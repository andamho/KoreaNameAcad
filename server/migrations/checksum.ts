// 마이그레이션 파일 무결성 체크섬 — 커밋 이후 SQL/fixture 가 바뀌면 실행 거부하기 위한 근거.
// autocrlf=true 환경에서 체크아웃마다 줄끝이 CRLF↔LF 로 바뀌어도 값이 안정적이도록
// CRLF→LF 정규화 후 sha256 (= git blob(LF) 해시와 동일). lowercase 64 hex.
import fs from "fs";
import crypto from "crypto";

export function sha256Normalized(content: string): string {
  return crypto.createHash("sha256").update(content.replace(/\r\n/g, "\n"), "utf8").digest("hex");
}

export function fileSha256Normalized(absPath: string): string {
  return sha256Normalized(fs.readFileSync(absPath, "utf8"));
}

export const isSha256Hex = (s: string): boolean => /^[0-9a-f]{64}$/.test(s);
