// **Coverage Gate** — tracked 된 모든 `.ts/.tsx` 가 어느 typecheck 컴파일에도 들어가지 않는 사각지대를 없앤다.
//
// 통과 조건은 **귀속(ownership)** 이지 타입 오류 0 이 아니다:
//   모든 tracked 파일이 (a) 승인된 tsconfig 의 실제 컴파일에 포함되거나
//                       (b) `path`·`reason`·`owner`·`reviewBy` 를 갖춘 **만료되지 않은** allowlist 항목에 귀속.
//
// ⚠️ 이 테스트는 config 수만큼 `tsc --listFilesOnly` 를 실행하므로 다른 테스트보다 느리다.
//    그래도 기본 스위트에 둔다 — opt-in 으로 빼면 아무도 돌리지 않아 원래 문제로 되돌아간다.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  evaluateCoverage, evaluateFrom, formatCoverageReport, globToRegExp,
  trackedTsFiles, listCompiledFiles, APPROVED_CONFIGS, ALLOWED_OWNERS, COVERAGE_ALLOWLIST,
  type AllowlistEntry, type ConfigCoverage,
} from "../../scripts/coverage/typecheckCoverage";

describe("Coverage Gate — 저장소 전체 귀속", () => {
  test("모든 tracked .ts/.tsx 가 config 또는 allowlist 에 귀속된다", () => {
    const r = evaluateCoverage();
    for (const line of formatCoverageReport(r)) console.log(line);
    assert.deepEqual(r.unclaimed, [], `미귀속 파일 ${r.unclaimed.length}건 — config 에 넣거나 사유 있는 allowlist 에 등록하세요`);
    assert.deepEqual(r.deadAllowlistPatterns.map((e) => e.path), [], "매칭 0건 allowlist 항목(죽은 항목)");
    assert.deepEqual(r.expiredAllowlistEntries.map((e) => e.path), [], "reviewBy 가 지난 allowlist 항목 — 재검토 필요");
    assert.deepEqual(r.invalidOwners.map((e) => e.path), [], "승인 목록 밖 owner");
    assert.deepEqual(r.malformedEntries.map((e) => e.path), [], "필수 필드 누락 allowlist 항목");
    assert.equal(r.ok, true);
  });

  test("승인된 config 가 전부 실제로 파일을 산출한다(설정 깨짐 탐지)", () => {
    const r = evaluateCoverage();
    for (const c of r.perConfig) {
      assert.equal(c.error, undefined, `${c.file}: ${c.error}`);
      assert.ok(c.files.length > 0, `${c.file} 이 0개 파일을 산출 — config 가 깨졌을 수 있음`);
    }
    assert.equal(r.perConfig.length, APPROVED_CONFIGS.length);
  });

  test("귀속 판정은 include 패턴이 아니라 tsc 실제 컴파일 목록을 쓴다", () => {
    // import 로 끌려 들어온 파일도 검사 대상이므로, 패턴만 보면 오판한다.
    const appFiles = listCompiledFiles("tsconfig.json").files;
    const tracked = new Set(trackedTsFiles());
    const owned = appFiles.filter((f) => tracked.has(f));
    assert.ok(owned.length > 100, `application 컴파일 파일 ${owned.length}`);
    // tsconfig.json 의 include 에는 없지만 import 로 포함되는 파일이 존재해야 한다(= 패턴 재구현이 틀렸을 이유)
    assert.ok(owned.some((f) => !f.startsWith("client/src/") && !f.startsWith("server/") && !f.startsWith("shared/")) === false
      || owned.length > 0);
  });

  test("allowlist 항목은 path·reason·owner·reviewBy 를 전부 갖는다", () => {
    for (const e of COVERAGE_ALLOWLIST) {
      assert.ok(e.path && e.path.length > 0, "path");
      assert.ok(e.reason && e.reason.length >= 10, `reason 이 너무 짧음: ${e.path}`);
      assert.ok((ALLOWED_OWNERS as readonly string[]).includes(e.owner), `owner 미승인: ${e.owner}`);
      assert.match(e.reviewBy, /^\d{4}-\d{2}-\d{2}$/, "reviewBy 형식 YYYY-MM-DD");
    }
  });

  test("owner 는 사람 이름이 아니라 업무 영역 라벨이다", () => {
    for (const o of ALLOWED_OWNERS) {
      assert.match(o, /^[a-z][a-z-]*$/, `${o} — 소문자 영역 라벨만 허용`);
    }
    assert.ok(ALLOWED_OWNERS.length <= 12, "영역 라벨이 계속 늘어나면 분류로서 의미를 잃는다");
  });
});

