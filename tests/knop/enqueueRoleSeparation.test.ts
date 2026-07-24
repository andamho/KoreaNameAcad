// enqueuer 최소권한 분리 계약 — role 매핑·fail-closed·migration grants·inspect 검증(정적/단위).
//   실제 권한 강제(claim/execution/reaper 거부)는 embedded PG E2E(runQueueRuntimeE2E.ts)에서 실 role 로 검증.
import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { QUEUE_URL_ENV, queueConnectionConfigured } from "../../server/jobQueue/connection";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const grants = readFileSync(path.join(root, "migrations", "0005b_queue_runtime_grants.sql"), "utf-8");
const reportSyncSrc = readFileSync(path.join(root, "server", "knop", "reportSync.ts"), "utf-8");
const applySrc = readFileSync(path.join(root, "scripts", "applyQueueRuntime.ts"), "utf-8");

const ENV = ["ORCHESTRATION_ENQUEUE_URL", "ORCHESTRATION_WORKER_URL", "ORCHESTRATION_ADMIN_URL"];
afterEach(() => { for (const k of ENV) delete process.env[k]; });

describe("enqueuer 역할 분리 — 연결 매핑", () => {
  test("세 역할 전용 env 로 분리(fallback 없음)", () => {
    assert.equal(QUEUE_URL_ENV.enqueue, "ORCHESTRATION_ENQUEUE_URL");
    assert.equal(QUEUE_URL_ENV.worker, "ORCHESTRATION_WORKER_URL");
    assert.equal(QUEUE_URL_ENV.admin, "ORCHESTRATION_ADMIN_URL");
  });
  test("queueConnectionConfigured('enqueue') 는 ENQUEUE_URL 만 본다(worker/owner 무관)", () => {
    assert.equal(queueConnectionConfigured("enqueue"), false);
    process.env.ORCHESTRATION_WORKER_URL = "postgresql://w:p@h/db"; // worker 있어도
    assert.equal(queueConnectionConfigured("enqueue"), false, "worker URL 은 enqueue 로 fallback 안 됨");
    process.env.ORCHESTRATION_ENQUEUE_URL = "postgresql://e:p@h/db";
    assert.equal(queueConnectionConfigured("enqueue"), true);
  });
});

describe("enqueuer 역할 분리 — reportSync fail-closed", () => {
  test("enqueue 경로는 ORCHESTRATION_ENQUEUE_URL 만 읽고 worker/owner fallback 없음", () => {
    assert.match(reportSyncSrc, /queueConnectionConfigured\("enqueue"\)/);
    assert.match(reportSyncSrc, /acquireQueueClient\("enqueue"\)/);
    assert.ok(!/acquireQueueClient\("worker"\)/.test(reportSyncSrc), "reportSync 가 worker 연결로 enqueue 하면 과권한");
    assert.match(reportSyncSrc, /ORCHESTRATION_ENQUEUE_URL 미설정.*fail-closed/);
  });
});

describe("enqueuer 역할 분리 — migration grants(최소권한)", () => {
  test("orchestration_enqueuer 생성 + jobs SELECT,INSERT + CONNECT/USAGE", () => {
    assert.match(grants, /CREATE ROLE orchestration_enqueuer LOGIN/);
    assert.match(grants, /GRANT USAGE ON SCHEMA public TO orchestration_enqueuer/);
    assert.match(grants, /GRANT SELECT, INSERT ON "jobs" TO orchestration_enqueuer/);
    assert.match(grants, /GRANT CONNECT ON DATABASE[^;]*orchestration_enqueuer/);
  });
  test("enqueuer 에 job_executions·UPDATE·DELETE 부여 없음", () => {
    // enqueuer 를 언급하는 GRANT 라인에 job_executions/UPDATE/DELETE 가 없어야 한다.
    const eqGrants = grants.split(/\r?\n/).filter((l) => /GRANT/.test(l) && /orchestration_enqueuer/.test(l));
    for (const l of eqGrants) {
      assert.ok(!/job_executions/.test(l), `enqueuer 에 job_executions 권한 금지: ${l}`);
      assert.ok(!/\bUPDATE\b|\bDELETE\b/.test(l), `enqueuer 에 UPDATE/DELETE 금지: ${l}`);
    }
  });
});

describe("enqueuer 역할 분리 — inspect/rollback", () => {
  test("applyQueueRuntime inspect 가 enqueuer 최소권한 검증", () => {
    assert.match(applySrc, /orchestration_enqueuer/);
    assert.match(applySrc, /NOT has_table_privilege\('orchestration_enqueuer','jobs','UPDATE'\)/);
    assert.match(applySrc, /NOT has_table_privilege\('orchestration_enqueuer','job_executions','INSERT'\)/);
  });
  test("rollback 이 enqueuer REVOKE + DROP", () => {
    assert.match(applySrc, /DROP ROLE orchestration_enqueuer/);
  });
});
