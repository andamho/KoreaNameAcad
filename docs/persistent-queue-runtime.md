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

## 하드닝(concurrency & invariant Gate 추가)
- **canonical JSON 가드**: undefined·함수·symbol·BigInt·Date·비유한수·순환 참조 거부(fail-closed). null 보존(missing 과 구분). 골든 fixture `tests/knop/fixtures/canonicalGolden.json` 로 bytes/sha256 동결. idempotencySchemaVersion 별도 계약.
- **createJob identity 재검증**: 같은 idempotencyKey 인데 owner_scope/project_id/job_type/payload_hash/execution_options_hash/request_version_snapshot/input_identity 중 하나라도 다르면 **HASH_IDENTITY_MISMATCH**(새 job·기존 반환 둘 다 안 함, fail-closed, 불일치 필드명만). canonicalization 버그·수동 DB 변형 방어.
- **lease 경계**: `lease_expires_at > now()` 만 유효(정확히 같은 시각=만료). heartbeat/running/complete/fail 전부 만료 lease 거부(권한 상실=reaper 소관). DB now() 기준, worker 로컬 시간 금지.
- **claimed timeout**: reaper 는 `running + started_at` = adapter 실제 시작으로 판정. 비멱등 job 이라도 **claimed(미시작)** 만료는 needs_review 아니라 재시도/소진(부작용 없었음이 증명). 시작 후 만료만 needs_review.
- **retry 생성 시점**: fail/reaper 는 job 을 queued + available_at 까지만. 다음 정상 claim 이 attempt++·execution 생성(fail/reaper tx 안에서 미리 execution 만들지 않음) → active 부분유일·claim 경합 모델 단순.
- **forced-rerun 계약(안 C — 현 스키마 미지원)**: 관리자 함수가 worker_id/lease token/lease 만료를 **직접 발급하지 않는다**(worker 배정·capability·SKIP LOCKED·priority 경로 우회 금지). 올바른 계약은 "요청 함수가 job 을 queued 로 되돌리고 다음 정상 claim 이 execution_reason='forced-rerun' 으로 execution 을 생성"이나, 이를 위한 `jobs.pending_execution_reason` 컬럼이 현 스키마에 없다. → **RC 에서는 forced-rerun 실행 API 미제공**(`requestForcedRerun` 은 `FORCED_RERUN_UNSUPPORTED` 오류만). 안 A(additive `pending_execution_reason` migration) 후 일반 claim/lease 경로로 활성화. 부분유일 인덱스는 "중복 방지"일 뿐 직접 execution 생성 책임을 정당화하지 않는다. (허용 상태 후보: succeeded/failed/cancelled/blocked/needs_review, active execution 있으면 거부 — 활성화 시 적용.)
- **transaction lock order**: 기존 execution 을 변경하는 함수(complete/fail/reaper)는 **execution → job** 순서로 잠근다(단일 순서). reaper 는 `FOR UPDATE OF e SKIP LOCKED`. claim 은 **job(queued) → 새 execution INSERT** 이나, queued job 은 active execution 이 없고 claim 이 tx 내내 job lock 을 쥐므로 complete/fail/reaper(running job)과 잠그는 행 집합이 겹치지 않는다 → **반대 순서 사이클 없음**. READ COMMITTED 에서 안전(경합은 대기 또는 SKIP LOCKED 로 해소). PG17 교착 테스트(completion·fail 동시, completion·reaper 동시)로 무교착 확인.
- **결과/오류 계약**: 정상적인 상태 충돌은 **결과값**(discriminated: complete `{outcome}`, fail `{outcome,failureClass}`, claim `null`), 프로그래머 오류는 **throw**(미등록 jobType/error_code, `HASH_IDENTITY_MISMATCH`, `CanonicalizationError`, `FORCED_RERUN_UNSUPPORTED`). 안정 코드: HASH_IDENTITY_MISMATCH·lease-expired(LEASE_EXPIRED)·fencing-failed(LEASE_FENCING_FAILED)·already-terminal(EXECUTION_ALREADY_TERMINAL)·aborted-incomplete/-fingerprint 등. 결과·오류에 민감정보 없음(상태·필드명·ID 만).
- **reprocess 가드**: reprocess_reason 은 idempotencyKey 에 넣지 않음 → reason 만 바꾸면 같은 key → 기존 job 반환(**새 job 금지**). 입력·버전·옵션 중 최소 하나가 실제로 달라야 새 job.
- **불변식 진단**: `inspectJobInvariant(jobId)` = running↔single-active·terminal→active0·queued→active0·review→active0·succeeded→마지막 succeeded+검증충족. 상태·ID 만 반환(원문 금지).
- **로그 안전성**: raw lease token 은 DB·로그·throw 어디에도 없음(hash 만). error_code 레지스트리 외 값 거부, error_summary ≤1000자·원문/stack/고객값 금지.

