// 이름분석 PDF 폴더 자동 동기화 (로컬 전용): 새 PDF → PNG 변환 → R2 업로드 → 고객 매칭(없으면 생성) → crm_files 저장.
// 로컬 서버 시작 시 밀린 것 일괄 처리 + 폴더 감시(fs.watch). 배포 서버는 폴더 없어서 no-op.
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { spawn } from "child_process";
import { Pool as PgPool } from "pg";
import { fileURLToPath } from "url";
import { db } from "../db";
import { ObjectStorageService } from "../object_storage/objectStorage";
import { processFile, gatherCandidates, type ProcessorDeps } from "./reportProcessor";
import {
  listReports,
  baseName,
  resolveReportPath,
  reportsAvailable,
  reportsDir,
  isImageReport,
  REPORT_EXT,
  REPORT_PREFIX,
} from "./reports";
import { readEvents, parseNameCount, calendarAvailable } from "./calendar";
import { decideNewName, type NamingEvent, type NewNameCandidate } from "./newNameMatch";
import { normalizePhone } from "@shared/schema";

// PDF → 이미지 변환용 파이썬(PyMuPDF 필요).
// 예전에는 video-caption-bot 의 venv 를 썼는데 그 폴더가 사라져서 2026-08-11 렌더가 전부 실패했다.
// (증상: 새 PDF 를 넣어도 링크가 안 생김. status=attachment_failed, 사유 "렌더/업로드 실패")
// 전사(whisper)용 파이썬과 분리한다 — 한쪽이 없어져도 다른 쪽이 멈추지 않게.
const PY =
  process.env.KOP_PDF_PY?.trim() ||
  process.env.KOP_WHISPER_PY?.trim() ||
  process.env.KNOP_WHISPER_PY?.trim() ||
  "C:/Users/iimoo/AppData/Local/Programs/Python/Python311/python.exe";

// 문자 발송용 링크(.url 바로가기)를 저장할 로컬 폴더 + 링크가 가리킬 공개 도메인
const LINK_DIR = (process.env.KOP_REPORT_LINK_DIR || "C:/Users/iimoo/Desktop/이름분석링크").trim();
const PUBLIC_BASE = (process.env.PUBLIC_BASE_URL || "https://korea-name-acad.com").replace(/\/$/, "");

// 파일명 → 링크 슬러그: "하주오님 가족 이름분석.pdf" → "하주오님가족이름분석표" (파일명 그대로, 님 포함)
function reportSlugFromFile(fileName: string): string {
  let b = fileName.replace(/\.(pdf|png|jpe?g|webp)$/i, "").replace(/\s*\(상세\)\s*/g, "");
  // 새이름은 파일명 그대로("ㅇㅇㅇ님 새이름") — 뒤에 '이름분석표'를 붙이지 않는다.
  if (/새이름/.test(b)) return b.replace(/\s+/g, "").replace(/[^0-9A-Za-z가-힣_-]/g, "").slice(0, 60);
  if (/이름분석(?!표)/.test(b)) b = b.replace(/이름분석(?!표)/g, "이름분석표");
  else if (!/이름분석표/.test(b)) b = b + "이름분석표";
  return b.replace(/\s+/g, "").replace(/[^0-9A-Za-z가-힣_-]/g, "").slice(0, 60);
}

// 같은 대상이면 기존 슬러그 재사용, 없으면 원하는 슬러그(충돌 시 -2)로 생성. (워커의 raw pg 풀 사용)
async function ensureReportLinkSlug(target: string, label: string, desiredSlug: string): Promise<string | null> {
  const pool = reportPool();
  try {
    // 원하는 슬러그가 이미 그 대상을 가리키면 그대로 쓴다.
    if (desiredSlug) {
      const same = await pool.query("SELECT slug FROM short_links WHERE slug=$1 AND target=$2 LIMIT 1", [desiredSlug, target]);
      if (same.rows[0]) return same.rows[0].slug as string;
    }
    // 원하는 슬러그를 먼저 시도한다. 같은 대상에 옛 슬러그가 있어도 그걸 재사용하지 않는다
    // — 규칙이 바뀌면(예: 새이름은 뒤에 '이름분석표'를 안 붙임) 새 주소로 만들어야 하기 때문.
    // 옛 슬러그 행은 지우지 않으므로 이미 보낸 링크는 계속 열린다.
    const tries = desiredSlug ? [desiredSlug, ...Array.from({ length: 30 }, (_, i) => `${desiredSlug}-${i + 2}`)] : [];
    for (const slug of tries) {
      try {
        await pool.query("INSERT INTO short_links (slug, target, label, kind) VALUES ($1,$2,$3,'image')", [slug, target, label]);
        return slug;
      } catch {
        /* 슬러그 충돌 → 다음 후보 */
      }
    }
    // 전부 실패하면 같은 대상의 기존 슬러그라도 쓴다(링크가 없는 것보다 낫다).
    const ex = await pool.query("SELECT slug FROM short_links WHERE target=$1 LIMIT 1", [target]);
    return ex.rows[0] ? (ex.rows[0].slug as string) : null;
  } catch (e: any) {
    console.error(`[KOP] 링크 슬러그 생성 실패: ${e?.message}`);
    return null;
  }
}

