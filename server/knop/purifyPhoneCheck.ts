// 정화하기 첫 문자 전날 오전 10시 — 전화번호 확인 알림(원장님께 텔레그램).
//
// 원장님 지시(2026-09-24): 개명 후 정화하기 문자가 처음 나가기 전날 오전 10시에
// "이 번호가 맞는지" 확인 알림을 받고 싶다. 번호가 바뀌었으면 고객정보에서 고치면
// 아직 안 나간 예약 문자가 모두 새 번호로 옮겨진다(store.movePendingMessagesToNewPhone).
//
// 깨우는 방식: 따로 폴링하지 않는다(Neon 요금). 아침 점검(08:40)에서 '내일 첫 정화하기'가
// 있는지 한 번 보고, 있을 때만 그날 10:00 으로 타이머를 건다. 서버가 다시 뜨면 점검이
// 다시 돌면서 타이머를 새로 건다. 10시가 이미 지났으면 정오 전까지만 바로 보낸다.
import { db } from "../db";
import { and, eq } from "drizzle-orm";
import { customers, scheduledMessages } from "@shared/schema";
import { scheduleDaily } from "./dailyCheckpoint";

const SET = "gaemyeong_approved";
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

export type 확인대상 = { customerId: string | null; name: string; phone: string; sendAt: string };

// 내일 첫 정화하기 문자가 나가는 고객들(고객마다 가장 이른 예약 1건)
export async function 내일첫정화하기(): Promise<확인대상[]> {
  if (!db) return [];
  const rows = await db
    .select({ id: scheduledMessages.id, customerId: scheduledMessages.customerId, phone: scheduledMessages.phone, scheduledAt: scheduledMessages.scheduledAt })
    .from(scheduledMessages)
    .where(and(eq(scheduledMessages.setKey, SET), eq(scheduledMessages.status, "scheduled")));
  const 내일 = 내일KST();
  const 첫건 = new Map<string, { phone: string; at: Date }>();
  for (const r of rows) {
    const key = r.customerId || r.phone;
    const at = new Date(r.scheduledAt);
    const cur = 첫건.get(key);
    if (!cur || at < cur.at) 첫건.set(key, { phone: r.phone, at });
  }
  const out: 확인대상[] = [];
  for (const [key, v] of Array.from(첫건)) {
    if (kstDate(v.at) !== 내일) continue; // 첫 문자가 내일인 고객만
    let name = "고객정보 없는 번호";
    let customerId: string | null = null;
    if (db && key !== v.phone) {
      const [c] = await db.select().from(customers).where(eq(customers.id, key));
      if (c) {
        name = c.name;
        customerId = c.id;
      }
    }
    out.push({ customerId, name, phone: v.phone, sendAt: v.at.toISOString() });
  }
  return out;
}

const 보냄 = new Set<string>(); // `${날짜}|${고객}` — 서버가 살아 있는 동안 중복 방지

export async function 전화번호확인알림(): Promise<확인대상[]> {
  const 대상 = await 내일첫정화하기();
  const 오늘 = 오늘KST();
  const 보낼것 = 대상.filter((t) => !보냄.has(`${오늘}|${t.customerId || t.phone}`));
  if (!보낼것.length) return [];
  const { sendAlert, esc, alertAvailable } = await import("./alertBot");
  if (!alertAvailable()) return [];
  for (const t of 보낼것) {
    const d = t.phone.replace(/\D/g, "");
    const tel = d.startsWith("0") && d.length >= 10 ? `+82${d.slice(1)}` : t.phone || "번호 없음";
    const 시각 = new Date(new Date(t.sendAt).getTime() + 9 * 3600_000).toISOString().slice(5, 16).replace("T", " ");
    await sendAlert(
      [
        "📱 <b>전화번호 확인</b>",
        `${esc(t.name)} · ${tel}`,
        "",
        `내일 ${시각} 에 정화하기 첫 문자가 나갑니다.`,
        "번호가 맞는지 확인해 주세요.",
        "바뀌었으면 고객정보에서 번호를 고치면 예약 문자도 함께 옮겨집니다.",
      ].join("\n"),
    );
    보냄.add(`${오늘}|${t.customerId || t.phone}`);
    console.log(`[KOP] 정화하기 전 전화번호 확인 알림: ${t.name} ${t.phone}`);
  }
  return 보낼것;
}

let _timer: ReturnType<typeof setTimeout> | null = null;
let _started = false;
export function startPurifyPhoneCheckScheduler() {
  if (_started) return;
  _started = true;
  scheduleDaily("정화하기 전날 전화번호 확인 알림(10:00 KST)", async () => {
    const 대상 = await 내일첫정화하기();
    if (!대상.length) return; // 내일 첫 문자가 없으면 타이머도 걸지 않는다
    const 남은 = 오늘10시() - Date.now();
    if (_timer) clearTimeout(_timer);
    if (남은 > 0) {
      _timer = setTimeout(() => {
        전화번호확인알림().catch((e) => console.error(`[KOP] 전화번호 확인 알림 실패: ${e?.message}`));
      }, 남은);
      console.log(`[KOP] 정화하기 전 전화번호 확인 알림 예약: ${대상.map((t) => t.name).join(", ")} (오늘 10:00)`);
    } else if (남은 > -2 * 3600_000) {
      // 10시가 막 지난 뒤 서버가 떴다면(정오 전까지) 바로 보낸다
      await 전화번호확인알림();
    }
  });
}