## 첫 adapter 최종 선택
① internal-report → ② pdf-generate → ③ call-transcribe → ④ video-caption → ⑤ sns-publish·SMS(비멱등, 최후). 기존 reportSync 경로는 교체하지 않음(이미 content-hash 멱등+terminal guard 보유).

## shadow 단계 용어(엄격 분리 — "shadow create" 표현 금지)
| 단계 | 운영 DB write | jobs insert | worker/adapter | 승인 |
|---|---|---|---|---|
| **shadow preview**(다음 단계) | **없음** | **없음** | 없음 | 이 계약 문서 후 |
| shadow write | jobs 에 queued/shadow 행 기록 | **있음** | worker claim·adapter 실행 없음 | 별도 승인 |
| dual-write | 도메인 요청 생성 시 queue job 동시 생성 | 있음 | worker OFF, 기존 경로만 실행 | 별도 승인(고위험) |

**다음 단계 = shadow preview**: 기존 처리 요청을 읽어 queue request candidate 를 **메모리에서만** 계산(idempotencyKey·requestVersionSnapshot·executionOptionsHash·adapter mapping·validation). 실제 jobs insert·adapter 실행 없음, 기존 실행에 영향 0.

## internal-report shadow-preview 계약(다음 Gate용, 문서 전용)
- 대상 jobType: `internal-report`.
- **입력 매핑 후보**: ownerScope · projectId · jobType='internal-report' · inputAssetHash(또는 report content hash) · pipelineVersion · dictionaryVersion(사용 여부 결정) · normalizationVersion(사용 여부) · correctionEngineVersion/Hash(사용 여부) · executionOptions · payloadHash.
- **preview 출력**: `wouldCreate`(bool) · `existingJobId | null` · `idempotencyKey` · `validationErrors[]` · `requestVersionSnapshot` · `adapterPolicy`(jobType 정책) · **민감정보 없는 identity summary**(해시·필드명만).
- **금지**: jobs insert · job execution · 기존 reportSync 수정 · route 연결 · 관리자 UI.
- 이번 Gate 는 이 계약·매핑 문서까지만(코드 배선 0).

## 요구사항 23 ↔ 테스트 대응(요약)
1 idempotency 1행=runtime#1 · 2 다른 project=runtime#2+hardening#3 · 3 동시 claim 단일=runtime#3(PGlite)+**pg#6·contention A/B(PG17)** · 4 priority=runtime#4 · 5 available_at 미래=runtime#5 · 6 attempt++=runtime#6 · 7 active 중복=runtime#7 · 8 token heartbeat=runtime#8 · 9 stale completion=runtime#9+hardening lease · 10·11 lease 만료 reaper/pure→queued=runtime#10·11 · 12 side-effect→needs_review=runtime#12(+12b 미시작 예외) · 13 transient→queued=runtime#13 · 14 permanent→failed=runtime#14 · 15 소진→failed=runtime#15 · 16 forced-rerun=runtime#16+**pg#6** · 17 reprocess=runtime#17+hardening reprocess · 18 snapshot mismatch=runtime#18 · 19 verification pending 금지=runtime#19 · 20 passed→succeeded=runtime#20 · 21 terminal 덮어쓰기 금지=runtime#21+**pg#1(completion/reaper)** · 22 raw token 미저장=runtime#22+hardening safety · 23 sentinel 불변=runtime#23. (전 항목 커버 + 신규: canonical 골든·identity mismatch·불변식 진단·lease 경계·claimed timeout·PG 경합 5쌍.)