// 달력에서 '오늘 이후 상담(cat=상담)' 일정이 잡힌 사람들의 기준이름 집합
async function upcomingConsultNames(): Promise<Set<string> | null> {
  if (!calendarAvailable()) return null;
  try {
    const events = await readEvents();
    const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); // KST 오늘
    const set = new Set<string>();
    for (const e of events) {
      if (!e.date || e.date < today) continue;
      if ((e.cat || "") !== "상담") continue; // 상담 일정만
      const nm = baseName(parseNameCount(e.title || "").name);
      if (nm) set.add(nm);
    }
    return set;
  } catch (e: any) {
    console.error(`[KOP] 상담일정 조회 실패: ${e?.message}`);
    return null;
  }
}

// 새이름 링크는 상담 일정과 무관하게 만든다(작명완료 날 고객에게 보내는 것이라
// '오늘 이후 상담예정' 조건에 애초에 걸리지 않는다 — 2026-07-30 김경순님 건).
// 폴더 유지 기간은 링크 파일이 만들어진 시점부터 개인 1달 · 가족 2달(원장님 확정).
const NEWNAME_LINK_KEEP_DAYS = { individual: 30, family: 60 } as const;
const DAY_MS = 24 * 60 * 60 * 1000;

// 링크 파일이 만들어진 시각. birthtime 이 신뢰 못할 값(0)이면 mtime 으로 대체.
function linkCreatedAt(p: string): number | null {
  try {
    const st = fs.statSync(p);
    const b = st.birthtimeMs;
    return b && b > 0 ? b : st.mtimeMs;
  } catch {
    return null;
  }
}

// 이름분석 링크 만들기.
//
// 규칙(원장님 지시, 2026-08-11):
//  · 새로 들어온 PDF 는 누구 것인지 몰라도 무조건 링크를 만든다.
//    (사이트에 올리려고 폴더에 넣는 PDF 는 어차피 다 상담 대상이라, 달력에 상담 일정이
//     아직 없다는 이유로 링크가 안 생기면 손이 간다.)
//  · 예전 것까지 한꺼번에 만들지는 않는다. 지금 폴더에 쌓인 100여 건은 그대로 둔다.
//  · 삭제는 하지 않는다. 링크 파일 정리는 원장님이 직접 하신다.

// 링크 파일에 적힌 주소에서 슬러그만 떼어낸다.
// 파일에는 "https://korea-name-acad.com/홍나영님새이름" 처럼 한글 그대로 들어 있다.
function slugFromLinkFile(linkFile: string): string | null {
  try {
    const url = fs.readFileSync(linkFile, "utf-8").trim();
    const last = url.split("/").filter(Boolean).pop() || "";
    if (!last) return null;
    try {
      return decodeURIComponent(last);
    } catch {
      return last; // % 가 섞인 이상한 값이면 그대로 쓴다
    }
  } catch {
    return null;
  }
}

