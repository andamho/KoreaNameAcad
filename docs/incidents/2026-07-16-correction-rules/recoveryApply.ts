// ⚠️ 사고 기록 아카이브(2026-07-16) — 재실행 금지. 일반 운영 도구 아님.
// UUID 등 실제 값은 비식별화됨(placeholder). main()은 즉시 종료하도록 막아둠(코드 본문은 당시 로직 보존).
// 사고 복구 실행 — 삭제된 2행만 복원. 승인 범위를 벗어나는 동작 없음.
//
// 원칙(승인 조건 그대로):
//  - 단일 트랜잭션. 사전검증 → INSERT 2행 → 감사로그 1건 → 사후검증 → 전부 통과해야만 COMMIT, 아니면 ROLLBACK.
//  - 값은 PITR 복구 브랜치에서 실행 시점에 직접 읽어 그대로 사용(추측값·현재시각·새 UUID·새 count 없음).
//  - ON CONFLICT 미사용 → 예상치 못한 충돌은 조용히 덮어쓰지 않고 즉시 실패 후 롤백.
//  - exportLearnedToJson 호출 없음. 사전 파일은 읽기만 해서 실행 전후 동일함을 증명.
//
// 사용법: $env:RECOVERY_DATABASE_URL = '<복구 브랜치 접속문자열>'; npx tsx server/knop/recoveryApply.ts
import "dotenv/config";
import pg from "pg";
import crypto from "crypto";
import { promises as fs } from "fs";
import path from "path";

const RECOVERY = process.env.RECOVERY_DATABASE_URL?.trim();
const PROD = (process.env.NEON_DATABASE_URL || process.env.DATABASE_URL)?.trim();

const TARGET_IDS = ["RESTORED_RULE_ID_1", "RESTORED_RULE_ID_2"]; // 비식별화: 실제 UUID는 Git 미저장(운영 correction_audit 로그에 보존)
const DICT = path.join(
  (process.env.KOP_WHISPER_DIR || process.env.KNOP_WHISPER_DIR)?.trim() || "C:/Users/iimoo/Desktop/video-caption-bot",
  "learned_corrections.json",
);

// 실행 전 기대 상태(승인 조건 1) / 실행 후 기대 상태(승인 조건 6)
const EXPECT_BEFORE = { total: 76, pending: 41, disabled: 35, active: 0 };
const EXPECT_AFTER = { total: 78, pending: 41, disabled: 37, active: 0 };

const agg = (rows: any[]) => ({
  total: rows.length,
  pending: rows.filter((r) => r.status === "pending").length,
  disabled: rows.filter((r) => r.status === "disabled").length,
  active: rows.filter((r) => r.status === "active").length,
});
// 다른 행이 안 바뀌었음을 증명하는 지문(ID 정렬 후 핵심 필드 해시)
const fingerprint = (rows: any[]) =>
  crypto.createHash("sha256").update(JSON.stringify(
    rows.map((r) => ({ id: r.id, wrong: r.wrong, right: r.right, status: r.status, enabled: r.enabled, count: r.count, updated_at: r.updated_at }))
      .sort((a, b) => (a.id < b.id ? -1 : 1)),
  )).digest("hex");
const fileState = async () => {
  try {
    const [st, buf] = await Promise.all([fs.stat(DICT), fs.readFile(DICT)]);
    return { mtime: st.mtime.toISOString(), sha256: crypto.createHash("sha256").update(buf).digest("hex").slice(0, 16), size: buf.length };
  } catch (e: any) {
    return { mtime: "(파일 없음)", sha256: "-", size: -1, error: e?.message };
  }
};

