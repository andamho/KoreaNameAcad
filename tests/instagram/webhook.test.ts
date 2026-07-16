// 인스타 웹훅 서명 검증 + 페이로드 정규화 회귀 테스트.
// 실행: npm run test:instagram
// DB를 건드리지 않는 순수 함수만 검증한다(운영 DB 무관).
//
// 이 두 가지는 실제 트래픽에서 틀리면 원인 찾기가 가장 어려운 지점이라 고정해 둔다:
//  - 서명이 어긋나면 모든 웹훅이 403으로 조용히 버려진다
//  - is_echo를 못 거르면 자기 DM에 자기가 무한 응답한다
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";

const SECRET = "test_app_secret_123";
process.env.INSTAGRAM_APP_SECRET = SECRET;

const { verifySignature, normalizeWebhook } = await import("../../server/instagram/webhook");

function sign(body: string, secret = SECRET) {
  return "sha256=" + crypto.createHmac("sha256", secret).update(Buffer.from(body)).digest("hex");
}

describe("웹훅 서명 검증 (X-Hub-Signature-256)", () => {
  test("올바른 서명을 통과시킨다", () => {
    const body = JSON.stringify({ object: "instagram", entry: [] });
    assert.equal(verifySignature(Buffer.from(body), sign(body)), true);
  });

  test("다른 시크릿으로 만든 서명을 거부한다", () => {
    const body = JSON.stringify({ object: "instagram", entry: [] });
    assert.equal(verifySignature(Buffer.from(body), sign(body, "wrong_secret")), false);
  });

  test("본문이 1바이트라도 바뀌면 거부한다", () => {
    const body = JSON.stringify({ object: "instagram", entry: [] });
    assert.equal(verifySignature(Buffer.from(body + " "), sign(body)), false);
  });

  test("헤더 누락 / 잘못된 접두사 / 원본 누락을 모두 거부한다", () => {
    const body = "{}";
    assert.equal(verifySignature(Buffer.from(body), undefined), false);
    assert.equal(verifySignature(Buffer.from(body), "md5=abc"), false);
    assert.equal(verifySignature(undefined, sign(body)), false);
  });

  test("길이가 다른 서명에도 예외 없이 false (timingSafeEqual 은 길이 다르면 던짐)", () => {
    assert.equal(verifySignature(Buffer.from("{}"), "sha256=short"), false);
  });

  test("UTF-8 본문(한글)도 바이트 기준으로 정확히 검증한다", () => {
    const body = JSON.stringify({ text: "이름 분석 궁금해요" });
    assert.equal(verifySignature(Buffer.from(body), sign(body)), true);
  });
});

describe("댓글 웹훅 파싱 (entry[].changes[])", () => {
  test("최상위 댓글을 파싱한다", () => {
    const out = normalizeWebhook({
      object: "instagram",
      entry: [
        {
          id: "17841400008460056",
          time: 1569262486134,
          changes: [
            {
              field: "comments",
              value: {
                from: { id: "1134445676786405", username: "hong_gildong" },
                media: { id: "17878512141199967", media_product_type: "REELS" },
                comment_id: "17892100113811950",
                text: "이름 분석 궁금해요",
              },
            },
          ],
        },
      ],
    });
    assert.equal(out.length, 1);
    const e = out[0];
    assert.equal(e.kind, "comment");
    assert.equal(e.dedupeKey, "comment:17892100113811950");
    assert.equal(e.igAccountId, "17841400008460056");
    assert.equal(e.fromId, "1134445676786405");
    assert.equal(e.fromUsername, "hong_gildong");
    assert.equal(e.mediaId, "17878512141199967");
    assert.equal(e.text, "이름 분석 궁금해요");
    assert.equal(e.isEcho, false);
    assert.equal(e.parentId, undefined, "최상위 댓글에는 parent_id가 없어야 함");
  });

  test("대댓글은 parentId 로 구분된다", () => {
    const out = normalizeWebhook({
      entry: [
        {
          id: "178414",
          changes: [
            { field: "comments", value: { from: { id: "111", username: "u" }, comment_id: "c2", parent_id: "c1", text: "감사합니다" } },
          ],
        },
      ],
    });
    assert.equal(out[0].parentId, "c1");
  });

  test("댓글 외 필드(story_insights 등)는 무시한다", () => {
    assert.deepEqual(normalizeWebhook({ entry: [{ changes: [{ field: "story_insights", value: { impressions: 1 } }] }] }), []);
  });
});

describe("DM 웹훅 파싱 (entry[].messaging[])", () => {
  test("수신 메시지를 파싱한다", () => {
    const out = normalizeWebhook({
      object: "instagram",
      entry: [
        {
          id: "17841400008460056",
          time: 1569262486134,
          messaging: [
            {
              sender: { id: "1134445676786405" },
              recipient: { id: "17841400008460056" },
              timestamp: 1569262485349,
              message: { mid: "aWdfZAG1cc2FnZAA", text: "안녕하세요" },
            },
          ],
        },
      ],
    });
    assert.equal(out.length, 1);
    assert.equal(out[0].kind, "message");
    assert.equal(out[0].dedupeKey, "message:aWdfZAG1cc2FnZAA");
    assert.equal(out[0].fromId, "1134445676786405");
    assert.equal(out[0].text, "안녕하세요");
    assert.equal(out[0].isEcho, false);
  });

  test("is_echo(내가 보낸 DM)에 플래그가 선다 — 무한 자동응답 방지", () => {
    const out = normalizeWebhook({
      entry: [{ id: "178414", messaging: [{ sender: { id: "178414" }, message: { mid: "m1", text: "자동응답", is_echo: true } }] }],
    });
    assert.equal(out[0].isEcho, true);
  });

  test("mid 없는 messaging 이벤트(읽음/리액션 등)는 무시한다", () => {
    assert.deepEqual(normalizeWebhook({ entry: [{ messaging: [{ sender: { id: "1" }, read: { mid: "x" } }] }] }), []);
  });
});

describe("견고성", () => {
  test("빈/기형 페이로드에도 죽지 않는다", () => {
    assert.deepEqual(normalizeWebhook({}), []);
    assert.deepEqual(normalizeWebhook({ entry: null }), []);
    assert.deepEqual(normalizeWebhook({ entry: [{}] }), []);
    assert.deepEqual(normalizeWebhook({ entry: [{ changes: [{ field: "comments", value: {} }] }] }), [], "comment_id 없으면 무시");
  });

  test("한 요청에 댓글과 DM이 섞여 와도 모두 파싱한다", () => {
    const out = normalizeWebhook({
      entry: [
        { id: "a", changes: [{ field: "comments", value: { comment_id: "c1", text: "t1", from: { id: "u1" } } }] },
        { id: "a", messaging: [{ sender: { id: "u2" }, message: { mid: "m1", text: "t2" } }] },
      ],
    });
    assert.equal(out.length, 2);
    assert.equal(out[0].kind, "comment");
    assert.equal(out[1].kind, "message");
  });

  test("raw 에 원문이 보존된다 (실제 페이로드 형태 검증용)", () => {
    const out = normalizeWebhook({
      entry: [{ id: "a", changes: [{ field: "comments", value: { comment_id: "c1", text: "t1", from: { id: "u1" } } }] }],
    });
    assert.equal(JSON.parse(out[0].raw).value.comment_id, "c1");
  });
});
