// 공유 학습 교정 사전 (KNOP 통화 전사 ↔ 영상편집 봇 공용)
// 원천(source of truth): 공유 DB(correction_rules) — 인터넷 사이트/로컬 어디서 고쳐도 여기에 누적.
// correct.py 는 <video-caption-bot>/learned_corrections.json 을 읽으므로, 로컬 서버가 DB→JSON 으로 내려받아 반영.
import { promises as fs } from "fs";
import crypto from "crypto";
import path from "path";
import { db } from "../db";
import { correctionRules } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import { validateRule, shouldActivate, isStructural } from "./ruleValidator";
import { corpusFreq, corpusFreqMap } from "./corpusFreq";

// correct.py 가 읽는 로컬 파일. localTranscribe 와 같은 폴더 규칙(순환 import 방지 위해 직접 계산).
const WHISPER_DIR = (process.env.KOP_WHISPER_DIR || process.env.KNOP_WHISPER_DIR)?.trim() || "C:/Users/iimoo/Desktop/video-caption-bot";
const LEARNED_PATH = path.join(WHISPER_DIR, "learned_corrections.json");

// 관리자가 손으로 내린 차단 표식(reasonCode 에 저장) — 자동 재검증이 되살리지 못하게 한다.
export const ADMIN_BLOCK = "ADMIN_BLOCK";

export type RuleStatus = "active" | "pending" | "disabled";
export type CorrectionRule = {
  id: string;
  wrong: string;
  right: string;
  count: number;
  enabled: boolean;
  status: RuleStatus;
  blockReason: string | null;
  sample: string | null;
  source: "learned" | "manual";
  createdAt: string;
  updatedAt: string;
};

function toRule(row: typeof correctionRules.$inferSelect): CorrectionRule {
  return {
    id: row.id,
    wrong: row.wrong,
    right: row.right,
    count: row.count,
    enabled: row.enabled,
    status: ((row.status as RuleStatus) || "pending"),
    blockReason: row.blockReason ?? null,
    sample: row.sample ?? null,
    source: (row.source as "learned" | "manual") || "learned",
    createdAt: (row.createdAt as any)?.toISOString?.() || String(row.createdAt),
    updatedAt: (row.updatedAt as any)?.toISOString?.() || String(row.updatedAt),
  };
}

// 원천: DB. (DB 없으면 로컬 JSON 폴백 — 개발/오프라인 안전)
export async function loadRules(): Promise<CorrectionRule[]> {
  if (db) {
    try {
      const rows = await db.select().from(correctionRules);
      return rows.map(toRule);
    } catch (e: any) {
      console.error(`[KNOP] 교정사전 DB 조회 실패, JSON 폴백: ${e?.message}`);
    }
  }
  try {
    const raw = await fs.readFile(LEARNED_PATH, "utf-8");
    const data = JSON.parse(raw) as { rules: CorrectionRule[] };
    return Array.isArray(data.rules) ? data.rules : [];
  } catch {
    return [];
  }
}

// export 트리거 — 누가/무엇 때문에 사전이 바뀌었는지 감사 로그로 구분한다.
export type ExportTrigger =
  | "revalidate" | "learn" | "admin_toggle" | "manual_override" | "manual_rule" | "delete_rule"
  | "transcription" | "seed" | "unknown";
export type ExportResult = { ok: boolean; count?: number; hash?: string; skipped?: string };

const sha = (s: string) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 12);

// 감사 로그. 실패하면 throw → 호출부에서 사전 교체를 중단한다(기록 없는 교체 금지).
async function auditExport(action: string, actor: string, detail: unknown): Promise<void> {
  const d = db;
  if (!d) throw new Error("감사 로그 불가(DB 없음)");
  await d.execute(sql`INSERT INTO correction_audit (action, actor, detail) VALUES (${action}, ${actor}, ${JSON.stringify(detail)})`);
}

// 현재 사전 파일 상태(없으면 count 0)
async function currentFile(): Promise<{ raw: string | null; count: number; hash: string | null }> {
  try {
    const raw = await fs.readFile(LEARNED_PATH, "utf-8");
    return { raw, count: (JSON.parse(raw)?.rules || []).length, hash: sha(raw) };
  } catch {
    return { raw: null, count: 0, hash: null };
  }
}

