// 별도 시험: 재생 중 숨은 "More actions" 버튼을 화면 탭으로 다시 띄우는지(revealMoreActions).
// 편집·저장은 하지 않는다(메뉴도 열지 않음). 대상은 비공개 시험 영상.
//   node tools/yt-frame-worker/test-reveal.mjs <videoId>
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ANDROID_TEST, UDID, APPIUM_PORT, ensureEnv, stopEnv } from "./env.mjs";
import { revealMoreActions, selectFrameById, YT } from "./appiumFlow.mjs";

const ID = process.argv[2];
if (!/^[A-Za-z0-9_-]{11}$/.test(ID ?? "")) { console.error("사용법: node test-reveal.mjs <videoId>"); process.exit(2); }
const OUT = path.join(ANDROID_TEST, "dl", "yt-frame-worker", `reveal-test-${new Date().toISOString().replace(/[:.]/g, "-")}`);
fs.mkdirSync(OUT, { recursive: true });
const log = (m, x) => console.log(`[${new Date().toISOString()}] ${m}${x ? " " + JSON.stringify(x) : ""}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const { remote } = await import(pathToFileURL(path.join(ANDROID_TEST, "appium", "node_modules", "webdriverio", "build", "node.js")).href);

const started = await ensureEnv(log);
const d = await remote({ hostname: "127.0.0.1", port: APPIUM_PORT, logLevel: "error",
  capabilities: { platformName: "Android", "appium:automationName": "UiAutomator2", "appium:udid": UDID, "appium:noReset": true } });
const shot = async (n) => fs.writeFileSync(path.join(OUT, `${n}.png`), Buffer.from(await d.takeScreenshot(), "base64"));
const visible = async () => (await d.$(`android=new UiSelector().description("More actions")`)).isDisplayed().catch(() => false);
let result = { ok: false };
try {
  // 실제 작업 흐름과 같은 순서: 딥링크 → 일시정지 키 → 공유 → 링크 복사(→ 시트가 남으면 뒤로). 이 직후 버튼이 숨었던 사례가 있었다.
  const runs = [];
  for (let k = 1; k <= (process.argv.includes("--flow") ? 0 : 3); k++) {
    await d.execute("mobile: terminateApp", { appId: YT }).catch(() => {});
    await sleep(1500);
    await d.execute("mobile: deepLink", { url: `https://www.youtube.com/shorts/${ID}`, package: YT });
    await sleep(7000);
    await d.execute("mobile: shell", { command: "input", args: ["keyevent", "KEYCODE_MEDIA_PAUSE"] }).catch(() => {});
    await (await d.$(`android=new UiSelector().description("Share this video")`)).click();
    const copy = await d.$(`android=new UiSelector().description("Copy link")`);
    await copy.waitForDisplayed({ timeout: 8000 });
    await copy.click();
    await sleep(1500);
    if (await (await d.$(`android=new UiSelector().description("Copy link")`)).isExisting().catch(() => false)) { await d.back(); await sleep(800); }
    const hiddenNow = !(await visible());
    await shot(`${k}-1-after-share`);
    log(`회차 ${k}: 공유 직후 버튼 ${hiddenNow ? "숨음" : "보임"}`);
    if (!hiddenNow) { runs.push({ k, hidden: false }); continue; }
    const { el, taps } = await revealMoreActions(d, log, { waitMs: 1000 });
    const shown = !!el && (await el.isDisplayed().catch(() => false));
    await shot(`${k}-2-after-reveal`);
    runs.push({ k, hidden: true, taps, shown });
  }
  // 자연 재현이 안 되면: 플레이어 메뉴의 "Clear Screen" 으로 조작 버튼을 확실히 숨긴 뒤 시험(편집·저장 없음)
  if (!runs.some((r) => r.hidden) && process.argv.includes("--clear-screen")) {
    await (await d.$(`android=new UiSelector().description("More actions")`)).click();
    const cs = await d.$(`android=new UiSelector().text("Clear Screen")`);
    await cs.waitForDisplayed({ timeout: 8000 });
    await cs.click();
    await sleep(2000);
    const hiddenNow = !(await visible());
    await shot("cs-1-cleared");
    log(`Clear Screen 후 버튼 ${hiddenNow ? "숨음" : "보임"}`);
    if (hiddenNow) {
      const { el, taps } = await revealMoreActions(d, log, { waitMs: 1000 });
      const shown = !!el && (await el.isDisplayed().catch(() => false));
      await shot("cs-2-after-reveal");
      runs.push({ k: "clear-screen", hidden: true, taps, shown });
    } else runs.push({ k: "clear-screen", hidden: false });
    // 앱이 정상 상태로 돌아왔는지: 앱을 다시 열어 버튼이 보이는지 확인
    await d.execute("mobile: terminateApp", { appId: YT }).catch(() => {});
    await sleep(1500);
    await d.execute("mobile: deepLink", { url: `https://www.youtube.com/shorts/${ID}`, package: YT });
    await sleep(7000);
    const normal = await visible();
    await shot("cs-3-reopened");
    log(`앱 다시 연 뒤 버튼 ${normal ? "보임(정상)" : "숨음(이상)"}`);
    runs.push({ k: "reopen-normal", normal });
  }
  // 실제 흐름 시험(--flow "<제목>"): 첫 열기에서 일부러 버튼을 숨겨도, 화면 탭 → 앱 재시작·ID 재확인으로 회복해
  // 편집기까지 가는지. 점검 모드(dry)라 저장하지 않는다.
  const fi = process.argv.indexOf("--flow");
  if (fi > 0) {
    const flowLog = [];
    const r = await selectFrameById(d, { videoId: ID, liveTitle: process.argv[fi + 1], frameSec: 0 }, {
      dry: true,
      log: (m, x) => { flowLog.push(m); log(`  [흐름] ${m}`, x); },
      shot: async (n) => shot(`flow-${n}`),
      testHideOnce: async (drv) => {
        await (await drv.$(`android=new UiSelector().description("More actions")`)).click();
        const cs = await drv.$(`android=new UiSelector().text("Clear Screen")`);
        await cs.waitForDisplayed({ timeout: 8000 });
        await cs.click();
        await sleep(2000);
        log("  [시험] Clear Screen 으로 버튼 숨김");
      },
    });
    runs.push({ k: "flow", reopened: flowLog.some((m) => m.includes("앱을 다시 열고")), reachedEditorDry: !!r.dry, saved: r.saved });
    result = { ok: runs.at(-1).reopened && runs.at(-1).reachedEditorDry && !r.saved, runs };
  }
  const tested = runs.filter((r) => r.hidden);
  if (fi < 0) result = tested.length
    ? { ok: tested.every((r) => r.shown && r.taps >= 1), runs }
    : { ok: false, inconclusive: true, why: "3회 모두 버튼이 숨지 않아 시험 조건을 만들지 못함", runs };
} catch (e) {
  result = { ok: false, error: String(e?.message ?? e).slice(0, 200) };
} finally {
  await d.execute("mobile: terminateApp", { appId: YT }).catch(() => {});
  await d.deleteSession().catch(() => {});
  await stopEnv(started, log);
}
fs.writeFileSync(path.join(OUT, "result.json"), JSON.stringify(result, null, 1));
log("결과", result);
process.exit(result.ok ? 0 : 1);
