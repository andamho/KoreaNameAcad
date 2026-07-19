// renderer 버전 guard — 실제 PyMuPDF 버전이 기대와 다르면 fail-closed(artifact 생성 전 중단).
// ⚠️ 이번 Gate 는 운영 render 경로(reportSync/render_pdf.py)를 수정하지 않는다. 별도 validator·테스트·계약만.
export const EXPECTED_RENDERER = {
  library: "pymupdf",
  libraryVersion: "1.28.0", // 실제 확인(video-caption-bot/venv), requirements-report-renderer.txt 로 고정
  mupdfVersion: "1.29.0",
  dpiScale: 4, // fitz.Matrix(4,4) ≈ 288DPI
  outputFormat: "png",
} as const;

export type RendererGuardCode = "RENDERER_LIBRARY_VERSION_MISMATCH" | "RENDERER_LIBRARY_NOT_AVAILABLE";

// 실제 실행환경에서 조회한 값과 대조. 오류에 경로·고객정보 없음(코드만).
export function checkRendererVersion(actual: { library?: string | null; libraryVersion?: string | null }): { ok: true } | { ok: false; code: RendererGuardCode } {
  if (!actual.library || !actual.libraryVersion) return { ok: false, code: "RENDERER_LIBRARY_NOT_AVAILABLE" };
  if (actual.library.toLowerCase() !== EXPECTED_RENDERER.library || actual.libraryVersion !== EXPECTED_RENDERER.libraryVersion) {
    return { ok: false, code: "RENDERER_LIBRARY_VERSION_MISMATCH" };
  }
  return { ok: true };
}
