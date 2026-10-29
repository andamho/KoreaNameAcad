// 노트북 '휴대폰과 연결' 문자 동기화가 오래 끊기면 원장님께 메일.
//
// 원장님 결정(2026-10-24): 문자는 노트북 휴대폰과 연결로 모은다(tools/phonelink-sync.mjs).
// 그 앱은 폰에서 최근 30일치만 가져오므로, 노트북이 30일 넘게 꺼져 있으면 그 이전 문자가 빠진다.
// 마지막 동기화가 25일을 넘으면 매일 아침 메일로 알린다(텔레그램은 안 볼 수 있어 메일로).
//
// 노트북이 꺼져 있으면 노트북은 알릴 수 없으므로 서버가 본다. 아침 점검(08:40)에 붙여
// 따로 DB 를 깨우지 않는다. 노트북 동기화는 하루 한 번 이상 '살아 있음' 기록을 남긴다.
import { db } from "../db";
import { sql } from "drizzle-orm";
import { scheduleDaily } from "./dailyCheckpoint";

export const PHONELINK_DEVICE = "5f0e11c0-ba5e-4c0d-8e01-00000000f11c"; // 노트북 휴대폰과 연결 동기화(tools/phonelink/sync.mjs)의 고정 번호
const START_DAYS = 25;

export async function 노트북문자연결점검(): Promise<{ days: number | null; sent: boolean }> {
  if (!db) return { days: null, sent: false };
  // 일수·표시 시각을 SQL 에서 만든다. JS 로 시각을 옮겨 계산하니 NaN 이 나와
  // 'NaN < 25' 가 거짓이 되어 매일 'NaN일째' 메일이 나갔다(2026-10-24~29). smsHealth.ts 와 같은 방식.
  const r: any = await db.execute(sql`
    SELECT EXTRACT(EPOCH FROM (now() - max(created_at))) / 86400 AS days,
           to_char(max(created_at) + interval '9 hour', 'YYYY-MM-DD HH24:MI') AS last_kst
    FROM sms_backfill_runs WHERE device_id = ${PHONELINK_DEVICE} AND dry_run = false`);
  const row = r.rows?.[0];
  if (row?.days == null) return { days: null, sent: false }; // 아직 노트북 동기화를 시작하지 않음
  const days = Math.floor(Number(row.days));
  // 숫자가 아니면 알리지 않는다 — 계산이 깨졌을 때 매일 메일이 가는 쪽보다 조용한 쪽이 낫다.
  if (!Number.isFinite(days)) {
    console.error(`[KOP] 노트북 문자 연결 점검: 일수 계산 실패(${row.days}) — 메일 안 보냄`);
    return { days: null, sent: false };
  }
  if (days < START_DAYS) return { days, sent: false };
  const { sendPhoneLinkReminder } = await import("../email");
  await sendPhoneLinkReminder({ days, lastKst: String(row.last_kst) });
  console.log(`[KOP] 노트북 문자 연결 ${days}일째 — 원장님께 메일`);
  return { days, sent: true };
}

let _started = false;
export function startPhoneLinkReminder() {
  if (_started) return;
  _started = true;
  scheduleDaily("노트북 문자 연결 25일 점검(메일)", () => 노트북문자연결점검().then(() => {}));
}
