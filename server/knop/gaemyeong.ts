// 개명 자동관리 2세트(개명의뢰=미용감사 / 개명허가=정화하기)
// 각 세트: 안내 + 1/2/3주 점검 = 4건을 예약 발송. 발송 시각은 예약일 오전 9~10시 랜덤(KST).
// 안내 문자에는 짧은 링크(이미지/영상) + 저장방법 안내를 자동 첨부.
import crypto from "crypto";
import { and, asc, eq, sql, inArray, isNotNull } from "drizzle-orm";
import { db } from "../db";
import { sendSMS } from "../sms";
import {
  shortLinks,
  noticeSteps,
  noticeAssets,
  noticeRuns,
  scheduledMessages,
  customers,
  type Customer,
} from "@shared/schema";
import { ObjectStorageService } from "../object_storage/objectStorage";
import { smsStore } from "./sms";
import { knopStore } from "./store";
import { appendEvent } from "./calendar";

const objectStore = new ObjectStorageService();
const BASE_URL = (process.env.PUBLIC_BASE_URL?.trim() || "https://korea-name-acad.com").replace(/\/+$/, "");

export const NOTICE_SETS = {
  gaemyeong_request: { label: "개명의뢰 (미용감사)", hasAssets: true },
  gaemyeong_approved: { label: "개명허가 (정화하기)", hasAssets: false },
} as const;
export type SetKey = keyof typeof NOTICE_SETS;
export function isSetKey(k: string): k is SetKey {
  return k === "gaemyeong_request" || k === "gaemyeong_approved";
}

function requireDb() {
  if (!db) throw new Error("DB 사용 불가");
  return db;
}

// ── 입금 금액 분류 ──
// 개명비: 110만/130만의 배수·조합(a·110만+b·130만). 상담비: 6만원 배수(보통 <100만).
const GM_UNIT_A = 1_100_000;
const GM_UNIT_B = 1_300_000;
const CONSULT_UNIT = 60_000;

export function isGaemyeongAmount(amount: number): boolean {
  if (!Number.isFinite(amount) || amount < GM_UNIT_A) return false;
  for (let a = 0; a <= 20; a++) {
    if (a * GM_UNIT_A > amount) break;
    for (let b = 0; b <= 20; b++) {
      const total = a * GM_UNIT_A + b * GM_UNIT_B;
      if (total === amount && a + b >= 1) return true;
      if (total > amount) break;
    }
  }
  return false;
}

// "gaemyeong"(개명비 확실·자동) | "consult"(상담비) | "ambiguous"(애매→원장님 확인)
export function classifyDeposit(amount: number): "gaemyeong" | "consult" | "ambiguous" {
  if (isGaemyeongAmount(amount)) return "gaemyeong";
  if (amount > 0 && amount < 1_000_000 && amount % CONSULT_UNIT === 0) return "consult";
  return "ambiguous";
}

// 헷갈리는 글자(0/O/1/l/I) 제외한 7자리 슬러그
function genSlug(): string {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const b = crypto.randomBytes(7);
  let s = "";
  for (let i = 0; i < 7; i++) s += A[b[i] % A.length];
  return s;
}

// 사람이 읽는 슬러그: "홍길동가족 이름분석표" → "홍길동가족이름분석표" (한글·영문·숫자·-_ 만, 공백 제거)
export function slugifyReport(label: string): string {
  return (label || "").replace(/\s+/g, "").replace(/[^0-9A-Za-z가-힣_-]/g, "").slice(0, 60);
}
export function rootUrl(slug: string): string {
  return `${BASE_URL}/${slug}`;
}

export async function createShortLink(
  target: string,
  label: string,
  kind: string,
  desiredSlug?: string,
): Promise<{ slug: string; id: string }> {
  const d = requireDb();
  // 원하는 슬러그(이름 기반)가 있으면 그것부터 시도, 충돌 시 -2, -3 …
  if (desiredSlug) {
    const tries = [desiredSlug, ...Array.from({ length: 30 }, (_, i) => `${desiredSlug}-${i + 2}`)];
    for (const slug of tries) {
      try {
        const [row] = await d.insert(shortLinks).values({ slug, target, label, kind }).returning();
        return { slug: row.slug, id: row.id };
      } catch {
        // 충돌 → 다음 후보
      }
    }
  }
  for (let i = 0; i < 6; i++) {
    const slug = genSlug();
    try {
      const [row] = await d.insert(shortLinks).values({ slug, target, label, kind }).returning();
      return { slug: row.slug, id: row.id };
    } catch {
      // slug 유니크 충돌 → 재시도
    }
  }
  throw new Error("짧은 링크 생성 실패(슬러그 충돌)");
}

