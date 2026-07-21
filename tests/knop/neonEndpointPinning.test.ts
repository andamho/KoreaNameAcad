// direct/pooled endpoint **독립 pinning** 계약 + 운영자 secret 입력 경로 검증. **Neon 접속 0.**
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseHarnessEnv, parseUrlShape, DISPOSABLE_TOKEN, type HarnessEnv } from "../../scripts/neonCheck/guards";
import { ENV_CONTRACT, REQUIRED_ENV, SECRET_ENV, ENV_NAMES, DEPRECATED_ENV, formatEnvContract } from "../../scripts/neonCheck/envContract";
import { computeHashLines, hashToolUsage, HASH_TARGETS } from "../../scripts/neonCheck/hashTool";
import { hostHashOf } from "../../scripts/neonCheck/secrets";
import { buildDryRunPlan } from "../../scripts/neonOrchestrationCapabilityCheck";
import { CAPABILITIES, countFor } from "../../scripts/neonCheck/capabilities";
import { ASSERTION_IDS } from "../../server/migrations/hardening/functionSecurityAssertions";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..", "..");
const DIRECT = "postgresql://u:p@ep-disp-123.ap-southeast-1.aws.neon.tech/testdb";
const POOLED = "postgresql://u:p@ep-disp-123-pooler.ap-southeast-1.aws.neon.tech/testdb";
const PROD = "postgresql://u:p@ep-prod-999.ap-southeast-1.aws.neon.tech/proddb";
const RUN = "pin260721";

const okEnv = (over: Partial<HarnessEnv> = {}): HarnessEnv => ({
  NEON_CHECK_DIRECT_URL: DIRECT,
  NEON_CHECK_POOLED_URL: POOLED,
  NEON_CHECK_EXPECTED_DIRECT_HOST_HASH: hostHashOf(DIRECT),
  NEON_CHECK_EXPECTED_POOLED_HOST_HASH: hostHashOf(POOLED),
  NEON_CHECK_FORBIDDEN_HOST_HASH: hostHashOf(PROD),
  NEON_CHECK_DISPOSABLE_CONFIRM: DISPOSABLE_TOKEN,
  NEON_CHECK_RUN_ID: RUN,
  ...over,
});
const refuse = (over: Partial<HarnessEnv>) => {
  const r = parseHarnessEnv(okEnv(over));
  assert.equal(r.ok, false, "거부되어야 하는데 통과함");
  return (r as { ok: false; refusals: string[] }).refusals.join(" | ");
};

