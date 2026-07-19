# 영속 작업 큐 — runtime 계약 + claim prototype

> ⚠️ **prototype + 계약만.** `server/jobQueue/*` 는 운영 routes/cron/worker entrypoint 에 **연결하지 않는다**.
> 실제 배선·dual-write·기존 경로 전환·calls 120건 복구는 별도 **adapter integration Gate**. 이 Gate 는 운영 DB write 0.

## 현재 실행 경로 요약(read-only 조사 결과)
| 경로 | 위치 | 분류 | 큐가 해결할 문제 |
|---|---|---|---|
| 통화 전사(whisper/correct) | `routes.ts:849` → `localTranscribe.ts:116` | **pure computation** | in-mem 직렬큐(`localTranscribe.ts:77`) 재시작 시 유실 → **calls 120건 processing stuck**, 중복 전사 위험 |
| 리포트 렌더+매칭+첨부 | `reportSync.ts:83` → `reportProcessor.ts:54` | **self-retry 있음** | content-hash 멱등·트랜잭션·TERMINAL 가드(가장 견고). 크로스 프로세스 뮤텍스 부재 |
| YouTube/IG/TikTok 게시 | `routes.ts:1040-1205` | **non-idempotent external** | 요청 재시도 시 **중복 게시**·중복 videoJobs 행. IG retry 만 atomic claim(`routes.ts:1217`) |
| 예약 SMS `runDue` | `sms.ts:213` | **non-idempotent external** | atomic claim 부재 → 스케줄러 2개면 **이중 발송** |
| notice_runs 시퀀스 | `gaemyeong.ts:341` | **human-review 필요** | pending/active 가드가 중복 시퀀스 방지 |

**공통 부재(전부 확인됨)**: durable claim/lease, orphan reaper(stuck 원인), 크로스 프로세스 뮤텍스, 비멱등 게시의 idempotency key.

## 첫 adapter 추천
**`pdf-generate`(리포트 렌더) 또는 `internal-report`(순수 계산)를 첫 adapter 로 권장.**
- 근거: 외부 부작용 위험이 가장 낮고(순수/멱등), 결과 hash 검증이 쉬워 claim/lease/retry 기전을 안전하게 검증.
- **`call-transcribe` 는 즉시 후속(2번째)**: pure computation 이라 side-effect 위험은 낮고 stuck-120 문제를 직접 해결하지만, 3h GPU 실행이라 adapter-side heartbeat 타이머가 필요.
- **video/SNS/SMS(비멱등 게시)는 초기 대상에서 제외**: idempotency key + needs_review 정책 확정 전까지 금지.
- 이번 prototype 은 순수 `internal-report` adapter(`adapters/internalReport.ts`)로 전체 lifecycle 을 검증.

## 모듈 구조(`server/jobQueue/`)
`types.ts`(runtime 타입) · `registry.ts`(jobType 정책=retry/backoff/lease/heartbeat/side-effect class/verification) · `errorCodes.ts`(제한 코드) · `idempotency.ts`(canonical JSON + sha256 key) · `leaseToken.ts`(raw 생성/hash) · `versionCheck.ts` · `createJob.ts` · `claim.ts` · `running.ts` · `heartbeat.ts` · `complete.ts` · `fail.ts` · `reaper.ts` · `rerun.ts` · `repository.ts`(읽기) · `adapters/*`.

## 계약 요약
- **createJob**: canonical JSON → SHA-256 idempotencyKey(전역 UNIQUE). 충돌 시 `ON CONFLICT DO NOTHING` 후 기존 job 반환(**동일 key 새 행 금지**). request snapshot 불변. 비밀값·고객 원문 URI 금지.
- **claim(§5)**: `BEGIN` → `SELECT ... WHERE status='queued' AND available_at<=now() ORDER BY priority,available_at,created_at,id FOR UPDATE SKIP LOCKED LIMIT 1` → active execution 부재 확인 → attempt=max+1 → lease token 생성(**hash 만 DB**) → execution claimed → job running → `COMMIT` → **commit 이후 adapter 실행**. raw token 은 반환값에만.
- **claimed→running(§6)**: fencing(exec+worker+token hash+status=claimed) 일치 때만 running, started_at 기록. 실패 시 adapter 시작 금지.
- **heartbeat(§7)**: fencing(exec+worker+token+status active) → heartbeat_at·lease_expires_at 연장(DB now()). token 교체·attempt 변경·terminal heartbeat 금지. 반환 false = 즉시 중단.
- **completion(§8)**: execution+job row lock → fencing → artifact hash 필수(resultArtifactHash) → 검증 정책(필수 job=passed 만) → execution succeeded + job succeeded. **stale 거부·terminal 덮어쓰기 금지·검증 미통과 시 succeeded 안 함**.
- **failure/retry(§9)**: `transient`(재시도 가능 & attempt<max → job queued+backoff / 소진 → failed) · `permanent`(job failed, version-mismatch → blocked, 자동 retry 없음) · `ambiguous-side-effect`(pure/idempotent → retry-queued / 비멱등 → needs_review). error_code 레지스트리만, error_summary ≤1000자·원문 금지.
- **reaper(§10)**: `status IN(claimed,running) AND lease_expires_at<now() AND job running` → `FOR UPDATE OF e SKIP LOCKED` batch → execution expired + jobType 정책(pure/idempotent → queued(소진 failed) / non-idempotent → needs_review). 동시 실행 안전.
- **version snapshot(§12)**: claim 후 adapter 전에 request↔actual 비교. 불일치 필드명만 기록(값 금지) → adapter 미실행, execution verification_failed, job blocked.

## jobType 정책(레지스트리, **권장안** — 운영 확정은 adapter Gate)
| jobType | maxAttempts | lease | heartbeat | side-effect | ambiguous | verify |
|---|---|---|---|---|---|---|
| internal-report | 3 | 120s | 30s | pure | retry-queued | required |
| pdf-generate | 3 | 90s | 30s | idempotent-external | retry-queued | required |
| call-transcribe | 4 | 600s | 180s | idempotent-external | retry-queued | required |
| video-caption | 3 | 1200s | 300s | idempotent-external | retry-queued | required |
| sns-publish | 1 | 300s | 60s | **non-idempotent** | **needs-review** | required |

## 검증
- PGlite 격리 22 test(claim/priority/available_at/attempt/active-uniq/token fencing/heartbeat/completion/retry 3종/reaper 2종/forced-rerun/reprocess/snapshot mismatch/verification/no-overwrite/**raw token 미저장**/sentinel 불변).
- 실제 **PG17.10 SKIP LOCKED 경합 4 검증**(2 동시→1 획득·10 job·4 워커 중복 0·queued 잔여 0).

## 다음 adapter integration Gate 진입 조건
1. 첫 adapter(pdf/internal) 확정 + 운영 수치(maxAttempts/lease/heartbeat) 확정.
2. dual-write 전략(기존 경로 유지하며 큐 병행) + 관측.
3. FEATURE_JOB_QUEUE 플래그 설계(기본 OFF).
4. worker entrypoint·reaper cron 배치 계획(단일 실행 보장).
5. 그 다음에야 calls-120 복구·비멱등 게시 adapter.
