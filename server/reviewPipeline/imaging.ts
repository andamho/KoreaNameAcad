import sharp from "sharp";
import fs from "fs";
import path from "path";
import type { RedactionBox } from "@shared/schema";

/**
 * 이미지 가공: (1) 개인정보 마스킹  (2) 썸네일 합성(스톡 이미지 + 문구)
 * sharp 기반. 한글 폰트는 THUMBNAIL_FONT_PATH(또는 server/assets/fonts) 의 .ttf/.otf 를 사용.
 */

// ── 한글 폰트 (썸네일 문구 렌더용, 기본: 코트라 볼드체 KOTRA_BOLD) ──
// sharp 네이티브 text 연산에 fontfile로 직접 지정 → 서버 어디서든 한글 렌더 안정적.
const FONT_FAMILY = process.env.THUMBNAIL_FONT_FAMILY?.trim() || "KOTRA_BOLD Bold";
let _fontPath: string | null | undefined; // undefined=미시도, null=없음
function resolveFontPath(): string | null {
  if (_fontPath !== undefined) return _fontPath;
  const candidates = [
    process.env.THUMBNAIL_FONT_PATH,
    path.resolve(process.cwd(), "server/assets/fonts/thumbnail.ttf"),
    path.resolve(process.cwd(), "server/assets/fonts/thumbnail.otf"),
  ].filter(Boolean) as string[];
  for (const p of candidates) {
    try { if (fs.existsSync(p)) { _fontPath = p; return _fontPath; } } catch { /* ignore */ }
  }
  _fontPath = null;
  return null;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!));
}

/**
 * 개인정보 마스킹 — 해당 영역을 강한 블러로 처리(검정 박스 대신).
 * @param boxes 정규화(0~1) 박스. expand>0 이면 각 박스를 확대해 더 넓게 가림("더 가려줘").
 */
export async function maskImage(input: Buffer, boxes: RedactionBox[], expand = 0): Promise<Buffer> {
  // EXIF 회전을 먼저 확정(좌표와 정렬되게) 후 버퍼로 고정
  const base = await sharp(input, { failOn: "none" }).rotate().toBuffer();
  const meta = await sharp(base).metadata();
  const W = meta.width || 1000;
  const H = meta.height || 1000;

  if (!boxes.length) {
    return sharp(base).jpeg({ quality: 90 }).toBuffer();
  }

  const overlays: sharp.OverlayOptions[] = [];
  for (const b of boxes) {
    // AI 좌표 오차 대비: 개인정보가 있는 "줄 전체(가로)"를 덮고, 세로도 넉넉히.
    const padH = b.h * expand + b.h * 0.7; // 세로 여유 크게(줄 위치 오차 흡수)
    const cy = b.y + b.h / 2;              // 박스 세로 중심
    const halfH = (b.h + padH) / 2;
    let top = Math.round(Math.max(0, cy - halfH) * H);
    let height = Math.round(Math.min(1, cy + halfH) * H) - top;
    let left = Math.round(0.02 * W);       // 가로는 거의 전체
    let width = Math.round(0.96 * W);
    width = Math.min(width, W - left);
    height = Math.min(height, H - top);
    if (width < 2 || height < 2) continue;

    // 영역 크기에 비례한 강한 블러(안 읽히게). 최소 sigma 16.
    const sigma = Math.min(80, Math.max(16, Math.round(Math.min(width, height) / 2.5)));
    try {
      const region = await sharp(base)
        .extract({ left, top, width, height })
        .blur(sigma)
        .toBuffer();
      overlays.push({ input: region, left, top });
    } catch (e: any) {
      console.error("[mask] 블러 영역 처리 실패:", e?.message);
    }
  }

  if (!overlays.length) return sharp(base).jpeg({ quality: 90 }).toBuffer();
  return sharp(base).composite(overlays).jpeg({ quality: 90 }).toBuffer();
}

