// 네이버 클립 설명란: AI 출력 정리 + 해시태그 = 필수 2개(맨 앞, 코드가 붙임) + 내용 해시태그
import { test } from "node:test";
import assert from "node:assert/strict";

const mod = await import("../../server/naverClip");
const { finalizeClipDescription, normalizeTopicTags, buildNaverClipDescription, NAVER_CLIP_HASHTAGS, MAX_TOPIC_TAGS } = mod;

test("필수 2개는 항상 해시태그 맨 앞에 정확히 한 번, 그 뒤에 내용 해시태그", () => {
  const out = finalizeClipDescription("이름에 담긴 의미를 알려 드립니다.", ["이름풀이", "#수리운"]);
  assert.equal(NAVER_CLIP_HASHTAGS, "#한국이름학교 #와츠유어네임이름연구협회");
  assert.ok(out.endsWith(`\n\n${NAVER_CLIP_HASHTAGS} #이름풀이 #수리운`));
  assert.equal(out.split("#한국이름학교").length - 1, 1);
});

test("내용 해시태그 정리: 공백·기호 제거, 필수·중복 제외, 최대 개수", () => {
  assert.deepEqual(normalizeTopicTags(["이름 풀이", "#작명!", "한국이름학교", "작명", "", "#와츠유어네임이름연구협회"]), ["#이름풀이", "#작명"]);
  assert.equal(normalizeTopicTags(Array.from({ length: 10 }, (_, i) => `태그${i}`)).length, MAX_TOPIC_TAGS);
  assert.deepEqual(normalizeTopicTags("문자열"), []);
});

test("AI 가 설명 안에 넣은 해시태그·마크다운은 지운다", () => {
  const out = finalizeClipDescription("```\n**이름**은 중요합니다. #작명 #개명\n- 두 번째 문장입니다.\n#한국이름학교\n```", []);
  assert.equal(out, `이름은 중요합니다.\n두 번째 문장입니다.\n\n${NAVER_CLIP_HASHTAGS}`);
});

test("빈 출력이어도 필수 해시태그는 남는다", () => {
  assert.equal(finalizeClipDescription("", []), NAVER_CLIP_HASHTAGS);
});

test("300자 제한: 해시태그부터 줄이고, 그래도 넘치면 설명을 문장 단위로 줄인다(필수 2개는 유지)", () => {
  const { charCount, MAX_TOTAL_CHARS } = mod;
  assert.equal(MAX_TOTAL_CHARS, 300);
  const sentence = "이름에는 그 사람의 삶을 비추는 여러 가지 운이 담겨 있습니다. ";
  const tags = ["이름풀이", "수리운", "작명", "개명", "이름운", "이름의미"];
  // 1) 설명이 짧으면 해시태그 전부
  const short = finalizeClipDescription(sentence.trim(), tags);
  assert.ok(charCount(short) <= 300);
  assert.ok(short.endsWith("#이름의미"));
  // 2) 설명이 길면 결과는 항상 300자 이하, 필수 2개 유지, 문장 끝에서 잘림
  for (const n of [5, 7, 9, 20]) {
    const out = finalizeClipDescription(sentence.repeat(n).trim(), tags);
    assert.ok(charCount(out) <= 300, `${n}문장 → ${charCount(out)}자`);
    assert.ok(out.includes(NAVER_CLIP_HASHTAGS));
    const body = out.split("\n\n")[0];
    assert.ok(/[.다요]$/.test(body), `문장 끝에서 잘림: …${body.slice(-10)}`);
  }
  // 3) 마침표 없는 아주 긴 한 덩어리도 300자 이하
  const blob = finalizeClipDescription("가".repeat(600), tags);
  assert.ok(charCount(blob) <= 300);
  assert.ok(blob.split("\n\n")[0].endsWith("…"));
});

test("대본 없으면 지어내지 않고 거절", async () => {
  await assert.rejects(buildNaverClipDescription("제목", "  "), /대본이 없어/);
});

test("같은 대본은 캐시, 다시 쓰기는 새로 생성", async () => {
  let calls = 0;
  const generate = async (_s: string, p: string) => {
    calls++;
    assert.match(p, /영상 대본:\n물거품/);
    return { description: `설명 ${calls}`, hashtags: ["이름운"] };
  };
  const a = await buildNaverClipDescription("물거품 제목", "물거품 대본", { generate });
  const b = await buildNaverClipDescription("물거품 제목", "물거품 대본", { generate });
  const c = await buildNaverClipDescription("물거품 제목", "물거품 대본", { generate, regenerate: true });
  assert.equal(calls, 2);
  assert.equal(a, b);
  assert.ok(c.startsWith("설명 2"));
  assert.ok(c.endsWith(`${NAVER_CLIP_HASHTAGS} #이름운`));
});
