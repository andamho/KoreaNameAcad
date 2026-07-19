// createJob — 요청 identity 생성. 동일 idempotencyKey 는 새 행을 만들지 않고 기존 job 을 반환한다.
// request snapshot 불변. 비밀값·고객 원문 URI 금지(호출자 책임 + snapshot 빈문자열 검증).
import type { QueueClient, JobRow } from "./types";
import type { RequestVersionSnapshot } from "../../shared/jobQueueContract";
import { isValidPriority, isSha256Hex, assertNoEmptyString } from "../../shared/jobQueueContract";
import { jobTypePolicy } from "./registry";
import { computeExecutionOptionsHash, computeIdempotencyKey } from "./idempotency";

export interface CreateJobInput {
  ownerScope: string;
  projectId: string | null;
  jobType: string;
  inputIdentity: Record<string, unknown> & { inputAssetHash?: string | null };
  requestVersionSnapshot: RequestVersionSnapshot;
  executionOptions?: unknown | null;
  payloadHash: string; // SHA-256 hex(호출자 계산)
  availableAt?: string | null; // ISO; null 이면 now()
  priority?: number | null;
  parentJobId?: string | null;
  reprocessReason?: string | null;
}

export interface CreateJobResult {
  job: JobRow;
  created: boolean; // false = 동일 idempotencyKey 기존 job 반환
}

export async function createJob(c: QueueClient, input: CreateJobInput): Promise<CreateJobResult> {
  const policy = jobTypePolicy(input.jobType); // 미등록 jobType 이면 throw
  if (!isSha256Hex(input.payloadHash)) throw new Error("payloadHash 는 SHA-256 hex 여야 함");
  const priority = input.priority ?? policy.defaultPriority;
  if (!isValidPriority(priority)) throw new Error(`priority 범위 위반: ${priority}`);
  assertNoEmptyString(input.requestVersionSnapshot as any, "requestVersionSnapshot");

  const executionOptionsHash = computeExecutionOptionsHash(input.executionOptions ?? null);
  const s = input.requestVersionSnapshot;
  const idempotencyKey = computeIdempotencyKey({
    ownerScope: input.ownerScope,
    projectId: input.projectId,
    jobType: input.jobType,
    inputAssetHash: input.inputIdentity.inputAssetHash ?? null,
    pipelineVersion: s.pipelineVersion,
    transcriptionEngineHash: s.transcriptionEngineHash,
    transcriptionEngineVersion: s.transcriptionEngineVersion,
    dictionaryVersion: s.dictionaryVersion,
    normalizationVersion: s.normalizationVersion,
    correctionEngineHash: s.correctionEngineHash,
    executionOptionsHash,
  });

  // 전역 UNIQUE(idempotency_key) 충돌 시 새 행 만들지 않음. INSERT ... ON CONFLICT DO NOTHING 후 재조회.
  const availExpr = input.availableAt ? "$13::timestamptz" : "now()";
  const params: unknown[] = [
    input.ownerScope, input.projectId, input.jobType, priority,
    JSON.stringify(input.inputIdentity), JSON.stringify(input.requestVersionSnapshot),
    input.executionOptions == null ? null : JSON.stringify(input.executionOptions),
    executionOptionsHash, input.payloadHash, idempotencyKey,
    input.parentJobId ?? null, input.reprocessReason ?? null,
  ];
  if (input.availableAt) params.push(input.availableAt);

  const ins = await c.query(
    `INSERT INTO jobs
       (owner_scope, project_id, job_type, status, priority, input_identity, request_version_snapshot,
        execution_options, execution_options_hash, payload_hash, idempotency_key, parent_job_id, reprocess_reason,
        available_at, created_at, updated_at)
     VALUES ($1,$2,$3,'queued',$4,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9,$10,$11,$12, ${availExpr}, now(), now())
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING *`,
    params,
  );
  if (ins.rows[0]) return { job: ins.rows[0] as JobRow, created: true };

  const existing = await c.query(`SELECT * FROM jobs WHERE idempotency_key=$1`, [idempotencyKey]);
  if (!existing.rows[0]) throw new Error("idempotency 충돌인데 기존 job 조회 실패(경합 이례)");
  return { job: existing.rows[0] as JobRow, created: false };
}
