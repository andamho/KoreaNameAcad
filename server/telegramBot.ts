/**
 * 후기 자동화 텔레그램 봇.
 * 사진 전송 → AI 처리 → 버튼/자연어로 검수·선택 → 홈페이지 게시 + 네이버 복붙 패키지.
 * 별도 라이브러리 없이 Bot API(getUpdates 롱폴링)를 직접 호출한다.
 */
import { storage } from "./storage";
import {
  processNewReview, regenerateMask, composeSelectedThumbnail,
  publishReview, buildNaverPackage, objectPathToBuffer, moreThumbnails, moreTitles, draftJson as j,
} from "./reviewPipeline";
import { parseIntent, applyBodyEdit, type IntentAction, type DraftSummary } from "./reviewPipeline/intent";
import type { ReviewDraft, ThumbnailCandidate } from "@shared/schema";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN?.trim() || "";
const API = `https://api.telegram.org/bot${TOKEN}`;
const FILE_API = `https://api.telegram.org/file/bot${TOKEN}`;
const ALLOWED = (process.env.TELEGRAM_ALLOWED_CHAT_IDS || "")
  .split(",").map(s => s.trim()).filter(Boolean);

// ── Telegram API 헬퍼 ───────────────────────────────────────────
async function tg(method: string, params: Record<string, any>): Promise<any> {
  const res = await fetch(`${API}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!data.ok) console.error(`[tg] ${method} 실패:`, data.description);
  return data;
}

function ik(rows: Array<Array<{ text: string; data: string }>>) {
  return { inline_keyboard: rows.map(r => r.map(b => ({ text: b.text, callback_data: b.data }))) };
}

async function sendMessage(chatId: string, text: string, replyMarkup?: any) {
  return tg("sendMessage", { chat_id: chatId, text, reply_markup: replyMarkup, parse_mode: "HTML", disable_web_page_preview: true });
}

async function answerCallback(id: string, text?: string) {
  return tg("answerCallbackQuery", { callback_query_id: id, text });
}

async function sendPhotoBuffer(chatId: string, buffer: Buffer, caption?: string, replyMarkup?: any) {
  const form = new FormData();
  form.append("chat_id", chatId);
  if (caption) form.append("caption", caption);
  if (replyMarkup) form.append("reply_markup", JSON.stringify(replyMarkup));
  form.append("photo", new Blob([new Uint8Array(buffer)], { type: "image/jpeg" }), "image.jpg");
  const res = await fetch(`${API}/sendPhoto`, { method: "POST", body: form });
  return res.json();
}

async function sendDocumentBuffer(chatId: string, buffer: Buffer, filename: string, caption?: string) {
  const form = new FormData();
  form.append("chat_id", chatId);
  if (caption) form.append("caption", caption);
  form.append("document", new Blob([new Uint8Array(buffer)]), filename);
  const res = await fetch(`${API}/sendDocument`, { method: "POST", body: form });
  return res.json();
}

async function sendMediaGroupUrls(chatId: string, urls: string[]) {
  const media = urls.slice(0, 10).map((url, i) => ({ type: "photo", media: url, caption: `썸네일 ${i + 1}` }));
  return tg("sendMediaGroup", { chat_id: chatId, media });
}

async function getFileBuffer(fileId: string): Promise<{ buffer: Buffer; mediaType: string }> {
  const info = await tg("getFile", { file_id: fileId });
  const filePath = info.result?.file_path;
  if (!filePath) throw new Error("파일 경로를 가져오지 못했습니다.");
  const res = await fetch(`${FILE_API}/${filePath}`);
  const arr = await res.arrayBuffer();
  const mediaType = filePath.endsWith(".png") ? "image/png" : filePath.endsWith(".webp") ? "image/webp" : "image/jpeg";
  return { buffer: Buffer.from(arr), mediaType };
}

// ── 화면 렌더 ──────────────────────────────────────────────────
const short = (s: string, n = 28) => (s.length > n ? s.slice(0, n) + "…" : s);

const LABEL_TEXT: Record<string, string> = { consultation: "[이름분석 상담후기]", rename: "[개명후기]" };

function summaryText(d: ReviewDraft): string {
  return [
    `📋 <b>현재 선택</b>`,
    `• 분류 라벨: ${d.thumbnailLabel ? `<b>${escapeHtml(d.thumbnailLabel)}</b>` : "-"}`,
    `• 제목: ${d.selectedTitle ? `<b>${escapeHtml(d.selectedTitle)}</b>` : "미선택"}`,
    `• 썸네일 문구: ${d.selectedThumbnailTitle ? `<b>${escapeHtml(d.selectedThumbnailTitle)}</b>` : "미선택"}`,
    `• 썸네일 이미지: ${d.selectedThumbnailUrl ? "선택됨 ✅" : "미선택"}`,
  ].join("\n");
}

function escapeHtml(s: string) {
  return s.replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));
}

function mainActionKeyboard(d: ReviewDraft) {
  return ik([
    [{ text: "🏷 상담후기", data: `LB|${d.id}|consultation` }, { text: "🏷 개명후기", data: `LB|${d.id}|rename` }],
    [{ text: "🖼 미리보기", data: `PV|${d.id}` }, { text: "🙈 더 가려줘", data: `MM|${d.id}` }],
    [{ text: "🏠 홈페이지 게시", data: `PUB|${d.id}` }, { text: "📋 네이버용 받기", data: `NV|${d.id}` }],
  ]);
}

/** 처리 완료 후 검수 화면 일괄 전송 */
async function presentDraft(chatId: string, d: ReviewDraft) {
  const thumbTitles = j.parse<string[]>(d.thumbnailTitleCandidates, []);

  // 1) 마스킹 이미지
  try {
    const masked = await objectPathToBuffer(d.maskedImagePath!);
    await sendPhotoBuffer(chatId, masked, "🖼 이름·개인정보를 가린 후기 이미지예요.");
  } catch (e: any) {
    await sendMessage(chatId, "⚠️ 마스킹 이미지 전송 실패: " + e?.message);
  }

  // 2) 다듬은 본문
  await sendMessage(chatId,
    `📝 <b>다듬은 본문</b>\n\n${escapeHtml(d.polishedContent || "")}\n\n<i>본문을 고치려면 새 내용을 그냥 메시지로 보내주세요. (예: "더 짧게 해줘")</i>`);

  // 3) 제목 후보
  await sendTitleChoices(chatId, d);

  // 4) 썸네일 문구 후보
  if (thumbTitles.length) {
    await sendMessage(chatId, "🏷️ <b>썸네일 문구</b>를 골라주세요:",
      ik([
        ...thumbTitles.map((t, i) => [{ text: `${i + 1}) ${short(t)}`, data: `TT|${d.id}|${i}` }]),
      ]));
  }

  // 5) 썸네일 이미지 후보
  await sendThumbnailChoices(chatId, d);

  // 6) 현재 상태 + 액션
  await sendMessage(chatId, summaryText(d), mainActionKeyboard(d));
}

/** 게시 제목 후보 + 선택/재생성 버튼 전송 (초기·재추천 공용) */
async function sendTitleChoices(chatId: string, d: ReviewDraft) {
  const titles = j.parse<string[]>(d.titleCandidates, []);
  if (!titles.length) {
    await sendMessage(chatId, "📌 제목 후보가 없어요.", ik([[{ text: "🔄 제목 5개 추천", data: `MTI|${d.id}` }]]));
    return;
  }
  await sendMessage(chatId, "📌 <b>게시 제목</b>을 고르거나(직접 입력해 보내도 됨), 마음에 안 들면 다시 추천받으세요:",
    ik([
      ...titles.map((t, i) => [{ text: `${i + 1}) ${short(t)}`, data: `T|${d.id}|${i}` }]),
      [{ text: "🔄 다른 제목 5개 추천", data: `MTI|${d.id}` }],
    ]));
}

/** 썸네일 후보 미디어그룹 + 선택/재검색 버튼 전송 (초기·재검색 공용) */
async function sendThumbnailChoices(chatId: string, d: ReviewDraft) {
  const thumbs = j.parse<ThumbnailCandidate[]>(d.thumbnailCandidates, []);
  if (!thumbs.length) {
    await sendMessage(chatId, "ℹ️ 스톡 썸네일을 가져오지 못했어요. 마스킹 이미지를 썸네일로 쓰거나, \"다른 썸네일 찾아줘\"라고 해보세요.",
      ik([[{ text: "🔄 다른 썸네일 찾기", data: `MT|${d.id}` }]]));
    return;
  }
  await sendMediaGroupUrls(chatId, thumbs.map(t => t.thumbUrl || t.url));
  await sendMessage(chatId, "🌄 <b>썸네일 이미지</b> 번호를 고르거나, 마음에 안 들면 다시 찾으세요:",
    ik([
      thumbs.map((_, i) => ({ text: `${i + 1}`, data: `TH|${d.id}|${i}` })),
      [{ text: "🔄 다른 썸네일 더 찾기", data: `MT|${d.id}` }],
    ]));
}

// ── 액션 실행 (버튼/자연어 공통) ────────────────────────────────
async function runActions(chatId: string, draftId: string, actions: IntentAction[]) {
  let d = await storage.getReviewDraft(draftId);
  if (!d) { await sendMessage(chatId, "❌ 초안을 찾을 수 없어요."); return; }

  const titles = j.parse<string[]>(d.titleCandidates, []);
  const thumbTitles = j.parse<string[]>(d.thumbnailTitleCandidates, []);
  const thumbs = j.parse<ThumbnailCandidate[]>(d.thumbnailCandidates, []);
  const notes: string[] = [];
  let doPreview = false, doPublish = false, doNaver = false, choicesResent = false;

  for (const a of actions) {
    switch (a.type) {
      case "setTitle": {
        const t = a.text ?? (a.index ? titles[a.index - 1] : undefined);
        if (t) { d = (await storage.updateReviewDraft(d.id, { selectedTitle: t }))!; notes.push(`제목 → ${short(t)}`); }
        break;
      }
      case "setThumbnailTitle": {
        const t = a.text ?? (a.index ? thumbTitles[a.index - 1] : undefined);
        if (t) { d = (await storage.updateReviewDraft(d.id, { selectedThumbnailTitle: t, composedThumbnailPath: null }))!; notes.push(`썸네일 문구 → ${short(t)}`); }
        break;
      }
      case "setThumbnail": {
        const c = thumbs[(a.index || 1) - 1];
        if (c) { d = (await storage.updateReviewDraft(d.id, { selectedThumbnailUrl: c.url, composedThumbnailPath: null }))!; notes.push(`썸네일 이미지 → ${a.index}번`); }
        break;
      }
      case "setLabel": {
        const lab = LABEL_TEXT[a.labelType] || a.labelType;
        d = (await storage.updateReviewDraft(d.id, { thumbnailLabel: lab, composedThumbnailPath: null }))!;
        notes.push(`분류 라벨 → ${lab}`);
        break;
      }
      case "moreTitles": {
        await sendMessage(chatId, "🔄 다른 제목 5개 생성 중…");
        const r = await moreTitles(d);
        d = r.draft;
        await sendTitleChoices(chatId, d);
        choicesResent = true;
        break;
      }
      case "moreThumbnails": {
        await sendMessage(chatId, a.keywords ? `🔄 "${a.keywords}"(으)로 다른 썸네일 찾는 중…` : "🔄 다른 썸네일 찾는 중…");
        const r = await moreThumbnails(d, a.keywords);
        d = r.draft;
        if (r.candidates.length) await sendThumbnailChoices(chatId, d);
        else await sendMessage(chatId, "😶 더 찾은 결과가 없어요. 다른 키워드로 시도해보세요 (예: \"바다 느낌으로 찾아줘\").");
        choicesResent = true;
        break;
      }
      case "editBody": {
        if (a.newText) { d = (await storage.updateReviewDraft(d.id, { polishedContent: a.newText }))!; notes.push("본문 교체"); }
        else if (a.instruction) {
          const edited = await applyBodyEdit(d.polishedContent || "", a.instruction);
          d = (await storage.updateReviewDraft(d.id, { polishedContent: edited }))!;
          await sendMessage(chatId, `📝 <b>수정된 본문</b>\n\n${escapeHtml(edited)}`);
        }
        break;
      }
      case "maskMore": {
        await sendMessage(chatId, "🙈 더 넓게 가리는 중…");
        d = await regenerateMask(d, 0.6);
        const buf = await objectPathToBuffer(d.maskedImagePath!);
        await sendPhotoBuffer(chatId, buf, "🖼 더 가린 버전이에요.");
        break;
      }
      case "remask": {
        await sendMessage(chatId, "🙈 마스킹을 다시 적용하는 중…");
        d = await regenerateMask(d, 0);
        const buf = await objectPathToBuffer(d.maskedImagePath!);
        await sendPhotoBuffer(chatId, buf, "🖼 마스킹 재적용본");
        break;
      }
      case "preview": doPreview = true; break;
      case "publish": doPublish = true; break;
      case "naverPackage": doNaver = true; break;
      case "savePreference":
        if (a.text) { await storage.addPreference(chatId, a.text); notes.push(`📌 취향 저장: ${short(a.text)} (다음 후기부터 자동 적용)`); }
        break;
      case "help": await sendHelp(chatId); break;
      default:
        notes.push("❓ 이해 못한 요청: " + (a.note || ""));
    }
  }

  if (notes.length) await sendMessage(chatId, "✅ " + notes.join("\n✅ "));
  if (doPreview) await sendPreview(chatId, d);
  if (doPublish) { await doPublishFlow(chatId, d); return; }
  if (doNaver) { await sendNaverPackage(chatId, d); return; }
  if (!doPreview && !choicesResent) await sendMessage(chatId, summaryText(d), mainActionKeyboard(d));
}

async function sendPreview(chatId: string, draft: ReviewDraft) {
  if (!draft.selectedThumbnailUrl && !j.parse<ThumbnailCandidate[]>(draft.thumbnailCandidates, []).length) {
    await sendMessage(chatId, "ℹ️ 합성할 썸네일 이미지가 없어요. 먼저 썸네일을 골라주세요(🔄 다른 썸네일 더 찾기).");
    return;
  }
  await sendMessage(chatId, "🖼 썸네일 합성 중…");
  try {
    const d = await composeSelectedThumbnail(draft);
    const buf = await objectPathToBuffer(d.composedThumbnailPath!);
    await sendPhotoBuffer(chatId, buf, `🖼 미리보기\n라벨: ${d.thumbnailLabel || "-"}\n제목: ${d.selectedTitle || "-"}`, mainActionKeyboard(d));
  } catch (e: any) {
    console.error("[bot] 미리보기 실패:", e);
    await sendMessage(chatId, "❌ 미리보기 실패: " + (e?.message || e));
  }
}

async function doPublishFlow(chatId: string, draft: ReviewDraft) {
  if (!draft.selectedTitle) { await sendMessage(chatId, "⚠️ 제목을 먼저 골라주세요."); return; }
  await sendMessage(chatId, "🏠 홈페이지에 게시하는 중…");
  try {
    const { draft: published } = await publishReview(draft);
    await sendMessage(chatId, `✅ <b>홈페이지 후기에 게시 완료!</b>\n제목: ${escapeHtml(published.selectedTitle || "")}`);
    await sendNaverPackage(chatId, published);
  } catch (e: any) {
    await sendMessage(chatId, "❌ 게시 실패: " + e?.message);
  }
}

async function sendNaverPackage(chatId: string, draft: ReviewDraft) {
  try {
    let d = draft;
    if (!d.composedThumbnailPath) d = await composeSelectedThumbnail(d);
    const pkg = buildNaverPackage(d, process.env.PUBLIC_BASE_URL || "");
    await sendMessage(chatId,
      `📋 <b>네이버 블로그 복붙용</b>\n\n<b>[제목]</b>\n${escapeHtml(pkg.title)}\n\n<b>[본문]</b>\n${escapeHtml(pkg.body)}\n\n<i>아래 이미지 2장을 저장해 네이버 글에 넣으세요.</i>`);
    // 이미지(썸네일+마스킹본)를 문서로 첨부 → 원본 화질 저장 가능
    if (d.composedThumbnailPath) {
      const tBuf = await objectPathToBuffer(d.composedThumbnailPath);
      await sendDocumentBuffer(chatId, tBuf, "thumbnail.jpg", "썸네일");
    }
    if (d.maskedImagePath) {
      const mBuf = await objectPathToBuffer(d.maskedImagePath);
      await sendDocumentBuffer(chatId, mBuf, "review.jpg", "후기 이미지");
    }
  } catch (e: any) {
    await sendMessage(chatId, "❌ 네이버 패키지 생성 실패: " + e?.message);
  }
}

// ── 취향(표준 지침) 명령 처리 ──────────────────────────────────
async function listPreferences(chatId: string) {
  const prefs = await storage.getPreferences(chatId);
  if (!prefs.length) {
    await sendMessage(chatId, "📌 저장된 취향이 없어요.\n예) <code>/취향 추가 제목은 12자 이내로</code>\n또는 그냥 \"앞으로 항상 이모지 쓰지 마\"처럼 말해도 저장됩니다.");
    return;
  }
  const lines = prefs.map((p, i) => `${i + 1}. ${escapeHtml(p.instruction)}`).join("\n");
  await sendMessage(chatId, `📌 <b>현재 취향 지침</b> (매 후기 자동 적용)\n${lines}\n\n삭제: <code>/취향 삭제 2</code>  ·  전체삭제: <code>/취향 전체삭제</code>`);
}

/** /취향 관련 명령이면 처리하고 true 반환 */
async function handlePreferenceCommand(chatId: string, text: string): Promise<boolean> {
  const t = text.replace(/^\//, "").trim(); // 앞 슬래시 제거
  if (!/^취향/.test(t)) return false;
  const rest = t.replace(/^취향\s*/, "").trim();

  if (rest === "" || rest === "목록" || rest === "보기") { await listPreferences(chatId); return true; }

  // 전체 삭제
  if (/^(전체삭제|삭제전체|모두삭제|다삭제|전체|초기화|리셋|clear|reset|all)$/i.test(rest.replace(/\s+/g, ""))) {
    const prefs = await storage.getPreferences(chatId);
    for (const p of prefs) await storage.deletePreference(p.id);
    await sendMessage(chatId, `🗑️ 저장된 취향 ${prefs.length}개를 전부 삭제했어요.`);
    return true;
  }

  const addMatch = rest.match(/^(추가|add)\s+([\s\S]+)/);
  if (addMatch) {
    await storage.addPreference(chatId, addMatch[2].trim());
    await sendMessage(chatId, `✅ 취향 저장: ${escapeHtml(addMatch[2].trim())}\n(다음 후기부터 자동 적용)`);
    await listPreferences(chatId);
    return true;
  }

  const delMatch = rest.match(/^(삭제|제거|delete)\s+(\d+)/);
  if (delMatch) {
    const n = parseInt(delMatch[2], 10);
    const prefs = await storage.getPreferences(chatId);
    const target = prefs[n - 1];
    if (!target) { await sendMessage(chatId, `❌ ${n}번 항목이 없어요. /취향 으로 번호를 확인하세요.`); return true; }
    await storage.deletePreference(target.id);
    await sendMessage(chatId, `🗑️ 삭제: ${escapeHtml(target.instruction)}`);
    await listPreferences(chatId);
    return true;
  }

  // "/취향 <문구>" → 추가로 간주
  await storage.addPreference(chatId, rest);
  await sendMessage(chatId, `✅ 취향 저장: ${escapeHtml(rest)}\n(다음 후기부터 자동 적용)`);
  await listPreferences(chatId);
  return true;
}

async function sendHelp(chatId: string) {
  await sendMessage(chatId,
    `👋 <b>후기 자동화 봇</b>\n\n` +
    `1. 후기 캡처 <b>사진</b>을 보내면 자동으로 분석합니다.\n` +
    `2. 제목·썸네일 문구·썸네일 이미지를 <b>버튼</b>으로 고르거나, <b>말로</b> 지시하세요.\n` +
    `   예: "2번 제목으로 하고 썸네일은 3번, 더 가려주고 게시해줘"\n` +
    `3. <b>본문 수정</b>은 새 내용/지시를 그냥 메시지로 보내면 됩니다.\n` +
    `4. "게시" → 홈페이지 등록, "네이버" → 블로그 복붙 패키지.\n\n` +
    `📌 <b>취향 기억</b>: "앞으로 항상 이모지 쓰지 마"처럼 말하면 저장돼 다음 후기부터 자동 적용돼요.\n` +
    `   • <code>/취향</code> 목록 보기\n` +
    `   • <code>/취향 추가 제목은 12자 이내로</code>\n` +
    `   • <code>/취향 삭제 2</code>`);
}

// ── 업데이트 처리 ──────────────────────────────────────────────
function authorized(chatId: string): boolean {
  return ALLOWED.length === 0 || ALLOWED.includes(chatId);
}

async function handleUpdate(update: any) {
  // 콜백(버튼)
  if (update.callback_query) {
    const cq = update.callback_query;
    const chatId = String(cq.message?.chat?.id);
    await answerCallback(cq.id);
    if (!authorized(chatId)) return;
    const [kind, draftId, idxStr] = String(cq.data).split("|");
    const idx = idxStr !== undefined ? parseInt(idxStr, 10) : undefined;
    if (kind === "LB") {
      await runActions(chatId, draftId, [{ type: "setLabel", labelType: idxStr === "rename" ? "rename" : "consultation" }]);
      return;
    }
    const map: Record<string, IntentAction> = {
      T: { type: "setTitle", index: (idx ?? 0) + 1 },
      TT: { type: "setThumbnailTitle", index: (idx ?? 0) + 1 },
      TH: { type: "setThumbnail", index: (idx ?? 0) + 1 },
      MTI: { type: "moreTitles" },
      MT: { type: "moreThumbnails" },
      MM: { type: "maskMore" },
      PV: { type: "preview" },
      PUB: { type: "publish" },
      NV: { type: "naverPackage" },
    };
    const action = map[kind];
    if (action) await runActions(chatId, draftId, [action]);
    return;
  }

  const msg = update.message;
  if (!msg) return;
  const chatId = String(msg.chat.id);
  if (!authorized(chatId)) {
    await sendMessage(chatId, "이 봇을 사용할 권한이 없습니다. (chat id: " + chatId + ")");
    return;
  }

  // 사진 수신 → 파이프라인
  if (msg.photo?.length) {
    await sendMessage(chatId, "⏳ 후기를 분석하는 중이에요… (10~20초)");
    try {
      const fileId = msg.photo[msg.photo.length - 1].file_id; // 최고 해상도
      const { buffer, mediaType } = await getFileBuffer(fileId);
      const draft = await processNewReview(buffer, mediaType, chatId);
      await presentDraft(chatId, draft);
    } catch (e: any) {
      console.error("[bot] 사진 처리 실패:", e);
      await sendMessage(chatId, "❌ 처리 중 오류: " + (e?.message || e));
    }
    return;
  }

  // 문서로 보낸 이미지도 허용
  if (msg.document?.mime_type?.startsWith("image/")) {
    await sendMessage(chatId, "⏳ 후기를 분석하는 중이에요…");
    try {
      const { buffer, mediaType } = await getFileBuffer(msg.document.file_id);
      const draft = await processNewReview(buffer, mediaType, chatId);
      await presentDraft(chatId, draft);
    } catch (e: any) {
      await sendMessage(chatId, "❌ 처리 중 오류: " + (e?.message || e));
    }
    return;
  }

  // 텍스트
  if (msg.text) {
    const text = msg.text.trim();
    if (text === "/start" || text === "/help") { await sendHelp(chatId); return; }

    // 취향(표준 지침) 명령 — 초안 없이도 동작
    if (await handlePreferenceCommand(chatId, text)) return;

    const draft = await storage.getLatestReviewDraftByChat(chatId);
    if (!draft) { await sendMessage(chatId, "먼저 후기 사진을 보내주세요. 도움말은 /help"); return; }

    // 자연어 의도 해석
    try {
      const summary: DraftSummary = {
        titleCandidates: j.parse<string[]>(draft.titleCandidates, []),
        thumbnailTitleCandidates: j.parse<string[]>(draft.thumbnailTitleCandidates, []),
        thumbnailCount: j.parse<ThumbnailCandidate[]>(draft.thumbnailCandidates, []).length,
        selectedTitle: draft.selectedTitle,
        selectedThumbnailTitle: draft.selectedThumbnailTitle,
        hasThumbnailSelected: !!draft.selectedThumbnailUrl,
      };
      const actions = await parseIntent(text, summary);
      // 해석 실패 시: 본문 교체로 간주하지 않고 안내
      if (actions.length === 1 && actions[0].type === "unknown") {
        await sendMessage(chatId, "❓ 무슨 뜻인지 못 알아들었어요. 예) \"2번 제목\", \"썸네일 3번\", \"본문 더 짧게\", \"게시해줘\"");
        return;
      }
      await runActions(chatId, draft.id, actions);
    } catch (e: any) {
      await sendMessage(chatId, "❌ 명령 처리 오류: " + e?.message);
    }
    return;
  }
}

// ── 롱폴링 루프 ────────────────────────────────────────────────
let _running = false;
export function startTelegramBot() {
  if (!TOKEN) { console.log("[bot] TELEGRAM_BOT_TOKEN 미설정 → 봇 비활성화"); return; }
  if (_running) return;
  _running = true;
  console.log("[bot] 후기 자동화 텔레그램 봇 시작" + (ALLOWED.length ? ` (허용 chat: ${ALLOWED.join(",")})` : " (공개)"));
  let offset = 0;
  (async function loop() {
    while (_running) {
      try {
        const res = await fetch(`${API}/getUpdates`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ offset, timeout: 30, allowed_updates: ["message", "callback_query"] }),
        });
        const data = await res.json();
        if (data.ok && Array.isArray(data.result)) {
          for (const update of data.result) {
            offset = update.update_id + 1;
            handleUpdate(update).catch(e => console.error("[bot] update 처리 오류:", e));
          }
        }
      } catch (e: any) {
        console.error("[bot] 폴링 오류:", e?.message);
        await new Promise(r => setTimeout(r, 3000));
      }
    }
  })();
}