export function shortUrl(slug: string): string {
  return `${BASE_URL}/s/${slug}`;
}

// 같은 대상(target)에 이미 짧은링크가 있으면 그걸 재사용, 없으면 새로 만든다.
// 이름분석표 이미지를 문자로 보낼 때 사용(누를 때마다 새 링크가 쌓이지 않도록).
export async function ensureShortLink(target: string, label: string, kind: string, desiredSlug?: string): Promise<string> {
  const d = requireDb();
  const [ex] = await d.select().from(shortLinks).where(eq(shortLinks.target, target)).limit(1);
  if (ex) return ex.slug; // 같은 대상이면 기존 슬러그 재사용
  const link = await createShortLink(target, label, kind, desiredSlug);
  return link.slug;
}

// {이름} 등 치환 (이름은 "가족" 접미 제거)
function applyVars(text: string, name: string): string {
  const base = (name || "").replace(/\s*가족\s*$/, "").trim() || name;
  return (text || "").replace(/\{이름\}/g, base).replace(/\{name\}/g, base);
}

type AssetView = { id: string; kind: string; title: string; slug: string; url: string; target: string; sortOrder: number };

export async function assetsForSet(setKey: SetKey): Promise<AssetView[]> {
  const d = requireDb();
  const rows = await d
    .select({
      id: noticeAssets.id,
      kind: noticeAssets.kind,
      title: noticeAssets.title,
      sortOrder: noticeAssets.sortOrder,
      slug: shortLinks.slug,
      target: shortLinks.target,
    })
    .from(noticeAssets)
    .innerJoin(shortLinks, eq(noticeAssets.shortLinkId, shortLinks.id))
    .where(eq(noticeAssets.setKey, setKey))
    .orderBy(asc(noticeAssets.sortOrder), asc(noticeAssets.createdAt));
  return rows.map((r) => ({ ...r, url: shortUrl(r.slug) }));
}

// 세트의 뷰어 페이지(이미지·영상 한 화면) 짧은 링크. 없으면 생성해 재사용(세트당 1개 고정).
export async function getSetPageUrl(setKey: SetKey): Promise<string> {
  const d = requireDb();
  const target = `/view/${setKey}`;
  const [ex] = await d.select().from(shortLinks).where(eq(shortLinks.target, target));
  if (ex) return shortUrl(ex.slug);
  const link = await createShortLink(target, `${setKey}:뷰어페이지`, "page");
  return shortUrl(link.slug);
}

// 안내(step 0)에만 첨부를 붙임. 문구 뒤 맨 마지막에 모아보기 링크 1개(저장방법은 페이지 안에 있음).
async function renderStep(setKey: SetKey, stepBody: string, step: number, name: string, assets: AssetView[]): Promise<string> {
  let out = applyVars(stepBody, name).trim();
  if (step === 0 && assets.length) {
    const pageUrl = await getSetPageUrl(setKey);
    out += `\n\n${pageUrl}`;
  }
  return out.trim();
}

