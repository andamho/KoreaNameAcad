// preflight → execute 사이 **evidence 수명주기** 검증. 실제 Neon 접속 0.
//
// 이 파일이 닫는 공백(그동안 "동작할 것으로 보인다" 상태였던 항목):
//   1. **preflight 단계는 evidence 를 소비하지 않는다**(발급만 한다). 소비는 execute 의 책임이다.
//   2. **프로세스가 분리돼도** 다음 프로세스가 evidence/key 를 읽을 수 있다(파일 기반 전달이 실제로 동작).
//   3. 소비는 **정확히 한 프로세스에서만** 성공한다(두 번째 프로세스는 replay 로 거부).
//   4. preflight 실패 시 이전 evidence 가 남아 execute 를 열지 않는다.
//   5. 로그·evidence 파일 어디에도 key·credential·DSN 원문이 없다.
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runSelectOnlyPreflight } from "../../scripts/neonCheck/runPreflight";
import { evidenceExists, evidencePath, evidenceKeyPath, clearEvidence, consumeEvidence } from "../../scripts/neonCheck/evidenceStore";
import { verifySignedEvidence, resetConsumedNonces } from "../../scripts/neonCheck/evidenceAuth";
import { parseHarnessEnv, DISPOSABLE_TOKEN, type HarnessEnv, type HarnessConfig } from "../../scripts/neonCheck/guards";
import { hostHashOf } from "../../scripts/neonCheck/secrets";
import type { RawDriver } from "../../scripts/neonCheck/readOnlyAdapter";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
/** 자식 프로세스의 ESM import 는 Windows 절대경로가 아니라 file:// URL 이어야 한다. */
const mod = (rel: string) => JSON.stringify(pathToFileURL(path.join(REPO, rel)).href);
const DIRECT = "postgresql://evuser:evpass@ep-life-1.ap-southeast-1.aws.neon.tech/lifedb";
const POOLED = "postgresql://evuser:evpass@ep-life-1-pooler.ap-southeast-1.aws.neon.tech/lifedb";
const PROD_D = "postgresql://u:p@ep-prod-x.ap-southeast-1.aws.neon.tech/prod";
const PROD_P = "postgresql://u:p@ep-prod-x-pooler.ap-southeast-1.aws.neon.tech/prod";
const RUN = "life260721";

const env = (over: Partial<HarnessEnv> = {}): HarnessEnv => ({
  NEON_CHECK_DIRECT_URL: DIRECT, NEON_CHECK_POOLED_URL: POOLED,
  NEON_CHECK_EXPECTED_DIRECT_HOST_HASH: hostHashOf(DIRECT),
  NEON_CHECK_EXPECTED_POOLED_HOST_HASH: hostHashOf(POOLED),
  NEON_CHECK_FORBIDDEN_DIRECT_HOST_HASH: hostHashOf(PROD_D),
  NEON_CHECK_FORBIDDEN_POOLED_HOST_HASH: hostHashOf(PROD_P),
  NEON_CHECK_DISPOSABLE_CONFIRM: DISPOSABLE_TOKEN, NEON_CHECK_RUN_ID: RUN,
  PREFLIGHT_ONLY: "true", ...over,
});
const cfgOf = (over: Partial<HarnessEnv> = {}): HarnessConfig => {
  const p = parseHarnessEnv(env(over)); if (!p.ok) throw new Error(p.refusals.join("|")); return p.config;
};

/** 안전한 disposable DB 를 흉내내는 read-only 드라이버(allowlist query 만 응답). */
function cleanDriver(opts: { identity?: string; dirty?: boolean } = {}): RawDriver {
  const id = opts.identity ?? "same-db";
  let inTx = false;
  return {
    connect: async () => {},
    end: async () => {},
    query: async (sql: string) => {
      const head = sql.trim().split(/\s+/)[0].toUpperCase();
      if (head === "BEGIN") { inTx = true; return { rows: [] }; }
      if (head === "ROLLBACK") { inTx = false; return { rows: [] }; }
      if (/SET TRANSACTION READ ONLY/i.test(sql)) return { rows: [] };
      if (!inTx) throw new Error("트랜잭션 밖 query");
      if (/current_setting\('transaction_read_only'\) AS ro/.test(sql)) return { rows: [{ ro: "on" }] };
      if (/AS transaction_read_only/.test(sql)) return { rows: [{ transaction_read_only: "on", default_transaction_read_only: "off" }] };
      if (/database_hash/.test(sql)) return { rows: [{ database_hash: id, database_oid_hash: "o", schema_oid_hash: "s", server_version: "17.10" }] };
      if (/rolsuper/.test(sql) || /is_super/.test(sql)) return { rows: [{ is_super: false, can_create_role: true, can_create_db: false, can_login: true, bypass_rls: false }] };
      if (/rows_likely_present/.test(sql)) return { rows: [{ rows_likely_present: false, matched: 0 }] };
      if (/application_name/.test(sql)) return { rows: [{ application_name: "" }] };
      if (/catalog_visible/.test(sql)) return { rows: [{ server_version: "17.10", transaction_read_only: "on", catalog_visible: true }] };
      if (/server_version/.test(sql)) return { rows: [{ server_version: "17.10" }] };
      if (/count\(\*\)/.test(sql) || /AS n/.test(sql)) return { rows: [{ n: opts.dirty ? 3 : 0 }] };
      return { rows: [{}] };
    },
  };
}

