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
  const r: any = await db.execute(
    sql`SELECT max(created_at) AS last FROM sms_backfill_runs WHERE device_id = ${PHONELINK_DEVICE} AND dry_run = false`,
  );
  const raw = r.rows?.[0]?.last;
  if (!raw) return { days: null, sent: false }; // 아직 노트북 동기화를 시작하지 않음
  // DB 시각은 UTC 벽시계로 저장된다(timestamp without time zone). 운영 서버(UTC)는 Date 로 바로 맞게 읽힌다.
  const lastAt = raw instanceof Date ? raw : new Date(String(raw).replace(" ", "T") + "Z");
  const days = Math.floor((Date.now() - lastAt.getTime()) / 86_400_000);
  if (days < START_DAYS) return { days, sent: false };
  const { sendPhoneLinkReminder } = await import("../email");
  await sendPhoneLinkReminder({ days, lastAt });
  console.log(`[KOP] 노트북 문자 연결 ${days}일째 — 원장님께 메일`);
  return { days, sent: true };
}

let _started = false;
export function startPhoneLinkReminder() {
  if (_started) return;
  _started = true;
  scheduleDaily("노트북 문자 연결 25일 점검(메일)", () => 노트북문자연결점검().then(() => {}));
}
