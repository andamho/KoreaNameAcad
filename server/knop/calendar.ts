// 바른이름 달력(Firebase Firestore) 읽기 + 문자 규칙 (functions/index.js 이식 + 새이름 규칙)
// 키: zeus-calendar-key.json (env KNOP_FIREBASE_KEY 로 경로 지정 가능)
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";

let _db: FirebaseFirestore.Firestore | null = null;

// 키 로드: env KNOP_FIREBASE_KEY (JSON 문자열 또는 파일경로) 우선, 없으면 로컬 파일. 배포(Railway)는 env로.
function loadKey(): any | null {
  try {
    const env = (process.env.KOP_FIREBASE_KEY || process.env.KNOP_FIREBASE_KEY)?.trim();
    if (env) {
      if (env.startsWith("{")) return JSON.parse(env); // JSON 문자열
      if (fs.existsSync(env)) return JSON.parse(fs.readFileSync(env, "utf-8")); // 파일경로
    }
    const p = path.join(process.cwd(), "zeus-calendar-key.json");
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    /* noop */
  }
  return null;
}

export function calendarAvailable(): boolean {
  return !!loadKey();
}

function db(): FirebaseFirestore.Firestore {
  if (_db) return _db;
  const key = loadKey();
  if (!key) throw new Error("Firebase 키 없음 (KNOP_FIREBASE_KEY env 또는 zeus-calendar-key.json)");
  if (!getApps().length) initializeApp({ credential: cert(key), projectId: key.project_id });
  _db = getFirestore();
  return _db;
}

export type CalEvent = {
  id?: string;
  date?: string;
  title?: string;
  cat?: string;
  gaemyeong?: number;
  clientPhone?: string;
  phoneChange?: boolean;
  hongik?: boolean;
  repeat?: string;
  memo?: string;
};

// 모든 유저의 calendar/data 이벤트 (보통 1명)
export async function readEvents(): Promise<CalEvent[]> {
  const snap = await db().collectionGroup("calendar").get();
  const out: CalEvent[] = [];
  for (const doc of snap.docs) {
    if (doc.id !== "data") continue;
    const { events = [] } = doc.data() as { events?: CalEvent[] };
    out.push(...events);
  }
  return out;
}

// calendar/data 도큐먼트 참조 (쓰기용). 여러 유저면 첫 번째(원장님 계정) 사용
async function getDataRef(): Promise<FirebaseFirestore.DocumentReference> {
  const snap = await db().collectionGroup("calendar").get();
  const doc = snap.docs.find((d) => d.id === "data");
  if (!doc) throw new Error("calendar/data 도큐먼트를 찾을 수 없습니다");
  return doc.ref;
}

// 상담 이벤트를 달력에 추가 (트랜잭션 append). dryRun이면 실제로 안 쓰고 미리보기만 반환
export async function appendConsultEvent(
  evt: CalEvent,
  opts: { dryRun?: boolean } = {}
): Promise<{ written: boolean; event: CalEvent }> {
  const withId: CalEvent = { id: evt.id || `knop_${Date.now()}`, gaemyeong: 0, ...evt, cat: "상담" };
  if (opts.dryRun) return { written: false, event: withId };
  const ref = await getDataRef();
  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = (snap.data() || {}) as { events?: CalEvent[] };
    const events = Array.isArray(data.events) ? data.events : [];
    events.push(withId);
    tx.set(ref, { ...data, events }, { merge: true });
  });
  return { written: true, event: withId };
}

// 일반 이벤트를 달력에 추가 (cat 지정 유지). 새이름 일정 등 상담 외 이벤트용.
export async function appendEvent(
  evt: CalEvent,
  opts: { dryRun?: boolean } = {}
): Promise<{ written: boolean; event: CalEvent }> {
  const withId: CalEvent = { id: evt.id || `knop_${Date.now()}`, gaemyeong: 0, cat: "상담", ...evt };
  if (opts.dryRun) return { written: false, event: withId };
  const ref = await getDataRef();
  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = (snap.data() || {}) as { events?: CalEvent[] };
    const events = Array.isArray(data.events) ? data.events : [];
    events.push(withId);
    tx.set(ref, { ...data, events }, { merge: true });
  });
  return { written: true, event: withId };
}