// 파일 하나에 대한 링크 파일 생성.
//
// 링크 파일이 이미 있으면(같은 이름으로 다시 만든 경우) 주소는 그대로 두고
// 그 주소가 가리키는 이미지만 새것으로 바꾼다. 예전에는 여기서 그냥 돌아가서,
// 잘못 만든 분석표를 고쳐 다시 넣어도 링크를 열면 옛 이미지가 계속 나왔다
// (2026-08-17 홍나영님 새이름 건). 주소를 그대로 두므로 이미 보낸 링크도 그대로 열린다.
export async function makeReportLink(fileName: string, renderedUrl: string): Promise<boolean> {
  if (!renderedUrl) return false;
  if (/상세/.test(fileName)) return false; // 상세설명본은 링크를 만들지 않는다
  const slug = reportSlugFromFile(fileName);
  if (!slug) return false;
  try {
    if (!fs.existsSync(LINK_DIR)) fs.mkdirSync(LINK_DIR, { recursive: true });
    const linkFile = path.join(LINK_DIR, `${slug}.txt`);
    const viewerTarget = `/img?src=${encodeURIComponent(renderedUrl)}`;

    if (fs.existsSync(linkFile)) {
      const 쓰던슬러그 = slugFromLinkFile(linkFile);
      if (!쓰던슬러그) return false;
      const pool = reportPool();
      const cur = await pool.query("SELECT target FROM short_links WHERE slug=$1 LIMIT 1", [
        쓰던슬러그,
      ]);
      if (!cur.rows[0]) return false; // 주소가 DB 에 없으면 손대지 않는다
      if (cur.rows[0].target === viewerTarget) return false; // 이미 최신
      await pool.query("UPDATE short_links SET target=$1 WHERE slug=$2", [
        viewerTarget,
        쓰던슬러그,
      ]);
      console.log(`[KOP] 이름분석 링크 이미지 갱신: ${쓰던슬러그}`);
      return true;
    }

    const usedSlug = await ensureReportLinkSlug(viewerTarget, fileName.replace(/\.[^.]+$/, ""), slug);
    if (!usedSlug) return false;
    // 텍스트 파일: 열어서 Ctrl+A→Ctrl+C 로 복사해 카톡/문자에 붙여넣기. 주소는 한글 그대로(가독).
    fs.writeFileSync(linkFile, `${PUBLIC_BASE}/${usedSlug}`, "utf-8");
    console.log(`[KOP] 이름분석 링크 생성: ${slug}`);
    return true;
  } catch (e: any) {
    console.error(`[KOP] 링크 생성 실패 ${fileName}: ${e?.message}`);
    return false;
  }
}

// 안전망: 처리 직후 링크를 못 만든 건이 있으면 최근 3일 안의 것만 채운다.
// (예전 것까지 되살아나지 않도록 창을 좁게 둔다.)
export async function syncReportLinks(): Promise<void> {
  if (!reportsAvailable()) return; // 로컬 전용
  try {
    const pool = reportPool();
    const rows = (await pool.query(
      `SELECT DISTINCT ON (file_name) file_name, rendered_url, first_seen_at
       FROM report_matches
       WHERE rendered_url IS NOT NULL AND first_seen_at > now() - interval '3 days'
       ORDER BY file_name, first_seen_at DESC`,
    )).rows;
    let made = 0;
    for (const r of rows) {
      if (await makeReportLink(String(r.file_name), String(r.rendered_url))) made++;
    }
    if (made) console.log(`[KOP] 이름분석 링크 보충: ${made}개 (최근 3일 ${rows.length}건 중)`);
  } catch (e: any) {
    console.error(`[KOP] 이름분석 링크 동기화 오류: ${e?.message}`);
  }
}

const RENDER = fileURLToPath(new URL("./py/render_pdf.py", import.meta.url));
const store = new ObjectStorageService();

function renderPng(pdfAbs: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const tmp = path.join(os.tmpdir(), `knoprep_${crypto.randomUUID()}.png`);
    const p = spawn(PY, [RENDER, pdfAbs, tmp], { windowsHide: true });
    let err = "";
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("error", reject);
    p.on("close", (code) => {
      try {
        if (code === 0 && fs.existsSync(tmp)) {
          const b = fs.readFileSync(tmp);
          fs.unlinkSync(tmp);
          resolve(b);
        } else reject(new Error("render 실패: " + err.slice(0, 120)));
      } catch (e) {
        reject(e);
      }
    });
  });
}

// 렌더 어댑터: 파일이 이미 이미지(신규 상담 건, PS1이 4x PNG로 변환)면 바이트 그대로,
// PDF(기존 110건)면 4x PNG로 렌더. 매칭·업로드 이후 흐름은 동일.
function renderOrRead(abs: string): Promise<Buffer> {
  if (isImageReport(abs)) return fs.promises.readFile(abs);
  return renderPng(abs);
}

// 처리기용 raw pg 풀 (파라미터 쿼리·트랜잭션). drizzle db 는 raw query 미노출이라 별도 사용.
let _pool: PgPool | null = null;
export function reportPool(): PgPool {
  if (!_pool) {
    _pool = new PgPool({
      connectionString: (process.env.NEON_DATABASE_URL || process.env.DATABASE_URL)!,
      ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000, idleTimeoutMillis: 30000, max: 3,
    });
  }
  return _pool;
}

