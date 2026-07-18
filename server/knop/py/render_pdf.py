# PDF 1페이지를 PNG로 렌더 (PyMuPDF). argv: pdf경로 out.png경로
import sys
import fitz

def main():
    pdf, out = sys.argv[1], sys.argv[2]
    doc = fitz.open(pdf)
    pix = doc[0].get_pixmap(matrix=fitz.Matrix(4, 4))  # 4x ≈ 288DPI (선명한 텍스트)
    pix.save(out)
    doc.close()
    print("ok")

if __name__ == "__main__":
    main()
