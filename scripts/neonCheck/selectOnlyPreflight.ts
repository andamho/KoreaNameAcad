// SELECT-only preflight 본체 — 읽기 전용 연결로 **실제 DB 안전 조건**을 확인한다.
// DDL 0 · DML 0 · synthetic object 0 · COMMIT 0. 모든 probe 는 allowlist query ID 로만 실행된다.
import crypto from "node:crypto";
import { ReadOnlySession, connectReadOnly, ReadOnlyViolationError, type RawDriver } from "./readOnlyAdapter";
import { maskUrl, hostHashOf, sanitizeError } from "./secrets";
import { scopedNames } from "./identifiers";
import type { HarnessConfig } from "./guards";

export const PREFLIGHT_STATUSES = [
  "preflight-passed",
  "preflight-aborted-safety-guard",
  "preflight-target-identity-unverified",
  "preflight-connection-failed",
  "preflight-readonly-enforcement-failed",
] as const;
export type PreflightStatus = (typeof PREFLIGHT_STATUSES)[number];

export const POOLER_CONFIDENCES = ["confirmed", "consistent-with-transaction-pooling", "unverified"] as const;
export type PoolerConfidence = (typeof POOLER_CONFIDENCES)[number];

export const CREATE_ROLE_CAPABILITY = ["likely-capable", "unverified", "likely-incapable"] as const;
export type CreateRoleCapability = (typeof CREATE_ROLE_CAPABILITY)[number];

/** 업무/운영 표식 — 이름은 **입력 파라미터로만** 쓰이고 결과에 원문이 실리지 않는다. */
export const BUSINESS_TABLE_MARKERS = [
  "customers", "consultations", "calls", "call_transcripts", "reports", "report_matches",
  "jobs", "job_executions", "job_shadow_previews", "job_artifacts", "orchestration_audit_log",
];
export const MIGRATION_HISTORY_MARKERS = ["__drizzle_migrations", "schema_migrations", "migrations"];
export const ALLOWED_SCHEMAS = ["public"];

export interface DirectProbeResult {
  connected: boolean;
  readOnlyEnforced: boolean;
  serverVersion: string;
  databaseIdentity: string;      // masked (hash prefix)
  identityFingerprint: string;   // direct/pooled 대조용 (전체 hash)
  publicUserTableCount: number;
  userSchemaCount: number;
  businessTableCount: number;
  businessRowsPresent: boolean;
  migrationHistoryCount: number;
  orchestrationRoleCount: number;
  residualCount: number;
  syntheticNameConflicts: number;
  createRoleCapability: CreateRoleCapability;
  queryCount: number;
  error?: string;
}
export interface PooledProbeResult {
  connected: boolean;
  readOnlyEnforced: boolean;
  serverVersion: string;
  databaseIdentity: string;
  identityFingerprint: string;
  reconnectOk: boolean;
  sessionStateLeak: boolean;
  poolerConfidence: PoolerConfidence;
  queryCount: number;
  error?: string;
}

export interface PreflightReport {
  mode: "select-only-preflight";
  status: PreflightStatus;
  runId: string;
  directFingerprint: string;
  pooledFingerprint: string;
  databaseIdentity: string;
  serverVersion: string;
  readOnlyState: "enforced" | "not-enforced" | "unknown";
  publicUserTableCount: number;
  businessTableCount: number;
  businessRowsPresent: boolean;
  migrationHistoryCount: number;
  orchestrationRoleCount: number;
  residualCount: number;
  identityMatch: boolean;
  poolerConfidence: PoolerConfidence;
  createRoleCapability: CreateRoleCapability;
  queryCount: number;
  dbWrites: 0;
  ddl: 0;
  refusals: string[];
  nextAction: string;
}

/** identity 지문 — 원문 없이 direct/pooled 가 같은 DB 인지 판정한다. */
function identityOf(row: any): string {
  return crypto.createHash("sha256")
    .update([row?.database_hash, row?.database_oid_hash, row?.schema_oid_hash, row?.server_version].join("|"))
    .digest("hex");
}
const short = (h: string) => `db#${h.slice(0, 8)}…`;

