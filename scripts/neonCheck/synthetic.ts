// synthetic 환경(run-id 스코프 전용 schema). public schema 에는 아무것도 만들지 않는다.
// 운영 hardening 설계를 축소 재현: immutable / append-only / business-state / business(격리 대상) + 4 trigger function.
import type { DbAdapter } from "./adapters";
import { qi, qq, type ScopedNames } from "./identifiers";

/** 이 synthetic 환경이 갖는 trigger 수(기대값) */
export const EXPECTED_TRIGGER_COUNT = 7; // artifact(1) + audit(1) + approval(2) + truncate(3)

export const S = (n: ScopedNames) => ({
  artifact: qq(n.schema, n.tables.artifact),
  audit: qq(n.schema, n.tables.audit),
  approval: qq(n.schema, n.tables.approval),
  business: qq(n.schema, n.tables.business),
  schema: qi(n.schema),
  fn: {
    denyWrite: qq(n.schema, n.functions.denyWrite),
    denyDelete: qq(n.schema, n.functions.denyDelete),
    guard: qq(n.schema, n.functions.guard),
    denyTruncate: qq(n.schema, n.functions.denyTruncate),
  },
});

export async function createSchema(db: DbAdapter, n: ScopedNames): Promise<void> {
  await db.exec(`CREATE SCHEMA ${qi(n.schema)}`);
}

/** 테이블·함수·트리거 생성(역할 생성 이후 호출). */
export async function createObjects(db: DbAdapter, n: ScopedNames): Promise<void> {
  const s = S(n);
  await db.exec(`CREATE TABLE ${s.artifact} (id int PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(), v text)`);
  await db.exec(`CREATE TABLE ${s.audit} (id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(), v text)`);
  await db.exec(`CREATE TABLE ${s.approval} (id int PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(), status text NOT NULL DEFAULT 'awaiting', updated_at timestamptz NOT NULL DEFAULT now())`);
  await db.exec(`CREATE TABLE ${s.business} (id int PRIMARY KEY, v text)`);
  await db.exec(`INSERT INTO ${s.artifact} (id, v) VALUES (1, 'seed')`);
  await db.exec(`INSERT INTO ${s.audit} (v) VALUES ('seed')`);
  await db.exec(`INSERT INTO ${s.approval} (id) VALUES (1)`);
  await db.exec(`INSERT INTO ${s.business} (id, v) VALUES (1, 'biz')`);

  await db.exec(`CREATE FUNCTION ${s.fn.denyWrite}() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'immutable/append-only: % on %', TG_OP, TG_TABLE_NAME USING ERRCODE='OA001'; END;$$`);
  await db.exec(`CREATE FUNCTION ${s.fn.denyDelete}() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'delete forbidden on %', TG_TABLE_NAME USING ERRCODE='OA002'; END;$$`);
  await db.exec(`CREATE FUNCTION ${s.fn.guard}() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.id <> OLD.id OR NEW.created_at <> OLD.created_at THEN RAISE EXCEPTION 'identity change forbidden on %', TG_TABLE_NAME USING ERRCODE='OA003'; END IF; RETURN NEW; END;$$`);
  await db.exec(`CREATE FUNCTION ${s.fn.denyTruncate}() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'truncate forbidden on %', TG_TABLE_NAME USING ERRCODE='OA004'; END;$$`);

  await db.exec(`CREATE TRIGGER ${qi(n.tables.artifact + "_imm")} BEFORE UPDATE OR DELETE ON ${s.artifact} FOR EACH ROW EXECUTE FUNCTION ${s.fn.denyWrite}()`);
  await db.exec(`CREATE TRIGGER ${qi(n.tables.audit + "_app")} BEFORE UPDATE OR DELETE ON ${s.audit} FOR EACH ROW EXECUTE FUNCTION ${s.fn.denyWrite}()`);
  await db.exec(`CREATE TRIGGER ${qi(n.tables.approval + "_nodel")} BEFORE DELETE ON ${s.approval} FOR EACH ROW EXECUTE FUNCTION ${s.fn.denyDelete}()`);
  await db.exec(`CREATE TRIGGER ${qi(n.tables.approval + "_guard")} BEFORE UPDATE ON ${s.approval} FOR EACH ROW EXECUTE FUNCTION ${s.fn.guard}()`);
  for (const [t, tbl] of [[n.tables.artifact, s.artifact], [n.tables.audit, s.audit], [n.tables.approval, s.approval]] as const) {
    await db.exec(`CREATE TRIGGER ${qi(t + "_notrunc")} BEFORE TRUNCATE ON ${tbl} FOR EACH STATEMENT EXECUTE FUNCTION ${s.fn.denyTruncate}()`);
  }
}

