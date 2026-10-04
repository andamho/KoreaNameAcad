// 공개(또는 일부공개) 쇼츠의 실제 썸네일이 "첫 장면"인지 판정한다.
//   기대값  = i.ytimg.com/vi/<id>/frame0.jpg    (유튜브가 만든 영상 첫 프레임, 세로)
//   실제값  = i.ytimg.com/vi/<id>/hqdefault.jpg  (현재 표시 썸네일, 480x360 — 가운데 세로 띠에 영상이 들어감)
//   음성대조 = hq1/hq2/hq3.jpg                   (유튜브 자동 후보 프레임 = 본편 장면)
//
// 비교 방식(2026-10-03, 공개 쇼츠 183개로 보정 — tools/yt-frame-worker/README.md):
//   - 가운데 띠 폭은 frame0 의 실제 비율로 계산한다(9:16 이 아닌 영상도 있음).
//   - 위치·크기가 몇 픽셀 어긋나도 같은 장면으로 보도록 작은 범위를 탐색해 최소 차이를 쓴다.
//   - 색까지 비교한다(RGB 평균 절대차, 0~255). 밝기 평균을 빼지 않는다 — 단색 배경만 다른 장면을 같다고 보지 않게.
// 판정은 세 가지: match / mismatch / uncertain. 애매하면 uncertain(=확인 필요) 이고 성공으로 치지 않는다.
// 비공개 영상은 이 주소들이 404 라 판정할 수 없다(→ not_public).
import { spawn } from "node:child_process";

const FF = () => process.env.FFMPEG || "ffmpeg";
const GW = 20, GH = 36;            // 비교 격자
const INNER = 0.1;                 // 가장자리 10% 는 버린다(테두리·흐림 경계 영향 제거)

/** JPEG → {w,h,data(RGB)} (지정 크기로 축소, 면적 평균) */
function decode(jpeg, w, h) {
  return new Promise((resolve, reject) => {
    const p = spawn(FF(), ["-v", "error", "-i", "pipe:0", "-vf", `scale=${w}:${h}:flags=area,format=rgb24`, "-f", "rawvideo", "pipe:1"]);
    const out = []; let err = "";
    p.stdout.on("data", (d) => out.push(d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) => {
      const b = Buffer.concat(out);
      if (code !== 0 || b.length !== w * h * 3) return reject(new Error(`ffmpeg 실패(${code}): ${err.slice(0, 200)}`));
      resolve({ w, h, data: b });
    });
    p.stdin.on("error", () => {});
    p.stdin.end(jpeg);
  });
}

/** JPEG 크기(SOF 마커) */
export function jpegSize(buf) {
  for (let i = 2; i + 9 < buf.length;) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

/** 영역(x,y,w,h — 이미지 좌표)의 안쪽을 격자로 이중선형 표본 추출 */
function grid(img, x, y, w, h) {
  const out = new Float32Array(GW * GH * 3);
  let k = 0;
  for (let j = 0; j < GH; j++) {
    for (let i = 0; i < GW; i++) {
      const fx = x + w * (INNER + (1 - 2 * INNER) * (i + 0.5) / GW) - 0.5;
      const fy = y + h * (INNER + (1 - 2 * INNER) * (j + 0.5) / GH) - 0.5;
      const x0 = Math.max(0, Math.min(img.w - 1, Math.floor(fx))), y0 = Math.max(0, Math.min(img.h - 1, Math.floor(fy)));
      const x1 = Math.min(img.w - 1, x0 + 1), y1 = Math.min(img.h - 1, y0 + 1);
      const ax = Math.max(0, Math.min(1, fx - x0)), ay = Math.max(0, Math.min(1, fy - y0));
      for (let c = 0; c < 3; c++) {
        const p = (xx, yy) => img.data[(yy * img.w + xx) * 3 + c];
        out[k++] = (p(x0, y0) * (1 - ax) + p(x1, y0) * ax) * (1 - ay) + (p(x0, y1) * (1 - ax) + p(x1, y1) * ax) * ay;
      }
    }
  }
  return out;
}
const mad = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]); return s / a.length; };

const HQ_W = 240, HQ_H = 180; // 480x360 을 절반으로(작은 어긋남·압축 잡음 완화)

/** 가로 썸네일(hq*) 안 세로 영상 띠를 frame0 격자와 맞춰 가며 최소 차이 */
function bestAligned(hq, f0grid, aspect) {
  const baseW = HQ_H * aspect, cx = HQ_W / 2, cy = HQ_H / 2;
  let best = Infinity;
  for (let s = 0.94; s <= 1.0601; s += 0.03) {
    for (let dx = -3; dx <= 3; dx += 1.5) {
      for (let dy = -3; dy <= 3; dy += 1.5) {
        const w = baseW * s, h = HQ_H * s;
        best = Math.min(best, mad(grid(hq, cx - w / 2 + dx, cy - h / 2 + dy, w, h), f0grid));
      }
    }
  }
  return best;
}

