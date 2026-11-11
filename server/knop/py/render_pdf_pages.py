# PDF 전체 페이지 → 세로로 이어붙인 PNG 1장 (링크로 보낼 이미지용).
# render_pdf.py 는 1페이지만 렌더한다(이름분석표는 1장). 작명장 PDF 는 여러 장이라 이어붙인다.
# argv: pdf경로  out.png경로  [배율(기본 4)]  [미리보기.jpg경로]
#   미리보기 = 카톡·문자 링크 카드에 뜨는 그림. 첫 장의 맨 위(가로 2 : 세로 1)만 잘라 1200x600 으로 만든다.
#   전체 그림을 그대로 쓰면 카드가 가운데를 잘라 보여 줘서 손님 이름·풀이가 카드에 보인다(2026-11-11 대표님 지적).
import sys
import fitz
from PIL import Image

GAP = 24  # 페이지 사이 흰 여백(px)


def main():
    pdf, out = sys.argv[1], sys.argv[2]
    scale = float(sys.argv[3]) if len(sys.argv) > 3 else 4.0
    thumb = sys.argv[4] if len(sys.argv) > 4 else None

    doc = fitz.open(pdf)
    imgs = []
    for page in doc:
        pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale))
        imgs.append(Image.frombytes("RGB", (pix.width, pix.height), pix.samples))
    doc.close()
    if not imgs:
        raise SystemExit("빈 PDF")

    if thumb:
        first = imgs[0]
        top = first.crop((0, 0, first.width, min(first.height, first.width // 2)))
        top.resize((1200, 600), Image.LANCZOS).save(thumb, "JPEG", quality=88)

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
