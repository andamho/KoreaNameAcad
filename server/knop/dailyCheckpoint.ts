// 하루 한 번(오전 8시 40분 KST) 도는 공용 점검 시각.
//
// 왜 하루 한 번인가: 개명 후속 문자·새이름 안내는 모두 오전 9~10시에 나간다.
// 그런데 예전에는 각 스케줄러가 60분마다(하루 24회씩) DB를 두드렸다.
// Neon 은 쿼리가 없으면 컴퓨트를 재우고 깨어 있는 시간만큼 과금하는데,
// 이 폴링들 때문에 하루 종일 깨어 있었다 → 그대로 요금이 됐다.
// 발송 직전에 한 번만 확인하면 충분하다.
const CHECKPOINT_KST_HOUR = 8;
const CHECKPOINT_KST_MIN = 40;

// 다음 점검 시각(08:40 KST)까지 남은 ms
export function msUntilMorningCheckpoint(now: Date = new Date()): number {
  const KST = 9 * 3600 * 1000;
  const k = new Date(now.getTime() + KST); // UTC 필드를 KST 처럼 읽는다
  let cp =
    Date.UTC(
      k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate(),
      CHECKPOINT_KST_HOUR, CHECKPOINT_KST_MIN, 0,
    ) - KST;
  if (cp <= now.getTime()) cp += 24 * 3600 * 1000; // 오늘 것이 지났으면 내일
  return cp - now.getTime();
}

// 매일 점검 시각에 fn 을 실행한다. 서버가 뜰 때 한 번(bootDelayMs 뒤) 실행해
// 배포·재시작 중 놓친 일을 회수한다.
export function scheduleDaily(name: string, fn: () => Promise<void> | void, bootDelayMs = 20_000): void {
  const run = async () => {
    try {
      await fn();
    } catch (e: any) {
      console.error(`[KOP] ${name} 실패: ${e?.message}`);
    } finally {
      setTimeout(run, msUntilMorningCheckpoint()); // 다음 아침에 다시
    }
  };
  const first = msUntilMorningCheckpoint();
  const hours = Math.round(first / 3600_000);
  console.log(`[KOP] ${name} 스케줄러 시작 (매일 08:40 KST · 다음 실행 약 ${hours}시간 뒤)`);
  setTimeout(async () => {
    await Promise.resolve(fn()).catch((e: any) => console.error(`[KOP] ${name} 최초 실행 실패: ${e?.message}`));
    setTimeout(run, msUntilMorningCheckpoint());
  }, bootDelayMs);
}
