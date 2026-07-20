// DB adapter 계층 — 실제 Neon 없이 테스트 가능하도록 분리.
// direct adapter: 기존 저장소에 이미 있는 PostgreSQL client(pg) 사용. 신규 dependency 없음.
// pooled mock adapter: Neon/PgBouncer 없이 transaction boundary·recycle·prepared statement·rotation·leakage 를 모사.
import { sanitizeError } from "./secrets";

export interface QueryResult { rows: any[] }
/** 모든 실행 경로가 이 인터페이스만 본다(pg.Client · PGlite · mock 공통). */
export interface DbAdapter {
  readonly kind: "direct" | "pooled-mock";
  connect(): Promise<void>;
  query(sql: string, params?: unknown[]): Promise<QueryResult>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

/** 이미 연결된 client(pg.Client / PGlite 등)를 adapter 로 감싼다 — 테스트에서 embedded/PGlite 주입용. */
export function wrapClientAsDirect(client: { query(sql: string, params?: any[]): Promise<any>; }): DbAdapter {
  return {
    kind: "direct",
    async connect() { /* 이미 연결됨 */ },
    async query(sql, params) { const r = await client.query(sql, params as any[]); return { rows: (r?.rows ?? []) as any[] }; },
    async exec(sql) { await client.query(sql); },
    async close() { /* 소유권은 호출부 */ },
  };
}

/** 실제 direct 연결(운영자 disposable branch 용). URL 은 절대 로그로 나가지 않는다. */
export async function createDirectAdapter(url: string): Promise<DbAdapter> {
  const pg = (await import("pg")).default;
  const ssl = /sslmode=disable/i.test(url) ? false : { rejectUnauthorized: false as const };
  const client = new pg.Client({ connectionString: url, ssl, connectionTimeoutMillis: 20000 });
  return {
    kind: "direct",
    async connect() { try { await client.connect(); } catch (e) { throw new Error(`direct connect 실패: ${sanitizeError(e).message}`); } },
    async query(sql, params) { const r = await client.query(sql, params as any[]); return { rows: r.rows as any[] }; },
    async exec(sql) { await client.query(sql); },
    async close() { await client.end().catch(() => {}); },
  };
}

// ── pooled mock ─────────────────────────────────────────────────────────────
// 목적: PgBouncer transaction mode 에서 흔한 위험(세션 상태 누수·prepared statement 재사용·rotation 후 구연결)을
//       결정적으로 재현/감지. **실제 PgBouncer 통과로 표현 금지.**
export interface PooledMockOptions {
  /** transaction 종료 시 세션 상태(SET ROLE 등)를 초기화하는가(=transaction mode 모사) */
  resetSessionStateOnTxEnd?: boolean;
  /** connection recycle 시 세션 상태를 유지해버리는 결함 모사(leakage) */
  leakSessionStateOnRecycle?: boolean;
  /** credential rotation 후 기존 연결을 무효화하는가 */
  invalidateOnRotation?: boolean;
}
export interface PooledMockAdapter extends DbAdapter {
  /** 논리 연결 반납/재획득(pool recycle) */
  recycle(): void;
  /** 트랜잭션 경계 */
  beginTx(): void;
  endTx(): void;
  /** credential rotation 시뮬레이션 */
  rotateCredential(role: string): void;
  /** 현재 세션에 남아있는 role(누수 감지용) */
  currentRole(): string | null;
  /** prepared statement 등록/재사용 */
  prepare(name: string, sql: string): void;
  hasPrepared(name: string): boolean;
  /** 이 논리 연결의 소유 role */
  readonly owner: string;
  invalidated: boolean;
}

/** role 별 권한을 단순 모델로 갖는 pooled mock. 실제 SQL 을 실행하지 않는다. */
export function createPooledMockAdapter(owner: string, grants: Record<string, "select" | "write" | "none">, opts: PooledMockOptions = {}): PooledMockAdapter {
  const o = { resetSessionStateOnTxEnd: true, leakSessionStateOnRecycle: false, invalidateOnRotation: true, ...opts };
  let sessionRole: string | null = null;
  let inTx = false;
  const prepared = new Map<string, string>();
  const self: PooledMockAdapter = {
    kind: "pooled-mock",
    owner,
    invalidated: false,
    async connect() { /* pool 획득 */ },
    async query(sql: string) {
      if (self.invalidated) throw new Error("pooled connection invalidated (credential rotated)");
      const effective = sessionRole ?? owner;
      const g = grants[effective] ?? "none";
      const s = sql.trim().toLowerCase();
      if (s.startsWith("set role ")) { sessionRole = s.slice("set role ".length).replace(/["';]/g, "").trim(); return { rows: [] }; }
      if (s === "reset role") { sessionRole = null; return { rows: [] }; }
      if (s.startsWith("select")) { if (g === "none") throw new Error("permission denied (mock)"); return { rows: [{ ok: 1 }] }; }
      if (/^(insert|update|delete|truncate)/.test(s)) { if (g !== "write") throw new Error("permission denied (mock)"); return { rows: [] }; }
      return { rows: [] };
    },
    async exec(sql) { await self.query(sql); },
    async close() { sessionRole = null; },
    recycle() { if (!o.leakSessionStateOnRecycle) sessionRole = null; /* 결함 모드면 상태 유지(누수) */ },
    beginTx() { inTx = true; },
    endTx() { inTx = false; if (o.resetSessionStateOnTxEnd) sessionRole = null; },
    rotateCredential(role: string) { if (o.invalidateOnRotation && role === owner) self.invalidated = true; },
    currentRole() { return sessionRole; },
    prepare(name, sql) { prepared.set(name, sql); },
    hasPrepared(name) { return prepared.has(name); },
  };
  void inTx;
  return self;
}
