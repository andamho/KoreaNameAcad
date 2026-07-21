// safety guard validator — 환경변수 계약(연결 전) + preflight 카탈로그 판정(연결 후).
// dry-run 과 execute 가 **동일 guard/plan** 을 공유한다. execute 에서 guard 를 생략·캐시하지 않는다.
import { hostHashOf } from "./secrets";
import { RUN_ID_RE } from "./identifiers";
import { DEPRECATED_ENV, type RunMode } from "./envContract";

export const DISPOSABLE_TOKEN = "i-confirm-disposable-neon-branch";

export interface HarnessEnv {
  NEON_CHECK_DIRECT_URL?: string;
  NEON_CHECK_POOLED_URL?: string;
  NEON_CHECK_EXPECTED_DIRECT_HOST_HASH?: string;
  NEON_CHECK_EXPECTED_POOLED_HOST_HASH?: string;
  NEON_CHECK_FORBIDDEN_DIRECT_HOST_HASH?: string;
  NEON_CHECK_FORBIDDEN_POOLED_HOST_HASH?: string;
  NEON_CHECK_DISPOSABLE_CONFIRM?: string;
  NEON_CHECK_RUN_ID?: string;
  PREFLIGHT_ONLY?: string;
  CONFIRM_EXECUTE?: string;
  /** @deprecated 단일 expected hash 계약(폐기). */
  NEON_CHECK_EXPECTED_HOST_HASH?: string;
  /** @deprecated 단일 forbidden hash 계약(폐기) — production pooled 를 차단하지 못한다. */
  NEON_CHECK_FORBIDDEN_HOST_HASH?: string;
  /** @deprecated hash-helper 전용 입력을 실행 env 에 섞던 이름(폐기). */
  NEON_CHECK_FORBIDDEN_URL?: string;
}
export interface HarnessConfig {
  directUrl: string;
  pooledUrl: string;
  expectedDirectHostHash: string;
  expectedPooledHostHash: string;
  /** production forbidden **set** — direct/pooled 어느 조합과도 겹치면 안 된다. */
  forbiddenHostHashes: { direct: string; pooled: string };
  runId: string;
  mode: RunMode;
  execute: boolean;
  preflightOnly: boolean;
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
  const fbDirect = (env.NEON_CHECK_FORBIDDEN_DIRECT_HOST_HASH ?? "").trim().toLowerCase();
  const fbPooled = (env.NEON_CHECK_FORBIDDEN_POOLED_HOST_HASH ?? "").trim().toLowerCase();
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

  // 2. hash 형식 — 네 개 모두 필수 · lowercase 64hex
  if (!HEX64.test(expDirect)) r.push("NEON_CHECK_EXPECTED_DIRECT_HOST_HASH 없음/형식오류(64 lowercase hex)");
  if (!HEX64.test(expPooled)) r.push("NEON_CHECK_EXPECTED_POOLED_HOST_HASH 없음/형식오류(64 lowercase hex)");
  if (!HEX64.test(fbDirect)) r.push("NEON_CHECK_FORBIDDEN_DIRECT_HOST_HASH 없음/형식오류(64 lowercase hex)");
  if (!HEX64.test(fbPooled)) r.push("NEON_CHECK_FORBIDDEN_POOLED_HOST_HASH 없음/형식오류(64 lowercase hex)");
  if (HEX64.test(expDirect) && HEX64.test(expPooled) && expDirect === expPooled)
    r.push("expected direct/pooled hash 가 동일 → 두 endpoint 를 구분해 pin 하지 못함(거부)");
  if (HEX64.test(fbDirect) && HEX64.test(fbPooled) && fbDirect === fbPooled)
    r.push("forbidden direct/pooled hash 가 동일 → production 두 endpoint 를 구분해 차단하지 못함(거부)");

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

  // 4. forbidden **set** 비교 — 위치별 단순 비교가 아니라 4개 조합 전부.
  //    production 은 direct/pooled 두 host 를 가지므로, disposable 의 어느 endpoint 가
  //    production 의 **어느 쪽과도** 겹치면 안 된다(예: disposable pooled 자리에 production direct 를 넣는 사고).
  const forbiddenSet = [
    { label: "production direct", hash: fbDirect },
    { label: "production pooled", hash: fbPooled },
  ].filter((f) => HEX64.test(f.hash));
  for (const actual of [{ label: "direct", hash: hDirect }, { label: "pooled", hash: hPooled }]) {
    if (!actual.hash) continue;
    for (const f of forbiddenSet) {
      if (actual.hash === f.hash) r.push(`disposable ${actual.label} URL 이 **${f.label}** host hash 와 일치 → 즉시 중단`);
    }
  }

  // 5. 두 endpoint 는 실제로 달라야 한다
  if (direct && pooled && direct === pooled) r.push("direct/pooled URL 이 동일 → pooler 검증 불가(거부)");
  if (hDirect && hPooled && hDirect === hPooled) r.push("direct/pooled host 가 동일 → endpoint 구분 불가(거부)");

  // 6. 실행 모드 — 상호배타 · **정확한 문자열 `true`** 만 활성화
  //    ⚠️ **미설정(undefined)** 과 **빈 문자열("")** 을 구분한다.
  //       - 미설정  → 비활성(정상). 플래그를 안 쓴 것이다.
  //       - 빈 문자열/공백 → **거부**. 변수를 설정했는데 값이 비어 있는 것은 의도가 불명확하고,
  //         "지웠다고 생각했지만 빈 값으로 남아 있는" 상태를 조용히 통과시키면 모드 오인의 원인이 된다.
  //       - trim 하지 않는다. `"true "`·`" true"` 도 거부한다(정확 일치만).
  const flag = (v: string | undefined, name: string): boolean => {
    if (v === undefined) return false;                 // unset → 비활성
    if (v === "true") return true;                     // 정확 일치 → 활성
    r.push(v.trim() === ""
      ? `${name} 이 빈 값으로 설정돼 있습니다 → 거부(사용하지 않으려면 변수를 **제거**하세요: Remove-Item Env:${name})`
      : `${name} 값이 유효하지 않습니다(정확한 문자열 "true" 만 활성화) → 거부`);
    return false;
  };
  const preflightOnly = flag(env.PREFLIGHT_ONLY, "PREFLIGHT_ONLY");
  const execute = flag(env.CONFIRM_EXECUTE, "CONFIRM_EXECUTE");
  if (preflightOnly && execute) r.push("PREFLIGHT_ONLY 와 CONFIRM_EXECUTE 를 동시에 설정할 수 없습니다(모드 혼동 → 거부)");
  const mode: RunMode = execute ? "execute" : preflightOnly ? "select-only-preflight" : "offline-dry-run";

  if (r.length) return { ok: false, refusals: r };
  return {
    ok: true,
    config: {
      directUrl: direct, pooledUrl: pooled,
      expectedDirectHostHash: expDirect, expectedPooledHostHash: expPooled,
      forbiddenHostHashes: { direct: fbDirect, pooled: fbPooled },
      runId, mode, execute, preflightOnly,
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