// 로컬 해시 캐시(재해싱 방지). DB(report_matches)가 원천이고, 이건 성능용 보조 캐시.
const STATE_FILE = () => path.join(reportsDir(), ".kop_report_state.json");
type HashState = Record<string, { mtime: number; hash: string }>;
function loadState(): HashState {
  try { return JSON.parse(fs.readFileSync(STATE_FILE(), "utf-8")); } catch { return {}; }
}
function saveState(s: HashState) { try { fs.writeFileSync(STATE_FILE(), JSON.stringify(s)); } catch { /* noop */ } }

export type SyncResult = {
  auto_matched: number; needs_review: number; attachment_failed: number;
  processing_failed: number; skipped: number; processed: number;
  // 하위호환(기존 호출부): added = 이번에 새로 자동첨부된 수
  added: number; created: number;
  removed?: number; // 첨부 확인 후 폴더에서 정리한 새이름 PDF 수
};

// 고객정보에 확실히 첨부된 원본 파일만 폴더에서 삭제한다.
// DB(crm_files.memo = "이름분석표:{파일명}")에 첨부 기록이 있을 때만 지운다 — 없으면 그대로 둔다.
async function removeAttachedSourceFile(
  q: { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> },
  file: string,
  abs: string,
): Promise<boolean> {
  try {
    const { rows } = await q.query(`SELECT 1 FROM crm_files WHERE memo = $1 LIMIT 1`, [`${REPORT_PREFIX}${file}`]);
    if (!rows.length) return false; // 첨부 확인 안 되면 삭제하지 않음
    fs.unlinkSync(abs);
    console.log(`[KOP] 새이름 PDF 정리(첨부 확인됨): ${file}`);
    return true;
  } catch (e: any) {
    console.error(`[KOP] 새이름 PDF 정리 실패 ${file}: ${e?.message}`);
    return false;
  }
}

// 새이름 파일 판정: 달력의 '작명완료' 일정에서 같은 이름을 찾고,
// 파일 저장일 기준 가족 두 달 / 혼자 한 달 안이면 그 고객에게 붙인다. (판정 규칙은 newNameMatch.ts)
async function decideNewNameForFile(
  q: { query: (sql: string, params?: any[]) => Promise<{ rows: any[] }> },
  extractedName: string,
  reportType: "family" | "individual",
  absPath: string,
): Promise<{ status: "auto_matched" | "needs_review"; matchedCustomerId: string | null; reason: string } | undefined> {
  try {
    if (!calendarAvailable()) return { status: "needs_review", matchedCustomerId: null, reason: "확인 필요: 달력 키 없음(새이름 판정 불가)" };
    let savedAt = new Date();
    try { savedAt = fs.statSync(absPath).mtime; } catch { /* 못 읽으면 지금 시각 */ }

    const evtRows = await readEvents();
    const events: NamingEvent[] = [];
    for (const e of evtRows) {
      if (!e.cat || !e.cat.includes("완료")) continue;
      const nm = baseName(parseNameCount(e.title || "").name);
      if (!nm) continue;
      events.push({ date: String(e.date || ""), title: e.title || "", name: nm, phone: e.clientPhone ? normalizePhone(e.clientPhone) : null });
    }

    const custs = (await q.query(`SELECT id, name, normalized_phone FROM customers WHERE deleted_at IS NULL`)).rows;
    const cands: NewNameCandidate[] = custs.map((c: any) => ({
      customerId: c.id, customerName: baseName(c.name || ""), normalizedPhone: c.normalized_phone || null,
    }));

    const d = decideNewName(extractedName, reportType, savedAt, events, cands);
    return { status: d.status, matchedCustomerId: d.matchedCustomerId, reason: d.reason };
  } catch (e: any) {
    return { status: "needs_review", matchedCustomerId: null, reason: `확인 필요: 새이름 판정 오류(${String(e?.message).slice(0, 120)})` };
  }
}

