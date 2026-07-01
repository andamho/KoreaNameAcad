import fs from "fs";
import path from "path";
import sharp from "sharp";
import { ImageAnnotatorClient } from "@google-cloud/vision";
import type { RedactionBox } from "@shared/schema";

/**
 * Google Vision OCR(document_text_detection)로 이미지의 단어별 정확한 위치를 얻어,
 * Gemini가 찾은 개인정보 문자열과 매칭해 "정확한 마스킹 박스"를 만든다.
 * 인증: GOOGLE_VISION_CREDENTIALS(JSON 문자열) 우선 → 로컬 google-vision-credentials.json.
 */

let _client: ImageAnnotatorClient | null | undefined; // undefined=미시도, null=불가

function loadClient(): ImageAnnotatorClient | null {
  if (_client !== undefined) return _client;
  try {
    const envJson = process.env.GOOGLE_VISION_CREDENTIALS?.trim();
    if (envJson) {
      const c = JSON.parse(envJson);
      _client = new ImageAnnotatorClient({ credentials: { client_email: c.client_email, private_key: c.private_key }, projectId: c.project_id });
      return _client;
    }
    const candidates = [
      process.env.GOOGLE_APPLICATION_CREDENTIALS,
      path.resolve(process.cwd(), "google-vision-credentials.json"),
      path.resolve(process.cwd(), "credentials.json"),
    ].filter(Boolean) as string[];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        _client = new ImageAnnotatorClient({ keyFilename: p });
        return _client;
      }
    }
    console.log("[ocr] Vision 인증 없음 → OCR 비활성(Gemini 박스로 대체)");
    _client = null;
    return null;
  } catch (e: any) {
    console.error("[ocr] Vision 클라이언트 초기화 실패:", e?.message);
    _client = null;
    return null;
  }
}

export function visionAvailable(): boolean {
  return loadClient() !== null;
}

// 매칭용 정규화: 공백/하이픈/점 제거, 소문자 (밑줄 _는 아이디 일부라 유지)
const norm = (s: string) => (s || "").replace(/[\s\-.·,()/[\]]/g, "").toLowerCase();

/**
 * 이미지에서 개인정보(piiStrings)에 해당하는 단어들의 정확한 박스를 반환.
 * @param imageIndex 결과 박스에 넣을 image 인덱스
 */
export async function detectPIIBoxes(imageBuffer: Buffer, piiStrings: string[], imageIndex: number): Promise<RedactionBox[]> {
  const client = loadClient();
  if (!client) return [];
  const piiNorm = (piiStrings || []).map(norm).filter((p) => p.length >= 2);
  if (!piiNorm.length) return [];

  const meta = await sharp(imageBuffer, { failOn: "none" }).rotate().metadata();
  const W = meta.width || 1000;
  const H = meta.height || 1000;
  // OCR은 회전 보정된 픽셀 기준으로 맞추기 위해 회전 반영본을 넘긴다
  const rotated = await sharp(imageBuffer, { failOn: "none" }).rotate().jpeg().toBuffer();

  const [result] = await client.documentTextDetection({ image: { content: rotated } });
  const annotation = result?.fullTextAnnotation;
  if (!annotation) return [];

  const boxes: RedactionBox[] = [];
  for (const page of annotation.pages || []) {
    for (const block of page.blocks || []) {
      for (const para of block.paragraphs || []) {
        for (const word of para.words || []) {
          const text = (word.symbols || []).map((s: any) => s.text || "").join("");
          const wn = norm(text);
          if (wn.length < 2) continue;
          const matched = piiNorm.some((p) => p.includes(wn) || wn.includes(p));
          if (!matched) continue;
          const verts = word.boundingBox?.vertices || [];
          if (verts.length < 4) continue;
          const xs = verts.map((v: any) => v.x || 0);
          const ys = verts.map((v: any) => v.y || 0);
          const minX = Math.min(...xs), maxX = Math.max(...xs);
          const minY = Math.min(...ys), maxY = Math.max(...ys);
          const bw = (maxX - minX) / W;
          const bh = (maxY - minY) / H;
          if (bw <= 0 || bh <= 0) continue;
          boxes.push({ x: minX / W, y: minY / H, w: bw, h: bh, reason: `OCR:${text}`, image: imageIndex });
        }
      }
    }
  }
  return boxes;
}
