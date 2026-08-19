// 이름분석표 전용 워커 (로컬 PC 상주) — 폴더 감시 + PDF→사이트 가져오기 "그것만" 실행.
// ⚠️ 웹서버·문자 스케줄러·개명 안내 스케줄러는 실행하지 않는다 → Railway 서버와 절대 충돌 없음(문자 이중발송 방지).
// 실행: npm run report-sync   /   pm2 로 상주 등록 (부팅 시 자동 실행 + 꺼지면 자동 재시작)
import "dotenv/config"; // DB·R2 환경변수 로드 (db import 전에)
import { startReportSync, syncReports, syncReportLinks } from "./reportSync";
import { reportsAvailable, reportsDir } from "./reports";
import { startNamingSync, syncNamingLinks, namingAvailable, startNamingIntake, syncNamingIntake, intakeAvailable } from "./namingSync";
import { scheduleDaily } from "./dailyCheckpoint";

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

  // 상담예정 링크 폴더 동기화: 시작 시 1회 + 매일 아침 08:40(KST).
  // 새 PDF 는 폴더 감시로 즉시 처리되므로 이 주기가 하는 일은 '지난 상담자 링크 정리'뿐이다.
  // 예전에는 1시간마다 돌면서 대부분 "생성 0 · 정리 0" 인데도 Neon 컴퓨트를 깨워
  // 하루 24회 과금됐다 → 서버 스케줄러들과 같은 아침 점검 하루 1회로 통일.
  scheduleDaily("이름분석 링크 폴더 동기화", () => syncReportLinks(), 0);

  // 작명장 PDF → 이미지 링크 (PDF 1개 = 링크 1개). 폴더 없으면 조용히 건너뜀.
  if (namingAvailable()) {
    // 한글이 내보낸 새 PDF 를 PDF작명장 → PDF 로 자동 반입(복사). 링크 생성보다 먼저.
    if (intakeAvailable()) {
      await syncNamingIntake().catch((e: any) => console.error("[작명장] 초기 반입 오류:", e?.message));
      startNamingIntake();
    } else {
      console.log("[작명장] 반입 폴더(PDF작명장)가 없어 건너뜀");
    }
    await syncNamingLinks().catch((e: any) => console.error("[작명장] 초기 링크 동기화 오류:", e?.message));
    startNamingSync();
    // 렌더 실패 등으로 링크를 못 만든 PDF 재시도. 폴더 감시만 있으면 다음에 파일이 들어올 때까지
    // 실패한 채로 방치된다 → 아침 점검 때 한 번 더 훑는다.
    // (할 일이 없으면 DB 를 아예 건드리지 않으므로 Neon 컴퓨트 부담 없음)
    scheduleDaily("작명장 링크 폴더 동기화", async () => { await syncNamingIntake(); await syncNamingLinks(); }, 0);
  } else {
    console.log("[작명장] PDF 폴더가 없어 건너뜀");
  }
}

process.on("SIGINT", () => { console.log("[이름분석표 워커] 종료(SIGINT)"); process.exit(0); });
process.on("SIGTERM", () => { console.log("[이름분석표 워커] 종료(SIGTERM)"); process.exit(0); });

main().catch((e) => { console.error("[이름분석표 워커] 치명적 오류:", e?.message); process.exit(1); });