const THUMB = 1080;       // 정사각형 한 변 (홈페이지 후기 카드가 1:1)
const TEXT_W = 1030;      // 렌더 캔버스 폭(재줄바꿈 방지용, FILL_W보다 큼)
const FILL_W = 1000;      // 글자가 채울 목표 가로 폭
const MAX_SIZE = 150;     // 폰트 크기 상한
const MIN_SIZE = 46;      // 폰트 크기 하한

// 문구 길이에 따른 메인 제목 폰트 크기(px, dpi 72 기준). 정사각형 기준. (크게)
function pickFontSize(title: string): number {
  const n = title.length;
  if (n <= 8) return 134;
  if (n <= 14) return 114;
  if (n <= 22) return 96;
  if (n <= 30) return 82;
  return 70;
}

type Rendered = { buf: Buffer; w: number; h: number };

// 공백(단어) 기준 균형 줄바꿈 — 한글 단어가 중간에 잘리지 않게 직접 개행 삽입
function wrapKo(text: string, maxChars: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const cand = cur ? cur + " " + w : w;
    if (!cur || cand.length <= maxChars) {
      cur = cand;
    } else {
      lines.push(cur);
      cur = w;
    }
    while (cur.length > maxChars) { // 한 단어가 너무 길면 강제 분할
      lines.push(cur.slice(0, maxChars));
      cur = cur.slice(maxChars);
    }
  }
  if (cur) lines.push(cur);
  return lines.join("\n");
}

// 단어를 k줄에 균형 있게 배분 (각 줄 글자 수가 비슷하게)
function balancedWrap(text: string, k: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (k <= 1 || words.length <= 1) return words.join(" ");
  const kk = Math.min(k, words.length);
  const target = words.join(" ").length / kk;
  const lines: string[] = [];
  let cur = "";
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const cand = cur ? cur + " " + w : w;
    const linesLeft = kk - lines.length;
    const wordsLeft = words.length - i;
    if (cur && cand.length > target * 1.05 && linesLeft > 1 && wordsLeft >= linesLeft) {
      lines.push(cur);
      cur = w;
    } else {
      cur = cand;
    }
  }
  if (cur) lines.push(cur);
  return lines.join("\n");
}

// 코트라 볼드로 텍스트를 렌더해 {버퍼, 폭, 높이} 반환. 실패 시 null.
async function renderText(text: string, color: string, size: number): Promise<Rendered | null> {
  const fontfile = resolveFontPath();
  const markup = `<span foreground="${color}">${escapeXml(text)}</span>`;
  try {
    const buf = await sharp({
      text: {
        text: markup,
        ...(fontfile ? { fontfile } : {}),
        font: `${FONT_FAMILY} ${size}`,
        rgba: true,
        width: TEXT_W,
        align: "centre",
        dpi: 72,
      },
    }).png().toBuffer();
    const meta = await sharp(buf).metadata();
    return { buf, w: meta.width || 0, h: meta.height || 0 };
  } catch (e: any) {
    console.error("[thumbnail] 텍스트 렌더 실패:", e?.message);
    return null;
  }
}

// 텍스트를 상단에 두므로 위쪽을 어둡게(가독성), 아래는 밝게(핵심 이미지 노출)
const GRADIENT_SVG = `<svg width="${THUMB}" height="${THUMB}" xmlns="http://www.w3.org/2000/svg">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#000000" stop-opacity="0.66"/>
    <stop offset="0.42" stop-color="#000000" stop-opacity="0.34"/>
    <stop offset="0.7" stop-color="#000000" stop-opacity="0.10"/>
    <stop offset="1" stop-color="#000000" stop-opacity="0.05"/>
  </linearGradient></defs>
  <rect width="${THUMB}" height="${THUMB}" fill="url(#g)"/>
</svg>`;

// 텍스트 블록의 세로 중심 위치(0=맨위, 1=맨아래). 살짝 위쪽.
const TEXT_CENTER_Y = 0.30;

