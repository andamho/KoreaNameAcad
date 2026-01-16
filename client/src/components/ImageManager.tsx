import { useState, useRef } from "react";
import { Upload, X, ChevronUp, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type.startsWith("image/")) {
          await onUpload(file);
        }
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
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="h-8"
          >
            {isUploading ? "업로드 중..." : (
              <>
                <Upload className="w-4 h-4 mr-1" />
                이미지 추가
              </>
            )}
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
              <span className="absolute top-0.5 left-0.5 text-white/90 text-[10px] font-bold bg-black/60 px-1.5 py-0.5 rounded z-10">{idx + 1}</span>
              
              {/* 삭제 버튼 (오른쪽 상단) */}
              <button
                type="button"
                className="absolute top-0.5 right-0.5 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 z-20"
                onClick={(e) => {
                  e.stopPropagation();
                  removeImage(idx);
                }}
              >
                <X className="w-4 h-4" />
              </button>
              
              {/* 대표 표시 (왼쪽 하단) */}
              {thumbnail === img && (
                <div className="absolute bottom-0.5 left-0.5 bg-primary text-primary-foreground text-[10px] px-1 rounded z-10">
                  대표
                </div>
              )}
              
              {/* 순서 변경 버튼 (오른쪽 하단) */}
              <div className="absolute bottom-0.5 right-0.5 flex gap-0.5 z-10">
                <button
                  type="button"
                  className="w-5 h-5 bg-white/90 rounded flex items-center justify-center disabled:opacity-30"
                  onClick={(e) => { e.stopPropagation(); moveImage(idx, 'up'); }}
                  disabled={idx === 0}
                >
                  <ChevronUp className="w-3 h-3 text-black" />
                </button>
                <button
                  type="button"
                  className="w-5 h-5 bg-white/90 rounded flex items-center justify-center disabled:opacity-30"
                  onClick={(e) => { e.stopPropagation(); moveImage(idx, 'down'); }}
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
