// jobType 정책 레지스트리 — retry 한도·backoff·lease·heartbeat·side effect 분류·검증 필수 여부를
// 코드 곳곳에 흩지 않고 여기 한 곳에 둔다. 값은 동결 계약 기반 "권장안"(운영 확정은 adapter Gate).
import { PRIORITY } from "../../shared/jobQueueContract";

// side effect 성격 → reaper·ambiguous 처리 정책을 좌우한다(§10).
export type SideEffectClass =
  | "pure" // 순수 계산(재실행 안전)
  | "idempotent-external" // 외부 호출이나 멱등(같은 요청 반복 안전)
  | "non-idempotent-external" // 외부 부작용 비멱등(중복 위험) → 만료 시 needs_review
  | "human-review-required"; // 사람 검토 필요 부작용

export interface JobTypePolicy {
  jobType: string;
  maxAttempts: number;
  initialDelaySec: number;
  multiplier: number;
  maxDelaySec: number;
  jitterSec: number; // 0 이면 지터 없음(테스트 결정성)
  leaseDurationSec: number;
  heartbeatIntervalSec: number;
  sideEffectClass: SideEffectClass;
  // lease 만료/모호 실패 시 job 을 어디로: pure/idempotent → queued(재시도), 그 외 → needs_review.
  ambiguousSideEffectPolicy: "retry-queued" | "needs-review";
  verificationRequired: boolean;
  defaultPriority: number;
}

// ⚠️ 권장안(운영 확정 아님). 동결 계약의 lease/heartbeat 값 반영.
const RECOMMENDED: JobTypePolicy[] = [
  {
    jobType: "internal-report", // 첫 adapter 후보(순수 계산, 부작용 없음)
    maxAttempts: 3, initialDelaySec: 15, multiplier: 3, maxDelaySec: 300, jitterSec: 0,
    leaseDurationSec: 120, heartbeatIntervalSec: 30,
    sideEffectClass: "pure", ambiguousSideEffectPolicy: "retry-queued",
    verificationRequired: true, defaultPriority: PRIORITY.default,
  },
  {
    jobType: "pdf-generate",
    maxAttempts: 3, initialDelaySec: 30, multiplier: 4, maxDelaySec: 120, jitterSec: 5,
    leaseDurationSec: 90, heartbeatIntervalSec: 30,
    sideEffectClass: "idempotent-external", ambiguousSideEffectPolicy: "retry-queued",
    verificationRequired: true, defaultPriority: PRIORITY.default,
  },
  {
    jobType: "call-transcribe",
    maxAttempts: 4, initialDelaySec: 60, multiplier: 3, maxDelaySec: 900, jitterSec: 10,
    leaseDurationSec: 600, heartbeatIntervalSec: 180,
    sideEffectClass: "idempotent-external", ambiguousSideEffectPolicy: "retry-queued",
    verificationRequired: true, defaultPriority: PRIORITY.default,
  },
  {
    jobType: "video-caption",
    maxAttempts: 3, initialDelaySec: 300, multiplier: 4, maxDelaySec: 1200, jitterSec: 15,
    leaseDurationSec: 1200, heartbeatIntervalSec: 300,
    sideEffectClass: "idempotent-external", ambiguousSideEffectPolicy: "retry-queued",
    verificationRequired: true, defaultPriority: PRIORITY.default,
  },
  {
    jobType: "sns-publish", // 비멱등 외부 게시 — 첫 adapter 대상 아님, 만료 시 needs_review
    maxAttempts: 1, initialDelaySec: 0, multiplier: 1, maxDelaySec: 0, jitterSec: 0,
    leaseDurationSec: 300, heartbeatIntervalSec: 60,
    sideEffectClass: "non-idempotent-external", ambiguousSideEffectPolicy: "needs-review",
    verificationRequired: true, defaultPriority: PRIORITY.default,
  },
];

const BY_TYPE = new Map(RECOMMENDED.map((p) => [p.jobType, p]));
export function jobTypePolicy(jobType: string): JobTypePolicy {
  const p = BY_TYPE.get(jobType);
  if (!p) throw new Error(`미등록 jobType: ${jobType}`);
  return p;
}
export const registeredJobTypes = (): string[] => Array.from(BY_TYPE.keys());

// backoff(지터 제외한 결정적 값). available_at = now() + backoffSeconds(attempt).
// attempt 는 "이번에 실패한 시도 번호"(1부터). 다음 재시도 지연을 반환.
export function backoffSeconds(policy: JobTypePolicy, attemptNumber: number): number {
  const raw = policy.initialDelaySec * Math.pow(policy.multiplier, Math.max(0, attemptNumber - 1));
  return Math.min(raw, policy.maxDelaySec);
}
