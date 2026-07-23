// embedded PostgreSQL 17 을 **non-superuser + CREATEROLE**(Neon owner 모사)로 돌려
// role membership·schema 모델·cleanup 을 실측하는 재현용 러너.
//
// ⚠️ `embedded-postgres` 는 저장소 의존성이 아니다(package/lock 무변경). 없으면 **not-run** 으로 보고한다.
// ⚠️ 이 검증은 embedded 이지만 **superuser 가 아닌 role** 로 실행하므로, 그동안 superuser 라 숨어 있던
//    PG16+ 멤버십 semantics(CREATE ROLE 자동 멤버십 = ADMIN TRUE, SET FALSE, INHERIT FALSE)를 재현한다.
//
// 사용(scratchpad 에 embedded-postgres 설치 후):
//   node --import tsx/esm scripts/runNonSuperuserRoleCheck.ts
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { scopedNames, qi } from "./neonCheck/identifiers";
import { buildCleanupPlan, runCleanup, assertCleanupScope, verifyResidual } from "./neonCheck/cleanup";
import { wrapClientAsDirect } from "./neonCheck/adapters";
import { prepareEnvironmentForTest } from "./neonCheck/executor";

export interface NonSuperResult { ran: boolean; reason?: string; exitCode: number }

interface Check { name: string; ok: boolean; detail?: string }