const makeDriver = (opts: Parameters<typeof cleanDriver>[0] = {}) => async () => cleanDriver(opts);

describe("evidence 수명주기 — preflight 는 발급만, execute 가 소비", () => {
  test("preflight 성공 → evidence/key 발급되고 **소비되지 않은 상태**로 남는다", async () => {
    clearEvidence(); resetConsumedNonces();
    const cfg = cfgOf();
    const code = await runSelectOnlyPreflight(cfg, makeDriver());
    assert.equal(code, 0, "preflight 통과해야 함");
    const ex = evidenceExists();
    assert.equal(ex.evidence, true, "evidence 가 남아 있어야 execute 가 이어받는다");
    assert.equal(ex.key, true, "key 도 남아 있어야 한다");
    // 소비되지 않았음을 직접 확인: 지금 읽어서 검증하면 성공해야 한다
    const stored = consumeEvidence();
    assert.ok(stored.evidence && stored.key);
    assert.equal(verifySignedEvidence(cfg, stored.evidence, stored.key, Date.now()).ok, true);
    clearEvidence();
  });

  test("evidence 와 key 는 서로 다른 파일이고, evidence 파일에 key 가 없다", async () => {
    clearEvidence(); resetConsumedNonces();
    await runSelectOnlyPreflight(cfgOf(), makeDriver());
    assert.notEqual(evidencePath(), evidenceKeyPath());
    assert.equal(existsSync(evidencePath()), true);
    assert.equal(existsSync(evidenceKeyPath()), true);
    const ev = readFileSync(evidencePath(), "utf-8");
    const key = readFileSync(evidenceKeyPath(), "utf-8").trim();
    assert.ok(!ev.includes(key), "evidence 파일에 서명 키가 들어 있으면 안 된다");
    // 저장소 밖 경로여야 한다
    assert.ok(!evidencePath().replace(/\\/g, "/").startsWith(REPO.replace(/\\/g, "/")), "evidence 가 저장소 안에 저장됨");
    assert.ok(!evidenceKeyPath().replace(/\\/g, "/").startsWith(REPO.replace(/\\/g, "/")), "key 가 저장소 안에 저장됨");
    clearEvidence();
  });

  test("evidence·key 파일에 credential·DSN 원문 0", async () => {
    clearEvidence(); resetConsumedNonces();
    await runSelectOnlyPreflight(cfgOf(), makeDriver());
    const blob = readFileSync(evidencePath(), "utf-8") + readFileSync(evidenceKeyPath(), "utf-8");
    for (const leak of ["evuser", "evpass", "ep-life-1", "neon.tech", "lifedb", "postgresql://"]) {
      assert.ok(!blob.includes(leak), `${leak} 노출`);
    }
    clearEvidence();
  });

  test("★ 프로세스가 분리돼도 다음 프로세스가 evidence/key 를 읽고 검증할 수 있다", async () => {
    clearEvidence(); resetConsumedNonces();
    const cfg = cfgOf();
    await runSelectOnlyPreflight(cfg, makeDriver());

    // 별도 프로세스에서 읽어 검증 — 파일 기반 전달이 실제로 동작하는지(그동안 미검증이던 항목)
    const script = `
      import { consumeEvidence } from ${mod("scripts/neonCheck/evidenceStore.ts")};
      import { verifySignedEvidence } from ${mod("scripts/neonCheck/evidenceAuth.ts")};
      import { parseHarnessEnv } from ${mod("scripts/neonCheck/guards.ts")};
      const parsed = parseHarnessEnv(JSON.parse(process.env.EV_TEST_ENV));
      if (!parsed.ok) { console.log(JSON.stringify({ ok: false, why: "env" })); process.exit(0); }
      const stored = consumeEvidence();
      const r = verifySignedEvidence(parsed.config, stored.evidence, stored.key, Date.now());
      console.log(JSON.stringify({ ok: r.ok, hadEvidence: !!stored.evidence, hadKey: !!stored.key,
        refusals: r.ok ? [] : r.refusals }));
    `;
    const out = execFileSync(process.execPath, ["--import", "tsx/esm", "--input-type=module", "--eval", script], {
      cwd: REPO, encoding: "utf-8",
      env: { ...process.env, EV_TEST_ENV: JSON.stringify({ ...env(), PREFLIGHT_ONLY: undefined, CONFIRM_EXECUTE: "true" }) },
    });
    const res = JSON.parse(out.trim().split("\n").filter(Boolean).pop()!);
    assert.equal(res.hadEvidence, true, "다른 프로세스가 evidence 를 읽지 못함");
    assert.equal(res.hadKey, true, "다른 프로세스가 key 를 읽지 못함");
    assert.equal(res.ok, true, `다른 프로세스 검증 실패: ${JSON.stringify(res.refusals)}`);

    // 그 프로세스가 소비했으므로 **파일**이 사라져야 한다.
    // ⚠️ `evidenceExists()` 는 "메모리 또는 파일"을 본다. 이 테스트의 부모 프로세스에는 발급 당시의
    //    메모리 사본이 그대로 남아 있으므로(같은 프로세스 안에서는 정상 동작), 여기서는 **파일만** 확인한다.
    assert.equal(existsSync(evidencePath()), false, "소비 후 evidence 파일 잔존");
    assert.equal(existsSync(evidenceKeyPath()), false, "소비 후 key 파일 잔존");
    clearEvidence();
  });

  test("★ 두 번째 프로세스는 replay 로 거부된다(1회 소비)", async () => {
    clearEvidence(); resetConsumedNonces();
    await runSelectOnlyPreflight(cfgOf(), makeDriver());
    const runChild = () => {
      const script = `
        import { consumeEvidence } from ${mod("scripts/neonCheck/evidenceStore.ts")};
        import { verifySignedEvidence } from ${mod("scripts/neonCheck/evidenceAuth.ts")};
        import { parseHarnessEnv } from ${mod("scripts/neonCheck/guards.ts")};
        const parsed = parseHarnessEnv(JSON.parse(process.env.EV_TEST_ENV));
        const stored = consumeEvidence();
        const r = verifySignedEvidence(parsed.config, stored.evidence, stored.key, Date.now());
        console.log(JSON.stringify({ ok: r.ok, refusals: r.ok ? [] : r.refusals }));
      `;
      const out = execFileSync(process.execPath, ["--import", "tsx/esm", "--input-type=module", "--eval", script], {
        cwd: REPO, encoding: "utf-8",
        env: { ...process.env, EV_TEST_ENV: JSON.stringify({ ...env(), PREFLIGHT_ONLY: undefined, CONFIRM_EXECUTE: "true" }) },
      });
      return JSON.parse(out.trim().split("\n").filter(Boolean).pop()!);
    };
    assert.equal(runChild().ok, true, "첫 프로세스는 통과");
    const second = runChild();
    assert.equal(second.ok, false, "두 번째 프로세스가 통과함 — replay 차단 실패");
    assert.match(JSON.stringify(second.refusals), /evidence 없음|서명 키 없음/);
    clearEvidence();
  });

  test("preflight 실패 시 이전 evidence 가 남아 execute 를 열지 않는다", async () => {
    clearEvidence(); resetConsumedNonces();
    // 1) 성공 → evidence 존재
    await runSelectOnlyPreflight(cfgOf(), makeDriver());
    assert.equal(evidenceExists().evidence, true);
    // 2) 같은 run 에서 안전 조건 위반 상태로 재실행 → 이전 evidence 가 폐기되어야 한다
    const code = await runSelectOnlyPreflight(cfgOf(), makeDriver({ dirty: true }));
    assert.equal(code, 3, "안전 조건 위반은 exit 3");
    assert.deepEqual(evidenceExists(), { evidence: false, key: false }, "실패 후 이전 evidence 가 남았다");
    clearEvidence();
  });

  test("direct/pooled identity 불일치 → evidence 미발급", async () => {
    clearEvidence(); resetConsumedNonces();
    const cfg = cfgOf();
    let call = 0;
    const alternating = async () => cleanDriver({ identity: call++ === 0 ? "db-A" : "db-B" });
    const code = await runSelectOnlyPreflight(cfg, alternating);
    assert.equal(code, 3);
    assert.deepEqual(evidenceExists(), { evidence: false, key: false });
    clearEvidence();
  });
});
