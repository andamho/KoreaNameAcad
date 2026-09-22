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
 * 헤더 구간(잘라낸 이미지 맨 위). 자르기 규칙이 "대화 상대 이름 헤더 바로 위"라
 * 헤더는 항상 여기 온다. 이 구간에서 개인정보가 걸리면 그 줄 전체를 가린다
 * (헤더 줄에는 이름·번호·날짜뿐이라 가려도 후기 내용 손실이 없다).
 */
export const HEADER_Y = 0.07;

function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return dp[m][n];
}

/**
 * OCR 단어(wn)가 개인정보 문자열(p)에 해당하는가.
 * - 정확 포함(기존): "주희가" ⊃ "주희", "최주희" ⊃ "주희"
 * - 3글자 이상은 1글자 오독 허용: OCR이 "최주희"를 "최수희"로 읽어도 가린다.
 *   (2글자는 오독 허용 시 일반 단어까지 가려지므로 정확 일치만)
 */
export function matchesPII(wn: string, p: string): boolean {
  if (p.includes(wn) || wn.includes(p)) return true;
  if (p.length < 3) return false;
  // 단어 안에서 p와 같은 길이(글자 바뀜)·한 글자 긴(글자 끼어듦) 구간을 훑는다
  for (const len of [p.length, p.length + 1]) {
    for (let s = 0; s + len <= wn.length; s++) {
      if (editDistance(wn.slice(s, s + len), p) <= 1) return true;
    }
  }
  return false;
}

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
          const matched = piiNorm.some((p) => matchesPII(wn, p));
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
          if ((minY + maxY) / 2 / H < HEADER_Y) {
            // 헤더 줄: 옆 단어(이름 등)를 OCR이 잘못 읽었어도 같이 가려지도록 줄 전체
            boxes.push({ x: 0, y: minY / H, w: 1, h: bh, reason: `OCR헤더줄:${text}`, image: imageIndex });
          } else {
            // 본문: 그 단어만 가린다(문장 나머지는 그대로 읽히게)
            boxes.push({ x: minX / W, y: minY / H, w: bw, h: bh, reason: `OCR:${text}`, image: imageIndex });
          }
        }
      }
    }
  }
  return boxes;
}
