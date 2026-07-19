// job↔execution 불변식 진단(§5) — 테스트·관리자 진단용. 상태·ID 만 보고(원문·payload·고객값 금지).
// 운영 hot path 에서 매번 전체 검사하지 않는다(transaction 내부 최소 조건은 각 연산이 책임).
import type { QueueClient } from "./types";
import { jobTypePolicy } from "./registry";
import { jobSucceededAllowed } from "../../shared/jobQueueContract";

export type InvariantViolation =
  | "running-without-single-active" // job running 인데 active execution ≠ 1
  | "active-without-running" // active execution 존재하는데 job 이 running 아님
  | "terminal-with-active" // terminal job 인데 active execution 존재
  | "queued-with-active" // queued job 인데 active execution 존재
  | "review-with-active" // blocked/needs_review 인데 active execution 존재
  | "succeeded-last-not-succeeded" // job succeeded 인데 마지막 execution ≠ succeeded
  | "succeeded-verification-not-satisfied"; // job succeeded 인데 검증 정책 미충족

export interface InvariantReport {
  jobId: string;
  jobStatus: string;
  activeExecutionIds: string[];
  violations: InvariantViolation[];
}

const TERMINAL = new Set(["succeeded", "failed", "cancelled"]);

export async function inspectJobInvariant(c: QueueClient, jobId: string): Promise<InvariantReport> {
  const job = (await c.query(`SELECT id, status FROM jobs WHERE id=$1`, [jobId])).rows[0];
  if (!job) throw new Error(`job 없음: ${jobId}`);
  const exes = (await c.query(`SELECT id, status, attempt_number, verification_status FROM job_executions WHERE job_id=$1 ORDER BY attempt_number ASC`, [jobId])).rows;
  const active = exes.filter((e: any) => e.status === "claimed" || e.status === "running");
  const last = exes[exes.length - 1];
  const v: InvariantViolation[] = [];

  if (job.status === "running" && active.length !== 1) v.push("running-without-single-active");
  if (active.length > 0 && job.status !== "running") v.push("active-without-running");
  if (TERMINAL.has(job.status) && active.length > 0) v.push("terminal-with-active");
  if (job.status === "queued" && active.length > 0) v.push("queued-with-active");
  if ((job.status === "blocked" || job.status === "needs_review") && active.length > 0) v.push("review-with-active");
  if (job.status === "succeeded") {
    if (!last || last.status !== "succeeded") {
      v.push("succeeded-last-not-succeeded");
    } else {
      const jt = (await c.query(`SELECT job_type FROM jobs WHERE id=$1`, [jobId])).rows[0].job_type;
      const required = jobTypePolicy(jt).verificationRequired;
      if (!jobSucceededAllowed(last.verification_status, required)) v.push("succeeded-verification-not-satisfied");
    }
  }

  return { jobId, jobStatus: job.status, activeExecutionIds: active.map((e: any) => e.id), violations: v };
}
