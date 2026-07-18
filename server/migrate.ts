// 검토 가능한 additive 마이그레이션 적용기 (drizzle-kit push 사용 안 함).
// 지정한 SQL 파일을 트랜잭션 안에서 적용하고, 적용 전후 "기존 모든 테이블의 행 수"가 동일한지 검증.
// 하나라도 다르면 ROLLBACK. 새 테이블 생성만 허용.
//
// 사용:  DATABASE_URL 또는 NEON_DATABASE_URL 설정 후
//        node --import tsx/esm server/migrate.ts migrations/0001_add_report_matches.sql
import "dotenv/config";
import fs from "fs";
import pg from "pg";

async function tableCounts(c: pg.Client): Promise<Record<string, number>> {
  const tables = (await c.query(
    `SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`,
  )).rows.map((r: any) => r.tablename);
  const out: Record<string, number> = {};
  for (const t of tables) {
    const n = await c.query(`SELECT count(*)::int AS n FROM "${t}"`);
    out[t] = n.rows[0].n;
  }
  return out;
}

async function main() {
  const sqlPath = process.argv[2];
  if (!sqlPath || !fs.existsSync(sqlPath)) {
    console.error("사용법: node --import tsx/esm server/migrate.ts <migration.sql>");
    process.exit(2);
  }
  const url = (process.env.NEON_DATABASE_URL || process.env.DATABASE_URL || "").trim();
  if (!url) { console.error("DATABASE_URL / NEON_DATABASE_URL 없음"); process.exit(2); }
  const sql = fs.readFileSync(sqlPath, "utf-8");

  const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
  await c.connect();
  console.log(`[migrate] 대상 DB 접속 완료`);

  // 적용 전 스냅샷
  const before = await tableCounts(c);
  const beforeTables = Object.keys(before);
  console.log(`[migrate] 적용 전 기존 테이블 ${beforeTables.length}개, 총 행수 ${Object.values(before).reduce((a, b) => a + b, 0)}`);

  let ok = false;
  try {
    await c.query("BEGIN");
    await c.query(sql); // 마이그레이션 실행(다중 구문)
    // 검증 1: 새 테이블 생겼나
    const after = await tableCounts(c);
    const newTables = Object.keys(after).filter((t) => !(t in before));
    // 검증 2: 기존 테이블 행 수 전부 동일한가
    const changed = beforeTables.filter((t) => before[t] !== after[t]);
    console.log(`[migrate] 새로 생긴 테이블: ${newTables.length ? newTables.join(", ") : "(없음)"}`);
    if (changed.length) {
      console.error(`[migrate] ❌ 기존 테이블 행 수 변동: ${changed.map((t) => `${t} ${before[t]}→${after[t]}`).join(", ")}`);
      throw new Error("기존 데이터 변동 감지 → 롤백");
    }
    if (!newTables.includes("report_matches")) throw new Error("report_matches 테이블이 생성되지 않음 → 롤백");
    console.log(`[migrate] ✅ 기존 테이블 ${beforeTables.length}개 행 수 전부 동일 · report_matches 생성 확인`);
    await c.query("COMMIT");
    ok = true;
  } catch (e: any) {
    await c.query("ROLLBACK").catch(() => {});
    console.error(`[migrate] ❌ 실패 → ROLLBACK: ${e?.message}`);
  } finally {
    await c.end();
  }
  process.exit(ok ? 0 : 1);
}
main().catch((e) => { console.error("[migrate] 오류:", e?.message); process.exit(1); });
