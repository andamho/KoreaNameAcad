import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Request, Response } from "express";
import { randomUUID } from "crypto";

const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  },
});

const BUCKET_NAME = process.env.R2_BUCKET_NAME || "";

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export class ObjectStorageService {
  constructor() {}

  async getObjectEntityUploadURL(): Promise<string> {
    const objectId = randomUUID();
    const objectKey = `uploads/${objectId}`;
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: objectKey,
    });
    const signedUrl = await getSignedUrl(r2Client, command, { expiresIn: 900 });
    return signedUrl;
  }

  normalizeObjectEntityPath(rawPath: string): string {
    try {
      const url = new URL(rawPath);
      const pathname = url.pathname;
      const uploadsIndex = pathname.indexOf("/uploads/");
      if (uploadsIndex !== -1) {
        return `/objects${pathname.slice(uploadsIndex)}`;
      }
      return rawPath;
    } catch {
      return rawPath;
    }
  }

  async getObjectEntityFile(objectPath: string): Promise<string> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }
    const key = objectPath.replace("/objects/", "");
    return key;
  }

  async downloadObject(objectKey: string, res: Response, req?: Request) {
    const extensions = ["", ".jpg", ".jpeg", ".png", ".webp", ".gif", ".mp4", ".webm", ".mov"];

    for (const ext of extensions) {
      const key = objectKey + ext;
      try {
        // Range 요청 지원 (영상 스트리밍용)
        const rangeHeader = req?.headers.range;
        if (rangeHeader) {
          const headCmd = new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: key });
          const head = await r2Client.send(headCmd);
          const totalSize = head.ContentLength || 0;
          const contentType = head.ContentType || "video/mp4";

          const rawRange = rangeHeader.replace(/bytes=/, "");
          const [startStr, endStr] = rawRange.split("-");

          let start: number;
          let end: number;

          if (startStr === "") {
            // suffix range: bytes=-N → 마지막 N 바이트
            const suffixLen = parseInt(endStr, 10);
            start = Math.max(0, totalSize - suffixLen);
            end = totalSize - 1;
          } else {
            start = parseInt(startStr, 10);
            end = endStr ? Math.min(parseInt(endStr, 10), totalSize - 1) : Math.min(start + 1024 * 1024 - 1, totalSize - 1);
          }

          if (isNaN(start) || isNaN(end) || start >= totalSize) {
            res.status(416).set("Content-Range", `bytes */${totalSize}`).end();
            return;
          }

          const chunkSize = end - start + 1;

          const command = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
            Range: `bytes=${start}-${end}`,
          });
          const data = await r2Client.send(command);
          if (!data.Body) continue;

          res.status(206).set({
            "Content-Range": `bytes ${start}-${end}/${totalSize}`,
            "Accept-Ranges": "bytes",
            "Content-Length": String(chunkSize),
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=3600",
          });
          (data.Body as any).pipe(res);
          return;
        }

        // 일반 요청: HeadObject로 Content-Length 포함
        const headCmd = new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: key });
        const head = await r2Client.send(headCmd);
        const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key });
        const data = await r2Client.send(command);
        if (!data.Body) continue;
        res.set({
          "Content-Type": head.ContentType || data.ContentType || "application/octet-stream",
          "Content-Length": String(head.ContentLength || ""),
          "Accept-Ranges": "bytes",
          "Cache-Control": "public, max-age=3600",
        });
        (data.Body as any).pipe(res);
        return;
      } catch (error: any) {
        const code = error?.Code || error?.code || error?.name || "";
        if (code.includes("NoSuchKey") || code.includes("NotFound") || code.includes("404")) {
          continue;
        }
        throw error;
      }
    }
    throw new ObjectNotFoundError();
  }
}