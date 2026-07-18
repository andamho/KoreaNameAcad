// 동명이인 자동매칭 판정 — 가상 동명이인 시나리오 검증 (순수 함수, DB 없음).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { decideMatch, type Candidate, type ReportInfo } from "../../server/knop/reportMatch";

const T = new Date("2026-07-18T10:00:00+09:00"); // PDF 최초 감지 시각
const daysBefore = (n: number) => new Date(T.getTime() - n * 86400000);
const daysAfter = (n: number) => new Date(T.getTime() + n * 86400000);
const family: ReportInfo = { firstSeenAt: T, reportType: "family" };

const cand = (o: Partial<Candidate> & { customerId: string }): Candidate => ({
  customerName: "이은혜", consultationId: null, applicationDate: null, consultationDate: null,
  numPeople: 3, consultStatus: "진행", alreadyLinkedSameType: false, ...o,
});

describe("동명이인 자동매칭 판정 (v1)", () => {
  test("2022 이은혜 vs 2026 이은혜 → 2026 고객에게 자동연결", () => {
    const old2022 = cand({ customerId: "old", applicationDate: new Date("2022-05-01"), consultationDate: new Date("2022-05-10") });
    const new2026 = cand({ customerId: "new", applicationDate: daysBefore(2), consultationDate: daysBefore(1) });
    const d = decideMatch(family, [old2022, new2026]);
    assert.equal(d.status, "auto_matched");
    assert.equal(d.matchedCustomerId, "new");
    // 2022 후보는 기간 게이트에서 탈락(eligible 아님)
    assert.ok(d.topScore >= 70 && d.scoreGap >= 30, d.reason);
  });

  test("같은 달 이은혜 2명·상담일 비슷 → 자동 금지, 확인 필요", () => {
    const a = cand({ customerId: "a", applicationDate: daysBefore(5), consultationDate: daysBefore(1) });
    const b = cand({ customerId: "b", applicationDate: daysBefore(4), consultationDate: daysAfter(1) });
    const d = decideMatch(family, [a, b]);
    assert.equal(d.status, "needs_review");
    assert.equal(d.matchedCustomerId, null);
    assert.ok(d.scoreGap < 30, d.reason); // 점수차 부족
  });

  test("후보 1명이어도 기간 벗어나면 자동 금지(2022 자료 재발 방지)", () => {
    const old = cand({ customerId: "old", applicationDate: new Date("2022-01-01"), consultationDate: new Date("2022-01-05") });
    const d = decideMatch(family, [old]);
    assert.equal(d.status, "needs_review");
    assert.equal(d.matchedCustomerId, null);
  });

  test("후보 1명·상담일 근접·최근 신청 → 자동연결", () => {
    const only = cand({ customerId: "only", applicationDate: daysBefore(3), consultationDate: daysBefore(2) });
    const d = decideMatch(family, [only]);
    assert.equal(d.status, "auto_matched");
    assert.equal(d.matchedCustomerId, "only");
  });

  test("상담일 없는 고객(신청만) → 보수적으로 확인 필요", () => {
    const noConsult = cand({ customerId: "x", applicationDate: daysBefore(2), consultationDate: null });
    const d = decideMatch(family, [noConsult]);
    assert.equal(d.status, "needs_review"); // 주 신호(상담일) 0 → 70 미만
  });

  test("상담취소 후보는 자동연결 대상에서 제외", () => {
    const cancelled = cand({ customerId: "c", applicationDate: daysBefore(2), consultationDate: daysBefore(1), consultStatus: "취소" });
    const d = decideMatch(family, [cancelled]);
    assert.equal(d.status, "needs_review");
  });

  test("상담일 ±3일 = 70점 단독이면 자동(2위 없음 → gap=70)", () => {
    const only = cand({ customerId: "s", applicationDate: daysBefore(1), consultationDate: T, consultStatus: null, numPeople: 1 });
    const only2: ReportInfo = { firstSeenAt: T, reportType: "individual" };
    const d = decideMatch(only2, [only]);
    assert.equal(d.status, "auto_matched"); // 70 + 신청일20 = 90, 2위 없음
  });
});
