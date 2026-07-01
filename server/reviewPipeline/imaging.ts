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
    const padW = b.w * expand;
    const padH = b.h * expand;
    let left = Math.round(Math.max(0, b.x - padW / 2) * W);
    let top = Math.round(Math.max(0, b.y - padH / 2) * H);
    let width = Math.round(Math.min(1, b.w + padW) * W);
    let height = Math.round(Math.min(1, b.h + padH) * H);
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
const TEXT_W = 940;       // 좌우 여백

// 문구 길이에 따른 메인 제목 폰트 크기(px, dpi 72 기준). 정사각형 기준.
function pickFontSize(title: string): number {
  const n = title.length;
  if (n <= 8) return 110;
  if (n <= 16) return 92;
  if (n <= 26) return 74;
  return 60;
}

type Rendered = { buf: Buffer; w: number; h: number };

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

  // 크기 결정 (제목+라벨 블록이 세로로 넘치면 한 단계 축소)
  let size = pickFontSize(safeTitle);
  let titleImg: Rendered | null = null;
  let labelH = 0;
  const gap = () => Math.round(size * 0.22);
  for (;;) {
    titleImg = await renderText(safeTitle, "#ffffff", size);
    const labelSize = Math.round(size * 0.6);
    const labelImg = safeLabel ? await renderText(safeLabel, "#ffffff", labelSize) : null;
    labelH = labelImg ? labelImg.h : 0;
    const blockH = (safeLabel ? labelH + gap() : 0) + (titleImg?.h || 0);
    if (!titleImg || blockH <= Math.round(THUMB * 0.5) || size <= 44) break;
    size -= 10;
  }
  if (!titleImg) return sharp(base).jpeg({ quality: 90 }).toBuffer();

  const labelSize = Math.round(size * 0.6);
  const blockH = (safeLabel ? labelH + gap() : 0) + titleImg.h;
  // 텍스트 블록을 살짝 위쪽에 배치(핵심 이미지가 아래로 보이게)
  let cursor = Math.max(44, Math.round(THUMB * TEXT_CENTER_Y - blockH / 2));

  const layers: sharp.OverlayOptions[] = [];
  if (safeLabel) {
    const h = await pushTextLine(layers, safeLabel, "#ffffff", labelSize, cursor);
    cursor += h + gap();
  }
  await pushTextLine(layers, safeTitle, "#ffffff", size, cursor);

  return sharp(base).composite(layers).jpeg({ quality: 90 }).toBuffer();
}

export const thumbnailFontAvailable = () => resolveFontPath() !== null;
