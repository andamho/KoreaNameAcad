# PDF 전체 페이지 → 세로로 이어붙인 PNG 1장 (링크로 보낼 이미지용).
# render_pdf.py 는 1페이지만 렌더한다(이름분석표는 1장). 작명장 PDF 는 여러 장이라 이어붙인다.
# argv: pdf경로  out.png경로  [배율(기본 4)]
import sys
import fitz
from PIL import Image

GAP = 24  # 페이지 사이 흰 여백(px)


def main():
    pdf, out = sys.argv[1], sys.argv[2]
    scale = float(sys.argv[3]) if len(sys.argv) > 3 else 4.0

    doc = fitz.open(pdf)
    imgs = []
    for page in doc:
        pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale))
        imgs.append(Image.frombytes("RGB", (pix.width, pix.height), pix.samples))
    doc.close()
    if not imgs:
        raise SystemExit("빈 PDF")

    if len(imgs) == 1:
        canvas = imgs[0]
    else:
        w = max(i.width for i in imgs)
        h = sum(i.height for i in imgs) + GAP * (len(imgs) - 1)
        canvas = Image.new("RGB", (w, h), (255, 255, 255))
        y = 0
        for i in imgs:
            canvas.paste(i, ((w - i.width) // 2, y))
            y += i.height + GAP

    canvas.save(out, "PNG", optimize=True)
    print(f"ok {len(imgs)}p {canvas.width}x{canvas.height}")


if __name__ == "__main__":
    main()
