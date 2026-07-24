// 큐 런타임 전용 DB 연결 — **소유자 연결(NEON_DATABASE_URL)에 의존하지 않는다.**
// 전용 변수 ORCHESTRATION_QUEUE_URL(=orchestration_writer credential) 만 읽고, 없으면 fail-closed.
// worker 는 트랜잭션(BEGIN..FOR UPDATE..COMMIT)을 쓰므로 pool.query(라운드로빈) 이 아니라 **전용 pg.Client**(단일 커넥션)를 준다.
// 원문 URL/host/credential 을 로그에 남기지 않는다(host 는 sha256 8자).
import crypto from "crypto";
import pg from "pg";
import type { QueueClient } from "./types";

export const QUEUE_URL_ENV = "ORCHESTRATION_QUEUE_URL";

export function queueConnectionConfigured(): boolean {
  return !!(process.env[QUEUE_URL_ENV] || "").trim();
}

function requireQueueUrl(): string {
  const url = (process.env[QUEUE_URL_ENV] || "").trim();
  if (!url) throw new Error(`${QUEUE_URL_ENV} 미설정 — 큐 런타임은 소유자 연결(NEON_DATABASE_URL)에 의존하지 않는다(fail-closed). 전용 writer credential 을 주입하라.`);
  return url;
}

export function queueHostHash(): string {
  const url = requireQueueUrl();
  let host = ""; try { host = new URL(url).host.toLowerCase(); } catch { host = ""; }
  return "host#" + crypto.createHash("sha256").update(host).digest("hex").slice(0, 8) + "…";
}

const wrap = (client: pg.Client): QueueClient => ({
  query: (sql, params) => client.query(sql, params as any[]) as any,
  exec: async (sql) => { await client.query(sql); },
});

/** worker 1개당 전용 커넥션 1개(트랜잭션 안전). 사용 후 release() 필수. */
export async function acquireQueueClient(): Promise<{ queue: QueueClient; release: () => Promise<void> }> {
  const url = requireQueueUrl();
  const client = new pg.Client({
    connectionString: url,
    ssl: url.includes("sslmode=disable") ? undefined : { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
  await client.connect();
  return { queue: wrap(client), release: () => client.end() };
}
