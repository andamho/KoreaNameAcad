import { randomUUID } from "crypto";
import { storage } from "../storage";
import { ObjectStorageService } from "../replit_integrations/object_storage/objectStorage";
import { analyzeReviewImages, labelForReviewType, generateMoreTitles, keywordsFromTitle } from "./vision";
import { detectPIIBoxes, visionAvailable } from "./ocr";
import { maskImage, composeThumbnail } from "./imaging";
import { searchThumbnails, fetchImageBuffer } from "./thumbnails";
import type { ReviewDraft, RedactionBox, ThumbnailCandidate, InsertContent } from "@shared/schema";

const objectStorage = new ObjectStorageService();

async function uploadBuffer(buffer: Buffer, contentType: string, prefix = "reviews"): Promise<string> {
  const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
  const key = `${prefix}/${randomUUID()}.${ext}`;
  await objectStorage.putObject(key, buffer, contentType);
  return `/objects/${key}`;
}

// JSON 헬퍼 (text 컬럼 ↔ 객체)
const j = {
  parse<T>(s: string | null | undefined, fallback: T): T {
    if (!s) return fallback;
    try { return JSON.parse(s) as T; } catch { return fallback; }
  },
  str(v: unknown): string { return JSON.stringify(v); },
};

export const draftJson = j;

