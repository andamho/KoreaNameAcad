// 작명장 PDF 폴더 자동 링크 생성 (로컬 전용).
// Desktop\작명장\PDF 에 PDF 가 들어오면 → 전체 페이지를 이어붙인 PNG 로 렌더 → R2 업로드
// → 짧은링크 생성 → Desktop\작명장\링크\<PDF파일명>.txt 에 주소를 적어둔다.
// (이름분석표 링크 흐름[reportSync.syncReportLinks]과 같은 방식이지만, 고객 매칭·달력 조건 없이 "PDF 1개 = 링크 1개".)
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { ObjectStorageService } from "../object_storage/objectStorage";
import { reportPool } from "./reportSync";

const PY = (process.env.KOP_WHISPER_PY || process.env.KNOP_WHISPER_PY)?.trim()
  || "C:/Users/iimoo/Desktop/test-app/video-caption-bot/venv/Scripts/python.exe";
const RENDER = fileURLToPath(new URL("./py/render_pdf_pages.py", import.meta.url));

const PDF_DIR = (process.env.KOP_NAMING_PDF_DIR || "C:/Users/iimoo/Desktop/작명장/PDF").trim();
// 한글에서 PDF 를 실제로 내보내는 폴더(보관용 173건). 여기에 새로 생긴 것만 위 PDF_DIR 로 복사해
// 링크가 자동으로 만들어지게 한다. 보관본은 그대로 두므로 원장님 기존 습관은 그대로.
const INTAKE_DIR = (process.env.KOP_NAMING_INTAKE_DIR || "C:/Users/iimoo/Desktop/작명장/PDF작명장").trim();
const LINK_DIR = (process.env.KOP_NAMING_LINK_DIR || "C:/Users/iimoo/Desktop/작명장/링크").trim();
const PUBLIC_BASE = (process.env.PUBLIC_BASE_URL || "https://korea-name-acad.com").replace(/\/$/, "");

const store = new ObjectStorageService();

export function namingAvailable(): boolean {
  try {
    return fs.existsSync(PDF_DIR) && fs.statSync(PDF_DIR).isDirectory();
  } catch {
    return false;
  }
}

// 파일명 → 링크 슬러그(괄호 포함): "운이 술술 풀리는 이름 [김이나]" → "운이술술풀리는이름[김이나]"
// 이건 '보조 주소'로만 쓴다. 고객에게 보내는 주소는 아래 slugFromFile(괄호 뺀 것).
function bracketSlugFromFile(fileName: string): string {
  return fileName
    .replace(/\.pdf$/i, "")
    .replace(/\s+/g, "")
    .replace(/[^0-9A-Za-z가-힣_\-[\]()]/g, "")
    .slice(0, 60);
}

// 카톡·문자 미리보기 카드에 뜨는 제목: 파일명에서 [이름] 부분을 뺀 것.
// "운이 술술 풀리는 이름 [윤하라]" → "운이 술술 풀리는 이름"
// (고객 이름이 미리보기 카드에 노출되지 않게 일부러 뺀다.)
function displayTitleFromFile(fileName: string): string {
  const t = fileName
    .replace(/\.pdf$/i, "")
    .replace(/[[(][^\])]*[\])]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t.slice(0, 80);
}

// 실제로 보내는 주소용 슬러그 — 괄호를 뺀다.
// 대괄호는 인터넷 주소에 원래 못 쓰는 문자라 카톡·문자가 '[' 앞에서 링크를 끊어버린다
// → 고객이 "링크를 열 수 없습니다"를 보게 됨(2026-08-01 실제 발생). 그래서 괄호는 주소에서 뺀다.
function slugFromFile(fileName: string): string {
  return bracketSlugFromFile(fileName).replace(/[[\]()]/g, "");
}

// 전체 페이지를 세로로 이어붙인 PNG 로 렌더
function renderPng(pdfAbs: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const tmp = path.join(os.tmpdir(), `knopnaming_${crypto.randomUUID()}.png`);
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
        } else {
          if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
          reject(new Error("render 실패: " + err.slice(-160)));
        }
      } catch (e) {
        reject(e);
      }
    });
  });
}