## 다음 adapter integration Gate 진입 조건
1. 첫 adapter(pdf/internal) 확정 + 운영 수치(maxAttempts/lease/heartbeat) 확정.
2. dual-write 전략(기존 경로 유지하며 큐 병행) + 관측.
3. FEATURE_JOB_QUEUE 플래그 설계(기본 OFF).
4. worker entrypoint·reaper cron 배치 계획(단일 실행 보장).
5. 그 다음에야 calls-120 복구·비멱등 게시 adapter.

## 구현 순서 + 코드 위치 확정 (production 배선 준비 — Bundle C)
> ⚠️ 아래는 **적용 순서와 실제 파일 위치**를 못박는 표다. 코드 배선(worker entrypoint 연결)은 **production apply 승인 이후**에 한다. 지금은 위치·순서만 확정한다.

### 0) DB migration 적용 — `server/migrate.ts` (drizzle push 미사용)
- **적용 명령**(host 핀 필수, apply=COMMIT):
  ```
  MIGRATION_MODE=apply CONFIRM_APPLY=true EXPECTED_DATABASE_HOST_HASH=<sha256(host)> \
    node --import tsx/esm server/migrate.ts <id>
  ```
  `inspect`(기본, SELECT만) → `dry-run`(tx 후 ROLLBACK) → `apply`(COMMIT) 3단. sha256(CRLF→LF) 레지스트리 대조, host 원문 미로그.
- **적용 순서**: `0002_create_persistent_job_queue`(jobs/job_executions) → `0004_cross_agent_orchestration`(6 orchestration 테이블) → **hardening `0001`(별도 hardeningRunner·§12a-1, 승인 Gate)**. 레지스트리: `server/migrations/registry.ts`.
- ⚠️ `check-and-migrate.mjs`(루트)는 **일회성 ad-hoc + 하드코딩 credential** → 정식 경로 아님(자격증명 회전·env 전환 별도 태스크).

### 1) 이미 구현된 런타임 모듈(`server/jobQueue/`) — 배선만 남음
| 항목 | 파일 | 진입 함수 | 계약 |
|---|---|---|---|
| worker claim | `claim.ts` | `claimNextJob` | `FOR UPDATE SKIP LOCKED` + active 부재 + attempt=max+1 + lease token **hash만 DB** → commit 후 adapter |
| claimed→running | `running.ts` | `markRunning` | fencing(exec+worker+token+status=claimed) 일치만 |
| lease | `leaseToken.ts` | raw 생성/hash · 경계 `lease_expires_at>now()` | 만료 lease 는 heartbeat/complete/fail 전부 거부(reaper 소관) |
| heartbeat | `heartbeat.ts` | `heartbeat` | fencing 후 heartbeat_at·lease 연장(DB now()). 반환 false=즉시 중단 |
| complete | `complete.ts` | `completeExecution` | fencing + verification + terminal 덮어쓰기 금지 |
| fail | `fail.ts` | `failExecution` / `markVersionMismatch` | transient→queued(available_at) / permanent·소진→failed / side-effect→needs_review |
| idempotency | `idempotency.ts` | canonical JSON+sha256 key | createJob(`createJob.ts`) 재요청 1행 |
| reaper | `reaper.ts` | `reapExpired` | 만료 claimed(미시작)→재시도, running(시작)→정책 |
| 읽기·진단 | `repository.ts` · `invariant.ts` | `getJob`/`inspectJobInvariant` | — |
- 배럴: `server/jobQueue/index.ts`. **운영 route/cron/worker 에 미연결**(현 prototype 계약).