/** 본문에 줄바꿈이 없으면 문장 2개씩 묶어 문단으로 나눈다(안전장치) */
export function formatParagraphs(text?: string | null): string {
  const t = (text || "").trim();
  if (!t) return "";
  if (/\n/.test(t)) return t; // 이미 줄바꿈 있으면 그대로
  const sentences = t.match(/[^.!?…]+[.!?…]+['"”’]?|\S+$/g) || [t];
  const paras: string[] = [];
  for (let i = 0; i < sentences.length; i += 2) {
    paras.push(sentences.slice(i, i + 2).join(" ").trim());
  }
  return paras.filter(Boolean).join("\n\n");
}

/** 게시 제목 앞에 분류 라벨을 붙인다: "[이름분석 상담후기] 원제목" (이미 붙어있으면 그대로) */
export function titleWithLabel(label?: string | null, title?: string | null): string {
  const t = (title || "").trim();
  const l = (label || "").trim();
  if (!l) return t;
  if (t.startsWith(l)) return t;
  return `${l} ${t}`;
}

/**
 * 새 후기 이미지를 받아 전체 파이프라인 실행 후 검수 대기(draft) 생성.
 * 1) Claude Vision  2) 마스킹  3) 스톡 썸네일 5  4) R2 업로드  5) draft 저장
 */
export async function processNewReview(
  imageBuffers: Buffer[],
  mediaType: string,
  chatId: string,
): Promise<ReviewDraft> {
  const n = imageBuffers.length;

  // 1) 원본 업로드 (입력 순서)
  const originalPaths: string[] = [];
  for (const buf of imageBuffers) originalPaths.push(await uploadBuffer(buf, mediaType, "reviews/original"));

  // 2) AI 분석 (여러 장 통합, 취향 주입)
  const prefs = (await storage.getPreferences(chatId)).map(p => p.instruction);
  const vision = await analyzeReviewImages(imageBuffers, mediaType, prefs);

  // 3) 개인정보 박스 계산: Google Vision OCR(정확한 위치) 우선, 실패 시 Gemini 박스
  const pii = vision.detectedPersonalInfo || [];
  const useOcr = visionAvailable();
  const boxesByInput: RedactionBox[] = [];
  for (let i = 0; i < n; i++) {
    let boxes: RedactionBox[] = [];
    if (useOcr) {
      try { boxes = await detectPIIBoxes(imageBuffers[i], pii, i); }
      catch (e: any) { console.error(`[ocr] 이미지 ${i} 실패:`, e?.message); }
    }
    if (!boxes.length) boxes = vision.redactionBoxes.filter((b) => (b.image ?? 0) === i); // OCR 미검출 시 대체
    boxesByInput.push(...boxes);
  }

  // 각 이미지 마스킹 (OCR 정밀 박스라 확장 작게)
  const maskedPaths: string[] = [];
  for (let i = 0; i < n; i++) {
    const boxes = boxesByInput.filter((b) => (b.image ?? 0) === i);
    const masked = await maskImage(imageBuffers[i], boxes, 0.12);
    maskedPaths.push(await uploadBuffer(masked, "image/jpeg", "reviews/masked"));
  }

  // 4) imageOrder(내용→증빙)로 재정렬 + 박스 image 인덱스도 새 위치로 리맵
  const order = (vision.imageOrder && vision.imageOrder.length === n) ? vision.imageOrder : originalPaths.map((_, i) => i);
  const posOf = new Map<number, number>(order.map((oldI, newI) => [oldI, newI]));
  const orderedOriginal = order.map((i) => originalPaths[i]).filter(Boolean);
  const orderedMasked = order.map((i) => maskedPaths[i]).filter(Boolean);
  const remappedBoxes = boxesByInput.map((b) => ({ ...b, image: posOf.get(b.image ?? 0) ?? 0 }));

  // 5) 스톡 썸네일 검색
  let thumbnails: ThumbnailCandidate[] = [];
  try {
    thumbnails = await searchThumbnails(vision.thumbnailKeywords);
  } catch (e: any) {
    console.error("[pipeline] 썸네일 검색 실패:", e?.message);
  }

  // 6) draft 저장
  const draft = await storage.createReviewDraft({
    status: "review",
    source: "telegram",
    chatId,
    originalImagePath: orderedOriginal[0] ?? null,
    maskedImagePath: orderedMasked[0] ?? null,
    originalImagePaths: j.str(orderedOriginal),
    maskedImagePaths: j.str(orderedMasked),
    extractedText: vision.extractedText,
    polishedContent: formatParagraphs(vision.polishedContent),
    thumbnailLabel: labelForReviewType(vision.reviewType),
    redactionBoxes: j.str(remappedBoxes),
    titleCandidates: j.str(vision.titleCandidates),
    thumbnailTitleCandidates: j.str(vision.thumbnailTitleCandidates),
    thumbnailCandidates: j.str(thumbnails),
    thumbnailKeywords: j.str(vision.thumbnailKeywords),
    thumbnailPage: 1,
    selectedTitle: vision.titleCandidates[0] ?? null,
    selectedThumbnailTitle: vision.thumbnailTitleCandidates[0] ?? null,
    selectedThumbnailUrl: null,
    composedThumbnailPath: null,
    publishedContentId: null,
    errorMessage: null,
  });
  return draft;
}

/** 게시 제목 5개 다시 생성 (기존 후보와 겹치지 않게, 취향 반영) */
export async function moreTitles(draft: ReviewDraft): Promise<{ draft: ReviewDraft; titles: string[] }> {
  const prefs = draft.chatId ? (await storage.getPreferences(draft.chatId)).map(p => p.instruction) : [];
  const avoid = j.parse<string[]>(draft.titleCandidates, []);
  let titles = await generateMoreTitles(draft.polishedContent || "", prefs, avoid);
  if (!titles.length) titles = avoid; // 실패 시 기존 유지
  const updated = (await storage.updateReviewDraft(draft.id, {
    titleCandidates: j.str(titles),
    selectedTitle: titles[0] ?? draft.selectedTitle,
  }))!;
  return { draft: updated, titles };
}

/**
 * 썸네일 후보 다시 찾기.
 * newKeywords(영문) 주면 새 키워드로 1페이지부터, 없으면 기존 키워드의 다음 페이지.
 * 목록이 바뀌므로 기존 썸네일 선택은 초기화.
 */
export async function moreThumbnails(draft: ReviewDraft, newKeywords?: string, fromTitle = false): Promise<{ draft: ReviewDraft; candidates: ThumbnailCandidate[] }> {
  let keywords: string[];
  let page: number;
  if (fromTitle) {
    // 현재 선택된 제목에서 핵심 단어 추출
    const tk = await keywordsFromTitle(draft.selectedTitle || "");
    keywords = tk.length ? tk : j.parse<string[]>(draft.thumbnailKeywords, []);
    page = 1;
  } else if (newKeywords && newKeywords.trim()) {
    keywords = newKeywords.trim().split(/[\s,]+/).filter(Boolean).slice(0, 4);
    page = 1;
  } else {
    keywords = j.parse<string[]>(draft.thumbnailKeywords, []);
    page = (draft.thumbnailPage || 1) + 1;
  }
  const candidates = await searchThumbnails(keywords, page);
  const updated = (await storage.updateReviewDraft(draft.id, {
    thumbnailCandidates: j.str(candidates),
    thumbnailKeywords: j.str(keywords),
    thumbnailPage: page,
    selectedThumbnailUrl: null,
    composedThumbnailPath: null,
  }))!;
  return { draft: updated, candidates };
}

/** 다중 이미지 경로 헬퍼 (신규 배열 우선, 없으면 단일 값) */
function maskedList(d: ReviewDraft): string[] {
  return j.parse<string[]>(d.maskedImagePaths, d.maskedImagePath ? [d.maskedImagePath] : []);
}
function originalList(d: ReviewDraft): string[] {
  return j.parse<string[]>(d.originalImagePaths, d.originalImagePath ? [d.originalImagePath] : []);
}

/** 마스킹 재생성 (expand>0 → 더 넓게 가림) — 모든 장 재마스킹 */
export async function regenerateMask(draft: ReviewDraft, expand: number): Promise<ReviewDraft> {
  const originals = originalList(draft);
  if (!originals.length) throw new Error("원본 이미지가 없습니다.");
  const boxesAll = j.parse<RedactionBox[]>(draft.redactionBoxes, []);
  const maskedPaths: string[] = [];
  for (let i = 0; i < originals.length; i++) {
    const buffer = await objectPathToBuffer(originals[i]);
    const boxes = boxesAll.filter((b) => (b.image ?? 0) === i);
    const masked = await maskImage(buffer, boxes, expand);
    maskedPaths.push(await uploadBuffer(masked, "image/jpeg", "reviews/masked"));
  }
  return (await storage.updateReviewDraft(draft.id, {
    maskedImagePaths: j.str(maskedPaths),
    maskedImagePath: maskedPaths[0] ?? null,
  }))!;
}

/** 사용자가 지정한 세로 구간(가로 전체)을 추가로 블러 (AI가 놓친 부분 수동 커버) */
export async function addManualMaskBand(draft: ReviewDraft, imageIndex: number, top: number, bottom: number): Promise<ReviewDraft> {
  const boxes = j.parse<RedactionBox[]>(draft.redactionBoxes, []);
  const t = Math.max(0, Math.min(1, Math.min(top, bottom)));
  const b = Math.max(0, Math.min(1, Math.max(top, bottom)));
  const imgN = originalList(draft).length || 1;
  const idx = Math.max(0, Math.min(imgN - 1, imageIndex));
  boxes.push({ x: 0.02, y: t, w: 0.96, h: Math.max(0.04, b - t), image: idx, reason: "수동 지정" });
  const updated = (await storage.updateReviewDraft(draft.id, { redactionBoxes: j.str(boxes) }))!;
  return regenerateMask(updated, 0);
}

/** 선택된 썸네일 이미지 + 문구로 합성 썸네일 생성·업로드 */
export async function composeSelectedThumbnail(draft: ReviewDraft): Promise<ReviewDraft> {
  const thumbs = j.parse<ThumbnailCandidate[]>(draft.thumbnailCandidates, []);
  const chosenUrl = draft.selectedThumbnailUrl || thumbs[0]?.url;
  if (!chosenUrl) throw new Error("선택된 썸네일이 없습니다.");
  const { buffer } = await fetchImageBuffer(chosenUrl);
  const composed = await composeThumbnail(buffer, draft.selectedThumbnailTitle || "", draft.thumbnailLabel || "");
  const composedThumbnailPath = await uploadBuffer(composed, "image/jpeg", "reviews/thumbnail");
  return (await storage.updateReviewDraft(draft.id, { composedThumbnailPath, selectedThumbnailUrl: chosenUrl }))!;
}

/** 홈페이지 후기로 게시 (기존 contents/review 재사용) */
export async function publishReview(draft: ReviewDraft): Promise<{ contentId: string; draft: ReviewDraft }> {
  // 합성 썸네일이 없으면 먼저 생성
  let d = draft;
  if (!d.composedThumbnailPath) {
    d = await composeSelectedThumbnail(d);
  }
  // 본문 순서: ① (썸네일은 thumbnail 필드로 상세페이지 최상단 자동 표시) → ② 블러 후기 이미지들(내용→증빙 순) → ③ 후기 텍스트
  const parts: string[] = [];
  for (const m of maskedList(d)) parts.push(`![후기 이미지](${m})`);
  if (d.polishedContent) parts.push(d.polishedContent);
  const body = parts.join("\n\n").trim();
  const content: InsertContent = {
    category: "review",
    title: titleWithLabel(d.thumbnailLabel, d.selectedTitle || "고객 후기"),
    thumbnail: d.composedThumbnailPath || d.maskedImagePath,
    content: body,
    videoUrl: null,
    isVideo: false,
    isDraft: false,
  };
  const created = await storage.createContent(content);
  const updated = await storage.updateReviewDraft(d.id, {
    status: "published",
    publishedContentId: created.id,
  });
  return { contentId: created.id, draft: updated! };
}

// 네이버 블로그 본문 하단에 항상 붙이는 홍보/신청 블록
const NAVER_FOOTER = `😩고달픈 인생,
이름 하나로 이유와 해결책을!

🔍한글.한자이름만으로 운명상담
[정확도 80%👆]

🌸운이 술술 풀리는 이름으로
인생역전!

🔮이름상담 및 작명 [신청방법]
아래 링크통해
진행해주시면 됩니다~

📊 18년간 45만명 임상

#한국이름학교 #와츠유어네임이름연구협회 #이름분석 #이름풀이 #이름감명 #작명 #개명잘하는곳 #개명효과 #개명상담 #작명소 #운세상담`;

/** 네이버 블로그 복붙용 패키지 (제목 + 일반 텍스트 본문 + 이미지 URL 목록) */
export function buildNaverPackage(draft: ReviewDraft, originBase: string) {
  const abs = (p?: string | null) => (p ? (p.startsWith("http") ? p : `${originBase}${p}`) : "");
  const images = maskedList(draft).map(abs).filter(Boolean);
  const plainBody = (draft.polishedContent || "").replace(/[*_>`]/g, ""); // 해시태그 #는 유지
  const body = `${plainBody}\n\n${NAVER_FOOTER}`.trim();
  return {
    title: titleWithLabel(draft.thumbnailLabel, draft.selectedTitle || "고객 후기"),
    body,
    thumbnailTitle: draft.selectedThumbnailTitle || "",
    images,
  };
}

/** /objects/... 경로의 R2 객체를 버퍼로 가져온다 (텔레그램 전송용) */
export async function objectPathToBuffer(objectPath: string): Promise<Buffer> {
  const key = objectPath.replace("/objects/", "");
  const { buffer } = await fetchObjectBuffer(key);
  return buffer;
}

// 내부: R2 객체를 버퍼로 다운로드 (마스킹 재생성용)
async function fetchObjectBuffer(key: string): Promise<{ buffer: Buffer }> {
  // ObjectStorageService 에는 버퍼 다운로드가 없어 S3 GetObject를 직접 호출
  const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3");
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
    },
  });
  const out = await client.send(new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME || "", Key: key }));
  const bytes = await out.Body!.transformToByteArray();
  return { buffer: Buffer.from(bytes) };
}
