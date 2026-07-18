// 이름분석표 갱신 대기 — 관리자 액션(수동지정/대체/무시) + 목록조회. 감사기록 포함.
// 처리기와 같은 DbLike 인터페이스(파라미터 쿼리 + BEGIN/COMMIT). Railway에서 동작(렌더 불필요, 미리 렌더된 rendered_url 사용).
import type { DbLike } from "./reportProcessor";
import { REPORT_PREFIX } from "./reports";

type AuditEntry = {
  action: "assign" | "replace" | "ignore";
  actor: string; at: string;
  fromStatus: string; toStatus: string;
  customerId?: string | null; reason?: string | null;
};

function withAudit(snapshot: string | null, entry: AuditEntry): string {
  let snap: any = {};
  try { snap = JSON.parse(snapshot || "{}"); } catch { snap = {}; }
  snap.audit = [...(snap.audit || []), entry];
  return JSON.stringify(snap);
}

const attachName = (reportType: string) => `이름분석표 (${reportType === "family" ? "가족 이름분석" : "이름분석"})`;

// 확인 필요/실패 목록 (관리자 화면용). 후보 고객 이름까지 채워서 반환.
export async function listPendingReports(db: DbLike): Promise<any[]> {
  const rows = (await db.query(
    `SELECT * FROM report_matches WHERE status IN ('needs_review','attachment_failed','processing_failed') ORDER BY first_seen_at DESC`,
  )).rows;
  if (rows.length === 0) return [];

  // 후보 + 갱신 대상 고객 이름 일괄 조회
  const custIds = new Set<string>();
  const parsed = rows.map((r: any) => {
    let snap: any = {};
    try { snap = JSON.parse(r.candidate_snapshot || "{}"); } catch { snap = {}; }
    for (const c of snap.candidates || []) if (c.customerId) custIds.add(c.customerId);
    if (r.matched_customer_id) custIds.add(r.matched_customer_id);
    return { r, snap };
  });
  const nameMap = new Map<string, string>();
  if (custIds.size) {
    const cs = (await db.query(`SELECT id, name FROM customers WHERE id = ANY($1::varchar[])`, [Array.from(custIds)])).rows;
    for (const c of cs as any[]) nameMap.set(c.id, c.name);
  }
  // 갱신(supersedes_id)인 경우 이전 첨부(기존 이미지) 조회
  const superIds = rows.map((r: any) => r.supersedes_id).filter(Boolean);
  const prevMap = new Map<string, any>();
  if (superIds.length) {
    const prev = (await db.query(`SELECT id, matched_customer_id, rendered_url FROM report_matches WHERE id = ANY($1::varchar[])`, [superIds])).rows;
    for (const p of prev as any[]) prevMap.set(p.id, p);
  }

  return parsed.map(({ r, snap }) => {
    const isUpdate = !!r.supersedes_id; // 갱신 대기(같은 파일 내용변경) vs 동명이인 확인
    const prev = r.supersedes_id ? prevMap.get(r.supersedes_id) : null;
    return {
      id: r.id,
      kind: isUpdate ? "update" : "ambiguous", // 갱신 / 동명이인
      fileName: r.file_name,
      status: r.status,
      reportType: r.report_type,
      firstSeenAt: r.first_seen_at,
      matchReason: r.match_reason,
      renderedUrl: r.rendered_url,             // 새 이미지 미리보기
      topScore: r.top_score, secondScore: r.second_score, scoreGap: r.score_gap,
      candidates: (snap.candidates || []).map((c: any) => ({
        customerId: c.customerId, customerName: nameMap.get(c.customerId) || "(삭제됨)",
        score: c.score, passedGate: c.passedGate, autoEligible: c.autoEligible, parts: c.parts,
      })),
      previous: prev ? { customerId: prev.matched_customer_id, customerName: nameMap.get(prev.matched_customer_id) || null, renderedUrl: prev.rendered_url } : null,
      audit: snap.audit || [],
    };
  });
}

async function loadMatch(db: DbLike, matchId: string) {
  const m = (await db.query(`SELECT * FROM report_matches WHERE id=$1`, [matchId])).rows[0];
  if (!m) throw new Error("판정 건을 찾을 수 없습니다.");
  return m;
}