const esc = (s: string) =>
  (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// 뷰어 페이지 HTML (이미지 여러 장 + 영상 한 화면, 모바일 최적화, 자체완결)
// 유튜브 URL(watch?v=, youtu.be/, /embed/, /shorts/)에서 영상 ID 추출. 아니면 null.
function youtubeId(url: string): string | null {
  const m = (url || "").match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

export async function renderViewerHtml(setKey: SetKey): Promise<string> {
  const assets = await assetsForSet(setKey);
  // 제목(figcaption)은 보여주지 않는다. 올릴 때 붙은 파일 이름이 그대로 남아
  // 화면에 "2024_02_06 23_24", "002" 같은 게 찍혔다. 제목은 관리 화면에서만 쓴다.
  // 출처 안내는 영상마다가 아니라 맨 아래에 한 번만 붙인다.
  // 저장 안내는 마지막 이미지 '아래'에 한 번만. 예전엔 이미지마다 붙어 같은 문장이 반복됐다.
  // 아이콘은 이모지(📌) 대신 선 아이콘 — 기기마다 모양이 달라지지 않고 글자색과 어울린다.
  const SAVE_ICON =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>';
  const SAVE_TIP = "이미지를 저장하시려면, 사진을 꾹 눌러 “이미지 저장”을 선택하세요.";
  const lastImageIdx = assets.map((a) => a.kind).lastIndexOf("image");
  const blocks = assets
    .map((a, i) => {
      const tip =
        i === lastImageIdx ? `<div class="savetip">${SAVE_ICON}<span>${esc(SAVE_TIP)}</span></div>` : "";
      // 눌러서 유튜브로 넘어가는 방식. 영상 주인이 '다른 사이트에서 재생 금지'를 걸어두면
      // 페이지 안에서는 검은 오류창만 뜬다. 그때는 대표 그림만 보여주고 눌러서 보게 한다.
      if (a.kind === "videolink") {
        const yt = youtubeId(a.target);
        const thumb = yt ? `https://img.youtube.com/vi/${yt}/hqdefault.jpg` : "";
        return `<figure><a class="vlink" href="${esc(a.target)}" target="_blank" rel="noreferrer">${
          thumb ? `<img src="${thumb}" alt="" loading="lazy">` : `<div class="vlink-empty"></div>`
        }<span class="play"></span></a></figure>`;
      }
      if (a.kind === "video") {
        const yt = youtubeId(a.target);
        const player = yt
          ? `<div class="ytwrap"><iframe src="https://www.youtube.com/embed/${yt}" title="${esc(a.title)}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></div>`
          : `<video src="${esc(a.target)}" controls playsinline preload="metadata"></video>`;
        return `<figure>${player}</figure>`;
      }
      return `<figure><img src="${esc(a.target)}" alt="" loading="lazy"></figure>${tip}`;
    })
    .join("\n");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>한국이름학교</title>
<style>
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;background:#f6f8f9;color:#222;-webkit-text-size-adjust:100%}
.wrap{max-width:640px;margin:0 auto;padding:16px}
/* 머리말은 홈페이지 내비바 좌측과 같게 — 로고 + 한국이름학교 + 와츠유어네임 이름연구협회.
   글꼴도 같은 고려대학교체를 쓴다(파일은 /fonts 에 이미 있다). */
@font-face{font-family:'KoreaUnivB';src:url('/fonts/KoreaUnivB.woff2') format('woff2'),url('/fonts/KoreaUnivB.ttf') format('truetype');font-weight:700;font-style:normal;font-display:swap}
@font-face{font-family:'KoreaUnivL';src:url('/fonts/KoreaUnivL.woff2') format('woff2'),url('/fonts/KoreaUnivL.ttf') format('truetype');font-weight:300;font-style:normal;font-display:swap}
header{display:flex;align-items:center;justify-content:center;gap:4px;padding:14px 0 16px}
header img{height:84px;width:auto;display:block}
header .brand{text-align:left;color:#000}
header .b1{font-family:'KoreaUnivB',sans-serif;font-size:19.9px;line-height:1.1;letter-spacing:-0.025em}
header .b2{font-family:'KoreaUnivL',sans-serif;font-size:10.9px;line-height:1.1;letter-spacing:-0.025em;margin-top:2px}
figure{margin:0 0 16px;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,.06)}
figure img,figure video{display:block;width:100%;height:auto;background:#000;border-radius:14px}
.ytwrap{position:relative;width:100%;aspect-ratio:16/9;background:#000;border-radius:14px;overflow:hidden}
.ytwrap iframe{position:absolute;inset:0;width:100%;height:100%;border:0;border-radius:14px}
figcaption{padding:8px 12px;font-size:13px;color:#666}
.credit{margin:2px 2px 22px;font-size:12.5px;color:#8a8f93;line-height:1.7;text-align:center}
.vlink{display:block;position:relative;border-radius:14px;overflow:hidden}
/* 유튜브 대표 그림(hqdefault)은 4:3 이라 위아래에 검은 띠가 들어 있다.
   16:9 로 잘라내면 딱 영상 부분만 남는다. */
.vlink img{display:block;width:100%;aspect-ratio:16/9;object-fit:cover}
.vlink-empty{width:100%;aspect-ratio:16/9;background:#e9edee}
.play{position:absolute;left:0;right:0;top:0;bottom:0;margin:auto;width:62px;height:44px;border-radius:11px;background:rgba(0,0,0,.72)}
.play::after{content:"";position:absolute;left:50%;top:50%;transform:translate(-42%,-50%);border-style:solid;border-width:9px 0 9px 15px;border-color:transparent transparent transparent #fff}
.savetip{display:flex;align-items:center;justify-content:center;gap:6px;margin:2px 2px 16px;font-size:12.5px;color:#000;line-height:1.6;font-weight:500}
.savetip svg{width:15px;height:15px;flex-shrink:0}
.empty{padding:60px 0;text-align:center;color:#aaa}
</style></head><body><div class="wrap">
<header><img src="/new-logo.png" alt="" ><div class="brand"><div class="b1">한국이름학교</div><div class="b2">와츠유어네임 이름연구협회</div></div></header>
${blocks || '<div class="empty">준비 중입니다.</div>'}
${assets.some((a) => a.kind === "video" || a.kind === "videolink") ? '<div class="credit">이 영상들은 한국이름학교와 무관합니다.<br>‘미용감사’ 하시는데 도움되실 거 같아 소개해드립니다.</div>' : ""}
</div></body></html>`;
}

export type StepView = {
  id: string;
  setKey: string;
  step: number;
  name: string;
  body: string;
  offsetDays: number;
};

export async function getSteps(setKey: SetKey): Promise<StepView[]> {
  const d = requireDb();
  return d.select().from(noticeSteps).where(eq(noticeSteps.setKey, setKey)).orderBy(asc(noticeSteps.step));
}

export async function updateStep(id: string, patch: { name?: string; body?: string; offsetDays?: number }): Promise<StepView | undefined> {
  const d = requireDb();
  const set: any = { updatedAt: new Date() };
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.body !== undefined) set.body = patch.body;
  if (patch.offsetDays !== undefined && Number.isFinite(patch.offsetDays)) set.offsetDays = Math.max(0, Math.round(patch.offsetDays));
  const [row] = await d.update(noticeSteps).set(set).where(eq(noticeSteps.id, id)).returning();
  return row;
}

// 이미지 업로드(base64) → R2 → 짧은 링크 → 첨부 등록
export async function addImageAsset(setKey: SetKey, title: string, base64: string, contentType: string): Promise<AssetView> {
  const d = requireDb();
  const buf = Buffer.from(base64.replace(/^data:[^;]+;base64,/, ""), "base64");
  const ext = contentType.includes("png") ? "png" : contentType.includes("jpeg") || contentType.includes("jpg") ? "jpg" : "img";
  const key = `uploads/${crypto.randomUUID()}.${ext}`;
  await objectStore.putObject(key, buf, contentType || "image/png");
  const link = await createShortLink(`/objects/${key}`, `${setKey}:${title}`, "image");
  const [row] = await d
    .insert(noticeAssets)
    .values({ setKey, kind: "image", title, shortLinkId: link.id, sortOrder: Date.now() % 100000 })
    .returning();
  return { id: row.id, kind: "image", title, slug: link.slug, url: shortUrl(link.slug), target: `/objects/${key}`, sortOrder: row.sortOrder };
}

// 영상 링크(외부 URL) → 짧은 링크 → 첨부 등록
export async function addVideoAsset(setKey: SetKey, title: string, videoUrl: string): Promise<AssetView> {
  const d = requireDb();
  const url = videoUrl.trim();
  if (!/^https?:\/\//i.test(url)) throw new Error("영상 링크는 http(s):// 로 시작해야 합니다");
  const link = await createShortLink(url, `${setKey}:${title}`, "video");
  const [row] = await d
    .insert(noticeAssets)
    .values({ setKey, kind: "video", title, shortLinkId: link.id, sortOrder: Date.now() % 100000 })
    .returning();
  return { id: row.id, kind: "video", title, slug: link.slug, url: shortUrl(link.slug), target: url, sortOrder: row.sortOrder };
}

// 영상 보여주는 방식 전환: 페이지에서 재생(video) ↔ 눌러서 유튜브로(videolink).
// 영상 주인이 외부 재생을 막아둔 경우 페이지에선 검은 오류창만 뜨므로 후자로 바꾼다.
export async function toggleAssetPlayMode(id: string): Promise<string | null> {
  const d = requireDb();
  const [row] = await d.select().from(noticeAssets).where(eq(noticeAssets.id, id));
  if (!row || (row.kind !== "video" && row.kind !== "videolink")) return null;
  const next = row.kind === "video" ? "videolink" : "video";
  await d.update(noticeAssets).set({ kind: next }).where(eq(noticeAssets.id, id));
  return next;
}

// 첨부 순서를 한 칸 위/아래로 옮긴다.
// sortOrder 는 지금까지 Date.now() % 100000 으로 넣었다. 이 값은 100초마다 0 으로 되돌아가서
// 나중에 올린 게 앞에 오는 일이 생긴다. 옮길 때 0,1,2… 로 다시 매겨 그 문제도 같이 없앤다.
export async function moveAsset(id: string, dir: "up" | "down"): Promise<boolean> {
  const d = requireDb();
  const [row] = await d.select().from(noticeAssets).where(eq(noticeAssets.id, id));
  if (!row) return false;
  const list = await d
    .select()
    .from(noticeAssets)
    .where(eq(noticeAssets.setKey, row.setKey))
    .orderBy(asc(noticeAssets.sortOrder), asc(noticeAssets.createdAt));
  const i = list.findIndex((a) => a.id === id);
  const j = dir === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return false;
  [list[i], list[j]] = [list[j], list[i]];
  for (let k = 0; k < list.length; k++) {
    await d.update(noticeAssets).set({ sortOrder: k }).where(eq(noticeAssets.id, list[k].id));
  }
  return true;
}

// 이미 업로드된 R2 경로(/objects/...)를 첨부로 등록 (영상 원본 업로드용)
export async function addAssetFromPath(setKey: SetKey, title: string, objectPath: string, kind: "image" | "video"): Promise<AssetView> {
  const d = requireDb();
  if (!objectPath.startsWith("/objects/")) throw new Error("업로드 경로가 올바르지 않습니다");
  const link = await createShortLink(objectPath, `${setKey}:${title}`, kind);
  const [row] = await d
    .insert(noticeAssets)
    .values({ setKey, kind, title, shortLinkId: link.id, sortOrder: Date.now() % 100000 })
    .returning();
  return { id: row.id, kind, title, slug: link.slug, url: shortUrl(link.slug), target: objectPath, sortOrder: row.sortOrder };
}

export async function deleteAsset(id: string): Promise<boolean> {
  const d = requireDb();
  const res = await d.delete(noticeAssets).where(eq(noticeAssets.id, id)).returning();
  return res.length > 0;
}

// 오늘 KST 기준 N개월 뒤 날짜(YYYY-MM-DD)
export function monthsLaterKST(months: number): string {
  const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
  const y = kstNow.getUTCFullYear();
  const m = kstNow.getUTCMonth() + months;
  const d = kstNow.getUTCDate();
  const dt = new Date(Date.UTC(y, m, d));
  return dt.toISOString().slice(0, 10);
}

// 예약일(오늘 KST + days)의 오전 9~10시 랜덤 시각. 09:00 KST == 00:00 UTC.
function randomMorningKST(days: number): Date {
  const kstNow = new Date(Date.now() + 9 * 3600 * 1000); // UTC 필드를 KST처럼 읽기
  const y = kstNow.getUTCFullYear();
  const m = kstNow.getUTCMonth();
  const d = kstNow.getUTCDate() + days;
  const min = Math.floor(Math.random() * 60);
  const sec = Math.floor(Math.random() * 60);
  return new Date(Date.UTC(y, m, d, 0, min, sec)); // 09:min:sec KST
}

// 미리보기: 4단계 렌더 결과(발송 안 함)
export async function preview(setKey: SetKey, sampleName = "홍길동"): Promise<Array<{ step: number; name: string; offsetDays: number; content: string }>> {
  const steps = await getSteps(setKey);
  const assets = NOTICE_SETS[setKey].hasAssets ? await assetsForSet(setKey) : [];
  return Promise.all(
    steps.map(async (s) => ({
      step: s.step,
      name: s.name,
      offsetDays: s.offsetDays,
      content: await renderStep(setKey, s.body, s.step, sampleName, assets),
    })),
  );
}

// 내 번호로 직접 테스트 발송(전역 LIVE 게이트 우회, 자동 시퀀스는 계속 시뮬레이션 유지)
export async function testSend(setKey: SetKey, step: number, phone: string, sampleName = "홍길동"): Promise<{ content: string }> {
  const steps = await getSteps(setKey);
  const s = steps.find((x) => x.step === step);
  if (!s) throw new Error("단계를 찾을 수 없습니다");
  const assets = NOTICE_SETS[setKey].hasAssets ? await assetsForSet(setKey) : [];
  const content = await renderStep(setKey, s.body, s.step, sampleName, assets);
  await sendSMS(phone, content); // 직접 발송(테스트)
  return { content };
}

// 내부: 예약 생성(발송시각 9~10시 랜덤). 실제 발송은 KNOP_SMS_LIVE 게이트.
// keep: 특정 단계만 예약할 때(예: 정화하기=step≥1, 개명허가확인=step0만).
async function scheduleMessages(cust: Customer, setKey: SetKey, keep?: (step: number) => boolean): Promise<string[]> {
  const steps = (await getSteps(setKey)).filter((s) => !keep || keep(s.step));
  const assets = NOTICE_SETS[setKey].hasAssets ? await assetsForSet(setKey) : [];
  const dates: string[] = [];
  for (const s of steps) {
    const when = randomMorningKST(s.offsetDays);
    const content = await renderStep(setKey, s.body, s.step, cust.name, assets);
    await smsStore.createMessage({ customerId: cust.id, phone: cust.phone, content, scheduledAt: when.toISOString(), setKey });
    dates.push(when.toISOString());
  }
  return dates;
}

// gaemyeong_approved 세트의 step0 은 '개명허가 확인'(법원접수+2개월), step≥1 은 '정화하기'(개명승인 후).
// → startSequence(정화하기)는 step0 제외, 개명허가확인은 별도 scheduleApprovalCheck 로 예약.
function sequenceStepFilter(setKey: SetKey): ((step: number) => boolean) | undefined {
  return setKey === "gaemyeong_approved" ? (n) => n >= 1 : undefined;
}

// 법원접수 시 호출: '개명허가 확인'(step0) 1건을 2개월(offset) 뒤로 예약. 이미 예약돼 있으면 건너뜀.
export async function scheduleApprovalCheck(customerId: string): Promise<{ ok: boolean; reason?: string; date?: string }> {
  const cust = await knopStore.getCustomer(customerId);
  if (!cust?.phone) return { ok: false, reason: "전화번호 없음" };
  const steps = await getSteps("gaemyeong_approved");
  const s0 = steps.find((x) => x.step === 0);
  if (!s0) return { ok: false, reason: "개명허가 확인 문구 없음" };
  const content = await renderStep("gaemyeong_approved", s0.body, 0, cust.name, []);
  const when = randomMorningKST(s0.offsetDays);
  await smsStore.createMessage({ customerId: cust.id, phone: cust.phone, content, scheduledAt: when.toISOString(), setKey: "gaemyeong_approved" });
  return { ok: true, date: when.toISOString() };
}

async function findRun(customerId: string, setKey: SetKey) {
  const d = requireDb();
  const [row] = await d
    .select()
    .from(noticeRuns)
    .where(and(eq(noticeRuns.customerId, customerId), eq(noticeRuns.setKey, setKey)));
  return row;
}

// 개명비 자동감지 → "개명의뢰 확인 대기"로 등록(발송 안 함). 새이름 일정=입금+2개월 제안.
export async function flagPending(customerId: string, setKey: SetKey, reason: string): Promise<{ ok: boolean; reason?: string }> {
  const d = requireDb();
  const existing = await findRun(customerId, setKey);
  if (existing) return { ok: false, reason: existing.status === "pending" ? "이미 확인 대기중" : "이미 발송 시작됨" };
  const nameDate = setKey === "gaemyeong_request" ? monthsLaterKST(2) : null;
  await d.insert(noticeRuns).values({ customerId, setKey, status: "pending", reason, nameDate });
  return { ok: true };
}

// 확인 대기 목록(고객명/전화 포함)
export async function listPending(): Promise<Array<{ id: string; customerId: string; customerName: string; phone: string; setKey: string; setLabel: string; reason: string | null; nameDate: string | null; flaggedAt: any }>> {
  const d = requireDb();
  const rows = await d
    .select({
      id: noticeRuns.id,
      customerId: noticeRuns.customerId,
      setKey: noticeRuns.setKey,
      reason: noticeRuns.reason,
      nameDate: noticeRuns.nameDate,
      flaggedAt: noticeRuns.flaggedAt,
      customerName: customers.name,
      phone: customers.phone,
    })
    .from(noticeRuns)
    .innerJoin(customers, eq(noticeRuns.customerId, customers.id))
    .where(eq(noticeRuns.status, "pending"))
    .orderBy(asc(noticeRuns.flaggedAt));
  return rows.map((r) => ({ ...r, setLabel: isSetKey(r.setKey) ? NOTICE_SETS[r.setKey as SetKey].label : r.setKey }));
}

// 확인(최종점검) → 미용감사 예약 발송 시작 + 새이름 일정 달력 등록. nameDate 수정 가능.
export async function confirmPending(
  runId: string,
  opts: { nameDate?: string } = {},
): Promise<{ ok: boolean; scheduled: number; reason?: string; dates: string[]; calendar?: { date: string; title: string } }> {
  const d = requireDb();
  const [run] = await d.select().from(noticeRuns).where(eq(noticeRuns.id, runId));
  if (!run) return { ok: false, scheduled: 0, reason: "대기 항목 없음", dates: [] };
  if (run.status !== "pending") return { ok: false, scheduled: 0, reason: "이미 처리됨", dates: [] };
  if (!isSetKey(run.setKey)) return { ok: false, scheduled: 0, reason: "잘못된 세트", dates: [] };
  const cust = await knopStore.getCustomer(run.customerId);
  if (!cust?.phone) return { ok: false, scheduled: 0, reason: "고객 전화번호 없음", dates: [] };

  const dates = await scheduleMessages(cust, run.setKey);

  // 새이름 일정 달력 등록(개명의뢰 세트만). 실패해도 문자예약은 유지.
  let calendar: { date: string; title: string } | undefined;
  const nameDate = (opts.nameDate || run.nameDate || "").trim();
  if (run.setKey === "gaemyeong_request" && /^\d{4}-\d{2}-\d{2}$/.test(nameDate)) {
    const baseName = (cust.name || "").replace(/\s*가족\s*$/, "").trim() || cust.name;
    const title = `${baseName} 새이름`;
    try {
      await appendEvent({ date: nameDate, title, cat: "상담", clientPhone: cust.phone, memo: "개명비 입금 → 새이름 내어주기(자동)" });
      calendar = { date: nameDate, title };
    } catch (e: any) {
      console.error(`[KNOP] 새이름 달력 등록 실패: ${e?.message}`);
    }
  }

  await d.update(noticeRuns).set({ status: "active", startedAt: new Date(), nameDate: nameDate || run.nameDate }).where(eq(noticeRuns.id, runId));
  return { ok: true, scheduled: dates.length, dates, calendar };
}

// 확인 대기 취소(개명의뢰 아님)
export async function cancelPending(runId: string): Promise<boolean> {
  const d = requireDb();
  const res = await d
    .delete(noticeRuns)
    .where(and(eq(noticeRuns.id, runId), eq(noticeRuns.status, "pending")))
    .returning();
  return res.length > 0;
}

// 수동 즉시 시작(버튼) — 확인 절차 없이 바로 예약. 개명허가 세트/직접 시작용.
export async function startSequence(customerId: string, setKey: SetKey): Promise<{ ok: boolean; scheduled: number; reason?: string; dates: string[] }> {
  const d = requireDb();
  const cust = await knopStore.getCustomer(customerId);
  if (!cust) return { ok: false, scheduled: 0, reason: "고객 없음", dates: [] };
  if (!cust.phone) return { ok: false, scheduled: 0, reason: "고객 전화번호 없음", dates: [] };
  const existing = await findRun(customerId, setKey);
  if (existing?.status === "active") return { ok: false, scheduled: 0, reason: "이미 발송 시작됨", dates: [] };
  const dates = await scheduleMessages(cust, setKey, sequenceStepFilter(setKey)); // 정화하기는 step0(개명허가확인) 제외
  if (existing) {
    await d.update(noticeRuns).set({ status: "active", startedAt: new Date() }).where(eq(noticeRuns.id, existing.id));
  } else {
    await d.insert(noticeRuns).values({ customerId, setKey, status: "active", startedAt: new Date() });
  }
  return { ok: true, scheduled: dates.length, dates };
}

// 고객별 시퀀스 상태 (setKey → "pending" | "active")
export async function sequenceStatus(customerId: string): Promise<Record<string, string>> {
  const d = requireDb();
  const runs = await d.select().from(noticeRuns).where(eq(noticeRuns.customerId, customerId));
  const out: Record<string, string> = {};
  for (const r of runs) out[r.setKey] = r.status;
  return out;
}

// 진행중 현황: 아직 보낼 예약이 남은 세트들을 (고객·세트)별로 집계.
// 발송완료(sent)만 남고 예약(scheduled)이 0이면 목록에서 빠짐(= 관리 종료).
export type ActiveSequence = {
  customerId: string;
  customerName: string;
  setKey: string;
  setLabel: string;
  total: number;      // 세트 전체 문자 수
  sent: number;       // 이미 발송된 수
  nextAt: string | null; // 다음 발송 예정(ISO)
};
export async function listActiveSequences(): Promise<ActiveSequence[]> {
  const d = requireDb();
  const rows = await d
    .select({
      customerId: scheduledMessages.customerId,
      customerName: customers.name,
      setKey: scheduledMessages.setKey,
      total: sql<number>`count(*)::int`,
      sent: sql<number>`count(*) FILTER (WHERE ${scheduledMessages.status} = 'sent')::int`,
      // 저장값(naive)은 UTC 벽시계 → 타임존 변환 없이 그대로 ISO-Z 문자열로. 서버 TZ와 무관하게 정확.
      nextAt: sql<string | null>`to_char(min(${scheduledMessages.scheduledAt}) FILTER (WHERE ${scheduledMessages.status} = 'scheduled'), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
    })
    .from(scheduledMessages)
    .innerJoin(customers, eq(scheduledMessages.customerId, customers.id))
    // 진행중 현황은 '관리 시퀀스'만 보여준다 — 미용감사·정화하기.
    // 새이름 안내(newname:날짜)는 단발 예약이라 여기 섞이면 오해를 준다(원장님 요청).
    .where(inArray(scheduledMessages.setKey, ["gaemyeong_request", "gaemyeong_approved"]))
    .groupBy(scheduledMessages.customerId, customers.name, scheduledMessages.setKey)
    .having(sql`count(*) FILTER (WHERE ${scheduledMessages.status} = 'scheduled') > 0`)
    // 남은 횟수가 많은 사람이 위로(관리가 더 남은 순), 같으면 이름 ㄱㄴㄷ 순.
    .orderBy(
      sql`(count(*) - count(*) FILTER (WHERE ${scheduledMessages.status} = 'sent')) DESC`,
      sql`${customers.name} ASC`,
    );
  return rows.map((r) => ({
    customerId: r.customerId!,
    customerName: r.customerName,
    setKey: r.setKey!,
    setLabel: isSetKey(r.setKey!)
      ? NOTICE_SETS[r.setKey as SetKey].label
      : r.setKey!.startsWith("newname:")
        ? "새 이름 상담 안내" // 달력 작명완료 기준 단발 예약 (세트 아님)
        : r.setKey!,
    total: r.total,
    sent: r.sent,
    nextAt: r.nextAt ?? null, // 이미 UTC ISO-Z 문자열
  }));
}

// 진행중 세트 취소: 아직 안 보낸 예약을 모두 취소하고 run 을 취소 표시(재시작 가능).
export async function cancelSequence(customerId: string, setKey: SetKey): Promise<{ ok: boolean; canceled: number }> {
  const d = requireDb();
  const res = await d
    .update(scheduledMessages)
    .set({ status: "canceled" })
    .where(
      and(
        eq(scheduledMessages.customerId, customerId),
        eq(scheduledMessages.setKey, setKey),
        eq(scheduledMessages.status, "scheduled"),
      ),
    )
    .returning();
  await d
    .update(noticeRuns)
    .set({ status: "canceled" })
    .where(and(eq(noticeRuns.customerId, customerId), eq(noticeRuns.setKey, setKey)));
  return { ok: true, canceled: res.length };
}
