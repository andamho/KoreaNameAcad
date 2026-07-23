# PDF 1페이지 → 문자(MMS) 전용 저용량 JPEG.
# 목표 용량(기본 250KB) 이하가 되는 '가장 선명한' 조합을 해상도 높은 쪽부터 탐색.
# argv: pdf경로  out.jpg경로  [목표KB]
import sys
import fitz

def main():
    pdf, out = sys.argv[1], sys.argv[2]
    target_kb = int(sys.argv[3]) if len(sys.argv) > 3 else 250
    limit = target_kb * 1024

    doc = fitz.open(pdf)
    page = doc[0]
    smallest = None  # 목표를 못 맞추면 그중 가장 작은 것

    # 해상도를 우선 크게(글자 가독성) 하되, JPEG 품질은 68 밑으로는 안 내림(얼룩 방지).
    # 각 해상도에서 품질 높은 것부터 시도 → 목표 이하 되면 채택. 큰 해상도부터 훑음.
    for scale in (1.6, 1.4, 1.2, 1.0, 0.9):
        pix = page.get_pixmap(matrix=fitz.Matrix(scale, scale))
        for q in (80, 74, 68):
            data = pix.tobytes("jpeg", jpg_quality=q)
            if smallest is None or len(data) < len(smallest):
                smallest = data
            if len(data) <= limit:
                with open(out, "wb") as f:
                    f.write(data)
                print(f"ok scale={scale} q={q} {pix.width}x{pix.height} {len(data)//1024}KB")
                doc.close()
                return

    with open(out, "wb") as f:
        f.write(smallest)
    print(f"ok-min {len(smallest)//1024}KB")
    doc.close()

if __name__ == "__main__":
    main()
