// 이름분석표 처리기 — 감지된 PDF 1건을 안전하게 판정·첨부. 외부 의존(렌더/업로드)은 주입식(테스트 가능).
// 안전요건(원장님 확정):
//  1) first_seen_at 은 최초 INSERT 이후 절대 갱신 안 함
//  2) 경로가 바뀌어도 내용 해시가 같으면 동일 PDF
//  3) 동일 해시가 이미 auto_matched/manually_matched 면 재첨부 안 함
//  4) 내용이 바뀌어 해시가 다르면 새 판정 건(이전 건 관계 기록)
//  5) DB 기록(크론 첨부 행) 성공 전에 첨부 확정 안 함
//  6) 자동연결(첨부+상태)은 트랜잭션으로 묶음
//  7) 첨부 실패 시 auto_matched 로 확정하지 않고 attachment_failed
//  8) 후보 조회/DB 장애면 추측 연결 금지 → processing_failed
import { decideMatch, type Candidate, type ReportInfo } from "./reportMatch";
import { REPORT_PREFIX } from "./reports";

export type MatchStatus =
  | "pending" | "processing" | "auto_matched" | "needs_review"
  | "manually_matched" | "attachment_failed" | "processing_failed"
  | "rejected" | "ignored" | "duplicate";

// 이미 결론난(재처리 불필요) 상태
const TERMINAL = new Set<MatchStatus>(["auto_matched", "manually_matched", "ignored", "rejected", "duplicate"]);

export type DbLike = { query: (sql: string, params?: any[]) => Promise<{ rows: any[]; rowCount?: number | null }> };

export type ProcessorDeps = {
  db: DbLike;
  render: (absPath: string) => Promise<Buffer>;      // PDF→PNG
  upload: (key: string, buf: Buffer) => Promise<string>; // → fileUrl
  hashFile: (absPath: string) => string;             // sha256(내용)
  now: () => Date;
  uuid: () => string;
};

export type ProcessInput = {
  file: string;            // 파일명
  absPath: string;         // 절대경로
  extractedName: string;   // 대표자 이름
  reportType: "family" | "individual";
  label: string;           // 첨부 표시용 라벨
  candidates: Candidate[]; // 후보 고객(이름 게이트 통과분) — 조회 실패면 null
  candidatesFailed?: boolean; // 후보/DB 조회 실패(요건 8)
};

export type ProcessResult = { status: MatchStatus; matchId: string; note: string };

const jsonSnapshot = (input: ProcessInput, decisionScored: any, previousMatchId: string | null, birthNote?: string) =>
  JSON.stringify({
    candidates: decisionScored,
    previousMatchId,
    birthtime: birthNote ?? null,
    extractedName: input.extractedName,
    reportType: input.reportType,
  });

