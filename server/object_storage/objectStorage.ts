import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Request, Response } from "express";
import { randomUUID } from "crypto";
import { createWriteStream } from "fs";
import { pipeline } from "stream/promises";
import { Readable, Transform } from "stream";

/**
 * R2 영상 키 검증 — 임의 값/경로탈출/스킴 주입 차단(SSRF·경로 안전).
 * 허용: uploads/ prefix. 거부: .., 역슬래시, URL scheme(://), NUL·제어문자.
 */
export function validateR2VideoKey(key: unknown): string {
  if (typeof key !== "string" || !key) throw new Error("R2 key empty");
  if (!key.startsWith("uploads/")) throw new Error("key not under uploads/");
  if (key.includes("..") || key.includes("\\") || key.includes("://")) {
    throw new Error("invalid key (traversal/scheme)");
  }
  for (let i = 0; i < key.length; i++) {
    if (key.charCodeAt(i) < 32) throw new Error("invalid key (control char)");
  }
  return key;
}

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

/**
 * Node Readable을 파일로 스트리밍하며 상한/무결성을 강제하는 공통 코어(단위 테스트 대상).
 * - contentLength가 maxBytes보다 크면 즉시 거부(다운로드 전).
 * - 스트림 도중 누적 바이트가 maxBytes를 넘으면 counter가 에러 → pipeline이 스트림/파일을 파괴(즉시 중단).
 * - 성공 시 실제 파일 크기 == 누적 counter(bytes). contentLength가 있으면 정확히 일치해야 함(적게/많이 받으면 실패).
 * - 실패 시 destPath 정리는 caller 책임(부분 임시파일 제거).
 */
export async function streamReadableToFile(
  body: Readable,
  destPath: string,
  opts: { maxBytes: number; contentLength?: number },
): Promise<{ bytes: number }> {
  const { maxBytes, contentLength } = opts;
  if (contentLength !== undefined && contentLength > maxBytes) {
    throw new Error(`R2 객체 상한 초과: ${contentLength} > ${maxBytes}`);
  }
  let bytes = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      bytes += chunk.length;
      if (bytes > maxBytes) return cb(new Error(`다운로드 상한 초과(>${maxBytes})`));
      cb(null, chunk);
    },
  });
  await pipeline(body, counter, createWriteStream(destPath));
  if (contentLength !== undefined && bytes !== contentLength) {
    throw new Error(`불완전 다운로드: 받은 ${bytes} != ContentLength ${contentLength}`);
  }
  return { bytes };
}

export class ObjectStorageService {
  constructor() {}

  async putObject(key: string, buffer: Buffer, contentType: string): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    });
    await r2Client.send(command);
  }

  // R2 객체 전체를 버퍼로 읽기 (유튜브 등 외부 업로드용)
  async getObjectBuffer(key: string): Promise<{ buffer: Buffer; contentType: string }> {
    const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key });
    const resp = await r2Client.send(command);
    if (!resp.Body) throw new ObjectNotFoundError();
    const bytes = await (resp.Body as any).transformToByteArray();
    return { buffer: Buffer.from(bytes), contentType: resp.ContentType || "video/mp4" };
  }

  /**
   * R2 객체를 로컬 임시파일로 스트리밍(전체 Buffer 미생성 — 파일크기 비례 메모리 점유 제거,
   * 제한된 스트림 버퍼만 사용). 바이트수·ContentType·ContentLength·다운로드시간 반환.
   * 상한 초과/불완전 다운로드 감지. 실패 시 caller가 destPath 정리.
   */
  async streamObjectToFile(
    key: string,
    destPath: string,
    opts?: { maxBytes?: number },
  ): Promise<{ bytes: number; contentType: string; contentLength?: number; downloadMs: number }> {
    const maxBytes = opts?.maxBytes ?? 2 * 1024 * 1024 * 1024; // 기본 2GB 상한
    const t0 = Date.now();
    const resp = await r2Client.send(new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
    if (!resp.Body) throw new ObjectNotFoundError();
    const body = resp.Body as unknown;
    // 서버(Node) 환경에서 S3 SDK Body는 Node Readable. 브라우저 ReadableStream 등은 미지원.
    if (!(body instanceof Readable) && typeof (body as any)?.pipe !== "function") {
      throw new Error("R2 Body가 Node Readable이 아님(스트리밍 불가)");
    }
    const contentLength = resp.ContentLength;
    const contentType = resp.ContentType || "";
    const { bytes } = await streamReadableToFile(body as Readable, destPath, { maxBytes, contentLength });
    const downloadMs = Date.now() - t0;
    return { bytes, contentType, contentLength, downloadMs };
  }

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

        // 일반 요청: HeadObject로 Content-Length 포함 후 writeHead로 강제 전송
        const headCmd = new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: key });
        const head = await r2Client.send(headCmd);
        const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: key });
        const data = await r2Client.send(command);
        if (!data.Body) continue;
        res.writeHead(200, {
          "content-type": head.ContentType || data.ContentType || "application/octet-stream",
          "content-length": String(head.ContentLength ?? ""),
          "accept-ranges": "bytes",
          "cache-control": "public, max-age=3600",
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