// 상태 캐시: 같은 PDF 를 다시 올리지 않기 위함. 링크 폴더에 숨겨 둔다.
type NamingState = Record<string, { mtime: number; size: number; slug: string; url: string }>;
const STATE_FILE = () => path.join(LINK_DIR, ".kop_naming_state.json");
function loadState(): NamingState {
  try { return JSON.parse(fs.readFileSync(STATE_FILE(), "utf-8")); } catch { return {}; }
}
function saveState(s: NamingState) { try { fs.writeFileSync(STATE_FILE(), JSON.stringify(s)); } catch { /* noop */ } }

// 원하는 슬러그로 short_links 행 확보. 충돌하면 -2, -3... 로 비켜간다.
async function ensureSlug(target: string, label: string, desired: string): Promise<string | null> {
  const pool = reportPool();
  try {
    // 이미 그 주소가 '같은 파일'을 가리키고 있으면 그대로 쓴다(목적지만 새 이미지로 교체).
    // → 상태파일이 지워져도 -2, -3 으로 밀리지 않고 원장님이 보낸 주소가 그대로 유지된다.
    const same = await pool.query("SELECT slug, label, target FROM short_links WHERE slug=$1 LIMIT 1", [desired]);
    if (same.rows[0]) {
      if (same.rows[0].target === target) return desired;
      if (same.rows[0].label === label) {
        await retargetSlug(desired, target);
        return desired;
      }
    }
    const tries = [desired, ...Array.from({ length: 30 }, (_, i) => `${desired}-${i + 2}`)];
    for (const slug of tries) {
      try {
        await pool.query("INSERT INTO short_links (slug, target, label, kind) VALUES ($1,$2,$3,'image')", [slug, target, label]);
        return slug;
      } catch { /* 슬러그 충돌 → 다음 후보 */ }
    }
    return null;
  } catch (e: any) {
    console.error(`[작명장] 링크 슬러그 생성 실패: ${e?.message}`);
    return null;
  }
}

// 이미 보낸 링크가 계속 살아있도록, 같은 슬러그의 목적지만 새 이미지로 바꾼다.
async function retargetSlug(slug: string, target: string): Promise<boolean> {
  try {
    await reportPool().query("UPDATE short_links SET target=$2 WHERE slug=$1", [slug, target]);
    return true;
  } catch (e: any) {
    console.error(`[작명장] 링크 목적지 갱신 실패 ${slug}: ${e?.message}`);
    return false;
  }
}

// 괄호 있는 주소도 같은 이미지로 열리게 같이 등록해 둔다(주소창에 직접 쳐 넣는 경우 대비).
// 규칙이 바뀌어도 예전에 보낸 주소가 죽으면 안 되기 때문에, 한 번 만든 슬러그는 지우지 않고 목적지만 맞춰준다.
async function ensureAlias(alias: string, target: string, label: string): Promise<void> {
  if (!alias) return;
  const pool = reportPool();
  try {
    // 남의 슬러그를 뺏지 않도록, 없을 때만 넣고 / 같은 파일(label)일 때만 목적지를 갱신한다.
    await pool.query(
      `INSERT INTO short_links (slug, target, label, kind) VALUES ($1,$2,$3,'image')
       ON CONFLICT (slug) DO UPDATE SET target = EXCLUDED.target
       WHERE short_links.label = EXCLUDED.label`,
      [alias, target, label],
    );
  } catch (e: any) {
    console.error(`[작명장] 보조 링크 확보 실패 ${alias}: ${e?.message}`);
  }
}

