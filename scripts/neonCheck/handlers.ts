// 45 capability handler. 각 handler 는 pass / expected-denial / fail 만 반환한다.
// not-applicable 은 catalog 의 applicableProfiles 로 결정되며 handler 가 판단하지 않는다.
import type { DbAdapter } from "./adapters";
import type { PooledMockAdapter } from "./adapters";
import { createPooledMockAdapter } from "./adapters";
import { qi, qq, type ScopedNames } from "./identifiers";
import type { MemorySecret } from "./secrets";
import { S, triggerState, EXPECTED_TRIGGER_COUNT } from "./synthetic";
import type { CapabilityOutcome } from "./capabilities";

export type LoginFactory = (role: string, secret: MemorySecret) => Promise<DbAdapter>;

export interface HandlerCtx {
  db: DbAdapter;                       // bootstrap(관리) 연결
  names: ScopedNames;
  /** 실제 LOGIN 연결 팩토리(embedded/actual-neon 전용). PGlite 는 null. */
  login: LoginFactory | null;
  secrets: Map<string, MemorySecret>;  // role → CSPRNG password (메모리 전용)
  /** injection hook — handler 사이에 실패를 주입 */
  hook?: (label: string) => void | Promise<void>;
}
export interface HandlerResult { outcome: Exclude<CapabilityOutcome, "not-applicable">; detailCode?: string }
export type Handler = (ctx: HandlerCtx) => Promise<HandlerResult>;

// ── helpers ─────────────────────────────────────────────────────────────────
const ok = (detailCode?: string): HandlerResult => ({ outcome: "pass", detailCode });
const denied = (detailCode?: string): HandlerResult => ({ outcome: "expected-denial", detailCode });
const bad = (detailCode: string): HandlerResult => ({ outcome: "fail", detailCode });

/** 성공해야 하는 동작 */
async function expectPass(fn: () => Promise<unknown>, code = "ok"): Promise<HandlerResult> {
  try { await fn(); return ok(code); } catch (e: any) { return bad(`unexpected-error:${e?.code ?? "ERR"}`); }
}
/** 반드시 거부되어야 하는 동작 */
async function expectDenied(fn: () => Promise<unknown>): Promise<HandlerResult> {
  try { await fn(); return bad("not-denied"); } catch (e: any) { return denied(String(e?.code ?? "ERR")); }
}
const num = async (db: DbAdapter, sql: string, p?: unknown[]) => Number((await db.query(sql, p)).rows[0]?.n ?? 0);
const isMember = async (db: DbAdapter, member: string, group: string) =>
  (await num(db, `SELECT count(*)::int AS n FROM pg_auth_members am JOIN pg_roles m ON m.oid=am.member JOIN pg_roles g ON g.oid=am.roleid WHERE m.rolname=$1 AND g.rolname=$2`, [member, group])) > 0;

/** 테이블의 현재 소유자 role 이름(없으면 ""). */
const tableOwner = async (db: DbAdapter, schema: string, table: string): Promise<string> =>
  String((await db.query(`SELECT pg_get_userbyid(c.relowner) AS o FROM pg_class c JOIN pg_namespace ns ON ns.oid=c.relnamespace WHERE ns.nspname=$1 AND c.relname=$2`, [schema, table])).rows[0]?.o ?? "");

/**
 * 소유권 이전 capability 공통 검증(중복 이전 금지 — 실제 이전을 **한 번만** 수행).
 *   (1) executor 가 현재 각 테이블의 소유자인가(이미 owner 소유면 검증 의미가 없으므로 fail)
 *   (2) target owner 가 schema 에 CREATE + USAGE 를 갖는가
 *   (3) executor 가 owner 로 SET 가능한 membership 인가(PG16+ INHERIT FALSE 에서도 SET TRUE 면 이전 가능)
 *   (4) ALTER TABLE ... OWNER TO owner
 *   (5) catalog 상 실제로 owner 소유가 됐는가
 * detailCode 에는 run-id 원문 이름 대신 symbolic label 만 남긴다.
 */
