import { useState } from "react";
import { Upload, X, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

interface ImageManagerProps {
  images: string[];
  onImagesChange: (images: string[]) => void;
  thumbnail: string;
  onThumbnailChange: (thumbnail: string) => void;
  onUpload: (file: File) => Promise<unknown>;
  isUploading: boolean;
}

export function ImageManager({
  images,
  onImagesChange,
  thumbnail,
  onThumbnailChange,
  onUpload,
  isUploading,
}: ImageManagerProps) {
  const { toast } = useToast();
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // 사진 붙이기. 예전에는 실패해도 아무 표시가 없어서 "그냥 안 붙는다"로 보였다.
  // 실패한 파일 이름과 이유를 반드시 알려준다.
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const failed: string[] = [];
      let done = 0;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        // 브라우저가 형식을 못 읽는 경우가 있다(빈 값). 그때도 그림 파일이면 그대로 시도한다.
        const looksImage = file.type.startsWith("image/") || /\.(jpe?g|png|gif|webp|avif|bmp|heic|heif)$/i.test(file.name);
        if (!looksImage) {
          failed.push(`${file.name} (그림 파일이 아님)`);
          continue;
        }
        try {
          await onUpload(file);
          done++;
        } catch (err: any) {
          failed.push(`${file.name} (${err?.message || "올리기 실패"})`);
        }
      }
      if (failed.length) {
        toast({
          title: `사진 ${failed.length}장을 올리지 못했습니다`,
          description: failed.join(" / "),
          variant: "destructive",
        });
      } else if (done > 1) {
        toast({ title: `사진 ${done}장을 추가했습니다` });
      }
    }
    e.target.value = "";
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", index.toString());
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIndex(index);
  };

  const handleDragLeave = () => {
    setDragOverIndex(null);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      setDragOverIndex(null);
      return;
    }

    const newImages = [...images];
    const [draggedItem] = newImages.splice(draggedIndex, 1);
    newImages.splice(dropIndex, 0, draggedItem);
    onImagesChange(newImages);

    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const moveImage = (fromIndex: number, direction: 'up' | 'down') => {
    const toIndex = direction === 'up' ? fromIndex - 1 : fromIndex + 1;
    if (toIndex < 0 || toIndex >= images.length) return;
    
    const newImages = [...images];
    [newImages[fromIndex], newImages[toIndex]] = [newImages[toIndex], newImages[fromIndex]];
    onImagesChange(newImages);
  };

  const removeImage = (index: number) => {
    const removedImage = images[index];
    const newImages = images.filter((_, i) => i !== index);
    onImagesChange(newImages);
    if (thumbnail === removedImage) {
      onThumbnailChange(newImages[0] || "");
    }
  };

  const setAsThumbnail = (imageUrl: string) => {
    onThumbnailChange(imageUrl);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>이미지</Label>
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isUploading}
            className="h-8 p-0"
            asChild
          >
            <label className="cursor-pointer flex items-center px-3 h-full">
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFileChange}
                disabled={isUploading}
              />
              {isUploading ? "업로드 중..." : (
                <>
                  <Upload className="w-4 h-4 mr-1" />
                  이미지 추가
                </>
              )}
            </label>
          </Button>
        </div>
      </div>

      {images.length > 0 && (
        <div className="grid grid-cols-4 gap-2 mt-2">
          {images.map((img, idx) => (
            <div
              key={img}
              draggable={true}
              onDragStart={(e) => handleDragStart(e, idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, idx)}
              onDragEnd={handleDragEnd}
              style={{ cursor: 'grab' }}
              className={`relative aspect-square rounded overflow-hidden border-2 transition-all ${
                thumbnail === img ? 'border-primary' : 'border-transparent'
              } ${dragOverIndex === idx ? 'ring-2 ring-blue-400 scale-105' : ''} ${
                draggedIndex === idx ? 'opacity-50' : ''
              }`}
            >
              <img src={img} alt="" className="w-full h-full object-cover" />
              
              {/* 순번 표시 (왼쪽 상단) */}
              <span className="absolute top-0.5 left-0.5 text-white/90 text-[0.625rem] font-bold bg-black/60 px-1.5 py-0.5 rounded z-10">{idx + 1}</span>
              
              {/* 삭제 버튼 (오른쪽 상단) - 드래그 방지 */}
              <button
                type="button"
                draggable={false}
                className="absolute top-0.5 right-0.5 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 z-20"
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  removeImage(idx);
                }}
              >
                <X className="w-4 h-4" />
              </button>
              
              {/* 대표 표시 (왼쪽 하단) */}
              {thumbnail === img && (
                <div className="absolute bottom-0.5 left-0.5 bg-primary text-primary-foreground text-[0.625rem] px-1 rounded z-10">
                  대표
                </div>
              )}
              
              {/* 순서 변경 버튼 (오른쪽 하단) - 드래그 방지 */}
              <div className="absolute bottom-0.5 right-0.5 flex gap-0.5 z-10">
                <button
                  type="button"
                  draggable={false}
                  className="w-5 h-5 bg-white/90 rounded flex items-center justify-center disabled:opacity-30"
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); e.preventDefault(); moveImage(idx, 'up'); }}
                  disabled={idx === 0}
                >
                  <ChevronUp className="w-3 h-3 text-black" />
                </button>
                <button
                  type="button"
                  draggable={false}
                  className="w-5 h-5 bg-white/90 rounded flex items-center justify-center disabled:opacity-30"
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); e.preventDefault(); moveImage(idx, 'down'); }}
                  disabled={idx === images.length - 1}
                >
                  <ChevronDown className="w-3 h-3 text-black" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        화살표(▲▼)로 순서 변경 / 이미지 클릭하여 대표 선택
      </p>
    </div>
  );
}