// 여러 이벤트에 전화번호 되쓰기 (번호 없는 것만). id 또는 (date+title)로 매칭.
export async function applyEventPhones(
  updates: Array<{ id?: string; date?: string; title?: string; phone: string }>,
  opts: { dryRun?: boolean } = {}
): Promise<{ written: number }> {
  if (opts.dryRun || updates.length === 0) return { written: 0 };
  const ref = await getDataRef();
  let written = 0;
  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = (snap.data() || {}) as { events?: CalEvent[] };
    const events = Array.isArray(data.events) ? data.events : [];
    for (const e of events) {
      if (e.clientPhone) continue;
      const u = updates.find(
        (x) => (x.id && e.id && x.id === e.id) || (!x.id && e.date === x.date && e.title === x.title)
      );
      if (u) {
        e.clientPhone = u.phone;
        written++;
      }
    }
    tx.set(ref, { ...data, events }, { merge: true });
  });
  return { written };
}

// ── 이름/인원 파싱 (작명완료 제목: "이름" 또는 "이름3") ──
export function parseNameCount(title: string): { name: string; people: number } {
  const t = (title || "").trim().replace(/^\d+\s*/, ""); // 혹시 앞 시간 있으면 제거
  const m = t.match(/^(.*?)(\d+)?$/);
  return { name: (m?.[1] || "").trim(), people: m?.[2] ? parseInt(m[2], 10) : 1 };
}

// 이름으로 전화번호 찾기 (상담 이벤트 중 전화 있는 것). extraByName: KNOP/DB 소스
export function findPhone(name: string, events: CalEvent[], extraByName?: Map<string, string>): string | null {
  if (!name) return null;
  const direct = events.find((e) => e.cat === "상담" && e.clientPhone && parseNameCount(e.title || "").name === name);
  if (direct?.clientPhone) return direct.clientPhone;
  return extraByName?.get(name) || null;
}

// ── 이름분석 상담 안내 (functions/index.js 이식) ──
function getAmPm(hour: number): { ampm: string; hour24: number } {
  if (hour >= 9 && hour <= 11) return { ampm: "오전", hour24: hour };
  if (hour === 12) return { ampm: "오후", hour24: 12 };
  return { ampm: "오후", hour24: hour + 12 };
}

// 달력 이벤트의 시작 시각(제목 앞 숫자=시간, 예 "430김유진"→오후 4시 30분).
// 상담은 시간 표기가 없으면 오후 2시 기본. 상담이 아닌 일정은 시간 표기가 없으면 시각 없음(빈칸).
export function eventStartAt(evt: CalEvent): Date | null {
  if (!evt.date) return null;
  const [y, mo, d] = evt.date.split("-").map(Number);
  if (!y || !mo || !d) return null;
  const m = (evt.title || "").match(/^(\d{1,4})/);
  // 상담이 아니고(=cat 이 상담 외로 명시됨) 제목 앞에 시간 숫자도 없으면 시각을 비운다.
  const isConsult = !evt.cat || evt.cat === "상담";
  if (!m && !isConsult) return null;
  let hour24 = 14;
  let min = 0;
  if (m) {
    const tp = m[1];
    let hour: number;
    if (tp.length <= 2) {
      hour = parseInt(tp, 10);
      min = 0;
    } else {
      min = parseInt(tp.slice(-2), 10);
      hour = parseInt(tp.slice(0, -2), 10);
    }
    if (hour >= 1 && hour <= 23 && min >= 0 && min < 60) hour24 = getAmPm(hour).hour24;
    else min = 0;
  }
  // 제목의 시각은 한국시간(KST) 벽시계 값. 서버가 UTC(Railway)라 로컬로 만들면 9시간 어긋나므로
  // KST(UTC+9) 기준 절대시각으로 변환한다. (예: 오후 2시 = 14:00 KST = 05:00 UTC)
  const KST = 9 * 3600 * 1000;
  const dt = new Date(Date.UTC(y, mo - 1, d, hour24, min) - KST);
  return isNaN(dt.getTime()) ? null : dt;
}

