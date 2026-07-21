// safety guard validator — 환경변수 계약(연결 전) + preflight 카탈로그 판정(연결 후).
// dry-run 과 execute 가 **동일 guard/plan** 을 공유한다. execute 에서 guard 를 생략·캐시하지 않는다.
import { hostHashOf } from "./secrets";
import { RUN_ID_RE } from "./identifiers";
import { DEPRECATED_ENV } from "./envContract";

export const DISPOSABLE_TOKEN = "i-confirm-disposable-neon-branch";

export interface HarnessEnv {
  NEON_CHECK_DIRECT_URL?: string;
  NEON_CHECK_POOLED_URL?: string;
  NEON_CHECK_EXPECTED_DIRECT_HOST_HASH?: string;
  NEON_CHECK_EXPECTED_POOLED_HOST_HASH?: string;
  NEON_CHECK_FORBIDDEN_HOST_HASH?: string;
  NEON_CHECK_DISPOSABLE_CONFIRM?: string;
  NEON_CHECK_RUN_ID?: string;
  CONFIRM_EXECUTE?: string;
  /** @deprecated 단일 hash 계약(폐기). 설정돼 있으면 거부한다. */
  NEON_CHECK_EXPECTED_HOST_HASH?: string;
}
export interface HarnessConfig {
  directUrl: string;
  pooledUrl: string;
  expectedDirectHostHash: string;
  expectedPooledHostHash: string;
  forbiddenHostHash: string | null;
  runId: string;
  execute: boolean;
}
export interface GuardResult { ok: boolean; refusals: string[] }

const HEX64 = /^[0-9a-f]{64}$/;
/** URL 구조만 확인한다. **원문(host/user/db)을 반환하거나 메시지에 넣지 않는다.** */
export function parseUrlShape(url: string): { ok: boolean; reason?: string } {
  let u: URL;
  try { u = new URL(url); } catch { return { ok: false, reason: "URL 파싱 실패" }; }
  if (!/^postgres(ql)?:$/.test(u.protocol)) return { ok: false, reason: "protocol 이 postgres/postgresql 이 아님" };
  if (!u.hostname) return { ok: false, reason: "host 없음" };
  if (u.port && !/^\d{1,5}$/.test(u.port)) return { ok: false, reason: "port 형식 오류" };
  return { ok: true };
}

/**
 * 1단계: 연결 **전** 형식·핀 검증. 실패 시 DB 연결을 시도하지 않는다.
 * direct 와 pooled 를 **각각 독립적으로** expected hash 에 고정한다(suffix 추론 금지).
 */
export function parseHarnessEnv(env: HarnessEnv): { ok: true; config: HarnessConfig } | { ok: false; refusals: string[] } {
  const r: string[] = [];
  const direct = (env.NEON_CHECK_DIRECT_URL ?? "").trim();
  const pooled = (env.NEON_CHECK_POOLED_URL ?? "").trim();
  const expDirect = (env.NEON_CHECK_EXPECTED_DIRECT_HOST_HASH ?? "").trim().toLowerCase();
  const expPooled = (env.NEON_CHECK_EXPECTED_POOLED_HOST_HASH ?? "").trim().toLowerCase();
  const forbid = (env.NEON_CHECK_FORBIDDEN_HOST_HASH ?? "").trim().toLowerCase();
  const token = (env.NEON_CHECK_DISPOSABLE_CONFIRM ?? "").trim();
  const runId = (env.NEON_CHECK_RUN_ID ?? "").trim();

  // 0. 폐기된 계약 사용 거부(호환성 유지하지 않음)
  for (const d of DEPRECATED_ENV) {
    if (((env as Record<string, string | undefined>)[d.name] ?? "").trim()) {
      r.push(`${d.name} 는 폐기된 계약입니다 → ${d.replacedBy} 사용. 이유: ${d.reason}`);
    }
  }

  // 1. 필수 존재 + URL 구조
  if (!direct) r.push("NEON_CHECK_DIRECT_URL 없음");
  else { const s = parseUrlShape(direct); if (!s.ok) r.push(`NEON_CHECK_DIRECT_URL ${s.reason}`); }
  if (!pooled) r.push("NEON_CHECK_POOLED_URL 없음(pooled endpoint 는 actual-neon-pooled 5종의 유일한 정본이므로 필수)");
  else { const s = parseUrlShape(pooled); if (!s.ok) r.push(`NEON_CHECK_POOLED_URL ${s.reason}`); }
  if (token !== DISPOSABLE_TOKEN) r.push("disposable 확인 토큰 불일치/누락");
  if (!RUN_ID_RE.test(runId)) r.push("NEON_CHECK_RUN_ID 없음/형식오류([a-z0-9]{4,16})");

  // 2. hash 형식
  if (!HEX64.test(expDirect)) r.push("NEON_CHECK_EXPECTED_DIRECT_HOST_HASH 없음/형식오류(64 lowercase hex)");
  if (!HEX64.test(expPooled)) r.push("NEON_CHECK_EXPECTED_POOLED_HOST_HASH 없음/형식오류(64 lowercase hex)");
  if (forbid && !HEX64.test(forbid)) r.push("NEON_CHECK_FORBIDDEN_HOST_HASH 형식오류(64 lowercase hex)");
  if (HEX64.test(expDirect) && HEX64.test(expPooled) && expDirect === expPooled)
    r.push("expected direct/pooled hash 가 동일 → 두 endpoint 를 구분해 pin 하지 못함(거부)");

  // 3. 독립 pin — 각 endpoint 의 실제 host hash 가 각자의 expected 와 일치해야 한다
  const hDirect = direct && parseUrlShape(direct).ok ? hostHashOf(direct) : null;
  const hPooled = pooled && parseUrlShape(pooled).ok ? hostHashOf(pooled) : null;
  if (hDirect && HEX64.test(expDirect) && hDirect !== expDirect) {
    r.push(HEX64.test(expPooled) && hDirect === expPooled
      ? "direct URL host hash 가 **pooled** expected pin 과 일치 → direct/pooled expected hash 교차 입력(거부)"
      : "direct URL host hash ≠ expected direct pin");
  }
  if (hPooled && HEX64.test(expPooled) && hPooled !== expPooled) {
    r.push(HEX64.test(expDirect) && hPooled === expDirect
      ? "pooled URL host hash 가 **direct** expected pin 과 일치 → direct/pooled expected hash 교차 입력(거부)"
      : "pooled URL host hash ≠ expected pooled pin");
  }

  // 4. forbidden(production) 일치 거부 — 두 endpoint 모두
  if (hDirect && forbid && HEX64.test(forbid) && hDirect === forbid) r.push("direct URL 이 production host hash 와 일치 → 거부");
  if (hPooled && forbid && HEX64.test(forbid) && hPooled === forbid) r.push("pooled URL 이 production host hash 와 일치 → 거부");

  // 5. 두 endpoint 는 실제로 달라야 한다
  if (direct && pooled && direct === pooled) r.push("direct/pooled URL 이 동일 → pooler 검증 불가(거부)");
  if (hDirect && hPooled && hDirect === hPooled) r.push("direct/pooled host 가 동일 → endpoint 구분 불가(거부)");

  if (r.length) return { ok: false, refusals: r };
  return {
    ok: true,
    config: {
      directUrl: direct, pooledUrl: pooled,
      expectedDirectHostHash: expDirect, expectedPooledHostHash: expPooled,
      forbiddenHostHash: forbid || null, runId,
      execute: (env.CONFIRM_EXECUTE ?? "") === "true",
    },
  };
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