export async function probeDirect(driver: RawDriver, cfg: HarnessConfig): Promise<DirectProbeResult> {
  const empty: DirectProbeResult = {
    connected: false, readOnlyEnforced: false, serverVersion: "", databaseIdentity: "db#unknown",
    identityFingerprint: "", publicUserTableCount: -1, userSchemaCount: -1, businessTableCount: -1,
    businessRowsPresent: true, migrationHistoryCount: -1, orchestrationRoleCount: -1, residualCount: -1,
    syntheticNameConflicts: -1, createRoleCapability: "unverified", queryCount: 0,
  };
  const conn = await connectReadOnly(driver);
  if (!conn.ok) return { ...empty, error: `${conn.error.name}:${conn.error.code ?? ""}` };

  const names = scopedNames(cfg.runId);
  try {
    return await ReadOnlySession.withSession(driver, async (s) => {
      const version = (await s.run("server-version")).rows[0]?.server_version ?? "";
      const ident = (await s.run("identity-fingerprint")).rows[0] ?? {};
      const fp = identityOf(ident);
      const role = (await s.run("role-attributes")).rows[0] ?? {};
      const publicTables = (await s.run("public-user-tables")).rows[0]?.n ?? -1;
      const schemas = (await s.run("user-schemas", [ALLOWED_SCHEMAS])).rows[0]?.n ?? -1;
      const business = (await s.run("business-tables", [BUSINESS_TABLE_MARKERS])).rows[0]?.n ?? -1;
      const rowsRow = (await s.run("business-rows-present", [BUSINESS_TABLE_MARKERS])).rows[0] ?? {};
      const migration = (await s.run("migration-history", [MIGRATION_HISTORY_MARKERS])).rows[0]?.n ?? -1;
      const orchRoles = (await s.run("orchestration-roles")).rows[0]?.n ?? -1;
      const residue = (await s.run("run-scoped-residue", [`%${cfg.runId}%`])).rows[0]?.n ?? -1;
      const conflict = (await s.run("synthetic-name-conflict", [names.schema])).rows[0]?.n ?? -1;
      return {
        connected: true, readOnlyEnforced: true, serverVersion: String(version),
        databaseIdentity: short(fp), identityFingerprint: fp,
        publicUserTableCount: Number(publicTables), userSchemaCount: Number(schemas),
        businessTableCount: Number(business),
        businessRowsPresent: rowsRow.rows_likely_present === true,
        migrationHistoryCount: Number(migration), orchestrationRoleCount: Number(orchRoles),
        residualCount: Number(residue), syntheticNameConflicts: Number(conflict),
        createRoleCapability: classifyCreateRole(role), queryCount: s.executedQueryCount,
      };
    });
  } catch (e) {
    const err = sanitizeError(e);
    const readOnlyFail = e instanceof ReadOnlyViolationError;
    return { ...empty, connected: true, readOnlyEnforced: !readOnlyFail, error: `${err.name}:${err.code ?? ""}` };
  }
}

/** DDL 없이 확정할 수 없으므로 **단정하지 않는다**(§6). */
export function classifyCreateRole(role: any): CreateRoleCapability {
  if (role?.is_super === true || role?.can_create_role === true) return "likely-capable";
  if (role?.can_create_role === false) return "likely-incapable";
  return "unverified";
}