// DB → 로컬 JSON 원자적 내보내기 (correct.py 가 읽는 파일).
// 임시파일 작성 → 파싱검증 → 필드 검증 → fsync → rename(원자적 교체). 실패하면 기존 사전 유지.
//
// ⚠️ 안전장치는 호출자가 끌 수 없다(allowEmpty 같은 우회 옵션 없음):
//    - active 0 이면 항상 차단하고 기존 파일을 유지한다(fail-closed).
//    - 모든 시도/성공/차단/실패를 감사 로그에 남기며, 기록에 실패하면 파일을 교체하지 않는다.
export async function exportLearnedToJson(opts: { actor?: string; trigger?: ExportTrigger } = {}): Promise<ExportResult> {
  const actor = opts.actor ?? "system";
  const trigger: ExportTrigger = opts.trigger ?? "unknown";
  const base = { trigger, actor };
  let tmp = "";
  try {
    if (!db) return { ok: false, skipped: "DB 없음 — 사전 교체 안 함" }; // 원천이 DB이므로 DB 없이 덮어쓰지 않는다

    const prev = await currentFile();
    const all = await loadRules();
    const rules = all.filter((r) => r.status === "active").map((r) => ({ ...r, enabled: true }));

    // fail-closed: active 0 이면 어떤 경우에도 덮어쓰지 않는다
    if (rules.length === 0) {
      const skipped = `fail-closed: active 0 (기존 ${prev.count}개 유지)`;
      await auditExport("export_blocked", actor, { ...base, result: "blocked", reason: skipped, prevCount: prev.count, prevHash: prev.hash });
      console.error(`[KOP] 사전 내보내기 차단(fail-closed): active 0개, 기존 ${prev.count}개 유지`);
      return { ok: false, skipped };
    }

    const payload = JSON.stringify({ rules }, null, 2);
    // 파싱/필드 검증
    const parsed = JSON.parse(payload);
    if (!Array.isArray(parsed.rules)) throw new Error("형식 오류: rules 배열 아님");
    for (const r of parsed.rules)
      if (!r.wrong || !r.right || r.enabled !== true) throw new Error(`필수 필드 누락: ${JSON.stringify(r).slice(0, 60)}`);
    const hash = sha(payload);

    // 내용이 같으면 파일을 건드리지 않는다(불필요한 교체·mtime 변경 방지)
    if (prev.hash === hash) {
      await auditExport("export_result", actor, { ...base, result: "unchanged", count: rules.length, prevCount: prev.count, prevHash: prev.hash, newHash: hash });
      return { ok: true, count: rules.length, hash };
    }

    // 교체 전에 기록한다. 기록이 실패하면 파일을 바꾸지 않는다.
    await auditExport("export_attempt", actor, { ...base, result: "attempt", prevCount: prev.count, newCount: rules.length, prevHash: prev.hash, newHash: hash });

    // 임시파일 → fsync → 원자적 rename
    tmp = `${LEARNED_PATH}.tmp-${process.pid}`;
    const fh = await fs.open(tmp, "w");
    try {
      await fh.writeFile(payload, "utf-8");
      await fh.sync();
    } finally {
      await fh.close();
    }
    await fs.rename(tmp, LEARNED_PATH); // 같은 볼륨 → 원자적
    tmp = "";
    await auditExport("export_result", actor, { ...base, result: "success", count: rules.length, prevCount: prev.count, prevHash: prev.hash, newHash: hash }).catch((e) =>
      console.error(`[KOP] export 성공 기록 실패(파일은 교체됨): ${e?.message}`),
    );
    console.log(`[KOP] 사전 내보내기 완료: ${rules.length}개 (sha ${hash}, trigger=${trigger})`);
    return { ok: true, count: rules.length, hash };
  } catch (e: any) {
    if (tmp) await fs.unlink(tmp).catch(() => {}); // 임시파일 정리 → 기존 사전 그대로
    await auditExport("export_failed", actor, { ...base, result: "failed", reason: e?.message }).catch(() => {});
    return { ok: false, skipped: e?.message };
  }
}

// 기존 규칙 전수 재검증: 새 검증기를 통과 못하면 pending 으로 내림(삭제하지 않음).
// 관리자가 직접 disabled 로 내린 건 그대로 둔다.
let revalidating = false; // 중복 실행 락 (재검증과 export 를 한 범위로 묶음)

