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
} from "./reports";

const PY = (process.env.KOP_WHISPER_PY || process.env.KNOP_WHISPER_PY)?.trim() || "C:/Users/iimoo/Desktop/video-caption-bot/venv/Scripts/python.exe";
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
    render: renderPng,
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
  // 폴더 감시 (새 PDF 감지 → 디바운스 후 동기화)
  try {
    let timer: NodeJS.Timeout | null = null;
    fs.watch(reportsDir(), (_ev, file) => {
      if (!file || !String(file).toLowerCase().endsWith(".pdf")) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => syncReports().catch(() => {}), 6000);
    });
    console.log("[KNOP] 이름분석 폴더 자동 동기화 시작:", reportsDir());
  } catch (e: any) {
    console.error("[KNOP] 폴더 감시 실패:", e?.message);
  }
}