/** 최소 권한 부여 + PUBLIC 제거 + default privileges. business 테이블에는 어떤 grant 도 주지 않는다. */
export async function applyGrants(db: DbAdapter, n: ScopedNames): Promise<void> {
  const s = S(n);
  // ── 소유권 모델(PG16+ non-superuser / Neon 검증) ──────────────────────────────
  //   schema  = **executor 소유 유지** → cleanup 의 DROP SCHEMA 가 SET ROLE 없이 가능(소유자만 DROP).
  //   테이블·함수 = **owner 소유** → capability(owner 의 DISABLE TRIGGER·default-privileges)와 실제 hardening 모델 일치.
  //   전제: owner 가 테이블 소유·schema 안 작업을 하려면 schema 에 **CREATE + USAGE** 둘 다 필요하다
  //         (ALTER TABLE OWNER/CREATE FUNCTION 은 CREATE, GRANT/DISABLE TRIGGER 는 USAGE). — embedded PG17 non-superuser 재현으로 확정.
  await db.exec(`REVOKE ALL ON SCHEMA ${s.schema} FROM PUBLIC`);
  await db.exec(`REVOKE ALL ON ALL TABLES IN SCHEMA ${s.schema} FROM PUBLIC`);
  await db.exec(`REVOKE ALL ON FUNCTION ${s.fn.denyWrite}(), ${s.fn.denyDelete}(), ${s.fn.guard}(), ${s.fn.denyTruncate}() FROM PUBLIC`);
  await db.exec(`GRANT CREATE, USAGE ON SCHEMA ${s.schema} TO ${qi(n.roles.owner)}`);
  await db.exec(`GRANT USAGE ON SCHEMA ${s.schema} TO ${qi(n.roles.reader)}, ${qi(n.roles.writer)}`);

  // 테이블·함수 소유권을 owner 로 이전(executor 가 SET TRUE 멤버십 + owner 의 schema CREATE 로 가능).
  for (const tbl of [s.artifact, s.audit, s.approval, s.business]) await db.exec(`ALTER TABLE ${tbl} OWNER TO ${qi(n.roles.owner)}`);
  for (const fn of [s.fn.denyWrite, s.fn.denyDelete, s.fn.guard, s.fn.denyTruncate]) await db.exec(`ALTER FUNCTION ${fn}() OWNER TO ${qi(n.roles.owner)}`);

  // owner 소유가 됐으므로 이후 GRANT·default-privileges 는 owner 로 SET ROLE 한 상태에서 수행한다.
  await db.exec(`SET ROLE ${qi(n.roles.owner)}`);
  try {
    await db.exec(`GRANT SELECT ON ${s.artifact}, ${s.audit}, ${s.approval} TO ${qi(n.roles.reader)}`);
    await db.exec(`GRANT SELECT, INSERT ON ${s.artifact}, ${s.audit}, ${s.approval} TO ${qi(n.roles.writer)}`);
    await db.exec(`GRANT UPDATE (status, updated_at) ON ${s.approval} TO ${qi(n.roles.writer)}`);
    await db.exec(`ALTER DEFAULT PRIVILEGES FOR ROLE ${qi(n.roles.owner)} IN SCHEMA ${s.schema} REVOKE ALL ON TABLES FROM PUBLIC`);
    await db.exec(`ALTER DEFAULT PRIVILEGES FOR ROLE ${qi(n.roles.owner)} IN SCHEMA ${s.schema} REVOKE ALL ON SEQUENCES FROM PUBLIC`);
    await db.exec(`ALTER DEFAULT PRIVILEGES FOR ROLE ${qi(n.roles.owner)} IN SCHEMA ${s.schema} REVOKE ALL ON FUNCTIONS FROM PUBLIC`);
  } finally {
    await db.exec(`RESET ROLE`);
  }
}

/** synthetic schema 의 trigger 상태(startup self-check 축소판). */
export async function triggerState(db: DbAdapter, n: ScopedNames): Promise<{ total: number; disabled: number }> {
  const r = await db.query(
    `SELECT count(*)::int AS total, count(*) FILTER (WHERE t.tgenabled='D')::int AS disabled
       FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace ns ON ns.oid=c.relnamespace
      WHERE ns.nspname=$1 AND NOT t.tgisinternal`, [n.schema]);
  return { total: Number(r.rows[0]?.total ?? 0), disabled: Number(r.rows[0]?.disabled ?? 0) };
}
