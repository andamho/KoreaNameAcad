// 테스트 안전 가드 — 이 파일 없이는 어떤 테스트도 DB 를 건드리지 못하게 한다.
// 2026-07-16 사고(검증 스크립트가 운영 DB 에서 실제 단어를 테스트 키로 쓰고 DELETE) 재발 방지.
//
// 규칙:
//  1) 운영 DB 로 판단되면 테스트 실행 자체를 거부(쿼리 이전에 종료).
//  2) NODE_ENV 만으로 판단하지 않는다 — 명시적 TEST_DATABASE_URL + host/database 이름을 함께 본다.
//  3) 모든 테스트는 BEGIN → ... → 항상 ROLLBACK. 성공해도 COMMIT 하지 않는다.
//  4) 테스트 데이터는 test_run_id 로만 식별하고, cleanup 도 test_run_id 일치 행만 본다.
//  5) 실제 learned_corrections.json 경로는 테스트에서 쓰지 않는다(임시 디렉터리만).
import pg from "pg";
import crypto from "crypto";
import path from "path";
import os from "os";
import { promises as fs } from "fs";

export class ProductionDbRefused extends Error {
  constructor(reason: string) {
    super(`운영 DB 로 판단되어 테스트 실행을 거부합니다: ${reason}`);
    this.name = "ProductionDbRefused";
  }
}

const host = (url: string): string => {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return "";
  }
};
const dbName = (url: string): string => {
  try {
    return new URL(url).pathname.replace(/^\//, "").toLowerCase();
  } catch {
    return "";
  }
};

/**
 * 이 접속 문자열이 운영 DB 인가? (차단 방향으로만 판단 — 애매하면 운영으로 본다)
 * 반환값이 null 이면 테스트에 써도 되는 DB.
 */
export function productionReason(url: string): string | null {
  if (!url) return "빈 접속 문자열";
  const prod = (process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || "").trim();
  if (prod && url.trim() === prod.trim()) return "운영 접속 문자열(NEON_DATABASE_URL/DATABASE_URL)과 동일";
  const h = host(url);
  const n = dbName(url);
  if (prod && h && h === host(prod)) return `운영과 같은 호스트(${h})`;
  // 이름에 test/tmp 표식이 없으면 운영으로 간주(안전한 기본값)
  const marked = /(^|[-_.])(test|tests|testing|tmp|temp|sandbox|ci)([-_.]|$)/.test(n) || /(^|[-_.])(test|tmp|sandbox|ci)/.test(h);
  if (!marked) return `테스트 DB 표식이 없음(database=${n || "?"}, host=${h || "?"}) — test/tmp/sandbox 이름을 쓰세요`;
  return null;
}

/**
 * 테스트용 DB 접속 문자열을 고른다. 운영이면 즉시 throw.
 * TEST_DATABASE_URL 이 없으면 null(→ 호출부에서 skip).
 */
export function resolveTestDbUrl(): string | null {
  const url = process.env.TEST_DATABASE_URL?.trim();
  if (!url) return null;
  const reason = productionReason(url);
  if (reason) throw new ProductionDbRefused(reason);
  return url;
}

// 실행마다 고유 — 테스트 데이터는 전부 이 값으로만 식별한다.
export const makeTestRunId = (): string => `testrun_${crypto.randomUUID()}`;

// 테스트 규칙의 원문 — 실제 단어와 겹치지 않도록 test_run_id 를 포함시킨다.
export const testWord = (runId: string, label: string): string => `zz${label}_${runId.slice(8, 16)}`;

/**
 * BEGIN → fn → 항상 ROLLBACK. 성공해도 COMMIT 하지 않는다.
 * 예외가 나도 finally 에서 ROLLBACK 하고, 연결 종료 전 열린 트랜잭션이 없는지 확인한다.
 */
// 테스트가 쓰는 최소 인터페이스 — pg.Client 와 PGlite 를 같은 방식으로 다룬다.
export type TestClient = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }> };