describe("endpoint 독립 pinning", () => {
  test("정상 env 통과 — direct/pooled 각각 pin", () => {
    const r = parseHarnessEnv(okEnv());
    assert.equal(r.ok, true, r.ok ? "" : (r as any).refusals.join(" | "));
    if (!r.ok) return;
    assert.equal(r.config.expectedDirectHostHash, hostHashOf(DIRECT));
    assert.equal(r.config.expectedPooledHostHash, hostHashOf(POOLED));
    assert.notEqual(r.config.expectedDirectHostHash, r.config.expectedPooledHostHash);
    assert.equal(r.config.pooledUrl, POOLED);
    assert.equal(r.config.execute, false, "CONFIRM_EXECUTE 미설정 → execute false");
  });

  test("deprecated 단일 hash 변수 사용 거부", () => {
    const msg = refuse({ NEON_CHECK_EXPECTED_HOST_HASH: hostHashOf(DIRECT) });
    assert.match(msg, /NEON_CHECK_EXPECTED_HOST_HASH 는 폐기된 계약/);
    assert.match(msg, /EXPECTED_DIRECT_HOST_HASH/);
  });

  test("direct expected hash mismatch 거부", () => {
    assert.match(refuse({ NEON_CHECK_EXPECTED_DIRECT_HOST_HASH: "a".repeat(64) }), /direct URL host hash ≠ expected direct pin/);
  });

  test("pooled expected hash mismatch 거부 — 이전 계약에서 통과하던 구멍", () => {
    // 단일 hash 계약에서는 pooled 가 아무 host 여도 통과했다. 이제는 거부되어야 한다.
    assert.match(refuse({ NEON_CHECK_EXPECTED_POOLED_HOST_HASH: "b".repeat(64) }), /pooled URL host hash ≠ expected pooled pin/);
  });

  test("pooled URL 이 무관한 프로젝트를 가리켜도 거부(핵심 회귀)", () => {
    const other = "postgresql://u:p@ep-someone-else.us-east-2.aws.neon.tech/other";
    assert.match(refuse({ NEON_CHECK_POOLED_URL: other }), /pooled URL host hash ≠ expected pooled pin/);
  });

  test("direct/pooled expected hash 교차 입력 거부", () => {
    const msg = refuse({
      NEON_CHECK_EXPECTED_DIRECT_HOST_HASH: hostHashOf(POOLED),
      NEON_CHECK_EXPECTED_POOLED_HOST_HASH: hostHashOf(DIRECT),
    });
    assert.match(msg, /교차 입력/);
  });

  test("expected direct/pooled hash 동일 거부", () => {
    const h = hostHashOf(DIRECT);
    assert.match(refuse({ NEON_CHECK_EXPECTED_DIRECT_HOST_HASH: h, NEON_CHECK_EXPECTED_POOLED_HOST_HASH: h }),
      /expected direct\/pooled hash 가 동일/);
  });

  test("direct/pooled actual host 동일 거부", () => {
    assert.match(refuse({ NEON_CHECK_POOLED_URL: DIRECT, NEON_CHECK_EXPECTED_POOLED_HOST_HASH: hostHashOf(DIRECT) }),
      /동일/);
  });

  test("forbidden(production) hash 와 direct 일치 거부", () => {
    assert.match(refuse({ NEON_CHECK_DIRECT_URL: PROD, NEON_CHECK_EXPECTED_DIRECT_HOST_HASH: hostHashOf(PROD) }),
      /direct URL 이 production host hash 와 일치/);
  });

  test("forbidden(production) hash 와 pooled 일치 거부", () => {
    assert.match(refuse({ NEON_CHECK_POOLED_URL: PROD, NEON_CHECK_EXPECTED_POOLED_HOST_HASH: hostHashOf(PROD) }),
      /pooled URL 이 production host hash 와 일치/);
  });

  test("malformed hash 거부(대문자·길이·비hex)", () => {
    for (const bad of ["A".repeat(64), "a".repeat(63), "z".repeat(64), ""]) {
      assert.match(refuse({ NEON_CHECK_EXPECTED_DIRECT_HOST_HASH: bad }), /EXPECTED_DIRECT_HOST_HASH|expected direct/);
    }
    assert.match(refuse({ NEON_CHECK_FORBIDDEN_HOST_HASH: "xyz" }), /FORBIDDEN_HOST_HASH 형식오류/);
  });

  test("pooled URL 누락 거부(pooled 5종의 유일한 정본이므로 필수)", () => {
    assert.match(refuse({ NEON_CHECK_POOLED_URL: "" }), /NEON_CHECK_POOLED_URL 없음/);
  });

  test("URL protocol/host/port 파싱 검증", () => {
    assert.equal(parseUrlShape(DIRECT).ok, true);
    assert.equal(parseUrlShape("mysql://u:p@h/db").ok, false);
    assert.equal(parseUrlShape("not a url").ok, false);
    assert.equal(parseUrlShape("postgresql://u:p@/db").ok, false);
    assert.match(refuse({ NEON_CHECK_DIRECT_URL: "mysql://u:p@h/db" }), /protocol/);
  });

  test("거부 메시지에 URL·host·user·password 원문 0", () => {
    const all = [
      refuse({ NEON_CHECK_DIRECT_URL: "mysql://secretuser:secretpass@leak.example.com:5432/leakdb" }),
      refuse({ NEON_CHECK_EXPECTED_POOLED_HOST_HASH: "b".repeat(64) }),
      refuse({ NEON_CHECK_EXPECTED_HOST_HASH: hostHashOf(DIRECT) }),
    ].join(" || ");
    for (const leak of ["secretuser", "secretpass", "leak.example.com", "leakdb", "ep-disp-123", "neon.tech", "postgresql://"]) {
      assert.ok(!all.includes(leak), `거부 메시지에 ${leak} 노출`);
    }
  });
});

