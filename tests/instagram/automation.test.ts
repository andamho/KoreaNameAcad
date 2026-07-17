// 자동응답 로직 회귀 테스트 (DB·네트워크 없이 순수 로직).
// 실행: npm run test:instagram
//
// DB가 없으면(db=null) processComment 는 발송 시도 후 기록만 건너뛴다.
// SEND_LIVE 는 기본 미설정 → dry-run 이므로 실제 API 호출 없음.
import { test, describe } from "node:test";
import assert from "node:assert/strict";

// SEND_LIVE 를 확실히 끈 상태로 로드 (실수로도 실제 발송 안 하게)
delete process.env.INSTAGRAM_SEND_LIVE;
const { matchesKeyword, processComment, RULE } = await import("../../server/instagram/automation");

describe("키워드 매칭", () => {
  test('"이름"이 들어가면 매칭', () => {
    assert.equal(matchesKeyword("제 이름도 봐주세요"), true);
    assert.equal(matchesKeyword("이름"), true);
    assert.equal(matchesKeyword("우리 아이 이름 궁금해요"), true);
  });
  test("없으면 미매칭", () => {
    assert.equal(matchesKeyword("잘 봤습니다"), false);
    assert.equal(matchesKeyword("오행이 뭔가요"), false);
    assert.equal(matchesKeyword(""), false);
    assert.equal(matchesKeyword(null), false);
    assert.equal(matchesKeyword(undefined), false);
  });
  test("트리거 키워드는 이름", () => {
    assert.equal(RULE.keyword, "이름");
  });
});

describe("processComment (dry-run)", () => {
  test("키워드 있는 댓글: dry-run 으로 답글+DM 처리 표시", async () => {
    const r = await processComment({ commentId: "c1", text: "제 이름 봐주세요" });
    assert.equal(r.matched, true);
    assert.equal(r.live, false, "SEND_LIVE 없으면 dry-run");
    assert.equal(r.replied?.id, "(dry-run)");
    assert.equal(r.dm?.messageId, "(dry-run)");
    assert.equal(r.errors.length, 0);
  });

  test("키워드 없는 댓글: 아무것도 안 함", async () => {
    const r = await processComment({ commentId: "c2", text: "좋아요" });
    assert.equal(r.matched, false);
    assert.equal(r.replied, undefined);
    assert.equal(r.dm, undefined);
    assert.match(r.skippedReason || "", /키워드/);
  });

  test("force=true: 키워드 없어도 발송 (테스트/녹화용)", async () => {
    const r = await processComment({ commentId: "c3", text: "좋아요", force: true });
    assert.equal(r.replied?.id, "(dry-run)");
    assert.equal(r.dm?.messageId, "(dry-run)");
  });

  test("확정 문구가 그대로 쓰인다", () => {
    assert.equal(RULE.commentReplies[0], "이름에 관심가져주셔서 감사합니다. DM보내드렸습니다.");
    assert.equal(RULE.dmText, "이름과 나이 그리고 상담받고싶으신 이유를 가능한 구체적으로 적어주세요");
  });
});