async function main() {
  // ⚠️ 아카이브 보관본 — 재실행 금지. 실수 실행 방지용 즉시 종료(2026-07-18 보관 시 추가).
  console.error("이 파일은 2026-07-16 사고 기록 아카이브입니다. 재실행 금지 — 종료합니다.");
  process.exit(3);
  if (!RECOVERY) { console.error("RECOVERY_DATABASE_URL 없음 — 복구 브랜치 접속문자열을 환경변수로 넣어주세요."); process.exit(2); }
  if (!PROD) { console.error("운영 DB 접속 정보 없음"); process.exit(2); }
  if (RECOVERY === PROD) { console.error("중단: 복구 URL 이 운영 URL 과 같습니다."); process.exit(2); }

  // ── 1) PITR 에서 복구할 원본 2행을 읽는다(읽기 전용) ──
  const rec = new pg.Client({ connectionString: RECOVERY, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
  await rec.connect();
  let src: any[];
  try {
    await rec.query("BEGIN READ ONLY");
    const r = await rec.query(`SELECT * FROM correction_rules WHERE id = ANY($1::text[]) ORDER BY created_at`, [TARGET_IDS]);
    await rec.query("COMMIT");
    src = r.rows;
  } finally {
    await rec.end();
  }
  console.log(`[PITR] 복구 원본 ${src.length}행 읽음 (읽기 전용)`);
  if (src.length !== 2) { console.error(`중단: 복구 원본이 2행이 아님(${src.length})`); process.exit(1); }
  for (const r of src) console.log(`  - ${r.wrong} → ${r.right} | ${r.status} | count=${r.count} | id=${r.id}`);

  const dictBefore = await fileState();
  console.log(`[사전 파일] 실행 전: mtime=${dictBefore.mtime} sha=${dictBefore.sha256} size=${dictBefore.size}`);

  // ── 2) 운영 DB — 단일 트랜잭션 ──
  const prod = new pg.Client({ connectionString: PROD, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
  await prod.connect();
  let committed = false;
  const problems: string[] = [];
  try {
    await prod.query("BEGIN");

    // 사전검증(승인 조건 1) — 트랜잭션 안에서 확인해 경합 여지를 없앤다
    const before = (await prod.query(`SELECT * FROM correction_rules`)).rows;
    const aBefore = agg(before);
    const fpBefore = fingerprint(before);
    console.log(`\n[실행 전] ${JSON.stringify(aBefore)}`);
    for (const [k, v] of Object.entries(EXPECT_BEFORE))
      if ((aBefore as any)[k] !== v) problems.push(`실행 전 ${k} 기대 ${v} ≠ 실제 ${(aBefore as any)[k]}`);
    for (const r of src) {
      if (before.some((b) => b.wrong === r.wrong)) problems.push(`실행 전 이미 존재: ${r.wrong}`);
      if (before.some((b) => b.id === r.id)) problems.push(`실행 전 이미 존재(ID): ${r.id}`);
    }
    const auditBefore = Number((await prod.query(`SELECT count(*)::int AS n FROM correction_audit`)).rows[0].n);
    if (problems.length) throw new Error(`사전검증 실패:\n  - ${problems.join("\n  - ")}`);
    console.log("[사전검증] 통과 — 76행, 대상 2행 없음, 집계 일치");

    // INSERT — 컬럼을 원본 행에서 동적으로 뽑아 전 필드를 그대로 넣는다. ON CONFLICT 없음(충돌 시 즉시 실패).
    for (const r of src) {
      const cols = Object.keys(r);
      const sql = `INSERT INTO correction_rules (${cols.map((c) => `"${c}"`).join(", ")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")})`;
      await prod.query(sql, cols.map((c) => r[c]));
      console.log(`[INSERT] ${r.wrong} → ${r.right} (${cols.length}개 필드 원본 그대로)`);
    }

    // 감사 로그 1건(승인 조건 7)
    const detail = {
      restored: src.map((r) => ({ id: r.id, wrong: r.wrong, right: r.right, status: r.status, count: r.count })),
      evidence: { source: "Neon PITR 브랜치", branchPoint: "2026-07-16 08:15 KST (=2026-07-15 23:15 UTC)", method: "복구 브랜치 78행 vs 운영 76행 diff, 역방향 diff 0건" },
      incident: {
        cause: "검증(evidence) 스크립트가 운영 DB에서 실제 단어(오늘/당신은)를 테스트 키로 사용하며 DELETE 후 INSERT/DELETE 수행",
        at: "2026-07-15 23:16:27 UTC (=2026-07-16 08:16:27 KST)",
        impact: "두 행 모두 status=disabled/enabled=false 로 사전 파일에 내보내진 적 없음 → 전사 적용 이력 없음",
        corroboration: "감사로그 산술(pending 무변동·disabled 2 감소) 및 전사문 재도출과 일치",
      },
      rowCount: { before: aBefore.total, after: aBefore.total + src.length },
      executedAt: new Date().toISOString(),
    };
    await prod.query(`INSERT INTO correction_audit (action, actor, detail) VALUES ($1, $2, $3)`, [
      "restore_deleted_correction_rules",
      "claude-code (원장님 승인)",
      JSON.stringify(detail),
    ]);

    // 사후검증(승인 조건 6)
    const after = (await prod.query(`SELECT * FROM correction_rules`)).rows;
    const aAfter = agg(after);
    console.log(`\n[실행 후] ${JSON.stringify(aAfter)}`);
    for (const [k, v] of Object.entries(EXPECT_AFTER))
      if ((aAfter as any)[k] !== v) problems.push(`실행 후 ${k} 기대 ${v} ≠ 실제 ${(aAfter as any)[k]}`);
    for (const r of src) {
      const hit = after.filter((x) => x.id === r.id);
      if (hit.length !== 1) problems.push(`복구 행이 정확히 1행이 아님: ${r.wrong} (${hit.length}행)`);
    }
    // 나머지 76행 무변동 확인
    const others = after.filter((x) => !TARGET_IDS.includes(x.id));
    if (others.length !== before.length) problems.push(`기존 행 수 변동: ${before.length} → ${others.length}`);
    const fpAfter = fingerprint(others);
    if (fpAfter !== fpBefore) problems.push(`기존 76행 지문 불일치 — 다른 행이 변경됨`);
    else console.log(`[무변동 확인] 기존 ${others.length}행 지문 동일: ${fpBefore.slice(0, 16)}`);
    const auditAfter = Number((await prod.query(`SELECT count(*)::int AS n FROM correction_audit`)).rows[0].n);
    if (auditAfter !== auditBefore + 1) problems.push(`감사 로그 증가가 1건이 아님: ${auditBefore} → ${auditAfter}`);

    if (problems.length) throw new Error(`사후검증 실패:\n  - ${problems.join("\n  - ")}`);
    console.log("[사후검증] 통과 — 78행 / pending 41 / disabled 37 / active 0 / 감사로그 +1 / 기존행 무변동");

    await prod.query("COMMIT");
    committed = true;
    console.log("\n✅ COMMIT — 복구 완료");
  } catch (e: any) {
    await prod.query("ROLLBACK").catch(() => {});
    console.error(`\n❌ ROLLBACK — 아무것도 변경되지 않았습니다.\n${e?.message}`);
  } finally {
    await prod.end();
  }

  // ── 3) 결과 보고(승인 조건 9) ──
  const dictAfter = await fileState();
  console.log(`\n[사전 파일] 실행 후: mtime=${dictAfter.mtime} sha=${dictAfter.sha256} size=${dictAfter.size}`);
  console.log(dictAfter.mtime === dictBefore.mtime && dictAfter.sha256 === dictBefore.sha256
    ? "✅ 사전 파일 실행 전후 동일(수정 시각·해시 불변) — export 호출 없음"
    : "❌ 사전 파일이 변경됨 — 즉시 확인 필요");

  if (committed) {
    // 복구 결과 재조회(별도 읽기 전용 연결)
    const v = new pg.Client({ connectionString: PROD, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
    await v.connect();
    await v.query("BEGIN READ ONLY");
    const rows = (await v.query(`SELECT id, wrong, "right", status, enabled, reason_code, count, sources, created_at, updated_at FROM correction_rules WHERE id = ANY($1::text[])`, [TARGET_IDS])).rows;
    console.log("\n━━━ 복구된 두 행 실제 조회 ━━━");
    for (const r of rows) console.log(JSON.stringify(r, null, 1));
    const au = (await v.query(`SELECT action, actor, at, detail FROM correction_audit ORDER BY at DESC LIMIT 1`)).rows[0];
    console.log("\n━━━ 감사 로그 최신 1건 ━━━");
    console.log(`${au.at} | ${au.action} | ${au.actor}`);
    console.log(au.detail);
    const st = (await v.query(`SELECT status, count(*)::int AS n FROM correction_rules GROUP BY status ORDER BY status`)).rows;
    console.log("\n━━━ 최종 상태 집계 ━━━");
    console.log(JSON.stringify(st));
    await v.query("COMMIT");
    await v.end();
  }
  process.exit(committed ? 0 : 1);
}
main().catch((e) => { console.error("실행 실패:", e?.message); process.exit(1); });
