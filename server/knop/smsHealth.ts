// 문자 수집이 끊겼는지 매일 아침 점검한다.
//
// 왜 필요한가: 2026-07-25 20:02 이후 문자가 한 건도 안 들어왔는데 8/4 에야 발견했다(10일).
// 원인은 incoming_sms 에 ingest_source 컬럼이 없어 저장이 전부 실패한 것이었다.
// 휴대폰 매크로는 정상 실행되고 인증도 통과해서 겉으로는 멀쩡해 보였다.
// → 서버가 스스로 "안 들어온다"를 알아채고 알려야 한다.
import { sql } from "drizzle-orm";
import { db } from "../db";
import { notifyAdmin } from "../telegramBot";
import { scheduleDaily } from "./dailyCheckpoint";

const SILENT_HOURS = 24; // 이 시간 넘게 한 건도 없으면 이상으로 본다

export type SmsHealth = {
  lastKst: string | null;   // 'YYYY-MM-DD HH:MM' (KST)
  silentHours: number | null;
  failed24h: number;
  failReasons: string[];
  problem: boolean;
};

export async function checkSmsHealth(): Promise<SmsHealth> {
  if (!db) throw new Error("DB 사용 불가");
  // 표시용 시각도 SQL 에서 만든다. received_at 은 timestamp(시간대 없음)라
  // JS 로 옮기면 서버 타임존에 따라 9시간 어긋난다(로컬 KST vs 배포 UTC).
  const [row] = (await db.execute(sql`
    SELECT to_char(max(received_at) + interval '9 hour', 'YYYY-MM-DD HH24:MI') AS last_kst,
           EXTRACT(EPOCH FROM (now() - max(received_at))) / 3600 AS silent_hours
    FROM incoming_sms
  `)).rows as any[];
  const lastKst = (row?.last_kst as string) ?? null;
  const silentHours = row?.silent_hours != null ? Number(row.silent_hours) : null;

  // 저장 실패가 쌓이고 있으면 그것도 알린다(오늘 같은 컬럼 누락은 여기서 바로 잡힌다)
  let failed24h = 0;
  let failReasons: string[] = [];
  try {
    const f = (await db.execute(sql`
      SELECT count(*)::int AS n FROM sms_webhook_log
      WHERE ok = false AND reason NOT LIKE '비밀값%' AND at > now() - interval '24 hours'
    `)).rows as any[];
    failed24h = Number(f[0]?.n ?? 0);
    if (failed24h > 0) {
      const r = (await db.execute(sql`
        SELECT DISTINCT left(reason, 80) AS reason FROM sms_webhook_log
        WHERE ok = false AND reason NOT LIKE '비밀값%' AND at > now() - interval '24 hours' LIMIT 3
      `)).rows as any[];
      failReasons = r.map((x) => String(x.reason));
    }
  } catch {
    /* 진단 테이블이 없어도 본 점검은 계속한다 */
  }

  const problem = failed24h > 0 || silentHours === null || silentHours > SILENT_HOURS;
  return { lastKst, silentHours, failed24h, failReasons, problem };
}

export async function runSmsHealthCheck(): Promise<void> {
  const h = await checkSmsHealth();
  if (!h.problem) {
    console.log(`[KOP] 문자 수집 정상 (마지막 ${h.lastKst} KST · ${Math.round(h.silentHours ?? 0)}시간 전)`);
    return;
  }
  const lines = ["⚠️ <b>문자 수집 이상</b>", ""];
  if (h.silentHours === null) lines.push("수신 기록이 아예 없습니다.");
  else lines.push(`마지막 수신: ${h.lastKst} KST (<b>${Math.round(h.silentHours)}시간 전</b>)`);
  if (h.failed24h > 0) {
    lines.push("", `최근 24시간 저장 실패 <b>${h.failed24h}건</b>`);
    for (const r of h.failReasons) lines.push(`· ${r}`);
  }
  lines.push("", "휴대폰 매크로가 정상 실행돼도 서버 저장에서 막힐 수 있습니다.");
  const text = lines.join("\n");
  console.error("[KOP] 문자 수집 이상 — 알림 발송:", text.replace(/<[^>]+>/g, ""));
  await notifyAdmin(text);
}

export function startSmsHealthCheck(): void {
  scheduleDaily("문자 수집 점검", runSmsHealthCheck, 60_000);
}