async function transferTablesToOwner(db: DbAdapter, n: ScopedNames, targets: { tbl: string; label: string }[]): Promise<HandlerResult> {
  const cur = String((await db.query(`SELECT current_user AS u`)).rows[0]?.u ?? "");
  for (const { tbl, label } of targets) {
    const o = await tableOwner(db, n.schema, tbl);
    if (o !== cur) return bad(`not-executor-owned:${label}`); // setup 이 미리 이전했거나 이미 이전됨 → 실검증 불가
  }
  const p = (await db.query(`SELECT has_schema_privilege($1, $2, 'CREATE') AS c, has_schema_privilege($1, $2, 'USAGE') AS u`, [n.roles.owner, n.schema])).rows[0] as { c: boolean; u: boolean };
  if (!(p?.c && p?.u)) return bad(`owner-schema-priv:c=${p?.c}/u=${p?.u}`);
  const setAble = (await db.query(`SELECT pg_has_role($1, 'SET') AS s`, [n.roles.owner])).rows[0] as { s: boolean };
  if (!setAble?.s) return bad("executor-not-set-able-to-owner");
  for (const { tbl } of targets) await db.exec(`ALTER TABLE ${qq(n.schema, tbl)} OWNER TO ${qi(n.roles.owner)}`);
  for (const { tbl, label } of targets) {
    if ((await tableOwner(db, n.schema, tbl)) !== n.roles.owner) return bad(`owner-mismatch:${label}`);
  }
  return ok(`transferred=${targets.length}`);
}

/** 실제 LOGIN 연결로 작업 수행(연결은 항상 닫는다). */
async function withLogin<T>(ctx: HandlerCtx, role: string, fn: (db: DbAdapter) => Promise<T>): Promise<T> {
  if (!ctx.login) throw new Error("login factory unavailable");
  const sec = ctx.secrets.get(role);
  if (!sec) throw new Error("secret unavailable");
  const conn = await ctx.login(role, sec);
  try { return await fn(conn); } finally { await conn.close(); }
}
const loginDenied = async (ctx: HandlerCtx, role: string, sql: string): Promise<HandlerResult> => {
  try { return await withLogin(ctx, role, (db) => expectDenied(() => db.query(sql))); }
  catch (e: any) { return bad(`login-failed:${e?.message ?? "ERR"}`.slice(0, 60)); }
};
const loginPass = async (ctx: HandlerCtx, role: string, sql: string): Promise<HandlerResult> => {
  try { return await withLogin(ctx, role, (db) => expectPass(() => db.query(sql))); }
  catch (e: any) { return bad(`login-failed:${e?.message ?? "ERR"}`.slice(0, 60)); }
};

