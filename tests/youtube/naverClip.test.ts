// 네이버 클립 설명란: AI 출력 정리 + 필수 해시태그는 항상 코드가 붙인다
import { test } from "node:test";
import assert from "node:assert/strict";

const { finalizeClipDescription, buildNaverClipDescription, NAVER_CLIP_HASHTAGS } = await import("../../server/naverClip");

test("필수 해시태그는 항상 맨 끝에 정확히 한 번", () => {
  const out = finalizeClipDescription("이름에 담긴 의미를 알려 드립니다.");
  assert.equal(NAVER_CLIP_HASHTAGS, "#한국이름학교 #와츠유어네임이름연구협회");
  assert.ok(out.endsWith(`\n\n${NAVER_CLIP_HASHTAGS}`));
  assert.equal(out.split("#한국이름학교").length - 1, 1);
});

test("AI 가 넣은 해시태그·마크다운은 지운다", () => {
  const out = finalizeClipDescription("```\n**이름**은 중요합니다. #작명 #개명\n- 두 번째 문장입니다.\n#한국이름학교\n```");
  assert.equal(out, `이름은 중요합니다.\n두 번째 문장입니다.\n\n${NAVER_CLIP_HASHTAGS}`);
});

test("빈 출력이어도 해시태그는 남는다", () => {
  assert.equal(finalizeClipDescription(""), NAVER_CLIP_HASHTAGS);
});

test("대본 없으면 지어내지 않고 거절", async () => {
  await assert.rejects(buildNaverClipDescription("제목", "  "), /대본이 없어/);
});

test("같은 대본은 캐시, 다시 쓰기는 새로 생성", async () => {
  let calls = 0;
  const generate = async (_s: string, p: string) => { calls++; assert.match(p, /영상 대본:\n물거품/); return `설명 ${calls}`; };
  const a = await buildNaverClipDescription("물거품 제목", "물거품 대본", { generate });
  const b = await buildNaverClipDescription("물거품 제목", "물거품 대본", { generate });
  const c = await buildNaverClipDescription("물거품 제목", "물거품 대본", { generate, regenerate: true });
  assert.equal(calls, 2);
  assert.equal(a, b);
  assert.ok(c.startsWith("설명 2"));
});
