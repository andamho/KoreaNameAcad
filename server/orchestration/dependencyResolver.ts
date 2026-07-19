// 순수 dependency resolver — 어떤 job 이 실행 가능한지 판정. cycle 차단·version pin·fail-closed.
// 실제 job 생성/실행 없음(설계 로직만). 미충족·모호 = blocked(자동 실행 금지).
import type { JobDependency, DependencyType, OrchestrationErrorCode, ReviewDecision, HumanApprovalState } from "../../shared/orchestration/types";

export type JobLifecycle = "queued" | "running" | "succeeded" | "failed" | "cancelled" | "blocked" | "needs_review";

export interface ResolverInput {
  jobs: { jobId: string; status: JobLifecycle }[];
  dependencies: JobDependency[];
  artifacts: { artifactId: string; producerJobId: string; artifactKind: string; schemaVersion: number }[];
  reviews: { jobId: string; decision: ReviewDecision }[]; // 검토 결과(승인 여부)
  humanApprovals: { jobId: string; state: HumanApprovalState }[];
}
export interface ResolverOutput {
  runnable: string[];
  blocked: { jobId: string; reasons: OrchestrationErrorCode[] }[];
  cycleJobIds: string[];
}

// dependsOnJobId 그래프에서 순환 탐지 → 관련 job id 집합.
export function detectCycleJobs(deps: JobDependency[]): Set<string> {
  const adj = new Map<string, string[]>();
  for (const d of deps) { if (!adj.has(d.jobId)) adj.set(d.jobId, []); adj.get(d.jobId)!.push(d.dependsOnJobId); }
  const state = new Map<string, 0 | 1 | 2>(); // 0=unvisited,1=in-stack,2=done
  const inCycle = new Set<string>();
  const stack: string[] = [];
  const dfs = (n: string) => {
    state.set(n, 1); stack.push(n);
    for (const m of adj.get(n) ?? []) {
      if (state.get(m) === 1) { const i = stack.indexOf(m); for (const c of stack.slice(i)) inCycle.add(c); }
      else if (!state.get(m)) dfs(m);
    }
    stack.pop(); state.set(n, 2);
  };
  for (const n of Array.from(adj.keys())) if (!state.get(n)) dfs(n);
  return inCycle;
}

export function resolveRunnable(input: ResolverInput): ResolverOutput {
  const jobStatus = new Map(input.jobs.map((j) => [j.jobId, j.status]));
  const depsByJob = new Map<string, JobDependency[]>();
  for (const d of input.dependencies) { if (!depsByJob.has(d.jobId)) depsByJob.set(d.jobId, []); depsByJob.get(d.jobId)!.push(d); }
  const reviewApproved = new Set(input.reviews.filter((r) => r.decision === "approve").map((r) => r.jobId));
  const humanApproved = new Set(input.humanApprovals.filter((h) => h.state === "approved").map((h) => h.jobId));
  const artifactsByJob = new Map<string, ResolverInput["artifacts"]>();
  for (const a of input.artifacts) { if (!artifactsByJob.has(a.producerJobId)) artifactsByJob.set(a.producerJobId, []); artifactsByJob.get(a.producerJobId)!.push(a); }
  const cycle = detectCycleJobs(input.dependencies);

  const runnable: string[] = [];
  const blocked: ResolverOutput["blocked"] = [];
  const GATING: DependencyType[] = ["requires-success", "requires-approved-review", "requires-human-approval"];

  for (const j of input.jobs) {
    if (j.status !== "queued") continue; // queued 만 실행 후보
    const reasons = new Set<OrchestrationErrorCode>();
    if (cycle.has(j.jobId)) reasons.add("cycle-detected");
    for (const d of depsByJob.get(j.jobId) ?? []) {
      if (d.resolutionStatus === "failed" || d.resolutionStatus === "cancelled") { reasons.add("dependency-missing"); continue; }
      if (!GATING.includes(d.dependencyType)) continue; // supersedes/retry-of/correction-of = lineage(비게이트)
      const depStatus = jobStatus.get(d.dependsOnJobId);
      if (d.dependencyType === "requires-success" && depStatus !== "succeeded") reasons.add("dependency-missing");
      if (d.dependencyType === "requires-approved-review" && !reviewApproved.has(d.dependsOnJobId)) reasons.add("dependency-missing");
      if (d.dependencyType === "requires-human-approval" && !humanApproved.has(d.dependsOnJobId)) reasons.add("dependency-missing");
      // version pinning: 필요 artifact kind/version 대조(오래된 artifact 오소비 방지)
      if (d.requiredArtifactKind) {
        const arts = (artifactsByJob.get(d.dependsOnJobId) ?? []).filter((a) => a.artifactKind === d.requiredArtifactKind);
        if (!arts.length) reasons.add("artifact-integrity-failure");
        else if (d.requiredArtifactSchemaVersion != null && !arts.some((a) => a.schemaVersion === d.requiredArtifactSchemaVersion)) reasons.add("version-pin-mismatch");
      }
    }
    if (reasons.size) blocked.push({ jobId: j.jobId, reasons: Array.from(reasons) });
    else runnable.push(j.jobId);
  }
  return { runnable, blocked, cycleJobIds: Array.from(cycle) };
}
