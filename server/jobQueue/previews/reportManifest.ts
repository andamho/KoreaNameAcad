// internal-report 결과 영향 manifest(read-only 계산기). label 과 manifest hash 를 분리한다.
// ⚠️ 운영 코드에 연결하지 않는다(순수 계산). 무관한 route·UI·로그 파일은 제외.
import { sha256Hex, canonicalStringify } from "../idempotency";

// 결과(렌더 bytes·매칭·terminal 정책)에 실제 영향을 주는 파일. route/UI/로그 제외.
export const REPORT_MANIFEST_TARGETS = [
  "server/knop/reportSync.ts", // 렌더 어댑터·내용해시·업로드 파이프라인·실행순서
  "server/knop/reportProcessor.ts", // 판정·상태·첨부·terminal guard
  "server/knop/reportMatch.ts", // 매칭 점수·threshold
  "server/knop/py/render_pdf.py", // PDF→PNG 렌더(고정 DPI/페이지 변환)
] as const;

// 고정 파라미터도 manifest 에 포함(코드 밖 상수가 결과를 바꾸면 반영).
export interface ManifestParams {
  renderDpiScale?: number | null; // 예: 4x
  pageConversion?: string | null;
}

export interface ManifestEntry { path: string; content: string }

// path 정렬 → {path: sha256(CRLF→LF 정규화 content)} + params → canonical → sha256. 라벨과 별개의 무결성값.
export function computeReportManifestHash(entries: ManifestEntry[], params: ManifestParams = {}): string {
  const files: Record<string, string> = {};
  for (const e of [...entries].sort((a, b) => a.path.localeCompare(b.path))) {
    files[e.path] = sha256Hex(e.content.replace(/\r\n/g, "\n"));
  }
  return sha256Hex(canonicalStringify({ files, params }));
}

// semantic label 은 코드가 정한다(Git SHA 그대로 쓰지 않음). 실제 hash 는 위 함수로.
export const INTERNAL_REPORT_PIPELINE_LABEL = "internal-report-pipeline-v1";
export const INTERNAL_REPORT_RENDERER_LABEL = "report-renderer-v1"; // render_pdf.py(PyMuPDF) 기반, 실제 lib 버전은 조사시 확인