// 수동 지정: 관리자가 고객을 골라 연결. (동명이인/미등록 확인용)
export async function assignReport(db: DbLike, matchId: string, customerId: string, actor: string, reason?: string): Promise<void> {
  const m = await loadMatch(db, matchId);
  if (!m.rendered_url) throw new Error("미리보기 이미지가 없어 연결할 수 없습니다(워커 재처리 필요).");
  const audit = withAudit(m.candidate_snapshot, { action: "assign", actor, at: new Date().toISOString(), fromStatus: m.status, toStatus: "manually_matched", customerId, reason });
  try {
    await db.query("BEGIN");
    // 조건부 claim: 아직 미처리(needs_review/실패) 상태일 때만 잡는다 → 중복 클릭·동시 처리 멱등
    const claim = await db.query(
      `UPDATE report_matches SET status='manually_matched', matched_customer_id=$2, manually_confirmed_by=$3, manually_confirmed_at=now(), candidate_snapshot=$4, updated_at=now()
       WHERE id=$1 AND status IN ('needs_review','attachment_failed','processing_failed')`,
      [matchId, customerId, actor, audit],
    );
    if (!claim.rowCount) throw new Error("이미 처리된 건입니다(다른 창에서 처리했거나 상태가 변경됨).");
    await db.query(
      `INSERT INTO crm_files (customer_id, file_name, file_type, file_url, memo) VALUES ($1,$2,'image/png',$3,$4)`,
      [customerId, attachName(m.report_type), m.rendered_url, `${REPORT_PREFIX}${m.file_name}`],
    );
    await db.query("COMMIT");
  } catch (e) { await db.query("ROLLBACK").catch(() => {}); throw e; }
}

// 대체(갱신): 이전 첨부를 지우고 새 이미지로 교체. 같은 고객 유지.
export async function replaceReport(db: DbLike, matchId: string, actor: string, reason?: string): Promise<void> {
  const m = await loadMatch(db, matchId);
  if (!m.supersedes_id) throw new Error("대체 대상(이전 건)이 없습니다.");
  if (!m.rendered_url) throw new Error("새 미리보기 이미지가 없습니다(워커 재처리 필요).");
  const prev = (await db.query(`SELECT * FROM report_matches WHERE id=$1`, [m.supersedes_id])).rows[0];
  if (!prev || !prev.matched_customer_id) throw new Error("이전 연결 정보를 찾을 수 없습니다.");
  const customerId = prev.matched_customer_id;
  const audit = withAudit(m.candidate_snapshot, { action: "replace", actor, at: new Date().toISOString(), fromStatus: m.status, toStatus: "manually_matched", customerId, reason });
  try {
    await db.query("BEGIN");
    // 조건부 claim (멱등)
    const claim = await db.query(
      `UPDATE report_matches SET status='manually_matched', matched_customer_id=$2, manually_confirmed_by=$3, manually_confirmed_at=now(), candidate_snapshot=$4, updated_at=now()
       WHERE id=$1 AND status IN ('needs_review','attachment_failed','processing_failed')`,
      [matchId, customerId, actor, audit],
    );
    if (!claim.rowCount) throw new Error("이미 처리된 건입니다(다른 창에서 처리했거나 상태가 변경됨).");
    // 기존 첨부(같은 파일명 memo) 제거 후 새 이미지 첨부
    await db.query(`DELETE FROM crm_files WHERE customer_id=$1 AND memo=$2`, [customerId, `${REPORT_PREFIX}${m.file_name}`]);
    await db.query(
      `INSERT INTO crm_files (customer_id, file_name, file_type, file_url, memo) VALUES ($1,$2,'image/png',$3,$4)`,
      [customerId, attachName(m.report_type), m.rendered_url, `${REPORT_PREFIX}${m.file_name}`],
    );
    // 이전 건은 대체됨 표시(이미 rejected 면 무해)
    await db.query(`UPDATE report_matches SET status='rejected', updated_at=now() WHERE id=$1 AND status <> 'rejected'`, [m.supersedes_id]);
    await db.query("COMMIT");
  } catch (e) { await db.query("ROLLBACK").catch(() => {}); throw e; }
}

// 무시: 이 판정 건을 처리하지 않고 보류 해제(다시 안 물어봄). 갱신이면 기존 유지.
export async function ignoreReport(db: DbLike, matchId: string, actor: string, reason?: string): Promise<void> {
  const m = await loadMatch(db, matchId);
  const audit = withAudit(m.candidate_snapshot, { action: "ignore", actor, at: new Date().toISOString(), fromStatus: m.status, toStatus: "ignored", reason });
  // 조건부(멱등): 미처리 상태일 때만 무시로 전환
  const claim = await db.query(
    `UPDATE report_matches SET status='ignored', manually_confirmed_by=$2, manually_confirmed_at=now(), candidate_snapshot=$3, updated_at=now()
     WHERE id=$1 AND status IN ('needs_review','attachment_failed','processing_failed')`,
    [matchId, actor, audit],
  );
  if (!claim.rowCount) throw new Error("이미 처리된 건입니다.");
}
