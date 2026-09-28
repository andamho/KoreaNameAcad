// 번호 확인 알림 — 첫 자동 문자가 나가기 전날 오전 10시에 원장님께 텔레그램.
//
// 원장님 확정(2026-09-24 → 2026-09-28 좁힘):
//   · 대상은 전화번호까지 새로 받은 고객뿐이다. 달력 새이름 일정의 전화번호 체크가
//     아침 점검에서 고객정보 ☎전번(phoneNaming) 으로 들어온다.
//   · 그 고객에게 앞으로 나갈 '다음' 자동 문자 전날 10:00 에 한 번만 알린다(고객당 1회).
//     (2026-09-28: '첫 문자' 기준이면 이미 문자가 시작된 고객은 영영 확인을 못 해 바꿈)
//   · 고객정보에서 번호를 바꾼 뒤에는 알리지 않는다(이미 새 번호로 고쳤다는 뜻).
//     번호를 바꾸면 아직 안 나간 예약 문자도 함께 새 번호로 옮겨진다(store).
//
// 깨우는 방식: 따로 폴링하지 않는다(Neon 요금). 아침 점검(08:40)에서 '내일 보낼 대상'이
// 있을 때만 그날 10:00 으로 타이머를 건다. 서버가 다시 뜨면 점검이 다시 돌며 타이머를 새로 건다.
import { db } from "../db";
import { eq, ne } from "drizzle-orm";
import { customers, scheduledMessages } from "@shared/schema";
import { scheduleDaily } from "./dailyCheckpoint";

// 한 번만 알리기 위한 표시(고객정보 태그)
export const DONE_TAG = "번호확인알림함";
const 알림시각 = { 시: 10, 분: 0 };

// UTC 순간 → KST 날짜(YYYY-MM-DD)
function kstDate(d: Date): string {
  return new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}
function 오늘KST(): string {
  return kstDate(new Date());
}
function 내일KST(): string {
  return kstDate(new Date(Date.now() + 86_400_000));
}
// 오늘 KST 10:00 의 UTC 순간
function 오늘10시(): number {
  const [y, m, d] = 오늘KST().split("-").map(Number);
  return Date.UTC(y, m - 1, d, 알림시각.시 - 9, 알림시각.분, 0);
}
function 태그목록(tags: unknown): string[] {
  try {
    const a = Array.isArray(tags) ? tags : JSON.parse(String(tags || "[]"));
    return Array.isArray(a) ? a.map(String) : [];
  } catch {
    return [];
  }
}
// 고객정보에서 번호를 실제로 바꾼 적이 있나('미입력' → 번호 입력은 변경으로 보지 않는다)
function 번호바꾼적있나(c: any): boolean {
  try {
    const h = Array.isArray(c.phoneHistory) ? c.phoneHistory : JSON.parse(String(c.phoneHistory || "[]"));
    return Array.isArray(h) && h.some((x: any) => x?.normalized);
  } catch {
    return false;
  }
}

export type 확인대상 = { customerId: string; name: string; phone: string; sendAt: string };

// 내일 자동 문자가 나가는 ☎전번 고객들(아직 번호를 안 바꿨고, 알린 적 없는 분)
export async function 내일첫문자대상(): Promise<확인대상[]> {
  if (!db) return [];
  const d = db;
  const rows = await d
    .select({ customerId: scheduledMessages.customerId, phone: scheduledMessages.phone, scheduledAt: scheduledMessages.scheduledAt, status: scheduledMessages.status })
    .from(scheduledMessages)
    .where(eq(scheduledMessages.status, "scheduled"));
  const 내일 = 내일KST();
  // 고객별로 앞으로 나갈 가장 이른 자동 문자
  const 다음건 = new Map<string, { phone: string; at: Date }>();
  for (const r of rows) {
    if (!r.customerId) continue;
    const at = new Date(r.scheduledAt);
    const cur = 다음건.get(r.customerId);
    if (!cur || at < cur.at) 다음건.set(r.customerId, { phone: r.phone, at });
  }
  const out: 확인대상[] = [];
  for (const [cid, v] of Array.from(다음건)) {
    if (kstDate(v.at) !== 내일) continue;
    const [c] = await d.select().from(customers).where(eq(customers.id, cid));
    if (!c || c.deletedAt) continue;
    if (!c.phoneNaming) continue; // 전화번호까지 받은 고객만
    if (번호바꾼적있나(c)) continue; // 이미 새 번호로 고쳤으면 물을 필요 없다
    if (태그목록(c.tags).includes(DONE_TAG)) continue; // 고객당 한 번만
    out.push({ customerId: c.id, name: c.name, phone: v.phone, sendAt: v.at.toISOString() });
  }
  return out;
}

export async function 번호확인알림(): Promise<확인대상[]> {
  if (!db) return [];
  const d = db;
  const 대상 = await 내일첫문자대상();
  if (!대상.length) return [];
  const { sendAlert, esc, alertAvailable } = await import("./alertBot");
  if (!alertAvailable()) return [];
  const 보낸것: 확인대상[] = [];
  for (const t of 대상) {
    const digits = t.phone.replace(/\D/g, "");
    const tel = digits.startsWith("0") && digits.length >= 10 ? `+82${digits.slice(1)}` : t.phone || "번호 없음";
    const 시각 = new Date(new Date(t.sendAt).getTime() + 9 * 3600_000).toISOString().slice(5, 16).replace("T", " ");
    await sendAlert(
      [
        "📱 <b>번호 확인</b>",
        `${esc(t.name)} · ${tel}`,
        "",
        `내일 ${시각} 에 자동 문자가 나갑니다.`,
        "새 전화번호로 바꾸셨다면 고객정보에서 번호를 고쳐 주세요.",
        "고치면 아직 안 나간 예약 문자도 함께 새 번호로 옮겨집니다.",
      ].join("\n"),
    );
    // 한 번만 보내도록 표시를 남긴다(서버가 다시 떠도 유지)
    const [c] = await d.select().from(customers).where(eq(customers.id, t.customerId));
    const tags = 태그목록(c?.tags);
    if (!tags.includes(DONE_TAG)) {
      tags.push(DONE_TAG);
      await d.update(customers).set({ tags: JSON.stringify(tags) }).where(eq(customers.id, t.customerId));
    }
    보낸것.push(t);
    console.log(`[KOP] 번호 확인 알림: ${t.name} ${t.phone}`);
  }
  return 보낸것;
}

let _timer: ReturnType<typeof setTimeout> | null = null;
let _started = false;
export function startPurifyPhoneCheckScheduler() {
  if (_started) return;
  _started = true;
  scheduleDaily("자동 문자 전날 번호 확인 알림(10:00 KST · ☎전번 고객 1회)", async () => {
    const 대상 = await 내일첫문자대상();
    if (!대상.length) return; // 대상이 없으면 타이머도 걸지 않는다
    const 남은 = 오늘10시() - Date.now();
    if (_timer) clearTimeout(_timer);
    if (남은 > 0) {
      _timer = setTimeout(() => {
        번호확인알림().catch((e) => console.error(`[KOP] 번호 확인 알림 실패: ${e?.message}`));
      }, 남은);
      console.log(`[KOP] 번호 확인 알림 예약: ${대상.map((t) => t.name).join(", ")} (오늘 10:00)`);
    } else if (남은 > -2 * 3600_000) {
      await 번호확인알림(); // 10시 직후 서버가 떴다면 바로
    }
  });
}