describe("environment contract 단일 정본", () => {
  test("필수/선택 목록이 계약대로", () => {
    assert.deepEqual(REQUIRED_ENV, [
      "NEON_CHECK_DIRECT_URL", "NEON_CHECK_POOLED_URL",
      "NEON_CHECK_EXPECTED_DIRECT_HOST_HASH", "NEON_CHECK_EXPECTED_POOLED_HOST_HASH",
      "NEON_CHECK_DISPOSABLE_CONFIRM", "NEON_CHECK_RUN_ID",
    ]);
    assert.ok(ENV_NAMES.includes("NEON_CHECK_FORBIDDEN_HOST_HASH"));
    assert.ok(ENV_NAMES.includes("CONFIRM_EXECUTE"));
    assert.deepEqual(SECRET_ENV, ["NEON_CHECK_DIRECT_URL", "NEON_CHECK_POOLED_URL"]);
    assert.deepEqual(DEPRECATED_ENV.map((d) => d.name), ["NEON_CHECK_EXPECTED_HOST_HASH"]);
  });

  test("필수 변수 누락은 전부 fail-closed", () => {
    for (const name of REQUIRED_ENV) {
      const r = parseHarnessEnv(okEnv({ [name]: "" } as Partial<HarnessEnv>));
      assert.equal(r.ok, false, `${name} 누락인데 통과함`);
    }
  });

  test("문서가 계약 정본과 일치한다", () => {
    const doc = readFileSync(path.join(root, "docs", "disposable-neon-operator-setup.md"), "utf-8")
      + readFileSync(path.join(root, "docs", "disposable-neon-orchestration-verification.md"), "utf-8");
    for (const v of ENV_CONTRACT) assert.ok(doc.includes(v.name), `문서에 ${v.name} 누락`);
    for (const d of DEPRECATED_ENV) assert.ok(doc.includes(d.name), `문서에 폐기 변수 ${d.name} 안내 누락`);
    assert.ok(!/NEON_CHECK_EXPECTED_HOST_HASH[^_]/.test(doc.replace(/폐기|deprecated/gi, "")) || doc.includes("폐기"),
      "폐기 변수가 유효한 것처럼 남아 있으면 안 됨");
  });

  test("CLI 도움말이 정본에서 생성된다", () => {
    const help = formatEnvContract().join("\n");
    for (const v of ENV_CONTRACT) assert.ok(help.includes(v.name), v.name);
    assert.match(help, /폐기/);
  });
});

describe("hash 도구 — argv/출력 누출 0", () => {
  test("환경변수에서만 읽고 direct#/pooled# 형식으로만 출력", () => {
    const lines = computeHashLines({ NEON_CHECK_DIRECT_URL: DIRECT, NEON_CHECK_POOLED_URL: POOLED });
    assert.equal(lines[0].text, `direct#${hostHashOf(DIRECT)}`);
    assert.equal(lines[1].text, `pooled#${hostHashOf(POOLED)}`);
    for (const l of lines) {
      for (const leak of ["ep-disp-123", "neon.tech", "testdb", "u:p", "postgresql://"]) {
        assert.ok(!l.text.includes(leak), `${leak} 노출: ${l.text}`);
      }
    }
  });

  test("malformed URL 이어도 원문 미출력", () => {
    const lines = computeHashLines({ NEON_CHECK_DIRECT_URL: "postgresql://leakuser:leakpw@bad host/db" });
    assert.equal(lines[0].ok, false);
    for (const leak of ["leakuser", "leakpw", "bad host"]) assert.ok(!lines[0].text.includes(leak), lines[0].text);
  });

  test("미설정이면 값 대신 안내만", () => {
    const lines = computeHashLines({});
    assert.ok(lines.every((l) => !l.ok));
    assert.match(lines[0].text, /미설정/);
  });

  test("도구가 URL argument 를 받지 않는다(소스 계약)", () => {
    const src = readFileSync(path.join(root, "scripts", "neonCheck", "hashTool.ts"), "utf-8");
    assert.match(src, /process\.argv\.length > 2/, "argv 인자 거부 경로 필요");
    assert.ok(!/process\.argv\[2\]/.test(src), "argv 에서 URL 을 읽으면 안 됨");
    assert.equal(HASH_TARGETS.every((t) => t.env.startsWith("NEON_CHECK_")), true);
    assert.match(hashToolUsage().join("\n"), /Read-Host/);
  });
});