// ── direct handlers (1–40) ──────────────────────────────────────────────────
export const DIRECT_HANDLERS: Record<string, Handler> = {
  // Role lifecycle
  "create-nologin-role": async ({ db, names: n }) => {
    const c = await num(db, `SELECT count(*)::int AS n FROM pg_roles WHERE rolname = ANY($1) AND NOT rolcanlogin`, [[n.roles.owner, n.roles.admin]]);
    return c === 2 ? ok("nologin=2") : bad(`nologin=${c}`);
  },
  "create-login-role": async ({ db, names: n }) => {
    const c = await num(db, `SELECT count(*)::int AS n FROM pg_roles WHERE rolname = ANY($1) AND rolcanlogin`, [[n.roles.deployer, n.roles.writer, n.roles.reader, n.roles.appSim]]);
    return c === 4 ? ok("login=4") : bad(`login=${c}`);
  },
  "grant-membership": async ({ db, names: n }) => {
    await db.exec(`GRANT ${qi(n.roles.owner)} TO ${qi(n.roles.admin)}`);
    await db.exec(`GRANT ${qi(n.roles.admin)} TO ${qi(n.roles.deployer)}`);
    return (await isMember(db, n.roles.admin, n.roles.owner)) && (await isMember(db, n.roles.deployer, n.roles.admin)) ? ok() : bad("membership-missing");
  },
  "revoke-membership": async ({ db, names: n }) => {
    await db.exec(`GRANT ${qi(n.roles.admin)} TO ${qi(n.roles.writer)}`);
    if (!(await isMember(db, n.roles.writer, n.roles.admin))) return bad("grant-failed");
    await db.exec(`REVOKE ${qi(n.roles.admin)} FROM ${qi(n.roles.writer)}`);
    return (await isMember(db, n.roles.writer, n.roles.admin)) ? bad("revoke-failed") : ok();
  },
  "set-role": async ({ db, names: n }) => {
    const r = await expectPass(async () => { await db.exec(`SET ROLE ${qi(n.roles.admin)}`); });
    const cur = String((await db.query(`SELECT current_user AS u`)).rows[0]?.u ?? "");
    await db.exec(`RESET ROLE`).catch(() => {});
    return r.outcome === "pass" && cur === n.roles.admin ? ok(`as=${cur === n.roles.admin}`) : bad(`current_user-mismatch`);
  },
  "reset-role": async ({ db, names: n }) => {
    await db.exec(`SET ROLE ${qi(n.roles.admin)}`);
    await db.exec(`RESET ROLE`);
    const cur = String((await db.query(`SELECT current_user AS u`)).rows[0]?.u ?? "");
    return cur !== n.roles.admin ? ok() : bad("reset-failed");
  },
  "set-role-denied-after-revoke": async (ctx) => {
    const { db, names: n } = ctx;
    await db.exec(`GRANT ${qi(n.roles.admin)} TO ${qi(n.roles.reader)}`);
    await db.exec(`REVOKE ${qi(n.roles.admin)} FROM ${qi(n.roles.reader)}`);
    return loginDenied(ctx, n.roles.reader, `SET ROLE ${qi(n.roles.admin)}`);
  },
  "escalation-denied-for-runtime-roles": async (ctx) => {
    const { names: n } = ctx;
    for (const [role, target] of [[n.roles.writer, n.roles.admin], [n.roles.reader, n.roles.owner], [n.roles.appSim, n.roles.admin]] as const) {
      const r = await loginDenied(ctx, role, `SET ROLE ${qi(target)}`);
      if (r.outcome !== "expected-denial") return bad(`escalation-allowed:${role}`);
    }
    return denied("all-denied");
  },

  // Ownership — setup 은 테이블을 미리 owner 로 이전하지 않는다. 아래 capability 가 executor→owner 이전을 **실제로 한 번** 수행·검증한다.
  "transfer-table-owner": async ({ db, names: n }) =>
    transferTablesToOwner(db, n, [{ tbl: n.tables.artifact, label: "artifact" }]),
  "transfer-function-owner": async ({ db, names: n }) => {
    // 함수도 setup 에서 미리 이전하지 않는다. executor(=현재 함수 소유자)가 owner 로 실제 이전 후 catalog 확인.
    const s = S(n);
    const cur = String((await db.query(`SELECT current_user AS u`)).rows[0]?.u ?? "");
    const preOwned = await num(db, `SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname=$1 AND pg_get_userbyid(p.proowner)=$2`, [n.schema, cur]);
    if (preOwned < 4) return bad(`not-executor-owned:fns=${preOwned}`);
    for (const f of [s.fn.denyWrite, s.fn.denyDelete, s.fn.guard, s.fn.denyTruncate]) await db.exec(`ALTER FUNCTION ${f}() OWNER TO ${qi(n.roles.owner)}`);
    const c = await num(db, `SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname=$1 AND pg_get_userbyid(p.proowner)=$2`, [n.schema, n.roles.owner]);
    return c >= 4 ? ok(`fns=${c}`) : bad(`fn-owner=${c}`);
  },
  // ── membership lifecycle: 하네스 핵심(executor↔owner) 이 아니라 **전용 parent/subject 쌍**에서만 GRANT/REVOKE 한다. ──
  "bootstrap-a-temporary-membership": async ({ db, names: n }) => {
    await db.exec(`GRANT ${qi(n.mlRoles.parent)} TO ${qi(n.mlRoles.subject)} WITH SET TRUE, INHERIT FALSE`);
    return (await isMember(db, n.mlRoles.subject, n.mlRoles.parent)) ? ok("temp-member") : bad("not-member");
  },
  "bootstrap-a-ownership-transfer": async ({ db, names: n }) =>
    transferTablesToOwner(db, n, [
      { tbl: n.tables.audit, label: "audit" },
      { tbl: n.tables.approval, label: "approval" },
      { tbl: n.tables.business, label: "business" },
    ]),
  "bootstrap-a-membership-revoked": async ({ db, names: n }) => {
    await db.exec(`REVOKE ${qi(n.mlRoles.parent)} FROM ${qi(n.mlRoles.subject)}`);
    return (await isMember(db, n.mlRoles.subject, n.mlRoles.parent)) ? bad("revoke-failed") : ok("revoked");
  },
  "bootstrap-a-residual-membership-zero": async ({ db, names: n }) =>
    (await isMember(db, n.mlRoles.subject, n.mlRoles.parent)) ? bad("residual-membership") : ok("residual=0"),

  // Privilege
  "public-table-privilege-zero": async ({ db, names: n }) =>
    (await num(db, `SELECT count(*)::int AS n FROM information_schema.role_table_grants WHERE table_schema=$1 AND grantee='PUBLIC'`, [n.schema])) === 0 ? ok() : bad("public-table-grant"),
  "public-sequence-privilege-zero": async ({ db, names: n }) =>
    (await num(db, `SELECT count(*)::int AS n FROM information_schema.role_usage_grants WHERE object_schema=$1 AND grantee='PUBLIC'`, [n.schema])) === 0 ? ok() : bad("public-seq-grant"),
  "public-function-execute-zero": async ({ db, names: n }) =>
    (await num(db, `SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname=$1 AND has_function_privilege('public', p.oid, 'EXECUTE')`, [n.schema])) === 0 ? ok() : bad("public-execute"),
  "reader-select-success": async (ctx) => loginPass(ctx, ctx.names.roles.reader, `SELECT 1 FROM ${S(ctx.names).artifact}`),
  "reader-write-denied": async (ctx) => loginDenied(ctx, ctx.names.roles.reader, `INSERT INTO ${S(ctx.names).audit} (v) VALUES ('x')`),
  "writer-insert-success": async (ctx) => loginPass(ctx, ctx.names.roles.writer, `INSERT INTO ${S(ctx.names).audit} (v) VALUES ('w')`),
  "writer-update-denied": async (ctx) => loginDenied(ctx, ctx.names.roles.writer, `UPDATE ${S(ctx.names).artifact} SET v='z'`),
  "writer-delete-denied": async (ctx) => loginDenied(ctx, ctx.names.roles.writer, `DELETE FROM ${S(ctx.names).artifact}`),
  "writer-truncate-denied": async (ctx) => loginDenied(ctx, ctx.names.roles.writer, `TRUNCATE ${S(ctx.names).audit}`),
  "writer-business-table-access-denied": async (ctx) => loginDenied(ctx, ctx.names.roles.writer, `SELECT 1 FROM ${S(ctx.names).business}`),
  "app-simulation-orchestration-write-denied": async (ctx) => loginDenied(ctx, ctx.names.roles.appSim, `INSERT INTO ${S(ctx.names).audit} (v) VALUES ('x')`),
  "trigger-function-direct-call-denied": async (ctx) => loginDenied(ctx, ctx.names.roles.writer, `SELECT ${S(ctx.names).fn.denyWrite}()`),
  // ⚠️ 정정됨(function privilege hardening correction Gate). 이전 판의 서술은 **부정확**했다.
  //    실측(PG 17.10 + PGlite 18.3): `ALTER DEFAULT PRIVILEGES ... **IN SCHEMA <s>** REVOKE ... FROM PUBLIC` 만 무력하다
  //    (빈 ACL 에서 시작 → no-op, pg_default_acl 행 미생성). **스키마 한정 없는 전역 형식**은 내장 기본값에서 시작하므로
  //    실제로 PUBLIC EXECUTE 를 제거하며, 이후 생성되는 함수는 모든 스키마에서 `public=false` 가 된다.
  //    → 이 capability 는 전역 형식이 **미래 함수**를 실제로 보호하는지 판정한다(명시 REVOKE 는 기존 함수용 보조층).
  "default-privileges-secure": async ({ db, names: n }) => {
    const probe = `${n.tables.artifact}_probe`;
    const fq = `${qi(n.schema)}.${qi(probe)}`;
    const pubCount = () => num(db, `SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname=$1 AND p.proname=$2 AND has_function_privilege('public', p.oid, 'EXECUTE')`, [n.schema, probe]);
    try {
      // ⚠️ PG16+ non-superuser: `ALTER DEFAULT PRIVILEGES FOR ROLE owner` 는 owner 로 SET ROLE 된 상태여야 한다(INHERIT FALSE).
      //    executor 로 직접 하면 permission denied. 그래서 SET ROLE owner 상태에서 전역 REVOKE + CREATE FUNCTION 을 함께 수행한다.
      await db.exec(`SET ROLE ${qi(n.roles.owner)}`);
      await db.exec(`ALTER DEFAULT PRIVILEGES FOR ROLE ${qi(n.roles.owner)} REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC`);
      const rows = await num(db, `SELECT count(*)::int AS n FROM pg_default_acl d WHERE d.defaclobjtype='f' AND d.defaclnamespace=0 AND pg_get_userbyid(d.defaclrole)=$1`, [n.roles.owner]);
      if (rows !== 1) { await db.exec(`RESET ROLE`).catch(() => {}); return bad(`global-default-acl-row-missing(${rows})`); }
      await db.exec(`CREATE FUNCTION ${fq}() RETURNS int LANGUAGE sql AS $$SELECT 1$$`);
      const after = await pubCount();          // 명시 REVOKE 없이도 0 이어야 한다 = 미래 함수 보호
      await db.exec(`DROP FUNCTION ${fq}()`);
      await db.exec(`RESET ROLE`);
      if (after !== 0) return bad("future-function-public-execute-present");
      return ok("global-default-acl-protects-future-functions");
    } catch (e: any) { return bad(`probe-failed:${e?.code ?? "ERR"}`); }
    finally { await db.exec(`RESET ROLE`).catch(() => {}); }
  },
  // ⚠️ `IN SCHEMA` 한정 형식이 no-op 이라는 회귀 확인은 **Neon capability 가 아니라**
  //    hardening security assertion(`server/migrations/hardening/functionSecurityAssertions.ts` → `default-acl-policy`)에 있다.
  //    Neon capability 정본 45개는 변경하지 않는다.

  // Trigger / emergency
  "immutable-update-denied": async ({ db, names: n }) => expectDenied(() => db.query(`UPDATE ${S(n).artifact} SET v='z'`)),
  "immutable-delete-denied": async ({ db, names: n }) => expectDenied(() => db.query(`DELETE FROM ${S(n).artifact}`)),
  "identity-field-update-denied": async ({ db, names: n }) => expectDenied(() => db.query(`UPDATE ${S(n).approval} SET id=99`)),
  "truncate-trigger-or-fk-denied": async ({ db, names: n }) => expectDenied(() => db.query(`TRUNCATE ${S(n).audit}`)),
  "session-replication-role-denied": async (ctx) => loginDenied(ctx, ctx.names.roles.writer, `SET session_replication_role=replica`),
  "runtime-trigger-disable-denied": async (ctx) => loginDenied(ctx, ctx.names.roles.writer, `ALTER TABLE ${S(ctx.names).artifact} DISABLE TRIGGER ${qi(ctx.names.tables.artifact + "_imm")}`),
  "owner-trigger-disable-allowed": async ({ db, names: n, hook }) => {
    // ⚠️ `GRANT owner TO CURRENT_USER`(SET 미지정) 을 하지 않는다 — 그러면 prepareEnvironment 의 SET TRUE 옵션이
    //    기본값(SET FALSE)으로 덮여 이후 SET ROLE 이 깨진다. 멤버십은 prepareEnvironment 에서 이미 SET TRUE 로 부여됐고,
    //    테이블은 owner 소유(applyGrants)이므로 SET ROLE owner 만으로 DISABLE TRIGGER 가 가능하다.
    try {
      await db.exec(`SET ROLE ${qi(n.roles.owner)}`);
      await db.exec(`ALTER TABLE ${S(n).artifact} DISABLE TRIGGER ${qi(n.tables.artifact + "_imm")}`);
      await db.exec(`RESET ROLE`);
      if (hook) await hook("after-trigger-disable");
      return ok("owner-can-disable");
    } catch (e: any) { return bad(`disable-failed:${e?.code ?? "ERR"}`); }
    finally { await db.exec(`RESET ROLE`).catch(() => {}); }
  },
  "startup-check-fails-when-trigger-disabled": async ({ db, names: n }) => {
    const st = await triggerState(db, n);
    return st.disabled > 0 ? ok(`disabled=${st.disabled}`) : bad("expected-disabled-trigger");
  },
  "startup-check-passes-after-reenable": async ({ db, names: n }) => {
    // 테이블이 owner 소유이므로 ENABLE TRIGGER 도 owner 로 수행한다. owner 멤버십은 **회수하지 않는다**
    //    (cleanup 이 SET ROLE 로 각 role 자기 소유물을 정리해야 하므로 멤버십이 끝까지 유지돼야 한다).
    try {
      await db.exec(`SET ROLE ${qi(n.roles.owner)}`);
      await db.exec(`ALTER TABLE ${S(n).artifact} ENABLE TRIGGER ${qi(n.tables.artifact + "_imm")}`);
      await db.exec(`RESET ROLE`);
    } catch { await db.exec(`RESET ROLE`).catch(() => {}); }
    const st = await triggerState(db, n);
    return st.disabled === 0 ? ok("disabled=0") : bad(`still-disabled=${st.disabled}`);
  },
  "final-trigger-enabled-count": async ({ db, names: n }) => {
    const st = await triggerState(db, n);
    return st.total === EXPECTED_TRIGGER_COUNT && st.disabled === 0 ? ok(`enabled=${st.total}`) : bad(`total=${st.total} disabled=${st.disabled}`);
  },

  // Direct credential boundary
  "direct-reader-credential": async (ctx) => {
    const r = await loginPass(ctx, ctx.names.roles.reader, `SELECT 1 FROM ${S(ctx.names).artifact}`);
    if (r.outcome !== "pass") return r;
    const w = await loginDenied(ctx, ctx.names.roles.reader, `INSERT INTO ${S(ctx.names).audit} (v) VALUES ('x')`);
    return w.outcome === "expected-denial" ? ok("reader-boundary") : bad("reader-boundary-broken");
  },
  "direct-writer-credential": async (ctx) => {
    const i = await loginPass(ctx, ctx.names.roles.writer, `INSERT INTO ${S(ctx.names).audit} (v) VALUES ('w2')`);
    if (i.outcome !== "pass") return i;
    const u = await loginDenied(ctx, ctx.names.roles.writer, `UPDATE ${S(ctx.names).artifact} SET v='z'`);
    return u.outcome === "expected-denial" ? ok("writer-boundary") : bad("writer-boundary-broken");
  },
  "deployer-admin-owner-chain": async (ctx) => {
    const { names: n } = ctx;
    try {
      return await withLogin(ctx, n.roles.deployer, async (db) => {
        await db.exec(`SET ROLE ${qi(n.roles.admin)}`);
        await db.exec(`SET ROLE ${qi(n.roles.owner)}`);
        const cur = String((await db.query(`SELECT current_user AS u`)).rows[0]?.u ?? "");
        await db.exec(`RESET ROLE`).catch(() => {});
        return cur === n.roles.owner ? ok("chain-ok") : bad(`chain-end=${cur === n.roles.owner}`);
      });
    } catch (e: any) { return bad(`chain-failed:${String(e?.message ?? "ERR").slice(0, 40)}`); }
  },
};