async function processPdf(file: string, state: NamingState): Promise<"made" | "updated" | "skipped" | "failed"> {
  const abs = path.join(PDF_DIR, file);
  const base = file.replace(/\.pdf$/i, "");
  const linkFile = path.join(LINK_DIR, `${base}.txt`);
  let st: fs.Stats;
  try { st = fs.statSync(abs); } catch { return "skipped"; }

  const prev = state[file];
  const unchanged = prev && prev.mtime === st.mtimeMs && prev.size === st.size;
  if (unchanged && fs.existsSync(linkFile)) return "skipped";

  // 내용은 그대로인데 링크 파일만 없어진 경우 → 다시 렌더하지 않고 파일만 복구
  if (unchanged && prev.url) {
    fs.writeFileSync(linkFile, prev.url, "utf-8");
    return "made";
  }

  const desired = slugFromFile(file);
  if (!desired) { console.error(`[작명장] 슬러그를 만들 수 없는 파일명: ${file}`); return "failed"; }

  try {
    const buf = await renderPng(abs);
    const key = `uploads/${crypto.randomUUID()}.png`;
    await store.putObject(key, buf, "image/png");
    const title = displayTitleFromFile(file);
    const target = `/img?src=${encodeURIComponent(`/objects/${key}`)}&t=${encodeURIComponent(title)}`;

    let slug: string | null;
    let updated = false;
    if (prev?.slug) {
      // 같은 파일의 새 버전 → 기존 링크 주소를 유지하고 이미지만 교체
      updated = await retargetSlug(prev.slug, target);
      slug = updated ? prev.slug : await ensureSlug(target, base, desired);
    } else {
      slug = await ensureSlug(target, base, desired);
    }
    if (!slug) return "failed";
    // 괄호 있는 주소도 같은 이미지를 가리키게 유지(예전에 보낸 주소가 죽지 않도록)
    const alias = bracketSlugFromFile(file);
    if (alias && alias !== slug) await ensureAlias(alias, target, base);

    // 주소는 한글 그대로 적는다(가독성). 카톡·문자·브라우저가 알아서 인코딩해 연다.
    const url = `${PUBLIC_BASE}/s/${slug}`;
    if (!fs.existsSync(LINK_DIR)) fs.mkdirSync(LINK_DIR, { recursive: true });
    // 열어서 Ctrl+A → Ctrl+C 로 복사해 카톡/문자에 붙여넣는 용도 (이름분석표 링크와 동일)
    fs.writeFileSync(linkFile, url, "utf-8");
    state[file] = { mtime: st.mtimeMs, size: st.size, slug, url };
    console.log(`[작명장] 링크 ${updated ? "갱신" : "생성"}: ${base}.txt → ${url} (${Math.round(buf.length / 1024)}KB)`);
    return updated ? "updated" : "made";
  } catch (e: any) {
    console.error(`[작명장] 링크 생성 실패 ${file}: ${e?.message}`);
    return "failed";
  }
}

// ── 반입(intake): PDF작명장 → PDF ────────────────────────────────────────────
// 한글에서 내보낸 PDF 는 'PDF작명장'(보관용) 에 쌓인다. 원장님이 손으로 'PDF' 로 옮기던 것을 자동화한다.
// 원본은 지우지 않고 복사만 한다(보관본 유지). 처음 켤 때 이미 있던 것들은 '기준선'으로 기록만 하고
// 복사하지 않는다 — 안 그러면 옛날 173건이 한꺼번에 링크로 만들어진다.
type IntakeState = { seen: string[] };
const INTAKE_STATE_FILE = () => path.join(LINK_DIR, ".kop_naming_intake.json");
function loadIntake(): IntakeState | null {
  try {
    const j = JSON.parse(fs.readFileSync(INTAKE_STATE_FILE(), "utf-8"));
    return Array.isArray(j?.seen) ? { seen: j.seen } : null;
  } catch {
    return null;
  }
}
function saveIntake(s: IntakeState) { try { fs.writeFileSync(INTAKE_STATE_FILE(), JSON.stringify(s)); } catch { /* noop */ } }

export function intakeAvailable(): boolean {
  try { return fs.existsSync(INTAKE_DIR) && fs.statSync(INTAKE_DIR).isDirectory(); } catch { return false; }
}

