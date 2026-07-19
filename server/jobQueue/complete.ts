// completion(§8) — 성공 처리. execution+job row lock, token fencing, artifact/검증 정책 확인 후에만 succeeded.
// stale worker 결과 거부, terminal 덮어쓰기 금지, artifact hash 누락 시 성공 금지, 검증 필수는 passed 만.
import type { QueueClient, CompletionInput } from "./types";
import { jobTypePolicy } from "./registry";
import { sha256Hex } from "./idempotency";
import { jobSucceededAllowed, isValidErrorSummary } from "../../shared/jobQueueContract";

export type CompleteOutcome =
  | "succeeded"
  | "fencing-failed" // 없음/탈취/이미 active 아님
  | "already-terminal" // idempotent: 이미 종료된 execution — 덮어쓰기 안 함
  | "rejected-missing-artifact-hash"
  | "rejected-verification"; // 검증 통과 아님 → 호출자가 fail/needs_review 로 라우팅

export interface CompleteResult {
  outcome: CompleteOutcome;
  executionId: string;
}

export async function completeExecution(
  c: QueueClient,
  args: { executionId: string; workerId: string; rawLeaseToken: string; jobType: string; result: CompletionInput },
): Promise<CompleteResult> {
  const policy = jobTypePolicy(args.jobType);
  const tokenHash = sha256Hex(args.rawLeaseToken);
  await c.query("BEGIN");
  try {
    const ex = await c.query(`SELECT * FROM job_executions WHERE id=$1 FOR UPDATE`, [args.executionId]);
    const row = ex.rows[0];
    if (!row) { await c.query("ROLLBACK"); return { outcome: "fencing-failed", executionId: args.executionId }; }
    // 이미 terminal → 덮어쓰기 금지(idempotent 응답).
    if (!["claimed", "running"].includes(row.status)) {
      await c.query("ROLLBACK");
      return { outcome: "already-terminal", executionId: args.executionId };
    }
    // fencing: worker + token 일치.
    if (row.worker_id !== args.workerId || row.lease_token_hash !== tokenHash) {
      await c.query("ROLLBACK");
      return { outcome: "fencing-failed", executionId: args.executionId };
    }
    // artifact hash 필수(무결성). resultArtifactHash 누락 시 성공 금지.
    if (!args.result.artifactSnapshot || !args.result.artifactSnapshot.resultArtifactHash) {
      await c.query("ROLLBACK");
      return { outcome: "rejected-missing-artifact-hash", executionId: args.executionId };
    }
    // 검증 정책: 필수 job 은 passed 만, 비필수는 skipped 도 허용.
    if (!jobSucceededAllowed(args.result.verificationStatus, policy.verificationRequired)) {
      await c.query("ROLLBACK");
      return { outcome: "rejected-verification", executionId: args.executionId };
    }
    if (!isValidErrorSummary(null)) throw new Error("unreachable");

    await c.query(`SELECT id FROM jobs WHERE id=$1 FOR UPDATE`, [row.job_id]);
    await c.query(
      `UPDATE job_executions
          SET status='succeeded', finished_at=now(), verification_status=$2,
              actual_version_snapshot=$3::jsonb, artifact_snapshot=$4::jsonb, executor_snapshot=$5::jsonb,
              manifest_uri=$6, manifest_artifact_hash=$7
        WHERE id=$1`,
      [
        args.executionId, args.result.verificationStatus,
        JSON.stringify(args.result.actualVersionSnapshot), JSON.stringify(args.result.artifactSnapshot),
        JSON.stringify(args.result.executorSnapshot),
        args.result.manifestUri ?? null, args.result.manifestArtifactHash ?? null,
      ],
    );
    await c.query(`UPDATE jobs SET status='succeeded', completed_at=now(), updated_at=now() WHERE id=$1`, [row.job_id]);
    await c.query("COMMIT");
    return { outcome: "succeeded", executionId: args.executionId };
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  }
}
