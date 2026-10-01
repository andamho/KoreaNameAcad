// 관리자가 고객정보에 PDF 를 직접 첨부하면, 올리기 전에 브라우저에서 이미지(PNG)로 바꾼다.
//
// 원장님 요청(2026-10-01): 자동 반입되는 이름분석표처럼, 손으로 찾아 붙인 PDF 도
// 열지 않고 바로 볼 수 있게 이미지로 넣어 달라.
//  · 이름분석표 워커(render_pdf.py)와 같은 4배(≈288DPI) 해상도로 그린다.
//  · 여러 쪽이면 위에서 아래로 이어 붙여 한 장으로 만든다(작명장 링크와 같은 방식).
//  · 너무 길거나 크면 브라우저 캔버스 한계를 넘지 않게 배율을 낮춘다.
// 서버에는 아무것도 안 깔아도 되도록 pdf.js 를 쓰고, 필요할 때만 불러온다(관리자 화면 첫 로딩 무관).

const PDFJS_VERSION = "4.10.38";
const MAX_SCALE = 4;
const MAX_HEIGHT = 30000; // 크롬 캔버스 한 변 한계(32767) 아래로
const MAX_AREA = 120_000_000; // 메모리 여유를 둔 총 픽셀 수

export function isPdf(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

export async function pdfToPng(file: File): Promise<File> {
  const pdfjs = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const doc = await pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    // 글꼴을 품지 않은 한글 PDF 대비(한글 프로그램이 내보낸 PDF 는 보통 품고 있다)
    cMapUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/standard_fonts/`,
  }).promise;

  try {
    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) pages.push(await doc.getPage(i));

    // 1배 크기로 전체 치수를 재고, 한계 안에 드는 가장 큰 배율을 고른다.
    const base = pages.map((p) => p.getViewport({ scale: 1 }));
    const w1 = Math.max(...base.map((v) => v.width));
    const h1 = base.reduce((s, v) => s + v.height, 0);
    const scale = Math.min(MAX_SCALE, MAX_HEIGHT / h1, Math.sqrt(MAX_AREA / (w1 * h1)));

    const views = pages.map((p) => p.getViewport({ scale }));
    const width = Math.ceil(Math.max(...views.map((v) => v.width)));
    const height = Math.ceil(views.reduce((s, v) => s + v.height, 0));

    const out = document.createElement("canvas");
    out.width = width;
    out.height = height;
    const ctx = out.getContext("2d")!;
    ctx.fillStyle = "#ffffff"; // 투명 배경이면 어두운 화면에서 글씨가 안 보인다
    ctx.fillRect(0, 0, width, height);

    let y = 0;
    for (let i = 0; i < pages.length; i++) {
      const v = views[i];
      const c = document.createElement("canvas");
      c.width = Math.ceil(v.width);
      c.height = Math.ceil(v.height);
      // intent "print": 화면용(display) 그리기는 requestAnimationFrame 을 기다려서, 변환 중에
      // 다른 탭으로 넘어가면 멈춘다. 인쇄용은 기다리지 않고 끝까지 그린다.
      await pages[i].render({ canvasContext: c.getContext("2d")!, viewport: v, intent: "print" }).promise;
      ctx.drawImage(c, Math.floor((width - c.width) / 2), Math.round(y));
      y += v.height;
      c.width = c.height = 0; // 쪽마다 메모리 바로 돌려준다
    }

    const blob: Blob = await new Promise((res, rej) =>
      out.toBlob((b) => (b ? res(b) : rej(new Error("이미지 만들기 실패"))), "image/png"),
    );
    out.width = out.height = 0;
    return new File([blob], file.name.replace(/\.pdf$/i, "") + ".png", { type: "image/png" });
  } finally {
    await doc.destroy();
  }
}
