// 쇼츠 썸네일 워커 — 고정 실행 폴더 관리(개발 작업트리를 직접 실행하지 않게)
//
//   node tools/yt-frame-worker/release.mjs build            시험 통과 후 새 버전 폴더 생성(아직 사용 안 함)
//   node tools/yt-frame-worker/release.mjs activate <버전>   그 버전으로 전환(실행 중 워커 재시작)
//   node tools/yt-frame-worker/release.mjs rollback         직전 버전으로 되돌림
//   node tools/yt-frame-worker/release.mjs status           현재 버전·무결성·실행 중 프로세스
//   node tools/yt-frame-worker/release.mjs install-task     실행 폴더에 감독 스크립트 복사 + 작업 스케줄러 등록(그 위치로)
//
// 실행 폴더: C:\Users\iimoo\android-test\yt-frame-worker\
//   releases\<버전>\  워커 파일 + MANIFEST.json(파일 sha256·의존성 버전) + node_modules(webdriverio 고정)
//   current.txt       사용 중 버전(감독 루프가 매번 읽음)
//   history.log       전환 기록(rollback 이 직전 버전을 여기서 찾음)
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const SRC = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(SRC, "../..");
const ANDROID_TEST = process.env.ANDROID_TEST_DIR || "C:/Users/iimoo/android-test";
const RT = path.join(ANDROID_TEST, "yt-frame-worker");
const RELEASES = path.join(RT, "releases");
const CURRENT = path.join(RT, "current.txt");
const HISTORY = path.join(RT, "history.log");
const FILES = ["worker.mjs", "appiumFlow.mjs", "env.mjs", "thumbCompare.mjs"];
const TASK = "KOP 쇼츠 썸네일 워커";

const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const readCurrent = () => (fs.existsSync(CURRENT) ? fs.readFileSync(CURRENT, "utf8").trim() : null);
const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { encoding: "utf8", windowsHide: true, ...opts }).trim();
const tryVer = (fn) => { try { return fn(); } catch { return null; } };

function verifyRelease(ver) {
  const dir = path.join(RELEASES, ver);
  const mf = path.join(dir, "MANIFEST.json");
  if (!fs.existsSync(mf)) return { ok: false, why: "MANIFEST 없음" };
  const m = JSON.parse(fs.readFileSync(mf, "utf8"));
  const bad = Object.entries(m.files).filter(([f, h]) => !fs.existsSync(path.join(dir, f)) || sha(fs.readFileSync(path.join(dir, f))) !== h).map(([f]) => f);
  const wdio = path.join(dir, "node_modules", "webdriverio", "package.json");
  const wdioVer = fs.existsSync(wdio) ? JSON.parse(fs.readFileSync(wdio, "utf8")).version : null;
  if (wdioVer !== m.deps.webdriverio) bad.push(`webdriverio(${wdioVer}≠${m.deps.webdriverio})`);
  return { ok: bad.length === 0, bad, manifest: m };
}

/** 이 PC 에서 돌고 있는 워커 프로세스(명령줄에 worker.mjs) */
function workerProcs() {
  const out = tryVer(() => sh("powershell.exe", ["-NoProfile", "-Command",
    "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -match 'worker\\.mjs' } | ForEach-Object { \"$($_.ProcessId)`t$($_.CommandLine)\" }"])) ?? "";
  return out.split(/\r?\n/).filter(Boolean).map((l) => { const [pid, cmd] = l.split("\t"); return { pid: Number(pid), cmd }; });
}

/**
 * 새 버전이 바로 쓰이도록: 실행 폴더의 워커와 감독 루프를 끝내고 작업 스케줄러로 다시 시작한다.
 * (감독 루프가 10분 대기 중이어도 즉시 반영. 작업 중이던 건은 서버가 리스 만료 후 다시 넘긴다)
 */
