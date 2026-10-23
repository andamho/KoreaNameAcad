// 스레드 게시(server/threads.ts) — 가짜 Threads API 로 흐름 검증(실제 게시 안 함). 2026-10-23
import { test } from "node:test";
import assert from "node:assert/strict";

delete process.env.DATABASE_URL;
delete process.env.NEON_DATABASE_URL;
process.env.THREADS_ACCESS_TOKEN = "env-token";

const T = await import("../../server/threads");
const noSleep = async () => {};

/** 호출 기록을 남기는 가짜 fetch. handler(url, body) → 응답 JSON */
function fake(handler: (url: string, body: URLSearchParams | null) => any) {
  const calls: { url: string; body: URLSearchParams | null }[] = [];
  const f = (async (url: any, init?: any) => {
    const body = init?.body instanceof URLSearchParams ? init.body : null;
    calls.push({ url: String(url), body });
    const j = handler(String(url), body);
    return { ok: !j?.error, json: async () => j } as any;
  }) as typeof fetch;
  return { f, calls };
}

test("글자 수·주제 태그 정리", () => {
  assert.equal(T.textLength("힘들 때 🌸"), 6);
  assert.equal(T.cleanTopicTag("#이름풀이"), "이름풀이");
  assert.equal(T.cleanTopicTag("a.b&c"), "abc");
  assert.equal(T.cleanTopicTag(""), undefined);
  assert.equal(Array.from(T.cleanTopicTag("가".repeat(80))!).length, 50);
});

test("영상 → 처리 대기 → 게시 → 첫 답글(링크) 순서, 토큰은 env 에서", async () => {
  let polls = 0;
  const { f, calls } = fake((url, body) => {
    if (url.includes("refresh_access_token")) return { error: { message: "too new" } };   // 24시간 안: 연장 거절 → 그대로 사용
    if (url.endsWith("/me/threads") && body?.get("media_type") === "VIDEO") return { id: "C1" };
    if (url.includes("/C1?")) return { status: ++polls < 2 ? "IN_PROGRESS" : "FINISHED" };
    if (url.endsWith("/me/threads_publish") && body?.get("creation_id") === "C1") return { id: "P1" };
    if (url.includes("/P1?fields=permalink")) return { permalink: "https://www.threads.com/@x/post/abc" };
    if (url.endsWith("/me/threads") && body?.get("media_type") === "TEXT") return { id: "C2" };
    if (url.includes("/C2?")) return { status: "FINISHED" };
    if (url.endsWith("/me/threads_publish") && body?.get("creation_id") === "C2") return { id: "R1" };
    return { error: { message: "unexpected " + url } };
  });
  const r = await T.publishThreadsVideo(
    { videoUrl: "https://korea-name-acad.com/objects/uploads/v", text: "힘들 때 되뇌는 말, 있으세요?", topicTag: "#좋은글귀", replyText: "상담 안내예요", replyLink: "https://korea-name-acad.com?open=analysis" },
    { f, sleep: noSleep },
  );
  assert.deepEqual(r, { postId: "P1", permalink: "https://www.threads.com/@x/post/abc", replyId: "R1", replyError: undefined });
  const video = calls.find((c) => c.body?.get("media_type") === "VIDEO")!.body!;
  assert.equal(video.get("video_url"), "https://korea-name-acad.com/objects/uploads/v");
  assert.equal(video.get("topic_tag"), "좋은글귀");
  assert.equal(video.get("access_token"), "env-token");
  const reply = calls.find((c) => c.body?.get("media_type") === "TEXT")!.body!;
  assert.equal(reply.get("reply_to_id"), "P1");
  assert.equal(reply.get("link_attachment"), "https://korea-name-acad.com?open=analysis");
  assert.ok(polls >= 2, "처리 끝날 때까지 상태를 다시 봄");
});

test("500자 넘으면 아예 올리지 않음", async () => {
  const { f, calls } = fake(() => ({ id: "X" }));
  await assert.rejects(T.publishThreadsVideo({ videoUrl: "https://a/b.mp4", text: "가".repeat(501) }, { f, sleep: noSleep }), /500자/);
  assert.equal(calls.length, 0);
});

test("영상 처리 실패(ERROR)면 게시하지 않고 오류", async () => {
  const { f, calls } = fake((url, body) => {
    if (url.includes("refresh_access_token")) return { error: {} };
    if (body?.get("media_type") === "VIDEO") return { id: "C1" };
    if (url.includes("/C1?")) return { status: "ERROR", error_message: "INVALID_FRAME_RATE" };
    return { id: "SHOULD_NOT" };
  });
  await assert.rejects(T.publishThreadsVideo({ videoUrl: "https://a/b.mp4", text: "글" }, { f, sleep: noSleep }), /INVALID_FRAME_RATE/);
  assert.ok(!calls.some((c) => c.url.endsWith("/me/threads_publish")));
});

test("첫 답글이 실패해도 본 글 결과는 돌려줌", async () => {
  const { f } = fake((url, body) => {
    if (url.includes("refresh_access_token")) return { error: {} };
    if (body?.get("media_type") === "VIDEO") return { id: "C1" };
    if (url.includes("/C1?")) return { status: "FINISHED" };
    if (url.endsWith("/me/threads_publish")) return { id: "P1" };
    if (url.includes("permalink")) return {};
    if (body?.get("media_type") === "TEXT") return { error: { message: "no permission" } };
    return {};
  });
  const r = await T.publishThreadsVideo({ videoUrl: "https://a/b.mp4", text: "글", replyText: "답글" }, { f, sleep: noSleep });
  assert.equal(r.postId, "P1");
  assert.match(r.replyError!, /no permission/);
});

test("상태 확인은 계정명만, 토큰 값은 돌려주지 않음", async () => {
  const { f } = fake((url) => url.includes("refresh_access_token") ? { error: {} } : { id: "1", username: "whats_ur_name.777" });
  const s = await T.getThreadsStatus(f);
  assert.equal(s.connected, true);
  assert.equal(s.username, "whats_ur_name.777");
  assert.ok(!JSON.stringify(s).includes("env-token"));
});
