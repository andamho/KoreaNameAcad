// 멱등키·해시 — 중앙 canonical JSON + SHA-256 lowercase hex(64자). 동일 key = 동일 job(전역 UNIQUE).
import crypto from "crypto";
import { isSha256Hex } from "../../shared/jobQueueContract";

export const IDEMPOTENCY_SCHEMA_VERSION = 1;

// canonicalization 계약 위반을 거부(fail-closed). undefined·함수·심볼·BigInt·Date·순환 참조 등
// 비결정적/모호 입력을 해시에 넣지 않는다. null 은 허용(미사용 슬롯), missing 과 구분된다.
export class CanonicalizationError extends Error {
  constructor(reason: string) {
    super(`canonicalization 거부: ${reason}`);
    this.name = "CanonicalizationError";
  }
}

// 정준 직렬화: 객체 키 정렬, null 보존, 배열 순서 유지. JSON 문자열 인코딩이 자기구분적이라
// 필드 경계 모호성 없음(따옴표·이스케이프). 미사용 슬롯은 null 로 통일(빈문자열 아님).
export function canonicalStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  const walk = (v: unknown, path: string): unknown => {
    if (v === undefined) throw new CanonicalizationError(`undefined 금지(${path}) — 미사용은 null`);
    if (typeof v === "function") throw new CanonicalizationError(`함수 금지(${path})`);
    if (typeof v === "symbol") throw new CanonicalizationError(`symbol 금지(${path})`);
    if (typeof v === "bigint") throw new CanonicalizationError(`bigint 금지(${path}) — 문자열로 정규화 후 전달`);
    if (typeof v === "number" && !Number.isFinite(v)) throw new CanonicalizationError(`비유한 숫자 금지(${path})`);
    if (v === null || typeof v !== "object") return v;
    if (v instanceof Date) throw new CanonicalizationError(`Date 금지(${path}) — ISO 문자열로 정규화 후 전달`);
    if (seen.has(v as object)) throw new CanonicalizationError(`순환 참조 금지(${path})`);
    seen.add(v as object);
    let out: unknown;
    if (Array.isArray(v)) out = v.map((el, i) => walk(el, `${path}[${i}]`));
    else {
      const o = v as Record<string, unknown>;
      out = Object.keys(o)
        .sort()
        .reduce((acc, k) => {
          acc[k] = walk(o[k], `${path}.${k}`);
          return acc;
        }, {} as Record<string, unknown>);
    }
    seen.delete(v as object);
    return out;
  };
  if (value === undefined) throw new CanonicalizationError("최상위 undefined 금지");
  return JSON.stringify(walk(value, "$"));
}

export function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

export function computeExecutionOptionsHash(executionOptions: unknown | null): string {
  return sha256Hex(canonicalStringify(executionOptions ?? null));
}

// 멱등키 구성요소(전부 정준 직렬화 대상). 미사용은 null.
export interface IdempotencyParts {
  ownerScope: string;
  projectId: string | null;
  jobType: string;
  inputAssetHash: string | null;
  pipelineVersion: string | null;
  transcriptionEngineHash: string | null;
  transcriptionEngineVersion: string | null;
  dictionaryVersion: string | null;
  normalizationVersion: number | null;
  correctionEngineHash: string | null;
  executionOptionsHash: string;
}

export function computeIdempotencyKey(parts: IdempotencyParts): string {
  const canonical = canonicalStringify({
    idempotencySchemaVersion: IDEMPOTENCY_SCHEMA_VERSION,
    ownerScope: parts.ownerScope,
    projectId: parts.projectId,
    jobType: parts.jobType,
    inputAssetHash: parts.inputAssetHash,
    pipelineVersion: parts.pipelineVersion,
    transcriptionEngineHash: parts.transcriptionEngineHash,
    transcriptionEngineVersion: parts.transcriptionEngineVersion,
    dictionaryVersion: parts.dictionaryVersion,
    normalizationVersion: parts.normalizationVersion,
    correctionEngineHash: parts.correctionEngineHash,
    executionOptionsHash: parts.executionOptionsHash,
  });
  const key = sha256Hex(canonical);
  if (!isSha256Hex(key)) throw new Error("idempotencyKey 생성 실패"); // 방어(이론상 불가)
  return key;
}
