// ── 쇼츠 썸네일 장면 선택 워커(이 PC 전용) ─────────────────────────────────────
// 서버에 롱폴링으로 "다음 작업"을 묻고, 받으면 에뮬레이터의 유튜브 앱에서 첫 장면을 골라 저장한 뒤
// 실제 썸네일 반영을 확인해 보고한다.
//
//   node tools/yt-frame-worker/worker.mjs            상시 실행(작업이 없으면 서버 쪽에서 대기, DB 조회 없음)
//   node tools/yt-frame-worker/worker.mjs --once     작업 1건만 처리하고 종료(시험용)
//   node tools/yt-frame-worker/worker.mjs --dry      저장 직전까지만(저장 안 함) — 실패로 보고하지 않고 손 뗌
//   node worker.mjs --version                        실행 중인 버전·파일 무결성 확인
//
// 운영 실행은 개발 작업트리가 아니라 고정 실행 폴더(android-test\yt-frame-worker\releases\<버전>)에서 한다
// (release.mjs 로 만들고 작업 스케줄러가 그 위치를 실행). 그 폴더의 MANIFEST.json 으로 시작 때 파일 해시를 대조한다.
//
// 설정(환경변수 또는 C:\Users\iimoo\android-test\yt-frame-worker.env 의 KEY=VALUE):
//   YT_FRAME_SERVER        서버 주소(예: https://koreanameacad.com)
//   YT_FRAME_WORKER_TOKEN  서버와 같은 워커 토큰(화면·로그에 찍지 않는다)
//
// 복구: 상태의 정본은 서버 DB 다. 이 PC 가 꺼져 있던 동안 쌓인 작업은 다시 켜면 바로 받는다.
//       작업 도중 죽으면 서버가 리스(15분) 만료 후 다시 넘긴다.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { pathToFileURL, fileURLToPath } from "node:url";
import { ANDROID_TEST, UDID, APPIUM_PORT, ensureEnv, stopEnv, adoptStarted } from "./env.mjs";
import { selectFrameById, StageError } from "./appiumFlow.mjs";
import { checkPublicThumb } from "./thumbCompare.mjs";

// ── 버전·무결성(고정 실행 폴더에만 MANIFEST.json 이 있다) ──
const HERE = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = path.join(HERE, "MANIFEST.json");
const sha256File = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
function checkIntegrity() {
  if (!fs.existsSync(MANIFEST_PATH)) return { version: "dev(작업트리 직접 실행)", ok: true, release: false };
  const m = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  const bad = Object.entries(m.files)
    .filter(([f, h]) => !fs.existsSync(path.join(HERE, f)) || sha256File(path.join(HERE, f)) !== h)
    .map(([f]) => f);
  return { version: m.version, ok: bad.length === 0, bad, release: true, manifest: m };
}
const INTEGRITY = checkIntegrity();
if (process.argv.includes("--version")) {
  console.log(JSON.stringify({ version: INTEGRITY.version, integrity: INTEGRITY.ok ? "ok" : `변조·누락: ${INTEGRITY.bad.join(", ")}`,
    dir: HERE, deps: INTEGRITY.manifest?.deps ?? null }, null, 1));
  process.exit(INTEGRITY.ok ? 0 : 4);
}
if (!INTEGRITY.ok) {
  console.error(`[무결성 실패] 버전 ${INTEGRITY.version} 파일이 MANIFEST 와 다름: ${INTEGRITY.bad.join(", ")} — 실행 중단`);
  process.exit(4);
}

const argv = new Set(process.argv.slice(2));
const ONCE = argv.has("--once");
const DRY = argv.has("--dry");
const VERIFY_TIMEOUT_MS = Number(process.env.YT_FRAME_VERIFY_TIMEOUT_MS || 10 * 60_000);
const VERIFY_EVERY_MS = 40_000;
const IDLE_SHUTDOWN_MS = 5 * 60_000; // 마지막 작업 후 이만큼 일이 없으면 워커가 켠 에뮬레이터·Appium 을 끈다