function restartWorker() {
  const rel = RELEASES.replace(/\//g, "\\").toLowerCase();
  const procs = workerProcs().filter((p) => p.cmd.toLowerCase().includes(rel));
  for (const p of procs) { try { process.kill(p.pid); } catch {} }
  const sup = tryVer(() => sh("powershell.exe", ["-NoProfile", "-Command",
    "Get-CimInstance Win32_Process -Filter \"Name='cmd.exe'\" | Where-Object { $_.CommandLine -match 'android-test\\\\yt-frame-worker\\\\run-worker\\.cmd' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; $_.ProcessId }"])) ?? "";
  const hasTask = tryVer(() => sh("powershell.exe", ["-NoProfile", "-Command", `if (Get-ScheduledTask -TaskName '${TASK}' -ErrorAction SilentlyContinue) { 'yes' }`])) === "yes";
  if (hasTask && (procs.length || sup)) sh("powershell.exe", ["-NoProfile", "-Command", `Start-ScheduledTask -TaskName '${TASK}'`]);
  return { workers: procs.map((p) => p.pid), supervisors: sup.split(/\r?\n/).filter(Boolean), restarted: hasTask && !!(procs.length || sup) };
}

const cmds = {
  build() {
    // 1) 판정 로직 시험 통과가 전제
    const t = spawnSync(process.execPath, ["--import", "tsx/esm", "--test", "tests/youtube/ytFrameWorker.test.ts"], { cwd: REPO, encoding: "utf8" });
    if (t.status !== 0) { console.error(t.stdout.slice(-1500), t.stderr.slice(-500)); throw new Error("워커 시험 실패 — 버전을 만들지 않음"); }
    // 2) 버전 이름 = 날짜-git커밋-내용해시
    const contentHash = sha(Buffer.concat(FILES.map((f) => fs.readFileSync(path.join(SRC, f))))).slice(0, 8);
    const head = tryVer(() => sh("git", ["rev-parse", "--short", "HEAD"], { cwd: REPO })) ?? "nogit";
    const dirty = tryVer(() => sh("git", ["status", "--porcelain", "--", "tools/yt-frame-worker"], { cwd: REPO })) ?? "";
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..*/, "").replace("T", "-");
    const ver = `${stamp}-${head}${dirty ? "-wt" : ""}-${contentHash}`;
    const dir = path.join(RELEASES, ver);
    fs.mkdirSync(dir, { recursive: true });
    for (const f of FILES) fs.copyFileSync(path.join(SRC, f), path.join(dir, f));
    // 3) 의존성: 지금 검증에 쓴 것과 같은 webdriverio 버전을 실행 폴더에 고정 설치
    const appiumDir = path.join(ANDROID_TEST, "appium");
    const wdioVer = JSON.parse(fs.readFileSync(path.join(appiumDir, "node_modules", "webdriverio", "package.json"), "utf8")).version;
    fs.writeFileSync(path.join(dir, "package.json"), JSON.stringify({ name: "yt-frame-worker-release", private: true, type: "module", dependencies: { webdriverio: wdioVer } }, null, 1));
    const npm = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["install", "--omit=dev", "--no-audit", "--no-fund", "--loglevel=error"], { cwd: dir, encoding: "utf8", shell: true });
    if (npm.status !== 0) throw new Error(`npm install 실패: ${npm.stderr.slice(-500)}`);
    const verOf = (p) => tryVer(() => JSON.parse(fs.readFileSync(p, "utf8")).version);
    const manifest = {
      version: ver,
      createdAt: new Date().toISOString(),
      source: { repoHead: head, workingTreeChanges: dirty ? dirty.split(/\r?\n/).map((l) => l.trim()) : [] },
      files: Object.fromEntries([...FILES, "package.json"].map((f) => [f, sha(fs.readFileSync(path.join(dir, f)))])),
      deps: {
        node: process.version,
        webdriverio: wdioVer,
        appium: verOf(path.join(appiumDir, "node_modules", "appium", "package.json")),
        uiautomator2: verOf(path.join(appiumDir, "home", "node_modules", "appium-uiautomator2-driver", "package.json")),
        ffmpeg: tryVer(() => sh("ffmpeg", ["-version"]).split(/\r?\n/)[0]),
      },
      tests: "tests/youtube/ytFrameWorker.test.ts 통과",
    };
    fs.writeFileSync(path.join(dir, "MANIFEST.json"), JSON.stringify(manifest, null, 1));
    // 4) 만든 폴더가 스스로 무결성·의존성 확인을 통과하는지
    const v = spawnSync(process.execPath, [path.join(dir, "worker.mjs"), "--version"], { cwd: dir, encoding: "utf8" });
    if (v.status !== 0) throw new Error(`새 버전 자체 점검 실패: ${v.stdout}${v.stderr}`);
    console.log(`만듦: ${ver}\n(아직 사용 안 함 — 전환: release.mjs activate ${ver})`);
  },

  activate(ver) {
    if (!ver) throw new Error("버전 필요");
    const v = verifyRelease(ver);
    if (!v.ok) throw new Error(`${ver} 무결성 실패: ${v.why ?? v.bad.join(", ")}`);
    const prev = readCurrent();
    fs.mkdirSync(RT, { recursive: true });
    fs.writeFileSync(CURRENT, ver); // 줄바꿈 없이(cmd 의 set /p 가 그대로 읽음)
    fs.appendFileSync(HISTORY, `${new Date().toISOString()}\t${prev ?? "-"}\t->\t${ver}\n`);
    const r = restartWorker();
    console.log(`전환: ${prev ?? "(없음)"} → ${ver}` +
      (r.restarted ? ` (워커 ${r.workers.join(",") || "-"}·감독 ${r.supervisors.join(",") || "-"} 종료 → 작업 스케줄러로 새 버전 시작)` : " (실행 중인 감독 루프 없음 — 다음 로그인/시작 때 적용)"));
  },

  rollback() {
    const cur = readCurrent();
    const lines = fs.existsSync(HISTORY) ? fs.readFileSync(HISTORY, "utf8").trim().split(/\r?\n/) : [];
    // 현재 버전으로 전환된 기록의 "이전 버전"
    const rec = [...lines].reverse().map((l) => l.split("\t")).find((p) => p[3] === cur && p[1] !== "-");
    if (!rec) throw new Error("되돌릴 이전 버전 기록이 없음");
    cmds.activate(rec[1]);
  },

  status() {
    const cur = readCurrent();
    console.log(`실행 폴더: ${RT}\n사용 중 버전: ${cur ?? "(없음)"}`);
    const rels = fs.existsSync(RELEASES) ? fs.readdirSync(RELEASES).sort() : [];
    for (const r of rels) {
      const v = verifyRelease(r);
      console.log(`  ${r === cur ? "*" : " "} ${r}  무결성 ${v.ok ? "OK" : "실패(" + (v.why ?? v.bad.join(",")) + ")"}  webdriverio ${v.manifest?.deps?.webdriverio ?? "?"}`);
    }
    const procs = workerProcs();
    for (const p of procs) {
      const m = p.cmd.match(/releases[\\/]([^\\/]+)[\\/]worker\.mjs/);
      console.log(`실행 중 워커 pid ${p.pid}: ${m ? `버전 ${m[1]}` : "실행 폴더 밖(개발 작업트리 등)!"}`);
    }
    if (!procs.length) console.log("실행 중 워커 없음");
    const task = tryVer(() => sh("powershell.exe", ["-NoProfile", "-Command", `(Get-ScheduledTask -TaskName '${TASK}').Actions.Arguments`]));
    console.log(`작업 스케줄러 실행 대상: ${task ?? "(등록 안 됨)"}`);
  },

  "install-task"() {
    fs.mkdirSync(RT, { recursive: true });
    for (const f of ["run-worker.cmd", "start-hidden.vbs"]) fs.copyFileSync(path.join(SRC, "runtime", f), path.join(RT, f));
    const r = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(SRC, "install-autostart.ps1"), "-Vbs", path.join(RT, "start-hidden.vbs")], { encoding: "utf8" });
    console.log(r.stdout.trim() || r.stderr.trim());
    if (r.status !== 0) throw new Error("작업 스케줄러 등록 실패");
  },
};

const [cmd, arg] = process.argv.slice(2);
if (!cmds[cmd]) { console.error("사용법: release.mjs build | activate <버전> | rollback | status | install-task"); process.exit(2); }
try { cmds[cmd](arg); } catch (e) { console.error(`실패: ${e.message}`); process.exit(1); }