let _intaking = false;
export async function syncNamingIntake(): Promise<{ copied: number }> {
  const res = { copied: 0 };
  if (!intakeAvailable() || !namingAvailable() || _intaking) return res;
  _intaking = true;
  try {
    if (!fs.existsSync(LINK_DIR)) fs.mkdirSync(LINK_DIR, { recursive: true });
    const files = fs.readdirSync(INTAKE_DIR).filter((f) => /\.pdf$/i.test(f));
    let state = loadIntake();
    if (!state) {
      // 첫 실행: 지금 있는 건 전부 '이미 본 것'으로 기록만 하고 끝낸다.
      saveIntake({ seen: files });
      console.log(`[작명장] 반입 기준선 등록: ${files.length}건 (앞으로 새로 생기는 것만 PDF 폴더로 복사)`);
      return res;
    }
    const seen = new Set(state.seen);
    for (const f of files) {
      if (seen.has(f)) continue;
      const src = path.join(INTAKE_DIR, f);
      const dest = path.join(PDF_DIR, f);
      try {
        if (fs.existsSync(dest)) {
          seen.add(f); // 이미 손으로 옮겨둔 건 복사하지 않고 본 것으로만 표시
          continue;
        }
        fs.copyFileSync(src, dest);
        seen.add(f);
        res.copied++;
        console.log(`[작명장] 새 PDF 반입: ${f} → PDF 폴더`);
      } catch (e: any) {
        console.error(`[작명장] 반입 실패 ${f}: ${e?.message}`); // 다음 번에 다시 시도되도록 seen 에 넣지 않는다
      }
    }
    saveIntake({ seen: Array.from(seen) });
    return res;
  } catch (e: any) {
    console.error(`[작명장] 반입 오류: ${e?.message}`);
    return res;
  } finally {
    _intaking = false;
  }
}

let _intakeWatching = false;
export function startNamingIntake() {
  if (_intakeWatching || !intakeAvailable() || !namingAvailable()) return;
  _intakeWatching = true;
  try {
    let timer: NodeJS.Timeout | null = null;
    fs.watch(INTAKE_DIR, (_ev, file) => {
      if (!file || !/\.pdf$/i.test(String(file))) return;
      if (timer) clearTimeout(timer);
      // 한글이 PDF 를 다 쓸 때까지 여유를 준다. 복사가 끝나면 PDF 폴더 감시가 이어받아 링크를 만든다.
      timer = setTimeout(() => { syncNamingIntake().catch(() => {}); }, 8000);
    });
    console.log("[작명장] 새 PDF 반입 감시 시작:", INTAKE_DIR, "→", PDF_DIR);
  } catch (e: any) {
    console.error("[작명장] 반입 감시 실패:", e?.message);
  }
}

let _syncing = false;
export async function syncNamingLinks(): Promise<{ made: number; updated: number; skipped: number; failed: number }> {
  const res = { made: 0, updated: 0, skipped: 0, failed: 0 };
  if (!namingAvailable() || _syncing) return res;
  _syncing = true;
  try {
    if (!fs.existsSync(LINK_DIR)) fs.mkdirSync(LINK_DIR, { recursive: true });
    const state = loadState();
    const files = fs.readdirSync(PDF_DIR).filter((f) => /\.pdf$/i.test(f));
    for (const f of files) {
      const r = await processPdf(f, state);
      res[r === "made" ? "made" : r === "updated" ? "updated" : r === "failed" ? "failed" : "skipped"]++;
    }
    // 폴더에서 사라진 PDF 는 상태에서만 정리 (링크 파일·short_links 행은 그대로 둬 이미 보낸 링크가 계속 열리게 한다)
    const alive = new Set(files);
    for (const k of Object.keys(state)) if (!alive.has(k)) delete state[k];
    saveState(state);
    if (res.made || res.updated || res.failed) {
      console.log(`[작명장] 링크 동기화: 생성 ${res.made} · 갱신 ${res.updated} · 실패 ${res.failed} (건너뜀 ${res.skipped})`);
    }
    return res;
  } catch (e: any) {
    console.error(`[작명장] 링크 동기화 오류: ${e?.message}`);
    return res;
  } finally {
    _syncing = false;
  }
}

let _watching = false;
export function startNamingSync() {
  if (_watching || !namingAvailable()) return; // 폴더 없는 PC/배포 서버는 no-op
  _watching = true;
  try {
    let timer: NodeJS.Timeout | null = null;
    fs.watch(PDF_DIR, (_ev, file) => {
      if (!file || !/\.pdf$/i.test(String(file))) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { syncNamingLinks().catch(() => {}); }, 6000); // 복사 끝날 때까지 대기
    });
    console.log("[작명장] PDF 폴더 감시 시작:", PDF_DIR, "→ 링크:", LINK_DIR);
  } catch (e: any) {
    console.error("[작명장] 폴더 감시 실패:", e?.message);
  }
}
