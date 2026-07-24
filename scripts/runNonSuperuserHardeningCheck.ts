// embedded PostgreSQL 17 **non-superuser**(Neon neondb_owner 모사) 로 production hardening SQL(0001)을
// runHardening(apply) 로 실증하는 재현용 러너. 운영 DB 미접촉.
//
// ⚠️ 목적: PG16+ non-superuser 에서만 드러나는 소유권 이전·SET ROLE·default privileges·executor escalation 제약을
//    로컬에서 실측한다(PGlite 하드닝 테스트는 superuser 라 이 제약을 우회해 못 잡는다).
// ⚠️ `embedded-postgres` 는 저장소 의존성이 아니다(package/lock 무변경). 없으면 **not-run**.
//    실행: NEON_ISO_MODULES=<iso> node --import tsx/esm scripts/runNonSuperuserHardeningCheck.ts
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { runHardening, findHardening, type HardeningClient } from "../server/migrations/hardening/hardeningRunner";
import { sha256Normalized } from "../server/migrations/checksum";

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1"), "..");

export interface NonSuperHardeningResult { ran: boolean; reason?: string; exitCode: number; outcome?: string; setEscalatable?: number }

export async function runNonSuperuserHardening(): Promise<NonSuperHardeningResult> {
  let EmbeddedPostgres: any, pg: any;
  try {
    const iso = (process.env.NEON_ISO_MODULES ?? "").trim();
    if (iso) {
      const req = createRequire(path.join(iso, "package.json"));
      EmbeddedPostgres = (await import(pathToFileURL(req.resolve("embedded-postgres")).href)).default;
      pg = (await import(pathToFileURL(req.resolve("pg")).href)).default;
    } else {
      EmbeddedPostgres = (await import("embedded-postgres" as string)).default;
      pg = (await import("pg" as string)).default;
    }
  } catch {
    console.log("[nsu-harden] not-run: embedded-postgres/pg 미설치(저장소 의존성 아님). NEON_ISO_MODULES 로 격리 설치본 지정 후 재실행.");
    return { ran: false, reason: "dependency-absent", exitCode: 0 };
  }

  const root = fs.existsSync(path.join(REPO, "migrations")) ? REPO : path.resolve("C:/Users/iimoo/koreanameacad/kna-orchmig-wt");
  const S2 = fs.readFileSync(path.join(root, "migrations/0002_create_persistent_job_queue.sql"), "utf8");
  const S4 = fs.readFileSync(path.join(root, "migrations/0004_cross_agent_orchestration.sql"), "utf8");
  const SH = fs.readFileSync(path.join(root, "migrations/hardening/0001_orchestration_immutability_roles.sql"), "utf8");
  const SHA = sha256Normalized(SH);
  const DEF = findHardening("0001_orchestration_immutability_roles")!;

  const dbDir = path.join(os.tmpdir(), `nsu-harden-${Date.now()}`);
  const port = 57200 + Math.floor(Math.random() * 300);
  const epg = new EmbeddedPostgres({ databaseDir: dbDir, user: "pgsuper", password: "pgsuper", port, persistent: false });
  await epg.initialise(); await epg.start();

  // Neon neondb_owner 모사: CREATEROLE + NOSUPERUSER, public schema 소유.
  const su = new pg.Client({ host: "localhost", port, user: "pgsuper", password: "pgsuper", database: "postgres" });
  await su.connect();
  await su.query(`CREATE ROLE appowner WITH LOGIN PASSWORD 'x' CREATEROLE NOSUPERUSER NOBYPASSRLS`);
  await su.query(`GRANT CREATE, USAGE ON SCHEMA public TO appowner`);
  await su.query(`GRANT CREATE ON DATABASE postgres TO appowner`);
  await su.query(`ALTER SCHEMA public OWNER TO appowner`);
  await su.end();

  const ao = new pg.Client({ host: "localhost", port, user: "appowner", password: "x", database: "postgres" });
  await ao.connect();
  await ao.query(S2); await ao.query(S4); // 6테이블 포함 전체 스키마(행수 0 유지)
  const client: HardeningClient = { query: (sql, params) => ao.query(sql, params as any[]), exec: (sql) => ao.query(sql).then(() => {}) };

  const results: { name: string; ok: boolean; detail?: string }[] = [];
  const add = (name: string, ok: boolean, detail?: string) => results.push({ name, ok, detail });

  // sha 불일치 차단(운영 write 0)
  const bad = await runHardening(client, DEF, { sqlText: SH, actualSha256: "0".repeat(64), apply: true });
  add("sha 불일치 → aborted-sha-mismatch(미적용)", bad.outcome === "aborted-sha-mismatch" && !bad.committed, bad.outcome);

  // dry-run: 검증만, 미적용
  const dry = await runHardening(client, DEF, { sqlText: SH, actualSha256: SHA, apply: false });
  add("dry-run → dry-run-verified(미적용)", dry.outcome === "dry-run-verified" && !dry.committed, dry.outcome);

  // 실제 apply(비-superuser)
  const res = await runHardening(client, DEF, { sqlText: SH, actualSha256: SHA, apply: true });
  add("apply → applied", res.outcome === "applied" && res.committed, `${res.outcome}: ${res.detail}`);

  // 사후 보안 속성
  const owned = Number((await ao.query(`SELECT count(*)::int n FROM pg_class r JOIN pg_namespace ns ON ns.oid=r.relnamespace WHERE ns.nspname='public' AND r.relname = ANY($1) AND pg_get_userbyid(r.relowner)='orchestration_owner'`, [["job_artifacts","job_dependencies","automated_reviews","human_approvals","orchestration_audit_log","emergency_stops"]])).rows[0].n);
  const setEsc = Number((await ao.query(`SELECT count(*)::int n FROM (SELECT pg_has_role('appowner', r, 'SET') s FROM unnest(ARRAY['orchestration_owner','orchestration_admin','orchestration_deployer']) r) x WHERE s`)).rows[0].n);
  const ownerCreate = (await ao.query(`SELECT has_schema_privilege('orchestration_owner','public','CREATE') c`)).rows[0].c === true;
  const dacl = Number((await ao.query(`SELECT count(*)::int n FROM pg_default_acl d WHERE d.defaclobjtype='f' AND pg_get_userbyid(d.defaclrole) LIKE 'orchestration_%'`)).rows[0].n);
  const pubExec = Number((await ao.query(`SELECT count(*)::int n FROM pg_proc p WHERE p.proname LIKE 'orch\\_%' AND has_function_privilege('public', p.oid, 'EXECUTE')`)).rows[0].n);
  add("6테이블 owner=orchestration_owner", owned === 6, `${owned}/6`);
  add("executor SET-가능 잔여 멤버십 0(escalation 차단)", setEsc === 0, `setEscalatable=${setEsc}`);
  add("orchestration_owner public CREATE 0(owner-only-creation)", !ownerCreate, `create=${ownerCreate}`);
  add("전역 FUNCTIONS default ACL 존재(미래 함수 PUBLIC 누수 차단)", dacl >= 1, `dacl=${dacl}`);
  add("PUBLIC function EXECUTE 0", pubExec === 0, `pubExec=${pubExec}`);

  // 재실행 → already-applied(멱등)
  const again = await runHardening(client, DEF, { sqlText: SH, actualSha256: SHA, apply: true });
  add("재실행 → already-applied(멱등)", again.outcome === "already-applied", again.outcome);

  await ao.end(); await epg.stop().catch(() => {});

  const fail = results.filter((r) => !r.ok);
  for (const r of results) console.log(`[nsu-harden] ${r.ok ? "PASS" : "FAIL"} ${r.name}${r.detail ? " :: " + r.detail : ""}`);
  console.log(`[nsu-harden] total=${results.length} pass=${results.length - fail.length} fail=${fail.length}`);
  return { ran: true, exitCode: fail.length ? 1 : 0, outcome: res.outcome, setEscalatable: setEsc };
}

const isDirect = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("runNonSuperuserHardeningCheck.ts");
if (isDirect) { runNonSuperuserHardening().then((r) => process.exit(r.exitCode)); }
