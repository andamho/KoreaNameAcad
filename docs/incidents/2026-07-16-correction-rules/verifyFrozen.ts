// ⚠️ 사고 기록 아카이브(2026-07-16) — 재실행 금지. 일반 운영 도구 아님.
// UUID는 비식별화됨(placeholder).
// 동결 확인 — 운영 규칙 DB / 사전 파일이 그대로인지 읽기만 해서 증명. 쓰기 구문 없음.
import "dotenv/config";
import pg from "pg";
import crypto from "crypto";
import { promises as fs } from "fs";

const RESTORED = ["RESTORED_RULE_ID_1", "RESTORED_RULE_ID_2"]; // 비식별화: 실제 UUID는 Git 미저장
const DICT = "C:/Users/iimoo/Desktop/video-caption-bot/learned_corrections.json";
const fingerprint = (rows: any[]) =>
  crypto.createHash("sha256").update(JSON.stringify(
    rows.map((r) => ({ id: r.id, wrong: r.wrong, right: r.right, status: r.status, enabled: r.enabled, count: r.count, updated_at: r.updated_at }))
      .sort((a, b) => (a.id < b.id ? -1 : 1)),
  )).digest("hex");

async function main() {
  const c = new pg.Client({ connectionString: (process.env.NEON_DATABASE_URL || process.env.DATABASE_URL)!, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
  await c.connect();
  await c.query("BEGIN READ ONLY");
  const rows = (await c.query(`SELECT * FROM correction_rules`)).rows;
  const agg = { total: rows.length, pending: rows.filter((r) => r.status === "pending").length, disabled: rows.filter((r) => r.status === "disabled").length, active: rows.filter((r) => r.status === "active").length };
  console.log("운영 규칙 DB:", JSON.stringify(agg));
  const others = rows.filter((r) => !RESTORED.includes(r.id));
  console.log(`복구 전부터 있던 ${others.length}행 지문:`, fingerprint(others).slice(0, 16), "(복구 시점 값: b87e06a0a7529bfb)");
  console.log("전체 78행 지문:", fingerprint(rows).slice(0, 16));
  const audit = (await c.query(`SELECT action, count(*)::int n FROM correction_audit GROUP BY action ORDER BY action`)).rows;
  console.log("감사 로그:", JSON.stringify(audit));
  await c.query("COMMIT");
  await c.end();
  const st = await fs.stat(DICT), buf = await fs.readFile(DICT);
  console.log(`사전 파일: mtime=${st.mtime.toISOString()} sha=${crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16)} size=${buf.length}`);
  process.exit(0);
}
main();
