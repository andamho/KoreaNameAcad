import { useState, useCallback, useRef } from "react";
import type { UppyFile } from "@uppy/core";

interface UploadMetadata {
  name: string;
  size: number;
  contentType: string;
}

interface UploadResponse {
  uploadURL: string;
  objectPath: string;
  metadata: UploadMetadata;
}

interface UseUploadOptions {
  onSuccess?: (response: UploadResponse) => void;
  onError?: (error: Error) => void;
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
}

async function compressImage(
  file: File,
  maxWidth: number = 1200,
  maxHeight: number = 1200,
  quality: number = 0.8
): Promise<File> {
  if (!file.type.startsWith("image/")) {
    return file;
  }
  
  if (file.type === "image/gif" || file.type === "image/svg+xml") {
    return file;
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    img.onload = () => {
      let { width, height } = img;

      if (width <= maxWidth && height <= maxHeight && file.size < 500 * 1024) {
        resolve(file);
        return;
      }

      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }
      if (height > maxHeight) {
        width = (width * maxHeight) / height;
        height = maxHeight;
      }

      canvas.width = width;
      canvas.height = height;

      if (!ctx) {
        resolve(file);
        return;
      }

      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }

          const ext = file.type === "image/png" ? ".png" : ".jpg";
          const baseName = file.name.replace(/\.[^/.]+$/, "");
          const compressedFile = new File([blob], baseName + ext, {
            type: file.type === "image/png" ? "image/png" : "image/jpeg",
            lastModified: Date.now(),
          });

          if (compressedFile.size < file.size) {
            console.log(`Image compressed: ${(file.size / 1024).toFixed(1)}KB → ${(compressedFile.size / 1024).toFixed(1)}KB`);
            resolve(compressedFile);
          } else {
            resolve(file);
          }
        },
        file.type === "image/png" ? "image/png" : "image/jpeg",
        quality
      );
    };

    img.onerror = () => {
      resolve(file);
    };

    img.src = URL.createObjectURL(file);
  });
}

export function useUpload(options: UseUploadOptions = {}) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [progress, setProgress] = useState(0);

  const { maxWidth = 1200, maxHeight = 1200, quality = 0.8 } = options;
  
  // Use ref to always have the latest callbacks without causing re-renders
  // Update synchronously on every render to ensure we always have the latest
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const requestUploadUrl = useCallback(
    async (file: File): Promise<UploadResponse> => {
      const response = await fetch("/api/uploads/request-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type || "application/octet-stream",
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to get upload URL");
      }

      return response.json();
    },
    []
  );

  const uploadToPresignedUrl = useCallback(
    async (file: File, uploadURL: string): Promise<void> => {
      const response = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type || "application/octet-stream",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to upload file to storage");
      }
    },
    []
  );

  const uploadFile = useCallback(
    async (file: File): Promise<UploadResponse | null> => {
      console.log("[useUpload] uploadFile called for:", file.name);
      setIsUploading(true);
      setError(null);
      setProgress(0);

      try {
        setProgress(5);
        console.log("[useUpload] compressing image...");
        const compressedFile = await compressImage(file, maxWidth, maxHeight, quality);
        console.log("[useUpload] compression done, file size:", compressedFile.size);
        
        setProgress(15);
        console.log("[useUpload] requesting upload URL...");
        console.log("[useUpload] file details:", compressedFile.name, compressedFile.type, compressedFile.size);
        const uploadResponse = await requestUploadUrl(compressedFile);
        console.log("[useUpload] requestUploadUrl succeeded");
        console.log("[useUpload] got upload URL:", uploadResponse.objectPath);

        setProgress(40);
        console.log("[useUpload] uploading to presigned URL...");
        await uploadToPresignedUrl(compressedFile, uploadResponse.uploadURL);
        console.log("[useUpload] upload complete!");

        setProgress(100);
        console.log("[useUpload] calling onSuccess callback...");
        console.log("[useUpload] optionsRef.current:", optionsRef.current);
        console.log("[useUpload] onSuccess exists:", !!optionsRef.current.onSuccess);
        // Use ref to get the latest callback
        if (optionsRef.current.onSuccess) {
          try {
            optionsRef.current.onSuccess(uploadResponse);
            console.log("[useUpload] onSuccess callback executed successfully");
          } catch (callbackError) {
            console.error("[useUpload] onSuccess callback threw error:", callbackError);
          }
        } else {
          console.warn("[useUpload] onSuccess callback is undefined!");
        }
        console.log("[useUpload] onSuccess callback completed");
        return uploadResponse;
      } catch (err) {
        console.error("[useUpload] error:", err);
        const error = err instanceof Error ? err : new Error("Upload failed");
        setError(error);
        // Use ref to get the latest callback
        optionsRef.current.onError?.(error);
        return null;
      } finally {
        setIsUploading(false);
      }
    },
    [requestUploadUrl, uploadToPresignedUrl, maxWidth, maxHeight, quality]
  );

  const getUploadParameters = useCallback(
    async (
      file: UppyFile<Record<string, unknown>, Record<string, unknown>>
    ): Promise<{
      method: "PUT";
      url: string;
      headers?: Record<string, string>;
    }> => {
      const response = await fetch("/api/uploads/request-url", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type || "application/octet-stream",
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get upload URL");
      }

      const data = await response.json();
      return {
        method: "PUT",
        url: data.uploadURL,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      };
    },
    []
  );

  return {
    uploadFile,
    getUploadParameters,
    isUploading,
    error,
    progress,
  };
}