### 2) ✅ cancel acknowledgment — **구현 완료**(worker 경로 배선)
- 현 스키마: `jobs.cancelled_at`(timestamptz) + status `cancelled` 는 있으나, **협조적 취소 요청→worker ack 흐름이 없다**(`cancel_requested_at` 컬럼·ack 모듈 부재).
- **필요 작업(구현 순서)**:
  1. **additive migration**(신규 `000N`): `jobs.cancel_requested_at timestamptz NULL`(+ 선택 `cancel_requested_by_ref`). 기존 행 무영향·backfill 0. `server/migrations/registry.ts` 등록 + fixture.
  2. **cancel 요청 API**: job 을 삭제하지 않고 `cancel_requested_at=now()` 만 기록(멱등). 위치: `server/jobQueue/cancel.ts`(신규) → `requestCancel(jobId)`.
  3. **worker ack**: `heartbeat` 반환값에 `cancelRequested: boolean` 추가(fencing 유지). worker 가 true 를 받으면 중단하고 `acknowledgeCancel(executionId, workerId, leaseToken)` 호출 → execution=cancelled·job=cancelled·`cancelled_at` 기록(terminal 덮어쓰기 금지, 부작용 없었음 증명 시에만). 위치: `cancel.ts` + `heartbeat.ts` 확장.
  4. 테스트(PGlite+PG17): 요청 멱등, 미시작 claimed 취소=부작용0 즉시 cancelled, running 취소=ack 후에만, 만료 lease 취소 거부, terminal 후 취소 무효.
- **원칙**: cancel 도 claim/lease/fencing 계약을 따른다(관리자 함수가 execution 상태를 직접 쓰지 않음 — forced-rerun 안 C 와 동일 원칙).

### 3) 배선 순서(요약)
migration apply(0002→0004→hardening) → cancel-ack additive migration → worker entrypoint(단일 실행·reaper cron) 연결 → `FEATURE_JOB_QUEUE`(기본 OFF) → 첫 adapter(internal-report) dual-write 관측 → calls-120 복구.


## 런타임 배선 완료(이번 묶음) — 실제 queued→running→done
- `server/jobQueue/worker.ts` `processNextJob`: claim→markRunning→(cancel 확인)→adapter.execute→complete/fail. commit 이후 adapter 실행, raw lease token 메모리 전용.
- `server/jobQueue/cancel.ts`: `requestCancel`(멱등, cancel_requested_at)·`isCancelRequested`·`acknowledgeCancel`(fencing+active+lease 유효 시 cancelled). 관리자가 execution 상태를 직접 쓰지 않음.
- `server/jobQueue/connection.ts`: 전용 `ORCHESTRATION_QUEUE_URL`(=writer credential)만 읽음. 소유자(NEON_DATABASE_URL) 비의존, 미설정 fail-closed. worker=전용 pg.Client(트랜잭션 안전).
- `server/jobQueue/adapters/echoCompute.ts`: 순수 echo adapter(e2e).  `server/jobQueue/adminApi.ts`: listJobs/getJobDetail/requestJobCancel(비밀 미노출).
- migration: `migrations/0005_job_cancel_request.sql`(cancel 컬럼, additive) · `migrations/0005b_queue_runtime_grants.sql`(writer/reader grants, 운영자 적용).
- e2e: `tests/knop/jobQueueE2E.test.ts` 9종 — 단계별 queued→running→succeeded, 1-shot, cancel, terminal cancel no-op, transient 재시도, no-adapter permanent, lease 만료 reaper, admin API, 전용 연결 fail-closed.
