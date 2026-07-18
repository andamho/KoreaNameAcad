// 동명이인 자동매칭 판정 — v1 신청일 축 검증 (순수 함수, DB 없음).
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { decideMatch, type Candidate, type ReportInfo } from "../../server/knop/reportMatch";

const T = new Date("2026-07-18T10:00:00+09:00"); // PDF 최초 감지 시각
const daysBefore = (n: number) => new Date(T.getTime() - n * 86400000);
const daysAfter = (n: number) => new Date(T.getTime() + n * 86400000);
const family: ReportInfo = { firstSeenAt: T, reportType: "family" };

// 기본: 신청일 출처 = consultation(자동연결 가능)
const cand = (o: Partial<Candidate> & { customerId: string }): Candidate => ({
  customerName: "이은혜", consultationId: "cons1", applicationDate: daysBefore(2),
  applicationDateSource: "consultation", numPeople: 3, consultStatus: "진행", alreadyLinkedSameType: false, ...o,
});

describe("동명이인 자동매칭 판정 (v1 신청일 축)", () => {
  test("2022 vs 2026(둘 다 consultation) → 2026 자동연결", () => {
    const old = cand({ customerId: "old", applicationDate: new Date("2022-05-01") });
    const now = cand({ customerId: "new", applicationDate: daysBefore(2) });
    const d = decideMatch(family, [old, now]);
    assert.equal(d.status, "auto_matched");
    assert.equal(d.matchedCustomerId, "new");
  });

  test("같은 시기 2명 → 확인 필요(점수차 부족)", () => {
    const a = cand({ customerId: "a", applicationDate: daysBefore(2) });
    const b = cand({ customerId: "b", applicationDate: daysBefore(1) });
    const d = decideMatch(family, [a, b]);
    assert.equal(d.status, "needs_review");
    assert.ok(d.scoreGap < 30, d.reason);
  });

  test("후보 1명이어도 신청일이 기간 밖(2022) → 자동 금지", () => {
    const old = cand({ customerId: "old", applicationDate: new Date("2022-01-01") });
    const d = decideMatch(family, [old]);
    assert.equal(d.status, "needs_review");
  });

  test("후보 1명·최근 신청·consultation 출처 → 자동연결", () => {
    const only = cand({ customerId: "only", applicationDate: daysBefore(3) });
    const d = decideMatch(family, [only]);
    assert.equal(d.status, "auto_matched");
    assert.equal(d.matchedCustomerId, "only");
  });

  test("신청일 출처가 customer_proxy 면 점수 높아도 자동 금지(needs_review)", () => {
    const proxy = cand({ customerId: "p", applicationDate: daysBefore(1), applicationDateSource: "customer_proxy" });
    const d = decideMatch(family, [proxy]);
    assert.equal(d.status, "needs_review");
    assert.match(d.reason, /출처 미확인/);
  });

  test("신청일 출처 unknown → 자동 금지", () => {
    const unk = cand({ customerId: "u", applicationDate: daysBefore(1), applicationDateSource: "unknown" });
    const d = decideMatch(family, [unk]);
    assert.equal(d.status, "needs_review");
  });

  test("신청일 미래 3일 이내는 허용(당일/익일 등록 유예)", () => {
    const soon = cand({ customerId: "s", applicationDate: daysAfter(2) });
    const d = decideMatch(family, [soon]);
    assert.equal(d.status, "auto_matched");
  });

  test("상담취소 후보는 자동연결 제외", () => {
    const cancelled = cand({ customerId: "c", applicationDate: daysBefore(2), consultStatus: "취소" });
    const d = decideMatch(family, [cancelled]);
    assert.equal(d.status, "needs_review");
  });
});