export async function runNonSuperuser(runId = `ns${crypto.randomBytes(3).toString("hex")}`): Promise<NonSuperResult> {
  let EmbeddedPostgres: any, pg: any;
  try {
    EmbeddedPostgres = (await import("embedded-postgres" as string)).default;
    pg = (await import("pg" as string)).default;
  } catch {
    console.log("[non-super] not-run: embedded-postgres/pg 미설치(저장소 의존성 아님). scratchpad 에 설치 후 재실행.");
    return { ran: false, reason: "dependency-absent", exitCode: 0 };
  }

  const dbDir = path.join(os.tmpdir(), `ns-${Date.now()}`);
  const port = 55200 + Math.floor(Math.random() * 400);
  const epg = new EmbeddedPostgres({ databaseDir: dbDir, user: "pgsuper", password: "pgsuper", port, persistent: false });
  await epg.initialise(); await epg.start();

  const su = new pg.Client({ host: "localhost", port, user: "pgsuper", password: "pgsuper", database: "postgres" });
  await su.connect();
  // Neon neondb_owner 모사: CREATEROLE + LOGIN + NOSUPERUSER
  await su.query(`CREATE ROLE neonowner WITH LOGIN PASSWORD 'x' CREATEROLE NOSUPERUSER NOBYPASSRLS`);
  await su.query(`GRANT CREATE, USAGE ON SCHEMA public TO neonowner`);
  await su.query(`GRANT CREATE ON DATABASE postgres TO neonowner`);

  const checks: Check[] = [];
  const add = (name: string, ok: boolean, detail?: string) => { checks.push({ name, ok, detail }); };
  const q = async (c: any, sql: string) => { try { await c.query(sql); return "OK"; } catch (e: any) { return `FAIL ${e.code}`; } };

  // ── baseline: superuser 가 아니면 자동 멤버십이 SET FALSE 임을 재현 ──
  {
    const eo = new pg.Client({ host: "localhost", port, user: "neonowner", password: "x", database: "postgres" });
    await eo.connect();
    await eo.query(`CREATE ROLE probe_owner_${runId} NOLOGIN`);
    const before = await q(eo, `ALTER SCHEMA public OWNER TO probe_owner_${runId}`); // must SET ROLE — 실패 기대(non-owner)
    add("baseline: CREATE ROLE 자동멤버십 SET=false → ALTER OWNER 거부", before.startsWith("FAIL"), before);
    const attrs = (await su.query(
      `SELECT pg_has_role('neonowner','probe_owner_${runId}','SET') s, pg_has_role('neonowner','probe_owner_${runId}','MEMBER') m FROM (SELECT 1) x`)).rows[0];
    add("baseline: member=true·SET=false (PG16+ semantics)", attrs.m === true && attrs.s === false, JSON.stringify(attrs));
    await eo.query(`DROP ROLE probe_owner_${runId}`).catch(() => {});
    await eo.end();
  }

  // ── 수정 반영본으로 prepare → capability 최소 → cleanup ──
  const n = scopedNames(runId);
  const eo = new pg.Client({ host: "localhost", port, user: "neonowner", password: "x", database: "postgres" });
  await eo.connect();
  const db = wrapClientAsDirect({ query: (sql: string, params?: unknown[]) => eo.query(sql, params as any[]) });
  const secrets = new Map<string, any>();
  let prepared = false;
  try {
    await prepareEnvironmentForTest(db, n, secrets);
    prepared = true;
    add("수정본 prepareEnvironment 성공(GRANT SET TRUE + schema executor 소유)", true);
  } catch (e: any) {
    add("수정본 prepareEnvironment 성공", false, `${e.code ?? ""}:${String(e.message).slice(0, 60)}`);
  }

  if (prepared) {
    // SET ROLE 이 실제로 되는지(수정 핵심)
    add("SET ROLE owner 성공", (await q(eo, `SET ROLE ${qi(n.roles.owner)}`)) === "OK");
    await eo.query(`RESET ROLE`).catch(() => {});
    // schema owner 가 executor 인지(넘기지 않음)
    const owner = (await su.query(
      `SELECT pg_get_userbyid(nspowner) o FROM pg_namespace WHERE nspname=$1`, [n.schema])).rows[0]?.o;
    add("schema owner = executor(neonowner)", owner === "neonowner", `owner=${owner}`);
    // owner 가 CREATE 권한만 갖는지
    const canCreate = (await su.query(
      `SELECT has_schema_privilege($1,$2,'CREATE') c, has_schema_privilege($1,$2,'USAGE') u`, [n.roles.owner, n.schema])).rows[0];
    add("owner 에 CREATE 권한 부여됨", canCreate.c === true, JSON.stringify(canCreate));
    // default-privileges 검증(owner 로 CREATE FUNCTION)
    await eo.query(`SET ROLE ${qi(n.roles.owner)}`).catch(() => {});
    add("owner 가 default ACL 설정 + CREATE FUNCTION", (await q(eo, `CREATE FUNCTION ${qi(n.schema)}.probe_f() RETURNS int LANGUAGE sql AS 'SELECT 1'`)) === "OK");
    await eo.query(`RESET ROLE`).catch(() => {});
  }

  // ── cleanup(수정 반영본) 2회 멱등 ──
  assertCleanupScope(buildCleanupPlan(n), runId);
  const c1 = await runCleanup(db, n, { retry: true });
  const c2 = await runCleanup(db, n, { retry: true }); // 멱등
  const residual = await verifyResidual(db, n);
  const dacl = (await su.query(
    `SELECT count(*)::int n FROM pg_default_acl d WHERE pg_get_userbyid(d.defaclrole) LIKE '%\\_${runId}'`)).rows[0].n;
  add("cleanup 1회 residual role 0", c1.residualRoles === 0, `roles=${c1.residualRoles}`);
  add("cleanup 2회 멱등(오류 없이 재실행)", true);
  add("최종 잔여 role 0", residual.roles === 0);
  add("최종 잔여 object 0", residual.objects === 0);
  add("최종 잔여 default-acl 0", dacl === 0, `n=${dacl}`);

  await eo.end(); await su.end(); await epg.stop().catch(() => {});

  const fail = checks.filter((c) => !c.ok);
  for (const c of checks) console.log(`[non-super] ${c.ok ? "PASS" : "FAIL"} ${c.name}${c.detail ? " :: " + c.detail : ""}`);
  console.log(`[non-super] total=${checks.length} pass=${checks.length - fail.length} fail=${fail.length}`);
  return { ran: true, exitCode: fail.length ? 1 : 0 };
}

const isDirect = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("runNonSuperuserRoleCheck.ts");
if (isDirect) { runNonSuperuser().then((r) => process.exit(r.exitCode)); }