let _syncing = false;
export async function syncReports(): Promise<SyncResult> {
  const empty: SyncResult = { auto_matched: 0, needs_review: 0, attachment_failed: 0, processing_failed: 0, skipped: 0, processed: 0, added: 0, created: 0 };
  if (!db || _syncing || !reportsAvailable()) return empty;
  _syncing = true;
  const state = loadState();
  const deps: ProcessorDeps = {
    db: { query: (sql, params) => reportPool().query(sql, params as any[]) as any },
    render: renderOrRead,
    upload: async (key, buf) => { await store.putObject(key, buf, "image/png"); return `/objects/${key}`; },
    hashFile: (abs) => {
      try {
        const st = fs.statSync(abs);
        const cached = state[abs];
        if (cached && cached.mtime === st.mtimeMs) return cached.hash;
        const h = crypto.createHash("sha256").update(fs.readFileSync(abs)).digest("hex");
        state[abs] = { mtime: st.mtimeMs, hash: h };
        return h;
      } catch {
        return crypto.createHash("sha256").update(abs).digest("hex"); // 최후: 경로 해시(사실상 미스)
      }
    },
    now: () => new Date(),
    uuid: () => crypto.randomUUID(),
  };
  const res: SyncResult = { ...empty };
  try {
    const reps = listReports().filter((r) => !/상세/.test(r.file));
    for (const r of reps) {
      const abs = resolveReportPath(r.file);
      if (!abs) continue;
      const extractedName = baseName(r.name);
      const reportType = r.family ? "family" : "individual";
      try {
        const { candidates, failed } = await gatherCandidates(deps.db, extractedName, reportType);
        // 새이름 파일은 판정 축이 다르다: 신청일이 아니라 '달력 작명완료 일정'으로 찾는다.
        const forced = /새이름/.test(r.file)
          ? await decideNewNameForFile(deps.db, extractedName, reportType, abs)
          : undefined;
        const out = await processFile(deps, {
          file: r.file, absPath: abs, extractedName, reportType, label: r.label, candidates, candidatesFailed: failed, forced,
        });
        res.processed++;
        if (out.status === "auto_matched") { res.auto_matched++; res.added++; }
        else if (out.status === "needs_review") res.needs_review++;
        else if (out.status === "attachment_failed") res.attachment_failed++;
        else if (out.status === "processing_failed") res.processing_failed++;
        else res.skipped++;

        // 새이름 PDF 는 고객정보에 붙고 나면 폴더에서 정리한다(이름분석 원본은 그대로 둔다).
        // 대상: 방금 첨부됨 / 이미 첨부돼 있음(수동매칭·중복) — 실제 삭제 여부는 DB 첨부 확인 후 결정.
        const attachedStatus =
          out.status === "auto_matched" || out.status === "manually_matched" || out.status === "duplicate";
        if (/새이름/.test(r.file) && attachedStatus) {
          const deleted = await removeAttachedSourceFile(deps.db, r.file, abs);
          if (deleted) { res.removed = (res.removed || 0) + 1; delete state[abs]; }
        }
      } catch (e: any) {
        console.error(`[KOP] 이름분석표 처리 오류 ${r.file}: ${e?.message}`);
        res.processing_failed++;
      }
    }
    saveState(state);
    if (res.auto_matched || res.needs_review || res.attachment_failed || res.processing_failed) {
      console.log(`[KOP] 이름분석표 동기화: 자동연결 ${res.auto_matched} · 확인필요 ${res.needs_review} · 첨부실패 ${res.attachment_failed} · 처리실패 ${res.processing_failed} (처리 ${res.processed})`);
    }
    await syncReportLinks(); // 방금 들어온 PDF 의 링크 생성(최근 3일 창)
    return res;
  } catch (e: any) {
    console.error(`[KOP] 이름분석표 동기화 오류: ${e?.message}`);
    saveState(state);
    return res;
  } finally {
    _syncing = false;
  }
}

let _watching = false;
export function startReportSync() {
  if (_watching || !reportsAvailable()) return; // 배포 서버(폴더 없음)는 no-op
  _watching = true;
  // 서버 시작 후 밀린 것 처리
  setTimeout(() => syncReports().catch(() => {}), 15000);
  // 폴더 감시 (새 PDF/이미지 감지 → 디바운스 후 동기화)
  try {
    let timer: NodeJS.Timeout | null = null;
    fs.watch(reportsDir(), (_ev, file) => {
      if (!file || !REPORT_EXT.test(String(file))) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => syncReports().catch(() => {}), 6000);
    });
    console.log("[KNOP] 이름분석 폴더 자동 동기화 시작:", reportsDir());
  } catch (e: any) {
    console.error("[KNOP] 폴더 감시 실패:", e?.message);
  }
}