describe("dry-run = offline contract validation", () => {
  const cfg = () => { const p = parseHarnessEnv(okEnv()); if (!p.ok) throw new Error("env"); return p.config; };

  test("plan 에 catalog 45 · direct 40 · pooled 5 · assertions 10 이 정본에서 출력", () => {
    const lines = buildDryRunPlan(cfg()).join("\n");
    assert.ok(lines.includes(`capability catalog=${CAPABILITIES.length}`));
    assert.ok(lines.includes(`actual-neon-direct applicable=${countFor("actual-neon-direct")}`));
    assert.ok(lines.includes(`actual-neon-pooled applicable=${countFor("actual-neon-pooled")}`));
    assert.ok(lines.includes(`hardening security assertions=${ASSERTION_IDS.length}`));
    assert.equal(CAPABILITIES.length, 45);
    assert.equal(countFor("actual-neon-direct"), 40);
    assert.equal(countFor("actual-neon-pooled"), 5);
    assert.equal(ASSERTION_IDS.length, 10);
  });

  test("plan 이 DB connection 0 · write 0 을 명시하고 masked fingerprint 만 노출", () => {
    const lines = buildDryRunPlan(cfg()).join("\n");
    assert.match(lines, /DB connection 0 · DB write 0/);
    assert.match(lines, /status=offline-contract-validation/);
    assert.match(lines, /url#[0-9a-f]{8}…/, "masked fingerprint 형식");
    for (const leak of ["ep-disp-123", "neon.tech", "testdb", "postgresql://"]) assert.ok(!lines.includes(leak), leak);
  });

  test("plan 이 '실행 준비 완료'라고 말하지 않고 미검증 범위를 명시", () => {
    const lines = buildDryRunPlan(cfg()).join("\n");
    assert.ok(!/준비 완료/.test(lines), "'실행 준비 완료' 표현 금지");
    assert.match(lines, /actual DB safety remains unverified/);
    for (const item of ["credential 유효성", "CREATE ROLE capability", "public user table 0", "migration history", "PgBouncer transaction mode"]) {
      assert.ok(lines.includes(item), `미검증 항목 누락: ${item}`);
    }
  });

  test("synthetic 이름·cleanup 이 run-id scoped", () => {
    const lines = buildDryRunPlan(cfg()).join("\n");
    assert.ok(lines.includes(`oc_chk_${RUN}`));
    assert.match(lines, new RegExp(`oc_owner_${RUN}`));
    assert.match(lines, /cleanup statements=\d+ \(run-id 범위 한정\)/);
  });

  test("CONFIRM_EXECUTE 미설정이면 execute=false, 'true' 문자열만 execute", () => {
    assert.equal(cfg().execute, false);
    const p1 = parseHarnessEnv(okEnv({ CONFIRM_EXECUTE: "TRUE" }));
    assert.equal(p1.ok && p1.config.execute, false, "'TRUE' 는 execute 아님");
    const p2 = parseHarnessEnv(okEnv({ CONFIRM_EXECUTE: "true" }));
    assert.equal(p2.ok && p2.config.execute, true);
  });
});

describe("SELECT-only preflight 계약 문서", () => {
  test("설계 문서가 존재하고 미구현임을 명시", () => {
    const doc = readFileSync(path.join(root, "docs", "neon-select-only-preflight-contract.md"), "utf-8");
    assert.match(doc, /designed, not implemented/);
    for (const k of ["PREFLIGHT_ONLY", "SET TRANSACTION READ ONLY", "allowlist", "PgBouncer", "preflight-passed"]) {
      assert.ok(doc.includes(k), `계약 문서에 ${k} 누락`);
    }
  });

  test("preflight 는 아직 구현되지 않았다(코드 부재 확인)", () => {
    const guards = readFileSync(path.join(root, "scripts", "neonCheck", "guards.ts"), "utf-8");
    assert.ok(!guards.includes("PREFLIGHT_ONLY"), "이번 Gate 에서는 구현하지 않는다");
  });
});
