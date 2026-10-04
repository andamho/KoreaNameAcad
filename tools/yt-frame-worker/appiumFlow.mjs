// 유튜브 앱(에뮬레이터)에서 "영상 ID 로 지정한" 쇼츠의 썸네일 장면을 첫 장면(0초)으로 고르고 저장한다.
//
// 대상 확인(저장 전에 모두 통과해야 함 — 하나라도 불확실하면 저장하지 않고 빠져나온다):
//   ① ID 딥링크로 연다(https://www.youtube.com/shorts/<id>)
//   ② 공유 → 링크 복사 → 클립보드의 영상 ID == 요청 ID
//   ③ 편집 화면의 제목 입력칸 == 유튜브 API 가 돌려준 그 영상의 제목
// 메뉴에는 Edit 옆에 Delete 가 있다 → 글자가 정확히 "Edit" 인 항목만 누른다.
export const YT = "com.google.android.youtube";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class StageError extends Error {
  constructor(stage, message, retryable) {
    super(message);
    this.stage = stage;
    this.retryable = retryable;
  }
}

/** 제목 비교용 정규화: 유니코드 NFC, 공백 제거, 소문자 */
export const normTitle = (s) => String(s ?? "").normalize("NFC").replace(/\s+/g, "").toLowerCase();

/** 클립보드 링크에서 영상 ID 추출 */
export function extractVideoId(clip) {
  const m = String(clip ?? "").match(/(?:shorts\/|youtu\.be\/|[?&]v=)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/);
  return m ? m[1] : null;
}

// 예: "Playhead selected at 0 minutes 0 seconds out of 1 minute 18 seconds" — 1분·1초는 단수(minute/second)로 나온다
export const parseSec = (desc) => {
  const m = String(desc ?? "").match(/at (\d+) minutes? (\d+) seconds? out of (\d+) minutes? (\d+) seconds?/);
  return m ? { at: +m[1] * 60 + +m[2], total: +m[3] * 60 + +m[4] } : null;
};

/**
 * @param driver webdriverio 세션
 * @param task   { videoId, liveTitle, frameSec }
 * @param opts   { log, shot, dry, testHideOnce(시험 전용) }
 * @returns { saved: boolean, dry?: boolean, playhead }
 */