// 텍스트 1줄(그림자+흰색)을 layers에 추가하고 차지한 높이를 반환
async function pushTextLine(layers: sharp.OverlayOptions[], text: string, color: string, size: number, top: number): Promise<number> {
  const white = await renderText(text, color, size);
  if (!white) return 0;
  const left = Math.round((THUMB - white.w) / 2);
  const shadow = await renderText(text, "#000000", size);
  if (shadow) {
    const sBuf = await sharp(shadow.buf).blur(2).toBuffer();
    layers.push({ input: sBuf, left: left + 3, top: top + 3 });
  }
  layers.push({ input: white.buf, left, top });
  return white.h;
}

/**
 * 스톡 이미지 버퍼 + 썸네일 문구(+분류 라벨) → 1080×1080 정사각 썸네일(JPEG).
 * 메인 제목 위에 라벨(메인의 60% 크기)을 얹는다. 코트라 볼드체 흰 글자 + 그림자.
 */
export async function composeThumbnail(imageBuffer: Buffer, title: string, label = ""): Promise<Buffer> {
  const base = await sharp(imageBuffer, { failOn: "none" })
    .resize(THUMB, THUMB, { fit: "cover", position: "attention" })
    .composite([{ input: Buffer.from(GRADIENT_SVG), top: 0, left: 0 }])
    .toBuffer();

  const safeTitle = (title || "").trim();
  const safeLabel = (label || "").trim();
  if (!safeTitle) return sharp(base).jpeg({ quality: 90 }).toBuffer();

  // 제목 높이 예산(라벨 있으면 줄임). 텍스트가 상단 절반 정도만 쓰게.
  const titleBudgetH = Math.round(THUMB * (safeLabel ? 0.42 : 0.48));

  // 줄 수별로 균형 줄바꿈 → 폭(FILL_W)과 높이 예산에 맞춰 최대 폰트 크기 계산 → 가장 큰 것 선택
  const wordCount = safeTitle.split(/\s+/).filter(Boolean).length;
  const maxLines = Math.min(4, Math.max(1, wordCount));
  let best: { size: number; text: string } | null = null;
  for (let k = 1; k <= maxLines; k++) {
    const wrapped = balancedWrap(safeTitle, k);
    const probe = await renderText(wrapped, "#ffffff", 100);
    if (!probe || !probe.w || !probe.h) continue;
    const byW = (FILL_W / probe.w) * 100;
    const byH = (titleBudgetH / probe.h) * 100;
    const size = Math.max(MIN_SIZE, Math.min(Math.floor(Math.min(byW, byH)), MAX_SIZE));
    if (!best || size > best.size) best = { size, text: wrapped };
  }
  if (!best) best = { size: pickFontSize(safeTitle), text: wrapKo(safeTitle, 9) };
  const size = best.size;
  const wrappedTitle = best.text;

  // 라벨 크기(제목의 60%) — 폭 넘치면 축소
  let labelSize = Math.round(size * 0.6);
  let labelH = 0;
  if (safeLabel) {
    let limg = await renderText(safeLabel, "#ffffff", labelSize);
    if (limg && limg.w > FILL_W) {
      labelSize = Math.max(MIN_SIZE, Math.floor((labelSize * FILL_W) / limg.w));
      limg = await renderText(safeLabel, "#ffffff", labelSize);
    }
    labelH = limg ? limg.h : 0;
  }

  const titleImg = await renderText(wrappedTitle, "#ffffff", size);
  if (!titleImg) return sharp(base).jpeg({ quality: 90 }).toBuffer();

  const gap = Math.round(size * 0.18);
  const blockH = (safeLabel ? labelH + gap : 0) + titleImg.h;
  // 텍스트 블록을 살짝 위쪽에 배치(핵심 이미지가 아래로 보이게)
  let cursor = Math.max(40, Math.round(THUMB * TEXT_CENTER_Y - blockH / 2));

  const layers: sharp.OverlayOptions[] = [];
  if (safeLabel) {
    const h = await pushTextLine(layers, safeLabel, "#ffffff", labelSize, cursor);
    cursor += h + gap;
  }
  await pushTextLine(layers, wrappedTitle, "#ffffff", size, cursor);

  return sharp(base).composite(layers).jpeg({ quality: 90 }).toBuffer();
}

export const thumbnailFontAvailable = () => resolveFontPath() !== null;