// ── pooled handlers (41–45) ─────────────────────────────────────────────────
export interface PooledCtx { hook?: (label: string) => void | Promise<void> }
const mkPool = (owner: string, grants: Record<string, "select" | "write" | "none">, opts = {}): PooledMockAdapter =>
  createPooledMockAdapter(owner, grants, opts);

export const POOLED_HANDLERS: Record<string, (ctx: PooledCtx) => Promise<HandlerResult>> = {
  "pooled-reader-writer-separation": async () => {
    const reader = mkPool("r", { r: "select", w: "write" });
    const writer = mkPool("w", { r: "select", w: "write" });
    const rOk = await expectPass(() => reader.query("SELECT 1"));
    const rDenied = await expectDenied(() => reader.query("INSERT INTO t VALUES (1)"));
    const wOk = await expectPass(() => writer.query("INSERT INTO t VALUES (1)"));
    await reader.close(); await writer.close();
    return rOk.outcome === "pass" && rDenied.outcome === "expected-denial" && wOk.outcome === "pass" ? ok("separated") : bad("pool-separation-broken");
  },
  "transaction-end-role-state-clean": async () => {
    const p = mkPool("w", { w: "write", r: "select" }, { resetSessionStateOnTxEnd: true });
    p.beginTx(); await p.exec("SET ROLE r"); p.endTx();
    return p.currentRole() === null ? ok("state-clean") : bad("role-leaked-after-tx");
  },
  "no-set-role-dependency-in-runtime-pools": async () => {
    // runtime pool 은 SET ROLE 없이 자기 credential 권한만으로 동작해야 한다.
    const p = mkPool("w", { w: "write" });
    const r = await expectPass(() => p.query("INSERT INTO t VALUES (1)"));
    await p.close();
    return r.outcome === "pass" && p.currentRole() === null ? ok("no-set-role-needed") : bad("set-role-dependency");
  },
  "prepared-statement-reuse-preserves-boundary": async ({ hook }) => {
    const p = mkPool("r", { r: "select", w: "write" });
    p.prepare("s1", "SELECT 1");
    if (hook) await hook("prepared-statement-pooled-failure");
    p.recycle(); // 재활용 후에도 권한 경계 유지되어야
    const reused = p.hasPrepared("s1");
    const stillDenied = await expectDenied(() => p.query("INSERT INTO t VALUES (1)"));
    await p.close();
    return reused && stillDenied.outcome === "expected-denial" ? ok("boundary-kept") : bad("prepared-boundary-broken");
  },
  "reconnect-preserves-boundary": async ({ hook }) => {
    const p = mkPool("r", { r: "select", w: "write" }, { invalidateOnRotation: true });
    await p.exec("SET ROLE w");            // 세션 상태 오염 시도
    p.recycle();                            // 재연결 → 상태 초기화되어야
    if (hook) await hook("reconnect-credential-rotation-failure");
    p.rotateCredential("r");                // credential rotation → 기존 연결 무효화
    const invalidated = await expectDenied(() => p.query("SELECT 1"));
    return p.currentRole() === null && invalidated.outcome === "expected-denial" ? ok("reconnect-boundary") : bad("reconnect-boundary-broken");
  },
};

export const ALL_HANDLER_IDS = [...Object.keys(DIRECT_HANDLERS), ...Object.keys(POOLED_HANDLERS)];