// ── 설정 ──
const envFile = path.join(ANDROID_TEST, "yt-frame-worker.env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const SERVER = (process.env.YT_FRAME_SERVER || "").replace(/\/+$/, "");
const TOKEN = (process.env.YT_FRAME_WORKER_TOKEN || "").trim();
if (!SERVER || TOKEN.length < 32) {
  console.error("YT_FRAME_SERVER / YT_FRAME_WORKER_TOKEN(32자 이상) 설정이 필요합니다.");
  process.exit(2);
}

// ── 로그 ──
const LOG_DIR = path.join(ANDROID_TEST, "dl", "yt-frame-worker");
fs.mkdirSync(LOG_DIR, { recursive: true });
const logFile = path.join(LOG_DIR, "worker.log");
const log = (msg, extra) => {
  const line = `[${new Date().toISOString()}] ${msg}${extra ? " " + JSON.stringify(extra) : ""}`;
  console.log(line);
  fs.appendFileSync(logFile, line + "\n");
};

// ── 단일 실행 잠금(같은 PC 에서 워커 2개가 같은 에뮬레이터를 만지지 않게) ──
const LOCK = path.join(ANDROID_TEST, "yt-frame-worker.lock");
function acquireLock() {
  try {
    const fd = fs.openSync(LOCK, "wx");
    fs.writeSync(fd, String(process.pid));
    fs.closeSync(fd);
    return true;
  } catch {
    const pid = Number(fs.readFileSync(LOCK, "utf8"));
    let alive = false;
    try { process.kill(pid, 0); alive = true; } catch {}
    // 재부팅 뒤 같은 PID 를 다른 프로그램이 쓰고 있을 수 있다 → 실제로 워커(node … worker.mjs)일 때만 "실행 중"으로 본다
    if (alive && pid !== process.pid) {
      let cmd = "";
      try {
        cmd = execFileSync("powershell.exe", ["-NoProfile", "-Command", `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`],
          { windowsHide: true, timeout: 15000 }).toString();
      } catch {}
      if (/node/i.test(cmd) && /worker\.mjs/i.test(cmd)) return false;
    }
    fs.writeFileSync(LOCK, String(process.pid)); // 죽은 워커가 남긴 잠금 → 회수
    return true;
  }
}
if (!acquireLock()) {
  console.error("다른 워커가 이미 실행 중입니다 — 종료");
  process.exit(3);
}
const releaseLock = () => { try { if (Number(fs.readFileSync(LOCK, "utf8")) === process.pid) fs.unlinkSync(LOCK); } catch {} };
process.on("exit", releaseLock);
for (const sig of ["SIGINT", "SIGTERM", "SIGBREAK"]) process.on(sig, () => { log(`종료 신호 ${sig}`); process.exit(130); });

// ── 서버 API ──
const H = { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
async function api(method, p, body, timeoutMs = 30_000) {
  const r = await fetch(`${SERVER}${p}`, { method, headers: H, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeoutMs) });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  return { status: r.status, json };
}
class LeaseLost extends Error {}
async function report(task, kind, body) {
  for (let i = 0; i < 5; i++) {
    try {
      const r = await api("POST", `/api/yt-frame/${task.id}/${kind}`, { token: task.leaseToken, ...body });
      if (r.status === 200) return r.json;
      if (r.status === 409) throw new LeaseLost(`${kind}: 리스 잃음(다른 실행이 가져갔거나 이미 종결)`);
      if (r.status === 401 || r.status === 503) throw new Error(`${kind}: 서버 ${r.status}`);
    } catch (e) {
      if (e instanceof LeaseLost) throw e;
      log(`보고 재시도 ${kind}`, { err: String(e?.message ?? e).slice(0, 120) });
    }
    await sleep(3000 * (i + 1));
  }
  throw new Error(`${kind} 보고 실패(5회)`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── webdriverio 는 android-test\appium 에 설치돼 있다 ──
// 고정 실행 폴더에는 버전을 고정해 함께 설치돼 있다. 작업트리 직접 실행 때만 android-test\appium 것을 쓴다
let remote;
try {
  ({ remote } = await import("webdriverio"));
} catch {
  if (INTEGRITY.release) { console.error("[의존성 누락] 실행 폴더에 webdriverio 가 없음 — 실행 중단"); process.exit(4); }
  ({ remote } = await import(pathToFileURL(path.join(ANDROID_TEST, "appium", "node_modules", "webdriverio", "build", "node.js")).href));
}

async function processTask(task) {
  const dir = path.join(LOG_DIR, `${new Date().toISOString().replace(/[:.]/g, "-")}_${task.videoId}`);
  fs.mkdirSync(dir, { recursive: true });
  const tlog = (m, x) => { log(`[${task.videoId}] ${m}`, x); };
  tlog("작업 받음", { attempts: task.attempts, privacy: task.privacyStatus, dry: DRY });

  const hb = setInterval(() => { api("POST", `/api/yt-frame/${task.id}/heartbeat`, { token: task.leaseToken }).catch(() => {}); }, 60_000);
  let driver = null;
  try {
    // 1) 장면 선택·저장
    let saved;
    try {
      started = mergeStarted(started, await ensureEnv(tlog));
      driver = await remote({
        hostname: "127.0.0.1", port: APPIUM_PORT, logLevel: "error",
        capabilities: { platformName: "Android", "appium:automationName": "UiAutomator2", "appium:udid": UDID,
          "appium:noReset": true, "appium:newCommandTimeout": 240 },
      });
      const shot = async (name) => fs.writeFileSync(path.join(dir, `${name}.png`), Buffer.from(await driver.takeScreenshot(), "base64"));
      saved = await selectFrameById(driver, { videoId: task.videoId, liveTitle: task.liveTitle, frameSec: task.frameSec }, { log: tlog, shot, dry: DRY });
    } catch (e) {
      const se = e instanceof StageError ? e : new StageError(e?.stage || "env", String(e?.message ?? e).slice(0, 300), true);
      tlog("실패", { stage: se.stage, reason: se.message, retryable: se.retryable });
      await report(task, "failed", { stage: se.stage, reason: se.message, retryable: se.retryable });
      return;
    } finally {
      if (driver) { await driver.deleteSession().catch(() => {}); driver = null; }
    }
    if (saved.dry) {
      // 점검 모드: 저장하지 않았으니 재시도 가능 실패로 돌려놓는다(알림 없음)
      await report(task, "failed", { stage: "worker", reason: "점검 모드(--dry) — 저장하지 않음", retryable: true });
      tlog("점검 모드 종료 — 저장하지 않음");
      return;
    }
    await report(task, "saved", {});
    tlog("저장 성공 보고");

    // 2) 실제 썸네일 반영 확인
    const privacy = task.privacyStatus;
    if (privacy !== "public" && privacy !== "unlisted") {
      await report(task, "verified", { result: "unverifiable_non_public", detail: `공개범위 ${privacy} — 공개 썸네일 주소로 확인 불가` });
      tlog("반영 확인 불가(비공개) 보고");
      return;
    }
    // 저장 직후 썸네일(바뀌기 전일 수 있음)도 증거로 남긴다
    const t0 = Date.now();
    let last = null;
    while (Date.now() - t0 < VERIFY_TIMEOUT_MS) {
      await sleep(VERIFY_EVERY_MS);
      last = await checkPublicThumb(task.videoId);
      tlog("반영 확인", last);
      if (last.kind === "match") break;
      if (last.kind === "not_public") break;
    }
    const nums = (x) => `첫 프레임 차이 ${x.dFrame0}, 자동 프레임 최소 ${x.nearestAuto}, 첫장면↔자동 ${x.f0Auto}`;
    if (last?.kind === "match") {
      await report(task, "verified", { result: "match", detail: nums(last) });
    } else if (last?.kind === "not_public") {
      await report(task, "verified", { result: "unverifiable_non_public", detail: "공개 썸네일 주소 404" });
    } else if (last?.kind === "mismatch") {
      await report(task, "verified", { result: "mismatch", detail: `${VERIFY_TIMEOUT_MS / 60000}분 뒤에도 첫 장면 아님(${last.why}; ${nums(last)})` });
    } else if (last?.kind === "uncertain") {
      // 애매하면 성공으로 기록하지 않는다 → 확인 필요
      await report(task, "verified", { result: "uncertain", detail: `${last.why}; ${nums(last)}` });
    } else {
      await report(task, "failed", { stage: "verify", reason: `반영 확인 불가: ${last?.detail ?? "응답 없음"}`, retryable: true });
    }
    tlog("반영 확인 보고", { kind: last?.kind });
  } catch (e) {
    tlog(e instanceof LeaseLost ? "리스 잃음 — 손 뗌" : "처리 중 오류", { err: String(e?.message ?? e).slice(0, 200) });
  } finally {
    clearInterval(hb);
  }
}

let started = { emulator: null, appium: null };
const mergeStarted = (a, b) => ({ emulator: a.emulator ?? b.emulator, appium: a.appium ?? b.appium });

async function main() {
  log(`워커 시작 (버전 ${INTEGRITY.version}, 서버 ${new URL(SERVER).host}${ONCE ? ", 1건만" : ""}${DRY ? ", 점검 모드" : ""})`);
  started = await adoptStarted(log);
  let backoff = 5000;
  let lastWorkAt = Date.now();
  let failStreak = 0;
  const maybeIdleStop = async () => {
    if ((started.emulator || started.appium) && Date.now() - lastWorkAt > IDLE_SHUTDOWN_MS) {
      await stopEnv(started, log);
      started = { emulator: null, appium: null };
    }
  };
  for (;;) {
    let r;
    try {
      r = await api("GET", "/api/yt-frame/next?wait=50", null, 70_000);
      if (failStreak) log("서버 연결 복구", { 실패횟수: failStreak });
      backoff = 5000;
      failStreak = 0;
    } catch (e) {
      // 네트워크 끊김·서버 재시작: 대기 작업은 서버 DB 에 남아 있으니 다시 연결되면 이어서 받는다
      failStreak++;
      if (failStreak <= 3 || failStreak % 20 === 0) log("서버 연결 실패 — 잠시 후 재시도", { err: String(e?.message ?? e).slice(0, 120), waitMs: backoff, 연속: failStreak });
      await maybeIdleStop();
      await sleep(backoff);
      backoff = Math.min(backoff * 2, 2 * 60_000);
      continue;
    }
    if (r.status === 200 && r.json?.task) {
      await processTask(r.json.task);
      lastWorkAt = Date.now();
      if (ONCE) break;
      continue;
    }
    if (r.status === 204) {
      await maybeIdleStop();
      continue;
    }
    // 401(토큰 불일치)·503(서버에서 꺼짐) 등: 설정 문제일 수 있으니 천천히 다시 묻는다
    log("서버 응답 이상", { status: r.status });
    await maybeIdleStop();
    await sleep(backoff);
    backoff = Math.min(backoff * 2, 5 * 60_000);
  }
  if (started.emulator || started.appium) await stopEnv(started, log);
  log("워커 종료");
}

await main();
process.exit(0);