export async function probePooled(driver: RawDriver, reconnect: () => Promise<RawDriver | null>): Promise<PooledProbeResult> {
  const empty: PooledProbeResult = {
    connected: false, readOnlyEnforced: false, serverVersion: "", databaseIdentity: "db#unknown",
    identityFingerprint: "", reconnectOk: false, sessionStateLeak: true, poolerConfidence: "unverified", queryCount: 0,
  };
  const conn = await connectReadOnly(driver);
  if (!conn.ok) return { ...empty, error: `${conn.error.name}:${conn.error.code ?? ""}` };

  try {
    const first = await ReadOnlySession.withSession(driver, async (s) => {
      const ident = (await s.run("identity-fingerprint")).rows[0] ?? {};
      const signals = (await s.run("pooler-signals")).rows[0] ?? {};
      return { fp: identityOf(ident), version: String(signals.server_version ?? ""), q: s.executedQueryCount };
    });
    // transaction boundary 이후 session 상태가 남는지 — 두 번째 트랜잭션에서 관찰
    const second = await ReadOnlySession.withSession(driver, async (s) => {
      const ro = (await s.run("readonly-state")).rows[0] ?? {};
      const marker = (await s.run("session-marker-probe")).rows[0] ?? {};
      return {
        // 새 트랜잭션에서도 read-only 가 다시 걸렸는지(= 트랜잭션마다 재설정이 동작)
        reEnforced: String(ro.transaction_read_only ?? "").toLowerCase() === "on",
        // 이전 트랜잭션의 SET LOCAL 이 남아 있지 않아야 한다
        leak: String(marker.application_name ?? "") === "oc-preflight-local-marker",
        q: s.executedQueryCount,
      };
    });
    const reconnected = await reconnect();
    let reconnectOk = false;
    if (reconnected) {
      const rc = await connectReadOnly(reconnected);
      if (rc.ok) {
        reconnectOk = await ReadOnlySession.withSession(reconnected, async (s) => {
          const ident = (await s.run("identity-fingerprint")).rows[0] ?? {};
          return identityOf(ident) === first.fp;
        }).catch(() => false);
      }
      await reconnected.end().catch(() => {});
    }
    return {
      connected: true, readOnlyEnforced: second.reEnforced, serverVersion: first.version,
      databaseIdentity: short(first.fp), identityFingerprint: first.fp,
      reconnectOk, sessionStateLeak: second.leak,
      poolerConfidence: classifyPooler({ reEnforced: second.reEnforced, leak: second.leak, reconnectOk }),
      queryCount: first.q + second.q,
    };
  } catch (e) {
    const err = sanitizeError(e);
    return { ...empty, connected: true, readOnlyEnforced: !(e instanceof ReadOnlyViolationError), error: `${err.name}:${err.code ?? ""}` };
  }
}

/**
 * pooler mode 판정 — **authoritative signal 이 없으면 confirmed 를 쓰지 않는다.**
 * 읽기 전용 probe 로는 "transaction pooling 과 모순되지 않는다"까지만 말할 수 있다.
 */
export function classifyPooler(o: { reEnforced: boolean; leak: boolean; reconnectOk: boolean }): PoolerConfidence {
  if (o.leak) return "unverified";                                  // session 상태가 새면 판정 불가
  if (o.reEnforced && o.reconnectOk) return "consistent-with-transaction-pooling";
  return "unverified";
}

export interface PreflightInput {
  cfg: HarnessConfig;
  direct: DirectProbeResult;
  pooled: PooledProbeResult;
}