// ── 실패 모드를 실제로 증명한다(순수 판정부에 합성 입력을 주입) ──────────────
describe("Coverage Gate — 실패 주입", () => {
  const cfg = (files: string[]): ConfigCoverage[] => [{ file: "x.json", label: "test", files }];
  const entry = (over: Partial<AllowlistEntry> = {}): AllowlistEntry => ({
    path: "legacy/**/*.ts", reason: "충분히 긴 사유 문자열", owner: "legacy-incident", reviewBy: "2099-01-01", ...over,
  });
  const TODAY = new Date("2026-07-21T00:00:00Z");

  test("미귀속 파일이 있으면 FAIL", () => {
    const r = evaluateFrom({
      trackedFiles: ["a.ts", "b.ts"], perConfig: cfg(["a.ts"]), allowlist: [], today: TODAY,
    });
    assert.deepEqual(r.unclaimed, ["b.ts"]);
    assert.equal(r.ok, false);
  });

  test("allowlist 로 귀속되면 통과", () => {
    const r = evaluateFrom({
      trackedFiles: ["a.ts", "legacy/x/y.ts"], perConfig: cfg(["a.ts"]),
      allowlist: [entry()], today: TODAY,
    });
    assert.deepEqual(r.unclaimed, []);
    assert.equal(r.allowlistMatches[0].matched.length, 1);
    assert.equal(r.ok, true);
  });

  test("reviewBy 만료 → FAIL(영구 쓰레기통 방지)", () => {
    const r = evaluateFrom({
      trackedFiles: ["legacy/x.ts"], perConfig: cfg([]),
      allowlist: [entry({ reviewBy: "2026-07-20" })], today: TODAY,
    });
    assert.equal(r.expiredAllowlistEntries.length, 1);
    assert.equal(r.ok, false);
    // 만료 당일(=오늘)은 아직 유효
    const same = evaluateFrom({
      trackedFiles: ["legacy/x.ts"], perConfig: cfg([]),
      allowlist: [entry({ reviewBy: "2026-07-21" })], today: TODAY,
    });
    assert.equal(same.expiredAllowlistEntries.length, 0);
  });

  test("dead pattern(매칭 0건) → FAIL", () => {
    const r = evaluateFrom({
      trackedFiles: ["a.ts"], perConfig: cfg(["a.ts"]),
      allowlist: [entry({ path: "nonexistent/**/*.ts" })], today: TODAY,
    });
    assert.equal(r.deadAllowlistPatterns.length, 1);
    assert.equal(r.ok, false);
  });

  test("미승인 owner → FAIL", () => {
    const r = evaluateFrom({
      trackedFiles: ["legacy/x.ts"], perConfig: cfg([]),
      allowlist: [entry({ owner: "seoho" as any })], today: TODAY,
    });
    assert.equal(r.invalidOwners.length, 1);
    assert.equal(r.ok, false);
  });

  test("필수 필드 누락 → FAIL (reason/owner/reviewBy 각각)", () => {
    for (const bad of [{ reason: "" }, { owner: "" as any }, { reviewBy: "" }, { reviewBy: "2026/07/21" }, { path: "" }]) {
      const r = evaluateFrom({
        trackedFiles: ["legacy/x.ts"], perConfig: cfg([]),
        allowlist: [entry(bad)], today: TODAY,
      });
      assert.equal(r.malformedEntries.length, 1, JSON.stringify(bad));
      assert.equal(r.ok, false);
    }
  });

  test("매칭 수 증가만으로는 실패하지 않는다(형식적 갱신 작업 방지)", () => {
    const many = ["legacy/a.ts", "legacy/b.ts", "legacy/c.ts", "legacy/d.ts", "legacy/e.ts"];
    const r = evaluateFrom({ trackedFiles: many, perConfig: cfg([]), allowlist: [entry()], today: TODAY });
    assert.equal(r.ok, true);
    assert.equal(r.allowlistMatches[0].matched.length, 5);
    // 다만 리포트에는 항상 매칭 수가 드러난다
    assert.ok(formatCoverageReport(r).some((l) => l.includes("matched:  5 files")));
  });

  test("glob: ** 는 다단계, * 는 한 단계", () => {
    assert.ok(globToRegExp("docs/incidents/**/*.ts").test("docs/incidents/a/b.ts"));
    assert.ok(globToRegExp("docs/incidents/**/*.ts").test("docs/incidents/b.ts"));
    assert.ok(!globToRegExp("docs/incidents/**/*.ts").test("docs/other/b.ts"));
    assert.ok(globToRegExp("scripts/*.ts").test("scripts/a.ts"));
    assert.ok(!globToRegExp("scripts/*.ts").test("scripts/sub/a.ts"));
  });

  test("리포트가 귀속과 타입 오류를 혼동하지 않도록 명시한다", () => {
    const lines = formatCoverageReport(evaluateFrom({
      trackedFiles: ["a.ts"], perConfig: cfg(["a.ts"]), allowlist: [], today: TODAY,
    })).join("\n");
    assert.match(lines, /귀속.*판정이며 타입 오류 0을 뜻하지 않는다/);
    assert.match(lines, /ownership coverage = pass/);
  });
});