export async function selectFrameById(driver, task, { log = console.log, shot = async () => {}, dry = false, testHideOnce = null } = {}) {
  const id = task.videoId;
  const want = normTitle(task.liveTitle);
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) throw new StageError("identity", `잘못된 영상 ID: ${id}`, false);
  if (!want) throw new StageError("identity", "대조할 제목(API)이 없음 — 대상 확인 불가", false);
  if ((task.frameSec ?? 0) !== 0) throw new StageError("identity", `지원하지 않는 장면 위치: ${task.frameSec}s (0초만)`, false);

  const $desc = (d) => driver.$(`android=new UiSelector().description("${d}")`);
  const $descStarts = (d) => driver.$(`android=new UiSelector().descriptionStartsWith("${d}")`);
  const $text = (t) => driver.$(`android=new UiSelector().text("${t}")`);
  const rect = async (el) => driver.getElementRect(el.elementId);
  const drag = async (x1, y1, x2, y2) =>
    driver.performActions([{ type: "pointer", id: "f", parameters: { pointerType: "touch" },
      actions: [{ type: "pointerMove", x: x1, y: y1, duration: 0 }, { type: "pointerDown", button: 0 }, { type: "pause", duration: 200 },
        { type: "pointerMove", x: x2, y: y2, duration: 900 }, { type: "pause", duration: 200 }, { type: "pointerUp", button: 0 }] }]);
  const waitFor = async (el, ms, stage, what, retryable = true) => {
    try { await el.waitForDisplayed({ timeout: ms }); } catch { throw new StageError(stage, `${what} 이(가) 나타나지 않음`, retryable); }
    return el;
  };

  let entered = false; // 편집 화면에 들어갔는가(실패 시 저장 없이 빠져나오기 위해)
  try {
    // ①~② 를 한 묶음으로: More actions 가 끝내 안 보이면 앱을 닫았다 다시 열고 ID 확인부터 다시 한 번(편집 진입 전이라 안전)
    let moreBtn = null;
    for (let open = 1; open <= 2 && !moreBtn; open++) {
      // ── ① ID 딥링크(깨끗한 상태에서) ──
      // 에뮬레이터를 막 켠 직후에는 딥링크가 쇼츠 대신 홈 화면(로딩 중)에 떨어지는 일이 있었다
      // → 쇼츠 플레이어(공유 버튼)가 20초 안에 안 보이면 딥링크를 다시 보낸다(최대 3번)
      let playerShown = false;
      for (let link = 1; link <= 3 && !playerShown; link++) {
        await driver.execute("mobile: terminateApp", { appId: YT }).catch(() => {});
        await sleep(1500);
        await driver.execute("mobile: deepLink", { url: `https://www.youtube.com/shorts/${id}`, package: YT });
        playerShown = await (await $desc("Share this video")).waitForDisplayed({ timeout: 20000 }).then(() => true, () => false);
        if (!playerShown) { await shot(`no-player-${open}-${link}`); log("쇼츠 화면이 안 열림 → 딥링크 다시", { link }); }
      }
      if (!playerShown) throw new StageError("navigate", "딥링크 3번에도 쇼츠 화면이 열리지 않음", true);
      // 화면이 자리 잡을 때까지 기다린다. 일시정지 키는 보내지 않는다 — 공개 영상에서 일시정지 뒤 공유 시트가 안 열렸다(2026-10-05)
      await sleep(4000);
      const pkg = await driver.getCurrentPackage();
      if (pkg !== YT) throw new StageError("navigate", `유튜브 앱이 앞에 있지 않음(${pkg})`, true);
      log("딥링크로 열림", { id, open });
      await shot(open === 1 ? "1-player" : "1-player-reopen");

      // ── ② 공유 → 링크 복사 → 클립보드 ID 대조 ──
      await driver.setClipboard(Buffer.from("EMPTY").toString("base64"), "plaintext");
      await dismissSheets(driver, log);
      // 공유 시트가 한 번에 안 열리는 경우가 있었다(공개 영상) → 2번까지 누른다
      let copy = null;
      for (let s = 1; s <= 2 && !copy; s++) {
        await (await waitFor(await $desc("Share this video"), 10000, "identity", "공유 버튼")).click();
        const c = await $desc("Copy link");
        if (await c.waitForDisplayed({ timeout: 8000 }).then(() => true, () => false)) copy = c;
        else { log("공유 시트가 안 열림 → 다시", { s }); await dismissSheets(driver, log); }
      }
      if (!copy) throw new StageError("identity", "링크 복사 항목이 나타나지 않음(공유 2번)", true);
      await copy.click();
      await sleep(1500);
      if (await (await $desc("Copy link")).isExisting().catch(() => false)) { await driver.back(); await sleep(800); }
      // 공개 영상은 링크 복사 뒤 "Promote video" 시트가 떠서 조작 버튼을 가린다 → 닫는다
      await dismissSheets(driver, log);
      const clip = Buffer.from(await driver.getClipboard("plaintext"), "base64").toString("utf8");
      const gotId = extractVideoId(clip);
      log("링크 복사 ID", { gotId, match: gotId === id });
      if (gotId !== id) throw new StageError("identity", `열린 영상 ID(${gotId ?? "없음"})가 요청 ID(${id})와 다름`, gotId === null);

      // 시험 전용: 조작 버튼이 숨은 상태를 일부러 만든다(Clear Screen). 운영 경로에서는 쓰지 않음
      if (open === 1 && testHideOnce) await testHideOnce(driver);

      // ── 편집 화면 진입 준비: More actions(숨었으면 화면 탭 → 그래도 없으면 앱 재시작) ──
      const r = await revealMoreActions(driver, log);
      moreBtn = r.el;
      if (!moreBtn) {
        await shot(`hidden-${open}`);
        if (open === 2) throw new StageError("navigate", `More actions 버튼이 나타나지 않음(화면 탭 ${r.taps}회·앱 재시작 후)`, true);
        log("More actions 안 보임 → 앱을 다시 열고 ID 확인부터 다시");
      }
    }

    // ── 편집 화면 진입: More actions → 정확히 "Edit" ──
    await moreBtn.click();
    await sleep(2000);
    const edits = await driver.$$(`android=new UiSelector().text("Edit")`);
    if (edits.length !== 1) throw new StageError("navigate", `메뉴의 Edit 항목 수가 ${edits.length}개`, true);
    await edits[0].click();
    entered = true;
    await waitFor(await $desc("Edit thumbnail"), 15000, "navigate", "편집 화면(Edit thumbnail)");
    const act = await driver.getCurrentActivity();
    if (!/EditVideoActivity/.test(act)) throw new StageError("navigate", `편집 화면이 아님(${act})`, true);

    // ── ③ 편집 화면 제목 == API 제목 ──
    const fields = await driver.$$(`android=new UiSelector().className("android.widget.EditText")`);
    const titles = [];
    for (const f of fields) titles.push(await f.getText().catch(() => ""));
    const ok = titles.some((t) => normTitle(t) === want);
    log("편집 화면 제목 대조", { match: ok, fields: titles.length });
    if (!ok) throw new StageError("identity", `편집 화면 제목이 API 제목과 다름: "${(titles[0] ?? "").slice(0, 60)}"`, false);
    await shot("2-edit-video");

    // ── 썸네일 편집기 → 재생 위치 0초 ──
    await (await $desc("Edit thumbnail")).click();
    const playhead = await waitFor(await $descStarts("Playhead selected at"), 15000, "edit", "장면 선택기");
    const film = await $descStarts("Filmstrip selected at");
    const before = parseSec(await playhead.getAttribute("content-desc"));
    const fr = await rect(film);
    const pr = await rect(playhead);
    const py = Math.round(pr.y + pr.height / 2);
    await drag(Math.round(pr.x + pr.width / 2), py, Math.round(fr.x - 30), py); // 맨 왼쪽 끝으로
    await sleep(1200);
    let after = parseSec(await (await $descStarts("Playhead selected at")).getAttribute("content-desc"));
    for (let i = 0; i < 3 && after && after.at !== 0; i++) {
      const cr = await rect(await $descStarts("Playhead selected at"));
      await drag(Math.round(cr.x + cr.width / 2), py, Math.round(fr.x - 60), py);
      await sleep(1000);
      after = parseSec(await (await $descStarts("Playhead selected at")).getAttribute("content-desc"));
    }
    log("재생 위치", { before, after });
    await shot("3-frame-selected");
    if (!after || after.at !== 0) throw new StageError("edit", `재생 위치를 0초로 맞추지 못함(${after?.at ?? "?"}s)`, true);

    if (dry) {
      await (await $desc("Exit thumbnail editor")).click();
      await sleep(1200);
      throw Object.assign(new Error("DRY"), { dry: true });
    }

    // ── 저장 ──
    await (await $desc("Done")).click();
    const save = await $text("Save");
    try { await save.waitForEnabled({ timeout: 10000 }); } catch { throw new StageError("save", "Save 버튼이 활성화되지 않음", true); }
    await save.click();
    log("Save 누름");
    await sleep(6000);
    const stillEditing = await (await $text("Edit video")).isExisting().catch(() => false);
    if (stillEditing) throw new StageError("save", "Save 후에도 편집 화면에 머묾", true);
    entered = false;
    await shot("4-after-save");
    return { saved: true, playhead: after };
  } catch (e) {
    if (e?.dry) {
      await safeExit(driver, log);
      return { saved: false, dry: true };
    }
    try { await shot("error"); } catch {}
    if (entered) await safeExit(driver, log);
    if (e instanceof StageError) throw e;
    throw new StageError("navigate", String(e?.message ?? e).slice(0, 300), true);
  }
}

