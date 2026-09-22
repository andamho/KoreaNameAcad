import type { RedactionBox } from "@shared/schema";
import { detectPIIBoxes } from "./ocr";

/**
 * 이미지별 마스킹 박스 결정 (OCR 정밀 박스 + Gemini 박스 안전망).
 * storage/DB에 의존하지 않아 테스트에서도 그대로 호출한다.
 */

type Crop = { image: number; top: number; bottom: number }; // 0~1000, 원본 기준

// 이보다 큰 Gemini 박스는 위치를 잘못 잡은 것으로 보고 버린다(본문을 통째로 가리는 사고 방지)
const MAX_GEMINI_BOX_H = 0.15;
const MAX_GEMINI_BOX_AREA = 0.2;

/**
 * Gemini 박스(원본 이미지 기준 0~1)를 상/하단을 잘라낸 이미지 좌표로 옮긴다.
 * 잘린 구간 밖이면 버리고, 걸치면 잘린 범위 안으로 자른다.
 */
export function remapToCrop(b: RedactionBox, crop?: Crop): RedactionBox | null {
  if (!crop) return b;
  const t = crop.top / 1000, bt = crop.bottom / 1000;
  const span = bt - t;
  if (span <= 0) return b;
  const y0 = Math.max(0, (b.y - t) / span);
  const y1 = Math.min(1, (b.y + b.h - t) / span);
  if (y1 <= 0 || y0 >= 1 || y1 - y0 <= 0) return null;
  return { ...b, y: y0, h: y1 - y0 };
}

// 채팅 앱 헤더(상대 이름 줄) 높이 ≈ 원본 화면 높이의 4.5% (삼성 메시지·카카오톡 실측 3.5~4.5%)
const HEADER_H_OF_ORIGINAL = 0.045;

/**
 * 채팅 캡처로 잘린 이미지(crop.top > 0)는 자르기 규칙상 맨 위가 곧 상대 이름 헤더다.
 * OCR이 헤더를 못 읽는 경우(글자가 위쪽 가장자리에서 잘림 등)에도 이름이 남지 않도록
 * 헤더 띠를 무조건 가린다. 원본 기준 높이를 잘린 이미지 비율로 환산.
 */
export function headerBand(crop: Crop | undefined, image: number): RedactionBox | null {
  if (!crop || crop.top <= 0) return null;
  const span = (crop.bottom - crop.top) / 1000;
  if (span <= 0) return null;
  const h = Math.min(0.25, Math.max(0.035, HEADER_H_OF_ORIGINAL / span));
  return { x: 0, y: 0, w: 1, h, reason: "헤더띠(채팅캡처)", image };
}

function saneGeminiBox(b: RedactionBox): boolean {
  return b.w > 0 && b.h > 0 && b.h <= MAX_GEMINI_BOX_H && b.w * b.h <= MAX_GEMINI_BOX_AREA;
}

/**
 * @param croppedBuffers 상/하단을 잘라낸 이미지들(마스킹 대상)
 * @param pii Gemini가 찾은 개인정보 문자열
 * @param geminiBoxes Gemini 박스(원본 기준, image 인덱스 포함)
 * @param crops 이미지별 자르기 구간(원본 기준 0~1000)
 * @param useOcr Google Vision OCR 사용 가능 여부
 */
export async function buildMaskBoxes(
  croppedBuffers: Buffer[],
  pii: string[],
  geminiBoxes: RedactionBox[],
  crops: Crop[],
  useOcr: boolean,
): Promise<RedactionBox[]> {
  const out: RedactionBox[] = [];
  for (let i = 0; i < croppedBuffers.length; i++) {
    // 1) OCR 정밀 박스 (헤더 줄은 줄 전체, 본문은 단어만)
    if (useOcr) {
      try { out.push(...await detectPIIBoxes(croppedBuffers[i], pii, i)); }
      catch (e: any) { console.error(`[ocr] 이미지 ${i} 실패:`, e?.message); }
    }
    // 2) 안전망: Gemini 박스를 잘린 좌표로 옮겨 항상 함께 적용.
    //    (예전엔 OCR이 하나라도 찾았거나 이미지를 잘랐으면 버려서, OCR이 이름을 잘못 읽으면 막을 게 없었다)
    const crop = crops.find((c) => c.image === i);
    // 3) 채팅 캡처면 헤더 띠는 OCR 결과와 무관하게 항상 가림
    const band = headerBand(crop, i);
    if (band) out.push(band);
    for (const b of geminiBoxes.filter((g) => (g.image ?? 0) === i)) {
      const m = remapToCrop(b, crop);
      if (m && saneGeminiBox(m)) out.push({ ...m, image: i, reason: `Gemini:${b.reason || ""}` });
    }
  }
  return out;
}
