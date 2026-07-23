// 이름분석표 전용 워커 (로컬 PC 상주) — 폴더 감시 + PDF→사이트 가져오기 "그것만" 실행.
// ⚠️ 웹서버·문자 스케줄러·개명 안내 스케줄러는 실행하지 않는다 → Railway 서버와 절대 충돌 없음(문자 이중발송 방지).
// 실행: npm run report-sync   /   pm2 로 상주 등록 (부팅 시 자동 실행 + 꺼지면 자동 재시작)
import "dotenv/config"; // DB·R2 환경변수 로드 (db import 전에)
import { startReportSync, syncReports, syncReportLinks } from "./reportSync";
import { reportsAvailable, reportsDir } from "./reports";

async function main() {
  console.log("========================================");
  console.log("[이름분석표 워커] 시작");
  console.log("  폴더:", reportsDir());
  console.log("  폴더 접근:", reportsAvailable() ? "가능 ✅" : "불가 ❌ (폴더 없음 — 이 PC가 아님)");
  console.log("========================================");

  if (!reportsAvailable()) {
    console.error("[이름분석표 워커] 폴더가 없어 종료합니다. (이 워커는 이름분석 폴더가 있는 PC에서만 실행)");
    process.exit(1);
  }

  // 시작 즉시 한 번 밀린 것 처리(startReportSync 의 15초 지연을 기다리지 않고)
  try {
    const r = await syncReports();
    console.log(`[이름분석표 워커] 초기 동기화: ${r.added}개 첨부, 고객 ${r.created}명 생성`);
  } catch (e: any) {
    console.error("[이름분석표 워커] 초기 동기화 오류:", e?.message);
  }

  // 폴더 감시 시작 (새 PDF 감지 → 자동 동기화). 프로세스는 계속 살아있음.
  startReportSync();
  console.log("[이름분석표 워커] 폴더 감시 중 — 새 PDF 가 들어오면 자동으로 사이트에 올립니다.");

  // 상담예정 링크 폴더 동기화: 시작 시 1회 + 15분마다 (달력에 상담일정이 바뀌어도 반영)
  syncReportLinks().catch((e: any) => console.error("[이름분석표 워커] 링크 동기화 오류:", e?.message));
  setInterval(() => { syncReportLinks().catch(() => {}); }, 15 * 60 * 1000);

}

process.on("SIGINT", () => { console.log("[이름분석표 워커] 종료(SIGINT)"); process.exit(0); });
process.on("SIGTERM", () => { console.log("[이름분석표 워커] 종료(SIGTERM)"); process.exit(0); });

main().catch((e) => { console.error("[이름분석표 워커] 치명적 오류:", e?.message); process.exit(1); });