export async function revalidateAllRules(actor = "admin"): Promise<{
  checked: number;
  active: number;
  pending: number;
  disabled: number;
  demoted: Array<{ wrong: string; right: string; reason: string }>;
  export?: { ok: boolean; count?: number; hash?: string; skipped?: string };
  locked?: boolean;
}> {
  const d = db;
  if (!d) return { checked: 0, active: 0, pending: 0, disabled: 0, demoted: [] };
  if (revalidating) return { checked: 0, active: 0, pending: 0, disabled: 0, demoted: [], locked: true };
  revalidating = true;
  const startedAt = new Date();
  try {
    const freqMap = await corpusFreqMap();
    const rows = await d.select().from(correctionRules);
    const before = { active: rows.filter((r) => r.status === "active").length, total: rows.length };
    const demoted: Array<{ wrong: string; right: string; reason: string }> = [];
    let active = 0, pending = 0, disabled = 0;

    for (const r of rows) {
      // 관리자 강제 활성은 자동 재검증이 끄지 않음
      if (r.manualOverride) { active++; continue; }
      // 관리자가 직접 내린 차단도 자동으로 되살리지 않음
      if (r.reasonCode === ADMIN_BLOCK) { disabled++; continue; }

      const v = validateRule(r.wrong, r.right, freqMap.get(r.wrong) || 0);
      const distinct = distinctCount(parseSources(r.sources));
      let status: string, reason: string | null;
      if (!v.ok && isStructural(v.code)) {
        status = "disabled";
        reason = v.reason ?? null;
      } else if (r.source === "manual" ? v.ok : shouldActivate(distinct, v)) {
        status = "active";
        reason = v.borderline ? v.reason ?? null : null;
      } else {
        status = "pending";
        reason = v.ok ? `독립 증거 ${distinct}건 (서로 다른 전사 2건 이상 필요)` : v.reason ?? null;
      }
      if (status === "active") active++;
      else if (status === "pending") pending++;
      else disabled++;
      if (r.status === "active" && status !== "active") demoted.push({ wrong: r.wrong, right: r.right, reason: reason || "" });

      await d
        .update(correctionRules)
        .set({
          status,
          enabled: status === "active",
          reasonCode: v.code,
          blockReason: reason,
          needsReview: !!v.borderline,
          updatedAt: new Date(),
        })
        .where(eq(correctionRules.id, r.id));
    }

    const exp = await exportLearnedToJson({ actor, trigger: "revalidate" });
    // 감사 로그
    await d.execute(sql`INSERT INTO correction_audit (action, actor, detail) VALUES (
      'revalidate', ${actor},
      ${JSON.stringify({ startedAt, endedAt: new Date(), before, after: { active, pending, disabled }, demoted, export: exp })})`);
    return { checked: rows.length, active, pending, disabled, demoted, export: exp };
  } finally {
    revalidating = false;
  }
}

// 관리자 강제 활성/차단 (감사 로그 + 안전규칙 위반은 강제 불가)
export async function setManualOverride(
  wrong: string,
  on: boolean,
  actor: string,
  reason?: string,
): Promise<{ ok: boolean; error?: string }> {
  const d = db;
  if (!d) return { ok: false, error: "DB 없음" };
  const [r] = await d.select().from(correctionRules).where(eq(correctionRules.wrong, wrong));
  if (!r) return { ok: false, error: "규칙 없음" };
  if (on) {
    const v = validateRule(r.wrong, r.right, (await corpusFreqMap()).get(r.wrong) || 0);
    // 보호어 위반 등 구조적 위험은 강제 활성 불가
    if (!v.ok && isStructural(v.code))
      return { ok: false, error: `안전 규칙 위반이라 강제 활성 불가: ${v.reason}` };
  }
  await d
    .update(correctionRules)
    .set({
      manualOverride: on,
      status: on ? "active" : "pending",
      reasonCode: on ? "OK" : r.reasonCode,
      blockReason: on ? null : r.blockReason,
      enabled: on,
      overrideBy: on ? actor : null,
      overrideAt: on ? new Date() : null,
      overrideReason: on ? reason ?? null : null,
      updatedAt: new Date(),
    })
    .where(eq(correctionRules.id, r.id));
  await d.execute(sql`INSERT INTO correction_audit (action, actor, detail) VALUES (
    ${on ? "manual_override_on" : "manual_override_off"}, ${actor},
    ${JSON.stringify({ wrong: r.wrong, right: r.right, reason })})`);
  await exportLearnedToJson({ actor, trigger: "manual_override" });
  return { ok: true };
}

