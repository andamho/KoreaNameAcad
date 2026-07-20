// safety guard validator — 환경변수 계약(연결 전) + preflight 카탈로그 판정(연결 후).
// dry-run 과 execute 가 **동일 guard/plan** 을 공유한다. execute 에서 guard 를 생략·캐시하지 않는다.
import { hostHashOf } from "./secrets";
import { RUN_ID_RE } from "./identifiers";

export const DISPOSABLE_TOKEN = "i-confirm-disposable-neon-branch";

export interface HarnessEnv {
  NEON_CHECK_DIRECT_URL?: string;
  NEON_CHECK_POOLED_URL?: string;
  NEON_CHECK_EXPECTED_HOST_HASH?: string;
  NEON_CHECK_FORBIDDEN_HOST_HASH?: string;
  NEON_CHECK_DISPOSABLE_CONFIRM?: string;
  NEON_CHECK_RUN_ID?: string;
  CONFIRM_EXECUTE?: string;
}
export interface HarnessConfig {
  directUrl: string;
  pooledUrl: string | null;
  expectedHostHash: string;
  forbiddenHostHash: string | null;
  runId: string;
  execute: boolean;
}
export interface GuardResult { ok: boolean; refusals: string[] }

/** 1단계: 연결 전 형식·핀 검증. 실패 시 DB 연결을 시도하지 않는다. */
export function parseHarnessEnv(env: HarnessEnv): { ok: true; config: HarnessConfig } | { ok: false; refusals: string[] } {
  const r: string[] = [];
  const direct = (env.NEON_CHECK_DIRECT_URL ?? "").trim();
  const pooled = (env.NEON_CHECK_POOLED_URL ?? "").trim();
  const expect = (env.NEON_CHECK_EXPECTED_HOST_HASH ?? "").trim().toLowerCase();
  const forbid = (env.NEON_CHECK_FORBIDDEN_HOST_HASH ?? "").trim().toLowerCase();
  const token = (env.NEON_CHECK_DISPOSABLE_CONFIRM ?? "").trim();
  const runId = (env.NEON_CHECK_RUN_ID ?? "").trim();
  const hex = (s: string) => /^[0-9a-f]{64}$/.test(s);

  if (!direct) r.push("NEON_CHECK_DIRECT_URL 없음");
  if (token !== DISPOSABLE_TOKEN) r.push("disposable 확인 토큰 불일치/누락");
  if (!hex(expect)) r.push("NEON_CHECK_EXPECTED_HOST_HASH 없음/형식오류");
  if (!RUN_ID_RE.test(runId)) r.push("NEON_CHECK_RUN_ID 없음/형식오류([a-z0-9]{4,16})");
  if (forbid && !hex(forbid)) r.push("NEON_CHECK_FORBIDDEN_HOST_HASH 형식오류");
  if (direct && hex(expect) && hostHashOf(direct) !== expect) r.push("direct URL host hash ≠ expected pin");
  if (direct && forbid && hex(forbid) && hostHashOf(direct) === forbid) r.push("direct URL 이 production host hash 와 일치 → 거부");
  if (pooled && forbid && hex(forbid) && hostHashOf(pooled) === forbid) r.push("pooled URL 이 production host hash 와 일치 → 거부");
  if (pooled && direct && pooled === direct) r.push("direct/pooled URL 이 동일 → pooler 검증 불가(거부)");
  if (pooled && direct && hostHashOf(pooled) === hostHashOf(direct)) r.push("direct/pooled host 가 동일 → endpoint 구분 불가(거부)");

  if (r.length) return { ok: false, refusals: r };
  return { ok: true, config: { directUrl: direct, pooledUrl: pooled || null, expectedHostHash: expect, forbiddenHostHash: forbid || null, runId, execute: (env.CONFIRM_EXECUTE ?? "") === "true" } };
}

// ── 2단계: 연결 후 카탈로그 관찰 판정 ────────────────────────────────────────
export interface CatalogProbe {
  serverVersion: string;
  /** public schema 의 '일반 사용자 테이블' 수(ordinary + partitioned, extension 소유 제외) */
  publicUserTableCount: number;
  /** 운영 표식 테이블(customers/calls/jobs 등) 발견 수 */
  businessTableCount: number;
  /** 그 테이블들의 행수 합 */
  businessRowTotal: number;
  /** production migration history 흔적 */
  productionMigrationHistory: boolean;
  /** production 이름 orchestration_* role 수 */
  productionOrchRoleCount: number;
  /** 동일 run-id 잔여 object/role 수 */
  runScopedLeftoverCount: number;
  /** 허용 목록 밖 non-system user schema 수 */
  unexpectedSchemaCount: number;
  /** direct/pooled endpoint 구분 가능 여부 */
  endpointDistinguishable: boolean;
  /** 현재 role 이 CREATE ROLE 가능한가(하네스 동작 전제) */
  canCreateRole: boolean;
}

/** 하나라도 걸리면 aborted-safety-guard. 판정 불확실도 거부(fail-closed). */
export function evaluatePreflight(probe: CatalogProbe): GuardResult {
  const r: string[] = [];
  if (probe.publicUserTableCount !== 0) r.push(`public schema 사용자 테이블 ${probe.publicUserTableCount}개 발견 → disposable 아님(hard stop)`);
  if (probe.businessTableCount > 0) r.push(`업무/운영 테이블 ${probe.businessTableCount}종 발견 → 거부`);
  if (probe.businessRowTotal > 0) r.push(`기존 데이터 행 ${probe.businessRowTotal} 발견 → 거부`);
  if (probe.productionMigrationHistory) r.push("production migration history 발견 → 거부");
  if (probe.productionOrchRoleCount > 0) r.push(`production 이름 orchestration_* role ${probe.productionOrchRoleCount} 발견 → 거부`);
  if (probe.runScopedLeftoverCount > 0) r.push(`이전 run-id 잔여 object ${probe.runScopedLeftoverCount} 발견 → 거부(수동 cleanup 필요)`);
  if (probe.unexpectedSchemaCount > 0) r.push(`허용 목록 밖 user schema ${probe.unexpectedSchemaCount} 발견 → 거부`);
  if (!probe.endpointDistinguishable) r.push("direct/pooled endpoint 구분 불가 → 거부");
  if (!probe.canCreateRole) r.push("현재 role 이 CREATE ROLE 불가 → 진행 불가(fail-closed)");
  return { ok: r.length === 0, refusals: r };
}