// 운영 스키마와 동일한 테스트 테이블 (운영 information_schema 에서 그대로 옮김)
const SCHEMA = `
CREATE TABLE IF NOT EXISTS correction_rules (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  wrong text NOT NULL UNIQUE,
  "right" text NOT NULL,
  count integer NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  source text NOT NULL DEFAULT 'learned',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending',
  block_reason text, sample text, reason_code text,
  needs_review boolean NOT NULL DEFAULT false,
  sources text NOT NULL DEFAULT '[]',
  manual_override boolean NOT NULL DEFAULT false,
  override_by text, override_at timestamp, override_reason text
);
CREATE TABLE IF NOT EXISTS correction_audit (
  id varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL, actor text, detail text,
  at timestamp NOT NULL DEFAULT now()
);`;

/**
 * 테스트 DB 를 연다.
 *  - TEST_DATABASE_URL 이 있으면 그 DB(운영이면 거부).
 *  - 없으면 PGlite(메모리 안에서 도는 진짜 Postgres) — 운영에 닿을 수 없는 구조.
 */
export async function openTestClient(): Promise<{ client: TestClient; close: () => Promise<void>; kind: string }> {
  const url = resolveTestDbUrl();
  if (url) {
    const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
    await c.connect();
    return { client: c, close: async () => { await c.end(); }, kind: `외부 테스트 DB(${dbName(url)})` };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const db = new PGlite(); // 메모리 전용 — 파일·네트워크 없음
  await db.exec(SCHEMA);
  // PGlite 는 rowCount 대신 affectedRows 를 준다 → pg.Client 와 같은 모양으로 맞춘다
  const client: TestClient = {
    query: async (sql, params) => {
      const r: any = await db.query(sql, params as any[]);
      return { rows: r.rows ?? [], rowCount: (r.rows?.length || r.affectedRows) ?? 0 };
    },
  };
  return { client, close: async () => { await db.close(); }, kind: "PGlite(메모리 Postgres)" };
}

/**
 * BEGIN → fn → 항상 ROLLBACK. 성공해도 COMMIT 하지 않는다.
 * 예외가 나도 finally 에서 ROLLBACK 하고, 트랜잭션이 안 남았는지 확인한다.
 */
export async function withRollback<T>(c: TestClient, fn: (c: TestClient) => Promise<T>): Promise<T> {
  await c.query("BEGIN");
  try {
    return await fn(c);
  } finally {
    await c.query("ROLLBACK").catch(() => {});
    // 열린 트랜잭션이 남아있으면 안 된다 — 트랜잭션 밖에서만 되는 쿼리로 확인
    const still = await c.query("SELECT now() AS t").then(() => false).catch(() => true);
    if (still) console.warn("[test] 롤백 후에도 트랜잭션이 열려 있음");
  }
}

// URL 기반 접속을 직접 요구하는 경우(가드 검증용) — 운영이면 쿼리 전에 차단
export async function connectByUrl(url: string): Promise<pg.Client> {
  const reason = productionReason(url);
  if (reason) throw new ProductionDbRefused(reason);
  const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
  await c.connect();
  return c;
}

// cleanup — test_run_id 가 일치하는 행만. 다른 조건(wrong/LIKE)으로는 절대 지우지 않는다.
export async function cleanupTestRows(c: TestClient, runId: string): Promise<number> {
  if (!/^testrun_[0-9a-f-]{36}$/.test(runId)) throw new Error(`cleanup 거부: 잘못된 test_run_id(${runId})`);
  const r = await c.query(`DELETE FROM correction_rules WHERE sources LIKE $1`, [`%"testRunId":"${runId}"%`]);
  return r.rowCount ?? 0;
}

// 테스트용 임시 사전 파일 — 운영 learned_corrections.json 경로는 절대 쓰지 않는다.
export async function makeTempDictDir(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "kop-dict-test-"));
}
export const sha256 = (b: Buffer | string): string => crypto.createHash("sha256").update(b).digest("hex").slice(0, 16);
export async function fileState(p: string): Promise<{ exists: boolean; mtime?: string; sha?: string; size?: number }> {
  try {
    const [st, buf] = await Promise.all([fs.stat(p), fs.readFile(p)]);
    return { exists: true, mtime: st.mtime.toISOString(), sha: sha256(buf), size: buf.length };
  } catch {
    return { exists: false };
  }
}
