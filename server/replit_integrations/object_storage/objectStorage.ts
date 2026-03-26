import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Response } from "express";
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

  async downloadObject(objectKey: string, res: Response) {
    const extensions = ["", ".jpg", ".jpeg", ".png", ".webp", ".gif"];
    
    for (const ext of extensions) {
      try {
        const command = new GetObjectCommand({
          Bucket: BUCKET_NAME,
          Key: objectKey + ext,
        });

        const data = await r2Client.send(command);

        if (!data.Body) continue;

        res.set({
          "Content-Type": data.ContentType || "application/octet-stream",
          "Cache-Control": "public, max-age=3600",
        });

        const stream = data.Body as any;
        stream.pipe(res);
        return;
      } catch (error: any) {
        if (error.name === "NoSuchKey" || error.Code === "NoSuchKey") {
          continue;
        }
        throw error;
      }
    }
    
    throw new ObjectNotFoundError();
  }
  }
}