// 최초 1회: 로컬 JSON 에만 있던 기존 규칙을 DB 로 이관(DB 가 비어있을 때).
export async function seedRulesFromJsonOnce(): Promise<number> {
  if (!db) return 0;
  try {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(correctionRules);
    if (n > 0) return 0;
    const raw = await fs.readFile(LEARNED_PATH, "utf-8").catch(() => "");
    if (!raw) return 0;
    const data = JSON.parse(raw) as { rules: CorrectionRule[] };
    const rules = Array.isArray(data.rules) ? data.rules : [];
    if (!rules.length) return 0;
    for (const r of rules) {
      const w = (r.wrong || "").trim();
      const rt = (r.right || "").trim();
      if (!w || !rt) continue;
      await db
        .insert(correctionRules)
        .values({
          wrong: w,
          right: rt,
          count: r.count ?? 0,
          enabled: r.enabled ?? true,
          source: r.source === "manual" ? "manual" : "learned",
        })
        .onConflictDoNothing({ target: correctionRules.wrong });
    }
    console.log(`[KNOP] 교정사전 ${rules.length}개 DB로 이관 완료`);
    return rules.length;
  } catch (e: any) {
    console.error(`[KNOP] 교정사전 이관 실패: ${e?.message}`);
    return 0;
  }
}

