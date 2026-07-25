// name-report 업무 처리 최소권한 role(orchestration_report_processor) 계약 — migration grants·URL 해석(fail-closed)·inspect/rollback·소스 배선(정적/단위).
//   실제 권한 강제(업무 테이블 SELECT/INSERT/UPDATE 허용 + 초과 거부)는 embedded PG E2E(runQueueRuntimeE2E.ts)에서 실 role 로 검증.
import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { resolveNameReportProcessorUrl, nameReportProcessorPool } from "../../server/knop/reportSync";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const grants = readFileSync(path.join(root, "migrations", "0005c_name_report_processor_grants.sql"), "utf-8");
const reportSyncSrc = readFileSync(path.join(root, "server", "knop", "reportSync.ts"), "utf-8");
const applySrc = readFileSync(path.join(root, "scripts", "applyQueueRuntime.ts"), "utf-8");
const workerSrc = readFileSync(path.join(root, "scripts", "queueWorker.ts"), "utf-8");

afterEach(() => { delete process.env.NAME_REPORT_DB_URL; });

describe("report_processor — migration grants(최소권한)", () => {
  test("role 생성 + 정확한 최소 grant", () => {
    assert.match(grants, /CREATE ROLE orchestration_report_processor LOGIN/);
    assert.match(grants, /GRANT USAGE ON SCHEMA public TO orchestration_report_processor/);
    assert.match(grants, /GRANT SELECT\s+ON "customers"\s+TO orchestration_report_processor/);
    assert.match(grants, /GRANT SELECT\s+ON "consultations"\s+TO orchestration_report_processor/);
    assert.match(grants, /GRANT SELECT, INSERT\s+ON "crm_files"\s+TO orchestration_report_processor/);
    assert.match(grants, /GRANT SELECT, INSERT, UPDATE ON "report_matches" TO orchestration_report_processor/);
    assert.match(grants, /GRANT CONNECT ON DATABASE[^;]*orchestration_report_processor/);
  });
  test("초과 권한 없음: DELETE·jobs·job_executions·customers UPDATE 부여 라인 없음", () => {
    const g = grants.split(/\r?\n/).filter((l) => /GRANT/.test(l) && /orchestration_report_processor/.test(l));
    for (const l of g) {
      assert.ok(!/\bDELETE\b/.test(l), `DELETE 금지: ${l}`);
      assert.ok(!/job_executions|"jobs"/.test(l), `jobs 접근 금지: ${l}`);
      // customers/consultations 는 SELECT 만 — UPDATE/INSERT 없어야
      if (/"customers"|"consultations"/.test(l)) assert.ok(!/\b(UPDATE|INSERT)\b/.test(l), `customers/consultations 는 SELECT 만: ${l}`);
    }
  });
});

describe("report_processor — URL 해석(fail-closed, 소유자 fallback 없음)", () => {
  test("resolveNameReportProcessorUrl 은 NAME_REPORT_DB_URL 만 본다", () => {
    assert.equal(resolveNameReportProcessorUrl(), null);
    process.env.NEON_DATABASE_URL = "postgresql://neondb_owner:p@h/db"; // 소유자 있어도
    assert.equal(resolveNameReportProcessorUrl(), null, "소유자 URL 로 fallback 하지 않음");
    process.env.NAME_REPORT_DB_URL = "postgresql://orchestration_report_processor:p@h/db";
    assert.equal(resolveNameReportProcessorUrl(), "postgresql://orchestration_report_processor:p@h/db");
    delete process.env.NEON_DATABASE_URL;
  });
  test("nameReportProcessorPool 은 미설정 시 fail-closed(throw)", () => {
    assert.throws(() => nameReportProcessorPool(), /NAME_REPORT_DB_URL 미설정/);
  });
});

describe("report_processor — 소스 배선", () => {
  test("makeLocalNameReportDeps 는 최소권한 풀(nameReportProcessorPool)로 업무 DB 접근", () => {
    assert.match(reportSyncSrc, /buildProcessorDeps\(state,\s*nameReportProcessorPool\)/);
    assert.match(reportSyncSrc, /소유자 fallback 없음/);
  });
  test("syncReports 큐 모드는 drizzle db(소유자) 불필요", () => {
    assert.match(reportSyncSrc, /if \(_syncing \|\| !reportsAvailable\(\)\) return empty;/);
    assert.match(reportSyncSrc, /if \(!nameReportQueueEnabled\(\) && !db\) return empty;/);
  });
  test("queueWorker 는 로컬 .env 로드(NAME_REPORT_DB_URL·R2·Python)", () => {
    assert.match(workerSrc, /import "dotenv\/config"/);
  });
});

describe("report_processor — inspect/rollback", () => {
  test("applyQueueRuntime inspect 가 report_processor 최소권한 검증(초과 거부 포함)", () => {
    assert.match(applySrc, /orchestration_report_processor/);
    assert.match(applySrc, /NOT has_table_privilege\('orchestration_report_processor','customers','UPDATE'\)/);
    assert.match(applySrc, /NOT has_table_privilege\('orchestration_report_processor','jobs','SELECT'\)/);
    assert.match(applySrc, /SQL_0005C\(\)/);
  });
  test("rollback 이 report_processor REVOKE + DROP", () => {
    assert.match(applySrc, /DROP ROLE orchestration_report_processor/);
  });
});