export async function processFile(deps: ProcessorDeps, input: ProcessInput): Promise<ProcessResult> {
  const { db } = deps;
  const hash = deps.hashFile(input.absPath);

  // 요건 2,3: 내용 해시로 조회 (경로 무관). 이미 결론난 건이면 재첨부/재판정 안 함.
  const existingByHash = (await db.query(
    `SELECT * FROM report_matches WHERE file_hash = $1 ORDER BY created_at DESC LIMIT 1`, [hash],
  )).rows[0];

  let row = existingByHash;
  if (row && TERMINAL.has(row.status)) {
    return { status: row.status, matchId: row.id, note: "이미 처리됨(재첨부 안 함)" };
  }
  if (row && row.status === "needs_review") {
    return { status: "needs_review", matchId: row.id, note: "사람 확인 대기 중" };
  }

  // 요건 8: 후보 조회 실패면 추측 연결 금지
  if (input.candidatesFailed) {
    if (!row) {
      const id = deps.uuid();
      await db.query(
        `INSERT INTO report_matches (id, file_name, file_path, file_hash, first_seen_at, extracted_name, report_type, status, match_reason)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'processing_failed','후보/DB 조회 실패')`,
        [id, input.file, input.absPath, hash, deps.now(), input.extractedName, input.reportType],
      );
      return { status: "processing_failed", matchId: id, note: "후보 조회 실패" };
    }
    await db.query(`UPDATE report_matches SET status='processing_failed', match_reason='후보/DB 조회 실패', updated_at=$2 WHERE id=$1`, [row.id, deps.now()]);
    return { status: "processing_failed", matchId: row.id, note: "후보 조회 실패" };
  }

  // 신규 판정 건 생성 (요건 1: first_seen_at 은 이 INSERT 에서만 설정, 이후 불변)
  let previousMatchId: string | null = null;
  if (!row) {
    // 요건 4: 같은 파일명·다른 해시의 이전 건이 있으면 관계 기록(갱신)
    const prior = (await db.query(
      `SELECT id FROM report_matches WHERE file_name=$1 AND file_hash IS DISTINCT FROM $2 ORDER BY created_at DESC LIMIT 1`,
      [input.file, hash],
    )).rows[0];
    previousMatchId = prior?.id ?? null;
    const id = deps.uuid();
    await db.query(
      `INSERT INTO report_matches (id, file_name, file_path, file_hash, first_seen_at, extracted_name, report_type, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'processing')`,
      [id, input.file, input.absPath, hash, deps.now(), input.extractedName, input.reportType],
    );
    row = (await db.query(`SELECT * FROM report_matches WHERE id=$1`, [id])).rows[0];
  } else if (row.file_path !== input.absPath) {
    // 요건 2: 경로만 바뀐 경우 경로 갱신(first_seen_at 은 건드리지 않음)
    await db.query(`UPDATE report_matches SET file_path=$2, updated_at=$3 WHERE id=$1`, [row.id, input.absPath, deps.now()]);
  }

  // 판정 (기준 T = 저장된 first_seen_at, 절대 재설정 안 함)
  const info: ReportInfo = { firstSeenAt: new Date(row.first_seen_at), reportType: input.reportType };
  const decision = decideMatch(info, input.candidates);
  const snapshot = jsonSnapshot(input, decision.scored, previousMatchId);

  await db.query(
    `UPDATE report_matches SET top_score=$2, second_score=$3, score_gap=$4, match_reason=$5, candidate_snapshot=$6, updated_at=$7 WHERE id=$1`,
    [row.id, decision.topScore, decision.secondScore, decision.scoreGap, decision.reason, snapshot, deps.now()],
  );

  if (decision.status === "needs_review") {
    await db.query(`UPDATE report_matches SET status='needs_review', matched_customer_id=NULL, updated_at=$2 WHERE id=$1`, [row.id, deps.now()]);
    return { status: "needs_review", matchId: row.id, note: decision.reason };
  }

  // 자동연결: 렌더·업로드(스토리지) 먼저 → 그 다음 트랜잭션으로 첨부 확정 (요건 5,6,7)
  const top = decision.matchedCustomerId!;
  const topCand = input.candidates.find((c) => c.customerId === top);
  let url: string;
  try {
    const buf = await deps.render(input.absPath);
    url = await deps.upload(`uploads/${deps.uuid()}.png`, buf);
  } catch (e: any) {
    await db.query(`UPDATE report_matches SET status='attachment_failed', match_reason=$2, updated_at=$3 WHERE id=$1`,
      [row.id, `렌더/업로드 실패: ${String(e?.message).slice(0, 200)}`, deps.now()]);
    return { status: "attachment_failed", matchId: row.id, note: "렌더/업로드 실패" };
  }

  try {
    await db.query("BEGIN");
    await db.query(
      `INSERT INTO crm_files (customer_id, file_name, file_type, file_url, memo) VALUES ($1,$2,'image/png',$3,$4)`,
      [top, `이름분석표 (${input.label})`, url, `${REPORT_PREFIX}${input.file}`],
    );
    await db.query(
      `UPDATE report_matches SET status='auto_matched', matched_customer_id=$2, matched_consultation_id=$3, updated_at=$4 WHERE id=$1`,
      [row.id, top, topCand?.consultationId ?? null, deps.now()],
    );
    await db.query("COMMIT");
  } catch (e: any) {
    await db.query("ROLLBACK").catch(() => {});
    await db.query(`UPDATE report_matches SET status='attachment_failed', match_reason=$2, updated_at=$3 WHERE id=$1`,
      [row.id, `첨부 트랜잭션 실패: ${String(e?.message).slice(0, 200)}`, deps.now()]);
    return { status: "attachment_failed", matchId: row.id, note: "첨부 실패(롤백)" };
  }
  return { status: "auto_matched", matchId: row.id, note: decision.reason };
}