// 규칙 하나 upsert + 상태 판정.
// 원칙: 사용자가 고쳤다는 사실만으로 전역 규칙을 만들지 않는다.
//  - 1회 학습 → pending(전사에 미적용)
//  - 검증 통과 + 2회 이상 반복 → active
//  - 검증 탈락 → pending 유지 + 차단사유 기록 (수동 확인용)
// manual(관리자가 직접 추가)은 검증 통과 시 즉시 active.
export type Evidence = { sourceId: string; editSessionId?: string; at?: string };
const parseSources = (s: string | null | undefined): Evidence[] => {
  try {
    const v = JSON.parse(s || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
};
// 같은 전사(sourceId)에서 여러 번 발견 = 증거 1건
const distinctCount = (evs: Evidence[]): number => new Set(evs.map((e) => e.sourceId)).size;

async function upsertRule(
  wrong: string,
  right: string,
  source: "learned" | "manual",
  sample?: string,
  ev?: Evidence,
): Promise<{ status: string; reason?: string; distinct: number }> {
  if (!db) return { status: "pending", reason: "DB 없음", distinct: 0 };
  const now = new Date();
  const freq = await corpusFreq(wrong);
  const v = validateRule(wrong, right, freq);

  const [existing] = await db.select().from(correctionRules).where(eq(correctionRules.wrong, wrong));

  // 관리자가 강제 활성한 규칙은 학습이 건드리지 않음
  if (existing?.manualOverride) return { status: existing.status, reason: "관리자 강제 활성", distinct: distinctCount(parseSources(existing.sources)) };
  // 관리자가 차단한 규칙은 학습으로 되살리지 않음(사람 판단 우선)
  if (existing?.status === "disabled" && !existing.reasonCode) {
    return { status: "disabled", reason: "관리자가 차단한 규칙", distinct: distinctCount(parseSources(existing.sources)) };
  }

  // 독립 증거 누적 (같은 sourceId 는 1건으로)
  const evs = parseSources(existing?.sources);
  if (ev && !evs.some((e) => e.sourceId === ev.sourceId)) evs.push({ ...ev, at: now.toISOString() });
  const distinct = distinctCount(evs);

  // 상태 결정: 구조적 위험 → disabled / 통과+증거충족 → active / 그 외 → pending
  let status: string;
  let reason: string | undefined;
  if (!v.ok && isStructural(v.code)) {
    status = "disabled";
    reason = v.reason;
  } else if (source === "manual" ? v.ok : shouldActivate(distinct, v)) {
    status = "active";
    reason = v.borderline ? v.reason : undefined;
  } else {
    status = "pending";
    reason = v.ok ? `독립 증거 ${distinct}건 (서로 다른 전사 2건 이상 필요)` : v.reason;
  }
  const active = status === "active";

  const patch = {
    right,
    count: (existing?.count ?? 0) + (source === "learned" ? 1 : 0),
    sources: JSON.stringify(evs),
    status,
    enabled: active,
    reasonCode: v.code,
    blockReason: reason ?? null,
    needsReview: !!v.borderline,
    sample: sample ?? existing?.sample ?? null,
    updatedAt: now,
  };
  if (existing) await db.update(correctionRules).set(patch).where(eq(correctionRules.id, existing.id));
  else await db.insert(correctionRules).values({ wrong, source, ...patch });
  return { status, reason, distinct };
}

// ── 한글 자모 분해 + 발음 유사도 (오타=발음비슷 필터용) ──
const CHO = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
const JUNG = ["ㅏ","ㅐ","ㅑ","ㅒ","ㅓ","ㅔ","ㅕ","ㅖ","ㅗ","ㅘ","ㅙ","ㅚ","ㅛ","ㅜ","ㅝ","ㅞ","ㅟ","ㅠ","ㅡ","ㅢ","ㅣ"];
const JONG = ["","ㄱ","ㄲ","ㄳ","ㄴ","ㄵ","ㄶ","ㄷ","ㄹ","ㄺ","ㄻ","ㄼ","ㄽ","ㄾ","ㄿ","ㅀ","ㅁ","ㅂ","ㅄ","ㅅ","ㅆ","ㅇ","ㅈ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];

function toJamo(s: string): string {
  let out = "";
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) {
      const n = code - 0xac00;
      out += CHO[Math.floor(n / 588)] + JUNG[Math.floor((n % 588) / 28)] + JONG[n % 28];
    } else {
      out += ch;
    }
  }
  return out;
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => i);
  for (let j = 1; j <= n; j++) {
    let prev = dp[0];
    dp[0] = j;
    for (let i = 1; i <= m; i++) {
      const tmp = dp[i];
      dp[i] = Math.min(dp[i] + 1, dp[i - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[m];
}

function phonSim(a: string, b: string): number {
  const ja = toJamo(a), jb = toJamo(b);
  const d = levenshtein(ja, jb);
  const L = Math.max(ja.length, jb.length) || 1;
  return 1 - d / L;
}

const PARTICLES = ["으로","에서","에게","부터","까지","이라","라고","한테","보다","처럼","만큼",
  "은","는","이","가","을","를","에","도","로","의","와","과","만","께","요","고","해","야"];

function stripPunct(t: string): string {
  return t.replace(/^[\s"'(「『]+|[\s.,?!"')」』]+$/g, "");
}

// old/new 가 같은 조사로 끝나면 그 조사를 떼어 핵심어만 남김
function stripCommonParticle(a: string, b: string): [string, string] {
  for (const p of PARTICLES.slice().sort((x, y) => y.length - x.length)) {
    if (a.length > p.length + 1 && b.length > p.length + 1 && a.endsWith(p) && b.endsWith(p)) {
      return [a.slice(0, -p.length), b.slice(0, -p.length)];
    }
  }
  return [a, b];
}

const hasHangul = (s: string) => /[가-힣]/.test(s);

// 단어 배열 diff(LCS) → 치환 블록 목록 [{old:[], new:[]}]
function diffReplaces(oldToks: string[], newToks: string[]): Array<{ o: string[]; n: string[] }> {
  const m = oldToks.length, n = newToks.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--)
    for (let j = n - 1; j >= 0; j--)
      dp[i][j] = oldToks[i] === newToks[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: Array<{ o: string[]; n: string[] }> = [];
  let i = 0, j = 0;
  let curO: string[] = [], curN: string[] = [];
  const flush = () => {
    if (curO.length || curN.length) out.push({ o: curO, n: curN });
    curO = []; curN = [];
  };
  while (i < m && j < n) {
    if (oldToks[i] === newToks[j]) {
      flush();
      i++; j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      curO.push(oldToks[i++]);
    } else {
      curN.push(newToks[j++]);
    }
  }
  while (i < m) curO.push(oldToks[i++]);
  while (j < n) curN.push(newToks[j++]);
  flush();
  return out;
}

export type LearnResult = { learned: Array<{ wrong: string; right: string }>; skipped: number };

// 원본 전사 → 수정본 비교 → 오타쌍 학습(누적). 발음유사 1:1 치환만 채택.
// 편집(원본→수정본)에서 오타쌍을 도출하는 순수 함수 — DB/파일 부작용 없음.
// 학습과 사후 조사(어떤 규칙이 어느 전사에서 나왔는지)가 반드시 같은 로직을 쓰도록 분리했다.
export function derivePairsFromEdit(
  oldText: string,
  newText: string,
): { pairs: Array<{ wrong: string; right: string; sample: string }>; skipped: number } {
  const out: { pairs: Array<{ wrong: string; right: string; sample: string }>; skipped: number } = { pairs: [], skipped: 0 };
  const o = (oldText || "").trim();
  const n = (newText || "").trim();
  if (!o || !n || o === n) return out;

  const blocks = diffReplaces(o.split(/\s+/), n.split(/\s+/));

  // 문장 전체를 다듬은 수정(치환 블록이 많음)은 ASR 단어오류가 아니라 문맥 수정 → 학습 대상 제외
  const subs = blocks.filter((b) => b.o.length === 1 && b.n.length === 1);
  if (blocks.length > 0 && subs.length / blocks.length < 0.5) {
    out.skipped += blocks.length;
    return out;
  }

  for (const b of blocks) {
    // 1:1 단어 치환만(ASR 오인식 후보)
    if (b.o.length !== 1 || b.n.length !== 1) { out.skipped++; continue; }
    let wrong = stripPunct(b.o[0]);
    let right = stripPunct(b.n[0]);
    [wrong, right] = stripCommonParticle(wrong, right);
    if (!wrong || !right || wrong === right) { out.skipped++; continue; }
    if (/^\d+$/.test(wrong) || /^\d+$/.test(right)) { out.skipped++; continue; }
    const sample = n.slice(Math.max(0, n.indexOf(right) - 30), n.indexOf(right) + right.length + 30).trim();
    out.pairs.push({ wrong, right, sample });
  }
  return out;
}

// 원본 전사 → 수정본 비교 → 오타쌍 학습(누적). 안전성 판정은 전부 검증기에 위임.
export async function learnFromEdit(
  oldText: string,
  newText: string,
  sourceId?: string,        // 이 편집이 나온 전사(통화) ID = 독립 증거 단위
  editSessionId?: string,
): Promise<LearnResult> {
  const result: LearnResult = { learned: [], skipped: 0 };
  const { pairs, skipped } = derivePairsFromEdit(oldText, newText);
  result.skipped += skipped;
  if (!pairs.length) return result;

  for (const { wrong, right, sample } of pairs) {
    const r = await upsertRule(wrong, right, "learned", sample || undefined,
      sourceId ? { sourceId, editSessionId } : undefined);
    if (r.status === "active") result.learned.push({ wrong, right });
    else result.skipped++; // pending/disabled = 아직 전사에 적용 안 됨
  }

  await exportLearnedToJson({ actor: sourceId ? `learn:${sourceId}` : "learn", trigger: "learn" }); // active 만 나감
  return result;
}

// ── 관리용 ──
export async function listRules(): Promise<CorrectionRule[]> {
  return (await loadRules()).sort((a, b) => b.count - a.count);
}

export async function upsertManualRule(wrong: string, right: string): Promise<CorrectionRule[]> {
  const w = wrong.trim(), r = right.trim();
  if (!w || !r) return loadRules();
  await upsertRule(w, r, "manual");
  await exportLearnedToJson({ actor: "admin", trigger: "manual_rule" });
  return loadRules();
}

// 관리자 수동 on/off. 켜면 active(사람 판단 우선), 끄면 disabled(학습으로 되살아나지 않음).
// 관리자 스위치. 켜기 = manualOverride(안전규칙 검사 통과해야 함), 끄기 = 관리자 차단(재검증이 되살리지 않음).
export async function setRuleEnabled(
  wrong: string,
  enabled: boolean,
  actor = "admin",
  reason?: string,
): Promise<{ ok: boolean; error?: string }> {
  const d = db;
  if (!d) return { ok: false, error: "DB 없음" };
  if (enabled) return setManualOverride(wrong, true, actor, reason ?? "관리자 직접 활성");

  const [r] = await d.select().from(correctionRules).where(eq(correctionRules.wrong, wrong));
  if (!r) return { ok: false, error: "규칙 없음" };
  await d
    .update(correctionRules)
    .set({
      enabled: false,
      status: "disabled",
      manualOverride: false,
      reasonCode: ADMIN_BLOCK, // 재검증이 이 규칙을 다시 켜지 않게 하는 표식
      blockReason: "관리자가 직접 차단",
      overrideBy: actor,
      overrideAt: new Date(),
      overrideReason: reason ?? null,
      updatedAt: new Date(),
    })
    .where(eq(correctionRules.id, r.id));
  await d.execute(sql`INSERT INTO correction_audit (action, actor, detail) VALUES (
    'manual_block', ${actor}, ${JSON.stringify({ wrong: r.wrong, right: r.right, reason })})`);
  await exportLearnedToJson({ actor, trigger: "admin_toggle" });
  return { ok: true };
}

// 규칙 삭제 — 반드시 명시적 ID 로만. (wrong 문자열/LIKE 조건 삭제 금지: 실수로 다른 행이 지워짐)
export async function deleteRule(id: string, actor = "admin"): Promise<{ ok: boolean; error?: string }> {
  const d = db;
  if (!d) return { ok: false, error: "DB 없음" };
  const [r] = await d.select().from(correctionRules).where(eq(correctionRules.id, id));
  if (!r) return { ok: false, error: "규칙 없음" };
  await d.delete(correctionRules).where(eq(correctionRules.id, id)); // ID 단건만
  await d.execute(sql`INSERT INTO correction_audit (action, actor, detail) VALUES (
    'delete_rule', ${actor}, ${JSON.stringify({ id: r.id, wrong: r.wrong, right: r.right, status: r.status, count: r.count })})`);
  await exportLearnedToJson({ actor, trigger: "delete_rule" });
  return { ok: true };
}

// ── 오류 패턴 분석 / 우선순위 ──
// 공통 접두/접미 제거 후 핵심 치환부만 남김
function coreSub(wrong: string, right: string): { from: string; to: string } {
  let i = 0;
  while (i < wrong.length && i < right.length && wrong[i] === right[i]) i++;
  let j = 0;
  while (j < wrong.length - i && j < right.length - i && wrong[wrong.length - 1 - j] === right[right.length - 1 - j]) j++;
  return { from: wrong.slice(i, wrong.length - j), to: right.slice(i, right.length - j) };
}

// 핵심 치환을 글자 단위 혼동으로 분해(길이 같으면 자리별로)
function charSubs(wrong: string, right: string): Array<{ from: string; to: string }> {
  const { from, to } = coreSub(wrong, right);
  if (!from || !to) return [];
  if (from.length === to.length && from.length > 1) {
    const out: Array<{ from: string; to: string }> = [];
    for (let k = 0; k < from.length; k++) if (from[k] !== to[k]) out.push({ from: from[k], to: to[k] });
    return out;
  }
  return [{ from, to }];
}

export type CorrectionAnalysis = {
  totalRules: number;
  totalHits: number;
  targets: Array<{ right: string; total: number; variants: Array<{ wrong: string; count: number }> }>;
  patterns: Array<{ from: string; to: string; count: number; single: boolean }>;
  top: Array<{ wrong: string; right: string; count: number }>;
};

export async function analyzeRules(): Promise<CorrectionAnalysis> {
  const rules = (await loadRules()).filter((r) => r.enabled);

  // 1) 정답 용어별 묶기 (같은 맞는말로 수렴하는 오타들 = 자주 틀리는 용어)
  const byTarget = new Map<string, { right: string; total: number; variants: Array<{ wrong: string; count: number }> }>();
  for (const r of rules) {
    const g = byTarget.get(r.right) || { right: r.right, total: 0, variants: [] };
    g.total += r.count;
    g.variants.push({ wrong: r.wrong, count: r.count });
    byTarget.set(r.right, g);
  }
  const targets = Array.from(byTarget.values()).sort(
    (a, b) => b.variants.length - a.variants.length || b.total - a.total,
  );

  // 2) 글자 혼동 패턴 (횟수 가중)
  const pat = new Map<string, { from: string; to: string; count: number; single: boolean }>();
  for (const r of rules) {
    for (const s of charSubs(r.wrong, r.right)) {
      const key = s.from + "→" + s.to;
      const ex = pat.get(key) || { from: s.from, to: s.to, count: 0, single: s.from.length === 1 && s.to.length === 1 };
      ex.count += r.count;
      pat.set(key, ex);
    }
  }
  const patterns = Array.from(pat.values()).sort((a, b) => b.count - a.count);

  // 3) 가장 잦은 오타
  const top = [...rules]
    .sort((a, b) => b.count - a.count)
    .slice(0, 20)
    .map((r) => ({ wrong: r.wrong, right: r.right, count: r.count }));

  return {
    totalRules: rules.length,
    totalHits: rules.reduce((s, r) => s + r.count, 0),
    targets,
    patterns,
    top,
  };
}