/** 결과 종합 — 성공 조건(§9)을 전부 만족해야 `preflight-passed`. */
export function summarizePreflight({ cfg, direct, pooled }: PreflightInput): PreflightReport {
  const refusals: string[] = [];
  const base: PreflightReport = {
    mode: "select-only-preflight", status: "preflight-passed", runId: cfg.runId,
    directFingerprint: maskUrl(cfg.directUrl), pooledFingerprint: maskUrl(cfg.pooledUrl),
    databaseIdentity: direct.databaseIdentity, serverVersion: direct.serverVersion,
    readOnlyState: direct.readOnlyEnforced && pooled.readOnlyEnforced ? "enforced" : direct.connected || pooled.connected ? "not-enforced" : "unknown",
    publicUserTableCount: direct.publicUserTableCount, businessTableCount: direct.businessTableCount,
    businessRowsPresent: direct.businessRowsPresent, migrationHistoryCount: direct.migrationHistoryCount,
    orchestrationRoleCount: direct.orchestrationRoleCount, residualCount: direct.residualCount,
    identityMatch: !!direct.identityFingerprint && direct.identityFingerprint === pooled.identityFingerprint,
    poolerConfidence: pooled.poolerConfidence, createRoleCapability: direct.createRoleCapability,
    queryCount: direct.queryCount + pooled.queryCount, dbWrites: 0, ddl: 0,
    refusals, nextAction: "",
  };

  // 1. 연결
  if (!direct.connected) refusals.push("direct 연결 실패");
  if (!pooled.connected) refusals.push("pooled 연결 실패");
  if (refusals.length) return { ...base, status: "preflight-connection-failed", refusals, nextAction: "credential/endpoint 확인 후 재시도. execute 승인 불가." };

  // 2. read-only 강제
  if (!direct.readOnlyEnforced) refusals.push("direct read-only 트랜잭션 강제 실패");
  if (!pooled.readOnlyEnforced) refusals.push("pooled read-only 트랜잭션 강제 실패");
  if (refusals.length) return { ...base, status: "preflight-readonly-enforcement-failed", refusals, nextAction: "읽기 전용 강제가 실패했으므로 execute 승인 불가." };

  // 3. 안전 조건(카탈로그)
  if (direct.publicUserTableCount !== 0) refusals.push(`public 사용자 테이블 ${direct.publicUserTableCount}개 발견 → disposable 아님`);
  if (direct.businessTableCount > 0) refusals.push(`업무/운영 테이블 ${direct.businessTableCount}종 발견`);
  if (direct.businessRowsPresent) refusals.push("업무 테이블에 데이터 존재 가능성 발견");
  if (direct.migrationHistoryCount > 0) refusals.push(`migration history ${direct.migrationHistoryCount}건 발견`);
  if (direct.orchestrationRoleCount > 0) refusals.push(`production 이름 orchestration_* role ${direct.orchestrationRoleCount}개 발견`);
  if (direct.residualCount > 0) refusals.push(`이전 run-id 잔여 object ${direct.residualCount}개 발견(수동 cleanup 필요)`);
  if (direct.syntheticNameConflicts > 0) refusals.push(`synthetic 이름 충돌 object ${direct.syntheticNameConflicts}개 발견`);
  if (direct.userSchemaCount > 0) refusals.push(`허용 목록 밖 user schema ${direct.userSchemaCount}개 발견`);
  if (refusals.length) return { ...base, status: "preflight-aborted-safety-guard", refusals, nextAction: "disposable 환경을 새로 만드세요. execute 승인 불가." };

  // 4. direct/pooled 동일 대상
  if (!base.identityMatch) {
    refusals.push("direct/pooled 가 같은 disposable DB 를 가리킨다는 증거 부족(identity fingerprint 불일치)");
    return { ...base, status: "preflight-target-identity-unverified", refusals, nextAction: "두 endpoint 가 동일 대상인지 확인 후 재시도. execute 승인 불가." };
  }

  return { ...base, status: "preflight-passed", refusals: [], nextAction: "운영자에게 masked 결과 공유 → 별도 execute 승인 Gate." };
}

/** 마스킹된 보고 줄. 원문 식별자(URL/host/db/user/role/table/migration)는 어떤 경로로도 실리지 않는다. */
export function formatPreflightReport(r: PreflightReport): string[] {
  return [
    `[preflight] mode=${r.mode} status=${r.status} runId=${r.runId}`,
    `[preflight] direct=${r.directFingerprint} pooled=${r.pooledFingerprint} database=${r.databaseIdentity} identityMatch=${r.identityMatch}`,
    `[preflight] server=${r.serverVersion} readOnly=${r.readOnlyState} queries=${r.queryCount} dbWrites=${r.dbWrites} ddl=${r.ddl}`,
    `[preflight] publicUserTables=${r.publicUserTableCount} businessTables=${r.businessTableCount} businessRows=${r.businessRowsPresent}`
      + ` migrationHistory=${r.migrationHistoryCount} orchestrationRoles=${r.orchestrationRoleCount} residue=${r.residualCount}`,
    `[preflight] poolerConfidence=${r.poolerConfidence} createRoleCapability=${r.createRoleCapability}`,
    ...r.refusals.map((x) => `[preflight] REFUSED ${x}`),
    `[preflight] next: ${r.nextAction}`,
  ];
}

// ── execute 차단 evidence ────────────────────────────────────────────────────
// ⚠️ 이전 판의 단순 `sha256(evidence body)` 방식은 **제거**했다(누구나 재계산 가능 = 위조 가능).
//    현재 계약은 `evidenceAuth.ts` 의 **HMAC-SHA256 + nonce + 만료 + 1회 소비**다.
//    발급/검증 API 는 그쪽을 사용한다: `issueSignedEvidence()` / `verifySignedEvidence()`.
export { EVIDENCE_SCHEMA_VERSION, EVIDENCE_MAX_AGE_MS, generateEvidenceKey, generateNonce,
         issueSignedEvidence, verifySignedEvidence, type SignedPreflightEvidence } from "./evidenceAuth";