/**
 * 플레이어 위에 뜬 알려진 시트를 닫는다(공개 영상의 "Promote video" 등). 편집 진입 전이라 안전.
 * 닫기 버튼(desc "Close")이 있으면 누르고, 없으면 뒤로 가기 1번.
 */
export async function dismissSheets(driver, log = console.log) {
  for (let i = 0; i < 2; i++) {
    const promo = await driver.$(`android=new UiSelector().text("Promote video")`);
    if (!(await promo.isExisting().catch(() => false))) return;
    const close = await driver.$(`android=new UiSelector().description("Close")`);
    if (await close.isExisting().catch(() => false)) await close.click();
    else await driver.back();
    log("Promote video 시트 닫음", { try: i + 1 });
    await sleep(1200);
  }
}

/**
 * 쇼츠 플레이어의 "More actions" 버튼을 찾는다. 재생 중에는 위쪽 조작 버튼이 숨는다
 * (헤드리스에서는 일시정지 키가 안 먹는 경우가 있었음) → 화면 가운데를 한 번 눌러 멈추고 다시 찾는다(최대 3회).
 * @returns {{ el: object|null, taps: number }}
 */
export async function revealMoreActions(driver, log = console.log, { waitMs = 3000, maxTaps = 3 } = {}) {
  let taps = 0;
  for (;;) {
    const el = await driver.$(`android=new UiSelector().description("More actions")`);
    if (await el.waitForDisplayed({ timeout: waitMs }).then(() => true, () => false)) return { el, taps };
    if (taps >= maxTaps) return { el: null, taps };
    const { width, height } = await driver.getWindowSize();
    await driver.performActions([{ type: "pointer", id: "t", parameters: { pointerType: "touch" },
      actions: [{ type: "pointerMove", x: Math.round(width / 2), y: Math.round(height * 0.4), duration: 0 },
        { type: "pointerDown", button: 0 }, { type: "pause", duration: 80 }, { type: "pointerUp", button: 0 }] }]);
    taps++;
    log("조작 버튼 표시용 화면 탭", { try: taps });
    await sleep(1500);
  }
}

/** 저장하지 않고 편집기·편집 화면을 빠져나온다 */
export async function safeExit(driver, log = console.log) {
  try {
    const $desc = (d) => driver.$(`android=new UiSelector().description("${d}")`);
    const $text = (t) => driver.$(`android=new UiSelector().text("${t}")`);
    const exitBtn = await $desc("Exit thumbnail editor");
    if (await exitBtn.isExisting()) { await exitBtn.click(); await sleep(1200); }
    if (await (await $text("Edit video")).isExisting()) { await driver.back(); await sleep(1500); }
    const discard = await $text("Discard");
    if (await discard.isExisting()) { await discard.click(); await sleep(1000); }
    log("안전 종료 — 저장하지 않음");
  } catch {}
}
