// 스트리밍 다운로드 코어(streamReadableToFile) 단위 테스트 — 실제 R2 접근 없음.
// 실행: node --import tsx/esm --test server/videoStreaming.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { Readable } from "stream";
import { statSync, unlinkSync, existsSync } from "fs";
import os from "os";
import path from "path";
import { randomUUID } from "crypto";
import { streamReadableToFile } from "./object_storage/objectStorage";

function tmp() {
  return path.join(os.tmpdir(), `strtest-${randomUUID()}.bin`);
}
function cleanup(p: string) {
  try { if (existsSync(p)) unlinkSync(p); } catch { /* ignore */ }
}
// 청크 여러 개로 쪼갠 Readable (스트리밍 경로 재현)
function chunked(total: number, chunk = 64 * 1024): Readable {
  let left = total;
  return new Readable({
    read() {
      if (left <= 0) return this.push(null);
      const n = Math.min(chunk, left);
      left -= n;
      this.push(Buffer.alloc(n, 1));
    },
  });
}

test("성공: bytes==길이 && 파일크기==bytes && ContentLength 일치", async () => {
  const p = tmp();
  try {
    const len = 300 * 1024;
    const r = await streamReadableToFile(chunked(len), p, { maxBytes: 1024 * 1024, contentLength: len });
    assert.equal(r.bytes, len);
    assert.equal(statSync(p).size, len);
  } finally { cleanup(p); }
});

test("ContentLength undefined: 상한 내면 성공", async () => {
  const p = tmp();
  try {
    const len = 128 * 1024;
    const r = await streamReadableToFile(chunked(len), p, { maxBytes: 1024 * 1024 });
    assert.equal(r.bytes, len);
    assert.equal(statSync(p).size, len);
  } finally { cleanup(p); }
});

test("사전거부: ContentLength > maxBytes 이면 다운로드 전에 throw", async () => {
  const p = tmp();
  try {
    await assert.rejects(
      () => streamReadableToFile(chunked(10), p, { maxBytes: 100, contentLength: 500 }),
      /상한 초과/,
    );
    assert.equal(existsSync(p), false); // 파일 생성 안 됨
  } finally { cleanup(p); }
});

test("스트림 도중 maxBytes 초과: 즉시 중단 throw", async () => {
  const p = tmp();
  try {
    // contentLength 미지정 → 사전거부 통과, 스트림 도중 카운터가 상한 초과 감지
    await assert.rejects(
      () => streamReadableToFile(chunked(500 * 1024), p, { maxBytes: 100 * 1024 }),
      /다운로드 상한 초과/,
    );
  } finally { cleanup(p); }
});

test("불완전(적게 받음): 받은 < ContentLength 이면 throw", async () => {
  const p = tmp();
  try {
    const actual = 100 * 1024;
    await assert.rejects(
      () => streamReadableToFile(chunked(actual), p, { maxBytes: 1024 * 1024, contentLength: actual + 5000 }),
      /불완전 다운로드/,
    );
  } finally { cleanup(p); }
});

test("과다(많이 받음): 받은 > ContentLength 이면 throw", async () => {
  const p = tmp();
  try {
    const actual = 100 * 1024;
    await assert.rejects(
      () => streamReadableToFile(chunked(actual), p, { maxBytes: 1024 * 1024, contentLength: actual - 10 }),
      /불완전 다운로드/,
    );
  } finally { cleanup(p); }
});

test("동시 2건: 서로 다른 destPath 충돌 없음", async () => {
  const p1 = tmp();
  const p2 = tmp();
  try {
    const [a, b] = await Promise.all([
      streamReadableToFile(chunked(70 * 1024), p1, { maxBytes: 1024 * 1024, contentLength: 70 * 1024 }),
      streamReadableToFile(chunked(90 * 1024), p2, { maxBytes: 1024 * 1024, contentLength: 90 * 1024 }),
    ]);
    assert.equal(a.bytes, 70 * 1024);
    assert.equal(b.bytes, 90 * 1024);
    assert.equal(statSync(p1).size, 70 * 1024);
    assert.equal(statSync(p2).size, 90 * 1024);
  } finally { cleanup(p1); cleanup(p2); }
});
