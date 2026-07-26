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

// ── 이름분석표에서 개명 전 이름 뽑기 (가족이면 전원) ──
const NAMES_SCHEMA = {
  type: "object",
  properties: { names: { type: "array", items: { type: "string" } } },
  required: ["names"],
};
const NAMES_SYSTEM =
  "당신은 한국이름학교 이름분석표에서 '분석 대상자(사람)의 한글 이름'만 뽑는 도우미입니다.\n" +
  "포함할 것: 표의 각 섹션 맨 위에 큰 글씨로 단독 표기된 사람 이름(그 옆에 오행 글자와 '○○세 직업'이 붙는다). 가족 분석표면 구성원 전원.\n" +
  "반드시 제외할 것:\n" +
  " - 주역 64괘 이름(화천대유·화지진·화택규·택천쾌·택산함·뇌화풍·뇌풍항·뇌천대장·진위뢰·건위천·천수송·산택손 등 두 글자 괘가 결합된 모든 표현)\n" +
  " - 수리운 항목(다재다능·인기순조·재물계획·이산파멸·명망사해·지략배려 등)\n" +
  " - 괄호 안 유명인 예시(조수미·유재석·이길여·임영웅·김미경 등)와 회사·상품명(스타벅스·비트코인 등)\n" +
  " - 한자 이름 표기\n" +
  "즉 '한자이름분석' 아래의 표 내용은 전부 이름이 아닙니다. 사람 이름만 순서대로 반환하세요.";

export async function extractReportNames(customerId: string): Promise<{ names: string[]; source?: string }> {
  if (!db) return { names: [] };
  const files = await db.select().from(crmFiles).where(eq(crmFiles.customerId, customerId));
  // 이름분석표(새이름 아님) 이미지 중 최신 1건
  const target = files
    .filter((f) => isOcrTarget(f.fileType) && !/새이름/.test(`${f.fileName || ""} ${f.memo || ""}`))
    .sort((a, b) => new Date(b.uploadedAt as any).getTime() - new Date(a.uploadedAt as any).getTime())[0];
  if (!target) return { names: [] };

  const key = target.fileUrl.replace(/^\/objects\//, "");
  const { buffer, contentType } = await objectStore.getObjectBuffer(key);
  const out = await geminiJson<{ names: string[] }>(
    NAMES_SYSTEM,
    [
      { text: "이 이름분석표에서 분석 대상자의 한글 이름만 순서대로 모두 뽑아줘." },
      { inline_data: { mime_type: target.fileType || contentType || "image/png", data: buffer.toString("base64") } },
    ],
    NAMES_SCHEMA,
    1024,
  );
  const names = (out.names || [])
    .map((n) => (n || "").trim())
    .filter((n) => /^[가-힣]{2,5}$/.test(n))
    .filter((n, i, arr) => arr.indexOf(n) === i);
  return { names, source: target.fileName };
}
