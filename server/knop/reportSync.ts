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
} from "./reports";
import { readEvents, parseNameCount, calendarAvailable } from "./calendar";

const PY = (process.env.KOP_WHISPER_PY || process.env.KNOP_WHISPER_PY)?.trim() || "C:/Users/iimoo/Desktop/video-caption-bot/venv/Scripts/python.exe";

// 문자 발송용 링크(.url 바로가기)를 저장할 로컬 폴더 + 링크가 가리킬 공개 도메인
const LINK_DIR = (process.env.KOP_REPORT_LINK_DIR || "C:/Users/iimoo/Desktop/이름분석링크").trim();
const PUBLIC_BASE = (process.env.PUBLIC_BASE_URL || "https://korea-name-acad.com").replace(/\/$/, "");

// 파일명 → 링크 슬러그: "하주오님 가족 이름분석.pdf" → "하주오님가족이름분석표" (파일명 그대로, 님 포함)
function reportSlugFromFile(fileName: string): string {
  let b = fileName.replace(/\.(pdf|png|jpe?g|webp)$/i, "").replace(/\s*\(상세\)\s*/g, "");
  if (/이름분석(?!표)/.test(b)) b = b.replace(/이름분석(?!표)/g, "이름분석표");
  else if (!/이름분석표/.test(b)) b = b + "이름분석표";
  return b.replace(/\s+/g, "").replace(/[^0-9A-Za-z가-힣_-]/g, "").slice(0, 60);
}

// 같은 대상이면 기존 슬러그 재사용, 없으면 원하는 슬러그(충돌 시 -2)로 생성. (워커의 raw pg 풀 사용)
async function ensureReportLinkSlug(target: string, label: string, desiredSlug: string): Promise<string | null> {
  const pool = reportPool();
  try {
    const ex = await pool.query("SELECT slug FROM short_links WHERE target=$1 LIMIT 1", [target]);
    if (ex.rows[0]) return ex.rows[0].slug as string;
    const tries = desiredSlug ? [desiredSlug, ...Array.from({ length: 30 }, (_, i) => `${desiredSlug}-${i + 2}`)] : [];
    for (const slug of tries) {
      try {
        await pool.query("INSERT INTO short_links (slug, target, label, kind) VALUES ($1,$2,$3,'image')", [slug, target, label]);
        return slug;
      } catch {
        /* 슬러그 충돌 → 다음 후보 */
      }
    }
    return null;
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

// 이름분석링크 폴더를 '오늘 이후 상담예정자'로 동기화: 예정자 링크(.url) 생성 + 비예정자 링크 정리.
export async function syncReportLinks(): Promise<void> {
  if (!reportsAvailable()) return; // 로컬 전용
  const upcoming = await upcomingConsultNames();
  if (!upcoming) return; // 달력 못 읽으면 아무 것도 안 함(전체 생성 방지)
  try {
    if (!fs.existsSync(LINK_DIR)) fs.mkdirSync(LINK_DIR, { recursive: true });
    const pool = reportPool();
    const rows = (await pool.query(
      `SELECT DISTINCT ON (file_name) file_name, extracted_name, rendered_url
       FROM report_matches WHERE rendered_url IS NOT NULL
       ORDER BY file_name, first_seen_at DESC`,
    )).rows;
    const wanted = new Set<string>();
    let made = 0;
    for (const r of rows) {
      if (/상세/.test(r.file_name)) continue;
      const nm = baseName(r.extracted_name || "");
      if (!nm || !upcoming.has(nm)) continue; // 상담예정자만
      const slug = reportSlugFromFile(r.file_name);
      if (!slug) continue;
      wanted.add(`${slug}.txt`);
      const linkFile = path.join(LINK_DIR, `${slug}.txt`);
      if (fs.existsSync(linkFile)) continue;
      const viewerTarget = `/img?src=${encodeURIComponent(r.rendered_url)}`;
      const usedSlug = await ensureReportLinkSlug(viewerTarget, String(r.file_name).replace(/\.[^.]+$/, ""), slug);
      if (!usedSlug) continue;
      // 텍스트 파일: 열어서 Ctrl+A→Ctrl+C 로 복사해 카톡/문자에 붙여넣기. 주소는 한글 그대로(가독).
      fs.writeFileSync(linkFile, `${PUBLIC_BASE}/${usedSlug}`, "utf-8");
      made++;
    }
    // 상담예정이 아닌 사람의 링크 파일은 폴더에서 제거(옛 .url 포함) → '오늘 이후 상담예정자'만 남음
    let removed = 0;
    for (const f of fs.readdirSync(LINK_DIR)) {
      const low = f.toLowerCase();
      if ((low.endsWith(".txt") || low.endsWith(".url")) && !wanted.has(f)) {
        try { fs.unlinkSync(path.join(LINK_DIR, f)); removed++; } catch { /* noop */ }
      }
    }
    if (made || removed) console.log(`[KOP] 상담예정 링크 동기화: 생성 ${made} · 정리 ${removed} (상담예정 ${upcoming.size}명)`);
  } catch (e: any) {
    console.error(`[KOP] 상담예정 링크 동기화 오류: ${e?.message}`);
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
};

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
        const out = await processFile(deps, {
          file: r.file, absPath: abs, extractedName, reportType, label: r.label, candidates, candidatesFailed: failed,
        });
        res.processed++;
        if (out.status === "auto_matched") { res.auto_matched++; res.added++; }
        else if (out.status === "needs_review") res.needs_review++;
        else if (out.status === "attachment_failed") res.attachment_failed++;
        else if (out.status === "processing_failed") res.processing_failed++;
        else res.skipped++;
      } catch (e: any) {
        console.error(`[KOP] 이름분석표 처리 오류 ${r.file}: ${e?.message}`);
        res.processing_failed++;
      }
    }
    saveState(state);
    if (res.auto_matched || res.needs_review || res.attachment_failed || res.processing_failed) {
      console.log(`[KOP] 이름분석표 동기화: 자동연결 ${res.auto_matched} · 확인필요 ${res.needs_review} · 첨부실패 ${res.attachment_failed} · 처리실패 ${res.processing_failed} (처리 ${res.processed})`);
    }
    await syncReportLinks(); // 오늘 이후 상담예정자 링크 폴더 동기화
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
