import { randomUUID } from "crypto";
import { storage } from "../storage";
import { ObjectStorageService } from "../replit_integrations/object_storage/objectStorage";
import { analyzeReviewImage, labelForReviewType, generateMoreTitles } from "./vision";
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
  imageBuffer: Buffer,
  mediaType: string,
  chatId: string,
): Promise<ReviewDraft> {
  // 1) 원본 업로드
  const originalImagePath = await uploadBuffer(imageBuffer, mediaType, "reviews/original");

  // 2) AI 분석 (채팅별 취향 지침 주입)
  const prefs = (await storage.getPreferences(chatId)).map(p => p.instruction);
  const vision = await analyzeReviewImage(imageBuffer, mediaType, prefs);

  // 3) 마스킹 이미지 생성·업로드
  const masked = await maskImage(imageBuffer, vision.redactionBoxes);
  const maskedImagePath = await uploadBuffer(masked, "image/jpeg", "reviews/masked");

  // 4) 스톡 썸네일 검색
  let thumbnails: ThumbnailCandidate[] = [];
  try {
    thumbnails = await searchThumbnails(vision.thumbnailKeywords);
  } catch (e: any) {
    console.error("[pipeline] 썸네일 검색 실패:", e?.message);
  }

  // 5) draft 저장
  const draft = await storage.createReviewDraft({
    status: "review",
    source: "telegram",
    chatId,
    originalImagePath,
    maskedImagePath,
    extractedText: vision.extractedText,
    polishedContent: vision.polishedContent,
    thumbnailLabel: labelForReviewType(vision.reviewType),
    redactionBoxes: j.str(vision.redactionBoxes),
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
export async function moreThumbnails(draft: ReviewDraft, newKeywords?: string): Promise<{ draft: ReviewDraft; candidates: ThumbnailCandidate[] }> {
  let keywords: string[];
  let page: number;
  if (newKeywords && newKeywords.trim()) {
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

/** 마스킹 재생성 (expand>0 → 더 넓게 가림) */
export async function regenerateMask(draft: ReviewDraft, expand: number): Promise<ReviewDraft> {
  if (!draft.originalImagePath) throw new Error("원본 이미지가 없습니다.");
  const key = draft.originalImagePath.replace("/objects/", "");
  const { buffer } = await fetchObjectBuffer(key);
  const boxes = j.parse<RedactionBox[]>(draft.redactionBoxes, []);
  const masked = await maskImage(buffer, boxes, expand);
  const maskedImagePath = await uploadBuffer(masked, "image/jpeg", "reviews/masked");
  return (await storage.updateReviewDraft(draft.id, { maskedImagePath }))!;
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
  const body = `![후기 이미지](${d.maskedImagePath})\n\n${d.polishedContent || ""}`.trim();
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

/** 네이버 블로그 복붙용 패키지 (제목 + 일반 텍스트 본문 + 이미지 URL 목록) */
export function buildNaverPackage(draft: ReviewDraft, originBase: string) {
  const abs = (p?: string | null) => (p ? (p.startsWith("http") ? p : `${originBase}${p}`) : "");
  const images = [abs(draft.composedThumbnailPath), abs(draft.maskedImagePath)].filter(Boolean);
  const plainBody = (draft.polishedContent || "").replace(/[*_#>`]/g, "");
  return {
    title: titleWithLabel(draft.thumbnailLabel, draft.selectedTitle || "고객 후기"),
    body: plainBody,
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
