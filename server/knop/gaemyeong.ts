// 개명 자동관리 2세트(개명의뢰=미용감사 / 개명허가=정화하기)
// 각 세트: 안내 + 1/2/3주 점검 = 4건을 예약 발송. 발송 시각은 예약일 오전 9~10시 랜덤(KST).
// 안내 문자에는 짧은 링크(이미지/영상) + 저장방법 안내를 자동 첨부.
import crypto from "crypto";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db";
import { sendSMS } from "../sms";
import {
  shortLinks,
  noticeSteps,
  noticeAssets,
  noticeRuns,
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

export async function createShortLink(target: string, label: string, kind: string): Promise<{ slug: string; id: string }> {
  const d = requireDb();
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
export async function renderViewerHtml(setKey: SetKey): Promise<string> {
  const assets = await assetsForSet(setKey);
  const blocks = assets
    .map((a) =>
      a.kind === "video"
        ? `<figure><video src="${esc(a.target)}" controls playsinline preload="metadata"></video><figcaption>${esc(a.title)}</figcaption></figure>`
        : `<figure><img src="${esc(a.target)}" alt="${esc(a.title)}" loading="lazy"><figcaption>${esc(a.title)}</figcaption></figure>`,
    )
    .join("\n");
  const hasImage = assets.some((a) => a.kind === "image");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>한국이름학교</title>
<style>
*{box-sizing:border-box}body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;background:#f6f8f9;color:#222;-webkit-text-size-adjust:100%}
.wrap{max-width:640px;margin:0 auto;padding:16px}
header{text-align:center;padding:18px 0 12px}header .b{display:inline-block;font-weight:700;color:#3fc4ca;letter-spacing:.02em}
figure{margin:0 0 16px;background:#fff;border-radius:14px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,.06)}
figure img,figure video{display:block;width:100%;height:auto;background:#000}
figcaption{padding:8px 12px;font-size:13px;color:#666}
.tip{margin:8px 2px 20px;font-size:12.5px;color:#8a8f93;line-height:1.6;text-align:center}
.empty{padding:60px 0;text-align:center;color:#aaa}
</style></head><body><div class="wrap">
<header><span class="b">한국이름학교</span></header>
${blocks || '<div class="empty">준비 중입니다.</div>'}
${hasImage ? '<div class="tip">📌 이미지를 저장하려면 사진을 길게 누른 뒤 “이미지 저장”을 선택하세요.</div>' : ""}
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

// 내부: 4건 예약 생성(발송시각 9~10시 랜덤). 실제 발송은 KNOP_SMS_LIVE 게이트.
async function scheduleMessages(cust: Customer, setKey: SetKey): Promise<string[]> {
  const steps = await getSteps(setKey);
  const assets = NOTICE_SETS[setKey].hasAssets ? await assetsForSet(setKey) : [];
  const dates: string[] = [];
  for (const s of steps) {
    const when = randomMorningKST(s.offsetDays);
    const content = await renderStep(setKey, s.body, s.step, cust.name, assets);
    await smsStore.createMessage({ customerId: cust.id, phone: cust.phone, content, scheduledAt: when.toISOString() });
    dates.push(when.toISOString());
  }
  return dates;
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
  const dates = await scheduleMessages(cust, setKey);
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
