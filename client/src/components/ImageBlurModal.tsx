import { useRef, useEffect, useState, useCallback } from "react";
import { X } from "lucide-react";

interface Props {
  src: string;
  onApply: (newSrc: string) => void;
  onClose: () => void;
}

interface Rect { x: number; y: number; w: number; h: number; }

export function ImageBlurModal({ src, onApply, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [displaySize, setDisplaySize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [selection, setSelection] = useState<Rect | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    const mountCanvas = (img: HTMLImageElement) => {
      imageRef.current = img;
      const MAX_W = Math.min(680, window.innerWidth - 80);
      const MAX_H = Math.min(500, window.innerHeight - 220);
      const ratio = Math.min(MAX_W / img.naturalWidth, MAX_H / img.naturalHeight, 1);
      const dw = Math.round(img.naturalWidth * ratio);
      const dh = Math.round(img.naturalHeight * ratio);
      setDisplaySize({ w: dw, h: dh });
      setTimeout(() => {
        if (!canvasRef.current) return;
        canvasRef.current.width = dw;
        canvasRef.current.height = dh;
        const ctx = canvasRef.current.getContext("2d");
        if (ctx) ctx.drawImage(img, 0, 0, dw, dh);
      }, 0);
    };

    // First try with crossOrigin
    const img1 = new Image();
    img1.crossOrigin = "anonymous";
    img1.onload = () => mountCanvas(img1);
    img1.onerror = () => {
      // Fallback: no crossOrigin (canvas will be tainted but preview still works)
      const img2 = new Image();
      img2.onload = () => mountCanvas(img2);
      img2.onerror = () => setLoadError(true);
      img2.src = src;
    };
    img1.src = src;
  }, [src]);

  const getPos = (e: React.MouseEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(e.clientX - rect.left, displaySize.w)),
      y: Math.max(0, Math.min(e.clientY - rect.top, displaySize.h)),
    };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const pos = getPos(e);
    setDragStart(pos);
    setSelection({ x: pos.x, y: pos.y, w: 0, h: 0 });
    setIsDragging(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const pos = getPos(e);
    setSelection({
      x: Math.min(dragStart.x, pos.x),
      y: Math.min(dragStart.y, pos.y),
      w: Math.abs(pos.x - dragStart.x),
      h: Math.abs(pos.y - dragStart.y),
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  const applyBlur = useCallback(() => {
    if (!selection || selection.w < 5 || selection.h < 5) return;
    const img = imageRef.current;
    if (!img) return;

    const scaleX = img.naturalWidth / displaySize.w;
    const scaleY = img.naturalHeight / displaySize.h;
    const rx = Math.round(selection.x * scaleX);
    const ry = Math.round(selection.y * scaleY);
    const rw = Math.max(1, Math.round(selection.w * scaleX));
    const rh = Math.max(1, Math.round(selection.h * scaleY));

    const mainCanvas = document.createElement("canvas");
    mainCanvas.width = img.naturalWidth;
    mainCanvas.height = img.naturalHeight;
    const mainCtx = mainCanvas.getContext("2d")!;

    try {
      mainCtx.drawImage(img, 0, 0);
    } catch {
      alert("이미지 처리가 불가합니다.\n(외부 이미지 CORS 제한)");
      return;
    }

    // Blur with padding to prevent edge clipping
    const pad = 24;
    const tmpCanvas = document.createElement("canvas");
    tmpCanvas.width = rw + pad * 2;
    tmpCanvas.height = rh + pad * 2;
    const tmpCtx = tmpCanvas.getContext("2d")!;
    tmpCtx.filter = "blur(14px)";
    tmpCtx.drawImage(
      mainCanvas,
      Math.max(0, rx - pad), Math.max(0, ry - pad),
      rw + pad * 2, rh + pad * 2,
      0, 0,
      rw + pad * 2, rh + pad * 2,
    );

    // Composite blurred region back (crop out the padding)
    mainCtx.drawImage(tmpCanvas, pad, pad, rw, rh, rx, ry, rw, rh);

    const newSrc = mainCanvas.toDataURL("image/jpeg", 0.92);
    onApply(newSrc);
  }, [selection, displaySize, onApply]);

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-2xl shadow-2xl p-5 flex flex-col gap-4"
        style={{ maxWidth: "calc(100vw - 32px)" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-base">블러 처리</h3>
            <p className="text-xs text-muted-foreground mt-0.5">드래그해서 블러 처리할 영역을 선택하세요</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {loadError ? (
          <p className="text-sm text-red-500 py-10 text-center">이미지를 불러올 수 없습니다.</p>
        ) : (
          <div
            className="relative select-none rounded overflow-hidden border border-border"
            style={{ width: displaySize.w || 300, height: displaySize.h || 200, background: "#111" }}
          >
            <canvas
              ref={canvasRef}
              className="block cursor-crosshair"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            />
            {selection && selection.w > 2 && selection.h > 2 && (
              <div
                className="absolute pointer-events-none"
                style={{
                  left: selection.x,
                  top: selection.y,
                  width: selection.w,
                  height: selection.h,
                  outline: "2px dashed white",
                  boxShadow: "0 0 0 9999px rgba(0,0,0,0.42)",
                  boxSizing: "border-box",
                }}
              />
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm rounded-lg border border-border hover:bg-muted transition"
          >
            취소
          </button>
          <button
            onClick={applyBlur}
            disabled={!selection || selection.w < 5 || selection.h < 5 || loadError}
            className="px-4 py-1.5 text-sm rounded-lg bg-[#18a999] text-white font-bold hover:bg-[#149085] disabled:opacity-40 transition"
          >
            블러 적용
          </button>
        </div>
      </div>
    </div>
  );
}
