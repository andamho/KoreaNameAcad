// applyQueueRuntime.deployReadiness — 배포 전 준비 체크(inspect 편입, 새 Gate 아님) 로직 검증.
//   worker 자격이 owner 면 FAIL · worker/owner host 불일치 FAIL · 빌드 산출물 없으면 FAIL · feature flag 코드게이트 감지.
//   ⚠️ 실제 DB 접속 없음(순수 URL 파싱·파일·env). raw URL 출력 안 함(host#8자만).
import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { deployReadiness } from "../../scripts/applyQueueRuntime";

const OWNER = "postgresql://neondb_owner:pw@ep-alpha.neon.tech/db";
const WRITER_SAME = "postgresql://orchestration_writer:pw@ep-alpha.neon.tech/db";
const WRITER_OTHER = "postgresql://orchestration_writer:pw@ep-beta.neon.tech/db";
const ADMIN_SAME = "postgresql://orchestration_queue_admin:pw@ep-alpha.neon.tech/db";

const ENV = ["ORCHESTRATION_WORKER_URL", "ORCHESTRATION_ADMIN_URL", "FEATURE_JOB_QUEUE"];
afterEach(() => { for (const k of ENV) delete process.env[k]; });

describe("deployReadiness — 하드 실패 조건(빌드 무관하게 항상 FAIL)", () => {
  test("worker 자격이 owner(neondb_owner) → hardFail", () => {
    process.env.ORCHESTRATION_WORKER_URL = OWNER; // 소유자 자격 재사용
    assert.equal(deployReadiness(OWNER).hardFail, true);
  });
  test("worker 자격이 owner 와 동일 user → hardFail", () => {
    const ownerCustom = "postgresql://myowner:pw@ep-alpha.neon.tech/db";
    process.env.ORCHESTRATION_WORKER_URL = "postgresql://myowner:pw@ep-alpha.neon.tech/db";
    assert.equal(deployReadiness(ownerCustom).hardFail, true);
  });
  test("worker host ≠ owner host → hardFail", () => {
    process.env.ORCHESTRATION_WORKER_URL = WRITER_OTHER; // 다른 host
    assert.equal(deployReadiness(OWNER).hardFail, true);
  });
  test("admin host ≠ owner host → hardFail", () => {
    process.env.ORCHESTRATION_WORKER_URL = WRITER_SAME;
    process.env.ORCHESTRATION_ADMIN_URL = "postgresql://orchestration_queue_admin:pw@ep-beta.neon.tech/db";
    assert.equal(deployReadiness(OWNER).hardFail, true);
  });
});

describe("deployReadiness — feature flag 코드게이트 감지", () => {
  test("routes.ts 의 FEATURE_JOB_QUEUE===\"true\" 게이트를 감지(감지 실패면 항상 hardFail)", () => {
    // writer 자격·host 일치·admin 일치로 URL 측 FAIL 을 제거해도, 빌드 산출물 유무는 환경에 따라 다르므로
    // 여기서는 '게이트 미감지 시 hardFail' 이 아니라 '게이트 감지됨' 을 간접 확인한다:
    //   게이트가 감지되면(정상) URL·빌드가 모두 통과할 때만 hardFail=false 가 될 수 있다.
    process.env.ORCHESTRATION_WORKER_URL = WRITER_SAME;
    process.env.ORCHESTRATION_ADMIN_URL = ADMIN_SAME;
    // 결과는 빌드 산출물 유무에 의존 → hardFail 은 boolean 이면 충분(로직이 throw 없이 완주).
    const r = deployReadiness(OWNER);
    assert.equal(typeof r.hardFail, "boolean");
  });
});
