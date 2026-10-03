// 고객정보에 이름분석표를 직접 첨부했을 때 링크를 만들지 판정하는 규칙.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isReportAttachment } from "../../server/knop/reportSync";

test("이름분석표 이미지 첨부 → 링크 대상", () => {
  assert.equal(isReportAttachment("안은주님 이름분석.png", "image/png"), true);
  assert.equal(isReportAttachment("하주오님 가족 이름분석.png", "image/png"), true);
  assert.equal(isReportAttachment("진유정님 가족 새이름.png", "image/png"), true);
});

test("상세본은 링크를 만들지 않는다", () => {
  assert.equal(isReportAttachment("안은주님 이름분석(상세).png", "image/png"), false);
  assert.equal(isReportAttachment("하주오님 가족 이름분석(상세).png", "image/png"), false);
});

test("PDF 그대로 올라간 경우(이미지 변환 실패)는 제외", () => {
  assert.equal(isReportAttachment("안은주님 이름분석.pdf", "application/pdf"), false);
});

test("이름분석표가 아닌 첨부는 제외", () => {
  assert.equal(isReportAttachment("신분증.jpg", "image/jpeg"), false);
  assert.equal(isReportAttachment("이름분석 참고자료.png", "image/png"), false); // '님' 없음
  assert.equal(isReportAttachment("홍길동님 상담메모.png", "image/png"), false);
});
