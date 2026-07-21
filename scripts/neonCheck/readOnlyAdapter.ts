// SELECT-only preflight 전용 adapter — **2중 방어**.
//
//  방어층 1 (서버): BEGIN → `SET TRANSACTION READ ONLY` → 모든 probe → **항상 ROLLBACK**. COMMIT 경로 없음.
//  방어층 2 (애플리케이션): **query ID allowlist**. 임의 SQL 실행 API 를 제공하지 않는다(raw escape hatch 0).
//
// ⚠️ 이 adapter 는 `exec()`/`query(sql)` 같은 자유 실행 메서드를 **의도적으로 갖지 않는다.**
//    호출부는 `run(queryId, params)` 만 쓸 수 있고, SQL 은 preflightQueries.ts 의 고정 문자열이다.
import { findPreflightQuery, type ParamShape } from "./preflightQueries";
import { sanitizeError } from "./secrets";

/** 최소 드라이버 인터페이스(pg.Client 호환). 테스트는 이 모양의 가짜를 넘긴다. */
export interface RawDriver {
  connect(): Promise<void>;
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>;
  end(): Promise<void>;
}

export class ReadOnlyViolationError extends Error {
  constructor(message: string) { super(message); this.name = "ReadOnlyViolationError"; }
}

export interface ReadOnlySessionOptions {
  /** 트랜잭션 시작 시 read-only 확인에 실패하면 즉시 중단(fail-closed) */
  requireReadOnlyConfirmation?: boolean;
}

export interface RunOutcome<T = any> { rows: T[] }

/**
 * read-only 트랜잭션 하나를 열고, allowlist query 만 실행한 뒤 **반드시 ROLLBACK** 한다.
 * 성공/실패/예외 어느 경로에서도 COMMIT 하지 않는다.
 */
export class ReadOnlySession {
  private queryCount = 0;
  private open = false;
  constructor(private readonly driver: RawDriver, private readonly opts: ReadOnlySessionOptions = {}) {}

  get executedQueryCount(): number { return this.queryCount; }

  async begin(): Promise<void> {
    if (this.open) throw new ReadOnlyViolationError("트랜잭션이 이미 열려 있습니다");
    await this.driver.query("BEGIN");
    this.open = true;
    // 방어층 1 — 트랜잭션마다 다시 건다(pooler transaction mode 에서 session 설정 유지가 보장되지 않으므로).
    await this.driver.query("SET TRANSACTION READ ONLY");
    if (this.opts.requireReadOnlyConfirmation !== false) {
      const { rows } = await this.driver.query("SELECT current_setting('transaction_read_only') AS ro");
      const ro = String(rows[0]?.ro ?? "").toLowerCase();
      if (ro !== "on" && ro !== "true") {
        await this.rollback().catch(() => {});
        throw new ReadOnlyViolationError(`read-only 트랜잭션 강제 실패(transaction_read_only=${ro || "unknown"})`);
      }
    }
  }

  /** allowlist 에 등록된 query ID 만 실행한다. 등록되지 않은 ID·형태 불일치는 거부. */
  async run<T = any>(queryId: string, params?: unknown[]): Promise<RunOutcome<T>> {
    if (!this.open) throw new ReadOnlyViolationError("read-only 트랜잭션 밖에서 query 실행 시도");
    const def = findPreflightQuery(queryId);
    if (!def) throw new ReadOnlyViolationError(`allowlist 에 없는 query ID: ${queryId}`);
    assertParamShape(def.params, params, queryId);
    this.queryCount += 1;
    const { rows } = await this.driver.query(def.sql, params);
    return { rows: rows as T[] };
  }

  async rollback(): Promise<void> {
    if (!this.open) return;
    this.open = false;
    await this.driver.query("ROLLBACK");
  }

  /** 성공·실패 무관하게 ROLLBACK 을 보장하는 실행 래퍼. */
  static async withSession<T>(driver: RawDriver, fn: (s: ReadOnlySession) => Promise<T>, opts?: ReadOnlySessionOptions): Promise<T> {
    const s = new ReadOnlySession(driver, opts);
    await s.begin();
    try {
      return await fn(s);
    } finally {
      await s.rollback().catch(() => { /* rollback 실패는 상위에서 상태로 다룬다 */ });
    }
  }
}

function assertParamShape(shape: ParamShape, params: unknown[] | undefined, queryId: string): void {
  if (shape === "none") {
    if (params && params.length) throw new ReadOnlyViolationError(`${queryId}: 파라미터를 받지 않는 query`);
    return;
  }
  if (!params || params.length !== 1) throw new ReadOnlyViolationError(`${queryId}: 파라미터 1개 필요`);
  const p = params[0];
  if (shape === "text") {
    if (typeof p !== "string") throw new ReadOnlyViolationError(`${queryId}: text 파라미터 필요`);
    return;
  }
  if (!Array.isArray(p) || p.some((x) => typeof x !== "string")) {
    throw new ReadOnlyViolationError(`${queryId}: text[] 파라미터 필요`);
  }
}

/** 연결 실패를 sanitize 해 상태로 바꾼다(원문 URL·host 미노출). */
export async function connectReadOnly(driver: RawDriver): Promise<{ ok: true } | { ok: false; error: ReturnType<typeof sanitizeError> }> {
  try { await driver.connect(); return { ok: true }; }
  catch (e) { return { ok: false, error: sanitizeError(e) }; }
}
