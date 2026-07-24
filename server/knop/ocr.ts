// 첨부 이미지 OCR: 고객이 보낸 사진(신분증·서류·캡처 등)에서 글자를 추출해 crm_files.ocr_text 에 저장.
// Gemini 비전(입금문자 분석과 동일 헬퍼) 사용. 업로드 시 자동 실행 + 수동 재실행 지원.
import { eq } from "drizzle-orm";
import { db } from "../db";
import { crmFiles } from "@shared/schema";
import { geminiJson } from "../reviewPipeline/gemini";
import { ObjectStorageService } from "../object_storage/objectStorage";

const objectStore = new ObjectStorageService();

const OCR_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" }, // 어떤 서류/내용인지 한 줄
    text: { type: "string" },    // 이미지에 보이는 모든 글자
  },
  required: ["summary", "text"],
};

const OCR_SYSTEM =
  "당신은 한국어 문서·사진 OCR 도우미입니다. 이미지에 보이는 모든 글자를 빠짐없이 정확히 추출하고(줄바꿈 유지), " +
  "어떤 서류/내용인지 한 줄로 요약합니다. 손글씨도 최대한 읽습니다. 글자가 없으면 text 를 빈 문자열로 둡니다. " +
  "설명·해석을 덧붙이지 말고 보이는 글자만 그대로 옮깁니다.";

export function isOcrTarget(fileType?: string | null): boolean {
  return !!fileType && fileType.startsWith("image/");
}

// 한 파일 OCR 실행(상태 갱신 포함). 실패해도 throw 하지 않음(백그라운드 안전).
export async function runOcr(fileId: string): Promise<{ ok: boolean; status: string; text?: string }> {
  if (!db) return { ok: false, status: "failed" };
  const [f] = await db.select().from(crmFiles).where(eq(crmFiles.id, fileId));
  if (!f) return { ok: false, status: "failed" };
  if (!isOcrTarget(f.fileType)) return { ok: false, status: "skipped" };

  await db.update(crmFiles).set({ ocrStatus: "pending" }).where(eq(crmFiles.id, fileId));
  try {
    const key = f.fileUrl.replace(/^\/objects\//, "");
    const { buffer, contentType } = await objectStore.getObjectBuffer(key);
    const b64 = buffer.toString("base64");
    const out = await geminiJson<{ summary: string; text: string }>(
      OCR_SYSTEM,
      [
        { text: "이 이미지의 모든 텍스트를 추출하고, 무슨 서류/내용인지 한 줄 요약을 작성해줘." },
        { inline_data: { mime_type: f.fileType || contentType || "image/jpeg", data: b64 } },
      ],
      OCR_SCHEMA,
      4096,
    );
    const body = (out.text || "").trim();
    const merged = body || "(인식된 글자 없음)";
    await db
      .update(crmFiles)
      .set({ ocrText: merged, ocrStatus: "done", memo: f.memo || (out.summary || "").trim() || null })
      .where(eq(crmFiles.id, fileId));
    return { ok: true, status: "done", text: merged };
  } catch (e: any) {
    console.error(`[OCR] 실패 ${fileId}: ${e?.message}`);
    await db.update(crmFiles).set({ ocrStatus: "failed" }).where(eq(crmFiles.id, fileId)).catch(() => {});
    return { ok: false, status: "failed" };
  }
}

// 업로드 직후 호출: 이미지면 백그라운드로 OCR 시작(응답 지연 없음).
export function kickOcr(fileId: string, fileType?: string | null): void {
  if (!isOcrTarget(fileType)) return;
  runOcr(fileId).catch((e) => console.error(`[OCR] kick 실패 ${fileId}: ${e?.message}`));
}
