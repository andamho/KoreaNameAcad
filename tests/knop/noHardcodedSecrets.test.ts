// 회귀 방지: 하드코딩 DB credential 이 추적 파일에 다시 들어오면 **테스트 실패**.
// ⚠️ 이 테스트는 secret 원문을 출력하지 않는다(매치되면 **파일 경로만** 보고).
//   실측 유출 사례: check-and-migrate.mjs / backfill-tokens.mjs 에 Neon password(npg_…) 하드코딩 → env 기반으로 제거함.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const self = "noHardcodedSecrets";

/** git grep(추적 파일만·빠름·경로만). 매치 0이면 git grep exit 1 → 빈 배열. secret 값은 절대 반환하지 않는다. */
function grepFiles(pattern: string): string[] {
  let out = "";
  try { out = execFileSync("git", ["grep", "-lIE", pattern], { cwd: root, encoding: "utf8" }); }
  catch { out = ""; } // exit 1 = 매치 없음
  return out.split("\n").map((s) => s.trim()).filter((f) => f && !f.includes(self));
}

describe("하드코딩 secret 회귀 방지", () => {
  test("Neon live password(npg_…) 가 추적 파일에 없다", () => {
    const hits = grepFiles("npg_[A-Za-z0-9]{6,}");
    assert.equal(hits.length, 0, `하드코딩 Neon password 발견(경로): ${hits.join(", ")}`);
  });

  test("credential 이 박힌 postgres DSN literal 이 추적 소스에 없다(example/redacted 제외)", () => {
    // user:password@host 형태의 실제 credential DSN. placeholder(example/selftest/redacted/env 치환)는 별도 필터.
    const hits = grepFiles("postgres(ql)?://[a-z0-9_]+:npg_[^@\\s\"']+@").filter((f) => f);
    assert.equal(hits.length, 0, `credential 박힌 DSN literal 발견(경로): ${hits.join(", ")}`);
  });

  test("정리된 두 스크립트는 env 기반(requireDbUrl) 사용 + DSN literal 없음", () => {
    for (const f of ["check-and-migrate.mjs", "backfill-tokens.mjs"]) {
      const src = readFileSync(path.join(root, f), "utf8");
      assert.ok(src.includes("requireDbUrl("), `${f}: requireDbUrl 사용 안 함`);
      assert.ok(!/postgres(ql)?:\/\/[^"'\s]*@/.test(src), `${f}: DSN literal 잔존`);
      assert.ok(!/npg_[A-Za-z0-9]{6,}/.test(src), `${f}: Neon password 잔존`);
    }
  });

  test("secureDbUrl 헬퍼는 DATABASE_URL 미설정 시 fail-closed(throw)", async () => {
    const mod: any = await import("../../scripts/secureDbUrl.mjs");
    const saved = process.env.DATABASE_URL; delete process.env.DATABASE_URL;
    try {
      assert.throws(() => mod.requireDbUrl({ exitOnFail: false }), /DATABASE_URL/);
    } finally { if (saved !== undefined) process.env.DATABASE_URL = saved; }
  });
});
