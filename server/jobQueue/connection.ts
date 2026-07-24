// 큐 런타임 전용 DB 연결 — **소유자 연결(NEON_DATABASE_URL)에 의존하지 않는다.** role별 전용 변수로 분리:
//   worker  : ORCHESTRATION_WORKER_URL  (=orchestration_writer)      — claim·heartbeat·complete·fail·reaper.
//   admin   : ORCHESTRATION_ADMIN_URL   (=orchestration_queue_admin) — 목록·상세·cancel 요청(SELECT + cancel 컬럼 UPDATE).
//   enqueue : ORCHESTRATION_ENQUEUE_URL (=orchestration_enqueuer)    — 이름분석표 감시·**job 생성 전용**(jobs SELECT+INSERT만).
// 미설정이면 fail-closed(role 간 fallback 금지 — 최소권한). 트랜잭션을 쓰므로 pool.query 가 아니라 **전용 pg.Client**.
// 원문 URL/host/credential 을 로그에 남기지 않는다(host 는 sha256 8자).
import crypto from "crypto";
import pg from "pg";
import type { QueueClient } from "./types";

export type QueueRole = "worker" | "admin" | "enqueue";
export const QUEUE_URL_ENV: Record<QueueRole, string> = {
  worker: "ORCHESTRATION_WORKER_URL",
  admin: "ORCHESTRATION_ADMIN_URL",
  enqueue: "ORCHESTRATION_ENQUEUE_URL",
};

export function queueConnectionConfigured(role: QueueRole): boolean {
  return !!(process.env[QUEUE_URL_ENV[role]] || "").trim();
}

function requireUrl(role: QueueRole): string {
  const env = QUEUE_URL_ENV[role];
  const url = (process.env[env] || "").trim();
  if (!url) throw new Error(`${env} 미설정 — 큐 ${role} 는 소유자 연결(NEON_DATABASE_URL)에 의존하지 않는다(fail-closed). 전용 credential 을 주입하라.`);
  return url;
}

export function queueHostHash(role: QueueRole): string {
  const url = requireUrl(role);
  let host = ""; try { host = new URL(url).host.toLowerCase(); } catch { host = ""; }
  return "host#" + crypto.createHash("sha256").update(host).digest("hex").slice(0, 8) + "…";
}

const wrap = (client: pg.Client): QueueClient => ({
  query: (sql, params) => client.query(sql, params as any[]) as any,
  exec: async (sql) => { await client.query(sql); },
});

/** role 전용 커넥션 1개(트랜잭션 안전). 사용 후 release() 필수. */
export async function acquireQueueClient(role: QueueRole): Promise<{ queue: QueueClient; release: () => Promise<void> }> {
  const url = requireUrl(role);
  const client = new pg.Client({
    connectionString: url,
    ssl: url.includes("sslmode=disable") ? undefined : { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  });
  await client.connect();
  return { queue: wrap(client), release: () => client.end() };
}
