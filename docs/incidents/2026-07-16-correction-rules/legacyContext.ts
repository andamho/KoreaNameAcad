// ⚠️ 사고 기록 아카이브(2026-07-16) — 재실행 금지. 일반 운영 도구 아님.
// 실제 규칙 단어·고객 이름성 단어는 비식별화됨(placeholder). 원문은 Git 미저장.
// legacy 4개 규칙 문맥 조사 — 읽기 전용. DB·사전·규칙 상태를 일절 변경하지 않는다.
import "dotenv/config";
import pg from "pg";
import { validateRule, phonSim } from "../../server/knop/ruleValidator";
import { derivePairsFromEdit } from "../../server/knop/learnedDict";

const TARGETS = ["RULE_TERM_1", "RULE_TERM_2", "RULE_TERM_3", "CUSTOMER_TERM_1"]; // 비식별화(원문 Git 미저장)
const conn = (process.env.NEON_DATABASE_URL || process.env.DATABASE_URL)!;

const sentencesOf = (t: string) => t.split(/(?<=[.?!])\s+/).filter(Boolean);
// 단어가 등장하는 문장과 앞뒤 2문장
function context(text: string, word: string): string {
  const ss = sentencesOf(text);
  const i = ss.findIndex((s) => s.includes(word));
  if (i < 0) return "(해당 단어 없음)";
  return ss.slice(Math.max(0, i - 2), i + 3).map((s, k) => `${k === Math.min(i, 2) ? "  ▶ " : "    "}${s}`).join("\n");
}

async function main() {
  const c = new pg.Client({ connectionString: conn, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 });
  await c.connect();
  await c.query("BEGIN READ ONLY");

  const rules = (await c.query(`SELECT * FROM correction_rules WHERE wrong = ANY($1::text[])`, [TARGETS])).rows;
  const calls = (await c.query(`SELECT id, customer_id, audio_file_url, original_transcript, transcript_text, words, call_date FROM calls WHERE transcript_text IS NOT NULL`)).rows;
  const withOrig = calls.filter((x) => x.original_transcript);
  console.log(`전사 보유 통화 ${calls.length}건 (원본 전사 보존 ${withOrig.length}건)\n`);

  for (const r of rules) {
    const v = validateRule(r.wrong, r.right, 0);
    const sources = JSON.parse(r.sources || "[]");
    const distinct = new Set(sources.map((s: any) => s.sourceId)).size;
    console.log("=".repeat(78));
    console.log(`▣ ${r.wrong} → ${r.right}`);
    console.log("=".repeat(78));
    console.log(`[1. 기본정보]`);
    console.log(`  ID=${r.id}`);
    console.log(`  status=${r.status} / enabled=${r.enabled} / reasonCode=${r.reason_code} / needsReview=${r.needs_review}`);
    console.log(`  count=${r.count} / distinctSourceCount=${distinct}`);
    console.log(`  sources=${r.sources}`);
    console.log(`  createdAt=${r.created_at?.toISOString?.()} / updatedAt=${r.updated_at?.toISOString?.()}`);
    console.log(`  발음유사도=${phonSim(r.wrong, r.right).toFixed(3)} / 검증기=${v.code}${v.reason ? ` (${v.reason})` : ""} / ok=${v.ok}`);
    console.log(`  sample(DB 보관 예문)=${r.sample ?? "(없음)"}`);

    // ── 2. 원본 편집 증거 ──
    console.log(`\n[2. 원본 편집 증거]`);
    const hits = withOrig.filter((x) => derivePairsFromEdit(x.original_transcript, x.transcript_text).pairs.some((p) => p.wrong === r.wrong));
    if (!hits.length) {
      const inOrig = withOrig.filter((x) => (x.original_transcript || "").includes(r.wrong));
      const inFinal = calls.filter((x) => (x.transcript_text || "").includes(r.right));
      console.log(`  ❌ 보존된 원본 전사 ${withOrig.length}건에서 이 규칙의 편집 정렬을 재현할 수 없음`);
      console.log(`     (원본 전사가 남은 통화 중 '${r.wrong}' 포함=${inOrig.length}건 / 현재 전사문에 '${r.right}' 포함=${inFinal.length}건)`);
      console.log(`     → 이 규칙은 원본 전사 보존 기능 이전에 학습됨. 편집 근거 문장 확인 불가.`);
    }
    for (const h of hits) {
      const pair = derivePairsFromEdit(h.original_transcript, h.transcript_text).pairs.find((p) => p.wrong === r.wrong)!;
      console.log(`  통화 ID: ${h.id} / 고객: ${h.customer_id} / 통화일: ${h.call_date}`);
      console.log(`  정렬 결과: "${pair.wrong}" → "${pair.right}" (1:1 단어 치환으로 도출)`);
      console.log(`  ── 원본 전사(수정 전) 문맥 ──\n${context(h.original_transcript, r.wrong)}`);
      console.log(`  ── 최종 전사(수정 후) 문맥 ──\n${context(h.transcript_text, r.right)}`);
      // 오디오 증거
      let audio = "  오디오: 확인 불가";
      if (h.words) {
        try {
          const ws = JSON.parse(h.words);
          const idx = ws.findIndex((w: any) => String(w.word || "").includes(r.right) || String(w.word || "").includes(r.wrong));
          if (idx >= 0) audio = `  오디오 구간: ${ws[idx].start}s ~ ${ws[idx].end}s (단어="${ws[idx].word}") / 파일=${h.audio_file_url ? "있음" : "없음"}`;
          else audio = `  오디오: words 있으나 해당 단어 시각 못 찾음 / 파일=${h.audio_file_url ? "있음" : "없음"}`;
        } catch {}
      }
      console.log(audio);
    }

    // ── 5. 역방향 위험: 원문이 정상 단어로 쓰인 곳 / 교정어가 이미 쓰이는 곳 ──
    console.log(`\n[5. 역방향 위험 검사]`);
    const wrongUse = calls.filter((x) => (x.transcript_text || "").includes(r.wrong));
    const rightUse = calls.filter((x) => (x.transcript_text || "").includes(r.right));
    console.log(`  현재 전사문에서 '${r.wrong}'(원문) 등장: ${wrongUse.length}건 / '${r.right}'(교정어) 등장: ${rightUse.length}건`);
    for (const x of wrongUse.slice(0, 3)) {
      const ss = sentencesOf(x.transcript_text).filter((s) => s.includes(r.wrong)).slice(0, 2);
      for (const s of ss) console.log(`    · [${x.id.slice(0, 8)}] …${s.trim().slice(0, 90)}…`);
    }
    if (wrongUse.length) console.log(`  ⚠️ 전역 치환하면 위 문장들이 '${r.right}' 로 바뀜`);
  }

  // ── 고객 이름 대조 (CUSTOMER_TERM_1 건) ──
  console.log("\n" + "=".repeat(78));
  console.log("▣ 고객 이름 대조 — 사람 이름 규칙 위험");
  console.log("=".repeat(78));
  for (const n of ["은희", "은혜"]) {
    const rows = (await c.query(`SELECT name, phone FROM customers WHERE name LIKE $1`, [`%${n}%`])).rows;
    console.log(`  고객 중 '${n}' 포함: ${rows.length}명 ${rows.map((x: any) => x.name).join(", ")}`);
  }
  await c.query("COMMIT");
  await c.end();
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
