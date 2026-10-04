// 이 PC 의 에뮬레이터·Appium 준비/정리. 모든 도구는 C:\Users\iimoo\android-test 한 폴더 안에 있다.
import { spawn, execFile } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

export const ANDROID_TEST = process.env.ANDROID_TEST_DIR || "C:/Users/iimoo/android-test";
const SDK = path.join(ANDROID_TEST, "sdk");
const ADB = path.join(SDK, "platform-tools", "adb.exe");
const EMULATOR = path.join(SDK, "emulator", "emulator.exe");
const APPIUM_MAIN = path.join(ANDROID_TEST, "appium", "node_modules", "appium", "index.js");
export const UDID = "emulator-5554";
// 워커가 켠 에뮬레이터·Appium 기록(워커가 죽었다 다시 떠도 자기가 켠 것을 끌 수 있게)
const MARK = path.join(ANDROID_TEST, "yt-frame-worker.started.json");
export const APPIUM_PORT = 4723;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function toolEnv() {
  const jdkDir = path.join(ANDROID_TEST, "jdk");
  const jdk = fs.existsSync(jdkDir) ? fs.readdirSync(jdkDir).find((d) => d.startsWith("jdk-17")) : null;
  return {
    ...process.env,
    ANDROID_HOME: SDK,
    ANDROID_SDK_ROOT: SDK,
    ANDROID_USER_HOME: path.join(ANDROID_TEST, ".android"),
    ANDROID_AVD_HOME: path.join(ANDROID_TEST, ".android", "avd"),
    APPIUM_HOME: path.join(ANDROID_TEST, "appium", "home"),
    ...(jdk ? { JAVA_HOME: path.join(jdkDir, jdk) } : {}),
  };
}

function run(file, args, timeoutMs = 15000) {
  return new Promise((resolve) => {
    execFile(file, args, { env: toolEnv(), timeout: timeoutMs, windowsHide: true }, (err, stdout) =>
      resolve({ ok: !err, out: String(stdout ?? "").trim() }));
  });
}

export async function emulatorReady() {
  const d = await run(ADB, ["devices"]);
  if (!new RegExp(`${UDID}\\s+device`).test(d.out)) return false;
  const b = await run(ADB, ["-s", UDID, "shell", "getprop", "sys.boot_completed"]);
  return b.out === "1";
}

export async function appiumReady() {
  try {
    const r = await fetch(`http://127.0.0.1:${APPIUM_PORT}/status`, { signal: AbortSignal.timeout(3000) });
    return r.ok;
  } catch { return false; }
}

/** 필요하면 켠다. 반환: 이번에 새로 켠 것들(작업이 끝나면 이것만 끈다) */
export async function ensureEnv(log) {
  const started = { emulator: null, appium: null };
  if (!(await emulatorReady())) {
    log("에뮬레이터 켜는 중");
    // 기본은 화면 없이(-no-window) — 작업 중 PC 사용을 방해하지 않게. 창을 보려면 YT_FRAME_EMULATOR_WINDOW=1
    const winArgs = process.env.YT_FRAME_EMULATOR_WINDOW === "1" ? [] : ["-no-window"];
    const p = spawn(EMULATOR, ["-avd", "yt_test", "-no-snapshot-load", "-gpu", "auto", "-no-audio", ...winArgs],
      { env: toolEnv(), detached: true, stdio: "ignore", windowsHide: false });
    p.unref();
    started.emulator = p.pid;
    saveMark(started);
    const t0 = Date.now();
    while (!(await emulatorReady())) {
      if (Date.now() - t0 > 5 * 60_000) throw Object.assign(new Error("에뮬레이터 부팅 5분 초과"), { stage: "env" });
      await sleep(5000);
    }
    await sleep(15000); // 부팅 직후 앱·구글 서비스 안정화
    log("에뮬레이터 준비됨");
  }
  if (!(await appiumReady())) {
    log("Appium 켜는 중");
    const out = fs.openSync(path.join(ANDROID_TEST, "dl", "yt-frame-worker", "appium.log"), "a");
    const p = spawn(process.execPath, [APPIUM_MAIN, "--port", String(APPIUM_PORT), "--log-level", "info", "--relaxed-security"],
      { env: toolEnv(), detached: true, stdio: ["ignore", out, out], windowsHide: true });
    p.unref();
    started.appium = p.pid;
    saveMark(started);
    const t0 = Date.now();
    while (!(await appiumReady())) {
      if (Date.now() - t0 > 60_000) throw Object.assign(new Error("Appium 시작 60초 초과"), { stage: "env" });
      await sleep(1000);
    }
    log("Appium 준비됨");
  }
  return started;
}

function saveMark(started) {
  const prev = loadMarkRaw();
  fs.writeFileSync(MARK, JSON.stringify({ emulator: started.emulator ?? prev.emulator ?? null, appium: started.appium ?? prev.appium ?? null }));
}
function loadMarkRaw() {
  try { return JSON.parse(fs.readFileSync(MARK, "utf8")); } catch { return {}; }
}

/** 프로세스 명령줄(같은 PID 가 재부팅 뒤 다른 프로그램에 쓰였을 수 있어 확인용) */
function cmdline(pid) {
  return new Promise((resolve) => {
    execFile("powershell.exe", ["-NoProfile", "-Command", `(Get-CimInstance Win32_Process -Filter "ProcessId=${Number(pid)}").CommandLine`],
      { windowsHide: true, timeout: 15000 }, (_e, out) => resolve(String(out ?? "")));
  });
}

/** 이전 워커 실행이 켜 두고 못 끈 것을 넘겨받는다(지금도 그 프로그램일 때만) */
export async function adoptStarted(log) {
  const m = loadMarkRaw();
  const started = { emulator: null, appium: null };
  if (m.appium && /appium/i.test(await cmdline(m.appium))) started.appium = m.appium;
  if (m.emulator && /emulator|qemu/i.test(await cmdline(m.emulator)) && (await emulatorReady())) started.emulator = m.emulator;
  if (started.appium || started.emulator) log("이전 실행이 켠 에뮬레이터·Appium 을 넘겨받음", started);
  else if (fs.existsSync(MARK)) fs.unlinkSync(MARK);
  return started;
}

/** 이 워커가 켠 것만 끈다(사람이 켜 둔 에뮬레이터는 건드리지 않음) */
export async function stopEnv(started, log) {
  if (started.appium) {
    if (/appium/i.test(await cmdline(started.appium))) { try { process.kill(started.appium); log("Appium 종료"); } catch {} }
  }
  if (started.emulator) {
    await run(ADB, ["-s", UDID, "emu", "kill"]);
    log("에뮬레이터 종료");
  }
  try { fs.unlinkSync(MARK); } catch {}
}