/** 지표 계산(네트워크 없음). cur/frame0/autos = JPEG Buffer */
export async function measure({ cur, frame0, autos = [] }) {
  const sz = jpegSize(frame0);
  if (!sz || !(sz.h > sz.w)) throw new Error(`frame0 이 세로 영상이 아님(${sz ? `${sz.w}x${sz.h}` : "크기 불명"})`);
  const aspect = sz.w / sz.h;
  const f0 = await decode(frame0, Math.round(240 * aspect), 240);
  const f0grid = grid(f0, 0, 0, f0.w, f0.h);
  const hqCur = await decode(cur, HQ_W, HQ_H);
  const hqAutos = [];
  for (const a of autos) hqAutos.push(await decode(a, HQ_W, HQ_H));
  // 같은 기하(가운데 띠)끼리는 정렬 탐색 없이 바로 비교
  const colW = HQ_H * aspect, colX = (HQ_W - colW) / 2;
  const gCur = grid(hqCur, colX, 0, colW, HQ_H);
  const dFrame0 = bestAligned(hqCur, f0grid, aspect);
  const curAuto = hqAutos.map((a) => mad(gCur, grid(a, colX, 0, colW, HQ_H)));
  const f0Auto = hqAutos.map((a) => bestAligned(a, f0grid, aspect));
  const r = (v) => +v.toFixed(1);
  return {
    dFrame0: r(dFrame0),
    nearestAuto: curAuto.length ? r(Math.min(...curAuto)) : null,
    f0Auto: f0Auto.length ? r(Math.min(...f0Auto)) : null,
  };
}

// 판정 기준(보정 결과 — README 의 표 참조). 바꾸면 tests/youtube/ytFrameWorker.test.ts 의 실측 사례도 같이 확인.
export const T = {
  MATCH_MAX: 12,      // 첫 프레임과 이 이하로 가까워야 일치 후보
  MARGIN: 2.0,        // 자동 후보와의 차이가 첫 프레임 차이의 이 배수 이상이어야 일치
  SEP_MIN: 12,        // 첫 프레임과 자동 후보가 이만큼은 달라야 구분 가능(정지 화면 영상 등은 판정 불가)
  AUTO_SAME: 4,       // 현재 썸네일이 자동 후보와 이 이하로 같으면 "자동 프레임 그대로"
  MISMATCH_MIN: 40,   // 첫 프레임과 이 이상 다르면 첫 장면 아님
};

/** 판정(순수 함수) */
export function decideThumb({ dFrame0, nearestAuto, f0Auto }) {
  const na = nearestAuto ?? Infinity, sep = f0Auto ?? Infinity;
  // 첫 장면과 크게 다르면 구분 가능 여부와 관계없이 첫 장면이 아니다
  if (dFrame0 >= T.MISMATCH_MIN) return { kind: "mismatch", why: "첫 장면과 다름" };
  // 첫 장면이 본편 자동 프레임과 비슷하면 "일치"를 증명할 수 없다
  if (sep < T.SEP_MIN) return { kind: "uncertain", why: "첫 장면과 본편 자동 프레임이 너무 비슷해 구분 불가" };
  // 자동 후보와 같은 썸네일(na ≤ AUTO_SAME)은 어떤 경우에도 일치로 보지 않는다
  if (dFrame0 <= T.MATCH_MAX && na > T.AUTO_SAME && na >= dFrame0 * T.MARGIN) return { kind: "match", why: "첫 장면과 일치" };
  if (na <= T.AUTO_SAME && dFrame0 >= na * T.MARGIN) return { kind: "mismatch", why: "자동 프레임 그대로" };
  return { kind: "uncertain", why: "판단 애매" };
}

async function get(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) return { status: r.status, buf: null };
  return { status: r.status, buf: Buffer.from(await r.arrayBuffer()) };
}

/**
 * 공개 썸네일을 받아 판정. 반환 kind:
 *  match | mismatch | uncertain  — 판정(uncertain = 확인 필요)
 *  not_public                    — 404(비공개 등) → 판정 불가
 *  error                         — 일시 오류
 */
export async function checkPublicThumb(videoId) {
  const base = `https://i.ytimg.com/vi/${videoId}`;
  const bust = `?t=${Date.now()}`; // 캐시 회피용 의미 없는 값(서명·토큰 아님)
  try {
    const [cur, f0, ...autos] = await Promise.all(
      ["hqdefault", "frame0", "hq1", "hq2", "hq3"].map((n) => get(`${base}/${n}.jpg${bust}`)),
    );
    if (cur.status === 404 || f0.status === 404) return { kind: "not_public" };
    if (!cur.buf || !f0.buf) return { kind: "error", detail: `HTTP ${cur.status}/${f0.status}` };
    const m = await measure({ cur: cur.buf, frame0: f0.buf, autos: autos.map((a) => a.buf).filter(Boolean) });
    const d = decideThumb(m);
    return { ...m, kind: d.kind, why: d.why };
  } catch (e) {
    return { kind: "error", detail: String(e?.message ?? e).slice(0, 200) };
  }
}

// 단독 실행: node thumbCompare.mjs <videoId> [...]  (읽기 전용)
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  for (const id of process.argv.slice(2)) console.log(id, JSON.stringify(await checkPublicThumb(id)));
}