// 상담 이벤트 파싱: 제목 "시간 이름 인원" (예: "2 홍길동 3")
export function parseConsult(evt: CalEvent): { timeStr: string; name: string; people: number; duration: number } {
  const title = evt.title || "";
  const m = title.match(/^(\d+)\s*(.*?)(\d+)?$/);
  const gaemyeong = evt.gaemyeong || 0;
  if (!m) {
    const people = parseInt(title.match(/(\d+)$/)?.[1] || "1", 10);
    const duration = 60 + (people - 1) * 30 + gaemyeong * 30;
    return { timeStr: "오후 2시", name: title.trim(), people, duration };
  }
  const timePart = m[1] || "";
  let name = (m[2] || "").trim();
  const people = m[3] ? parseInt(m[3], 10) : 1;
  let hour: number, min: number;
  if (timePart.length <= 2) {
    hour = parseInt(timePart, 10);
    min = 0;
  } else {
    min = parseInt(timePart.slice(-2), 10);
    hour = parseInt(timePart.slice(0, -2), 10);
  }
  const { ampm } = getAmPm(hour);
  const timeStr = min === 0 ? `${ampm} ${hour}시` : `${ampm} ${hour}시 ${min}분`;
  const duration = 60 + (people - 1) * 30 + gaemyeong * 30;
  name = name.replace(/\d+$/, "").trim();
  return { timeStr, name, people, duration };
}

export function buildConsultReminder(evt: CalEvent): string {
  const { timeStr, duration } = parseConsult(evt);
  const hours = Math.floor(duration / 60);
  const mins = duration % 60;
  const durationStr = mins === 0 ? `${hours}시간` : `${hours}시간 ${mins}분`;
  return `안녕하세요, 한국이름학교입니다.

내일 ${timeStr}에 이름분석 운명상담이 예정되어 있어 안내드립니다.


■ 상담 안내
· 소요 시간 : 약 ${durationStr}
· 분석표 : 상담 바로 직전에 발송해 드립니다
  (함께 보며 상담 진행)


■ 상담 환경
이어폰 또는 스피커폰을 이용해 주시고,
원활한 진행을 위해 아래 사항을 꼭 지켜주세요.

① 이동 중 상담은 어렵습니다
   운명과 삶의 흐름에 관한 깊은 이야기를 나누는 자리인 만큼,
   집중할 수 있는 환경에서 받아주시기 바랍니다.

② 카페 등 소음이 있는 공간은 피해 주세요
   생각보다 주변 소음이 커 상담이 어렵습니다.

일정과 유의사항 확인 후 답변 부탁드립니다.
그럼 내일 뵙겠습니다.

- 한국이름학교`;
}

// ── 새 이름 상담 안내 (원장님 규칙: 인원별 10~50분 + 가족문구) ──
const NEWNAME_DURATION: Record<number, number> = { 1: 10, 2: 20, 3: 30, 4: 40, 5: 40, 6: 50 };
export function newNameDuration(people: number): number {
  if (people <= 1) return 10;
  return NEWNAME_DURATION[people] ?? 50;
}
export function buildNewNameNotice(people: number): string {
  const fam = people >= 2 ? "가족분들의 " : "";
  return `안녕하세요. 한국이름학교입니다.

기다리셨던 ${fam}새 이름이 완성되었습니다~

새 이름 설명 상담을 도와드리겠습니다.
상담은 약 ${newNameDuration(people)}분 정도 소요됩니다.
편하신 시간을 알려주시면 일정 확정해 드리겠습니다.

- 한국이름학교`;
}

// 서울 기준 '내일' 날짜 (YYYY-MM-DD)
export function tomorrowKST(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parseInt(parts.find((p) => p.type === "year")!.value);
  const m = parseInt(parts.find((p) => p.type === "month")!.value);
  const d = parseInt(parts.find((p) => p.type === "day")!.value);
  const t = new Date(y, m - 1, d + 1);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}
