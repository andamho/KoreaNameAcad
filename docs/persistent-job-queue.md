# 영속 작업 큐 (persistent job queue) — 스키마·마이그레이션

## 목적
서버 재시작 시 유실되던 인메모리 큐(예: localTranscribe 의 `let queue=Promise.resolve()`)를 대체하는 **DB 영속 작업 큐**. `jobs`(불변 요청 identity) + `job_executions`(시도별 실제 실행) 2계층. 통화 전사·영상 자막·PDF·SNS 게시 등 여러 작업 종류를 공통 구조로 수용하며, 교정 버전(dictionary/normalization/correctionEngine)을 재현 가능하게 고정한다.

## 이 커밋 범위 / 안전
- **스키마 + 명시 migration + 중앙 타입·validator + 격리 테스트만.** 큐 runtime(claim/lease/heartbeat/worker)·API·UI **미구현**.
- **FEATURE_JOB_QUEUE 기본 OFF**(예정). migration 을 적용해도 큐를 read/claim 하는 코드가 없어 **기존 처리 경로 100% 그대로**.
- 기존 테이블·데이터·FK **무변경**. `db:push` 사용 안 함.

## migration
- 파일: `migrations/0002_create_persistent_job_queue.sql` (additive, DROP/ALTER/DML 없음, `IF NOT EXISTS` 안 씀).
- 적용기: `server/migrate.ts` — SQL 을 **BEGIN/COMMIT 트랜잭션**으로 감싸고 **기존 모든 테이블 행수 불변**을 검증, 하나라도 다르면 ROLLBACK.
- ⚠️ **선행 필요**: `server/migrate.ts` line 56 이 현재 `report_matches` 를 하드코딩 검증한다. 0002 적용 전에 이 검증을 **일반화**(신규 테이블 ≥1 + 기존 행수 불변)해야 한다. 이번 커밋에서는 migrate.ts 를 수정하지 않음 → **운영 실행 Gate 의 선행 조건.**

### 예상 증가량 (실측 fingerprint 기준)
- BASE TABLE **+2** (jobs, job_executions). 현재 운영 30 → **32**.
- FK **+2** (jobs.parent_job_id→jobs.id RESTRICT, job_executions.job_id→jobs.id RESTRICT). 현재 2 → **4**.
- 인덱스 **+9** (PK 2, unique 3[idempotency_key·job+attempt·active 부분유일], 조회 4[claim·reaper·parent·project]).
- jobs **19컬럼**, job_executions **21컬럼**. project_id **무FK**(projects 물리삭제 정책), **run_revision 없음**. timestamptz + DB now(), jsonb, varchar(64) hash.

## 운영 실행 전 baseline 검문 (별도 승인 필요)
- 실행 전: BASE TABLE 30·FK 2 확인, jobs/job_executions **부재** 확인, 기존 30테이블 행수 스냅샷.
- 실행: `server/migrate.ts`(일반화 후) 로 단일 tx 적용.
- 실행 후: BASE TABLE 32·FK 4, jobs/job_executions **fingerprint 일치**(`tests/knop/fixtures/jobQueueFingerprint.json` — 컬럼/타입/nullable/default/PK/FK/ON DELETE/인덱스/unique/부분 predicate), 신규 테이블 0행, 기존 30테이블 행수·구조 diff 0. **테이블 개수만으로 판단 금지 — fingerprint 대조.**

## rollback (DROP 없음)
- **FEATURE_JOB_QUEUE OFF + 기존 경로 복귀 + 신규 테이블 잔존(미사용).** DROP 하지 않는다.
- migration 만 적용된 상태(코드 미배선)는 운영 영향 0 → 롤백 불필요(플래그로 충분).
- 실제 테이블 제거가 필요하면 별도 명시 승인 하 DROP(자동 롤백 아님). 감사·재현 데이터가 있으면 보존.

## 범위 밖 (후속 Gate)
- 큐 runtime(claim/lease/heartbeat/reaper), 워커 배선, dual-write, API/UI.
- **calls 120건 stuck 복구**(available_at 미래 hold, 승인분만 now) = 별도 Gate.
- `server/migrate.ts` 일반화, 운영 migration 실행, Railway 배포.

## 값의 단일 소스
- 상태·검증·priority·hash·snapshot 타입 = `shared/jobQueueContract.ts`. status 컬럼은 text 이므로 값의 권위는 이 모듈(DB CHECK 초기 미도입, 롤백 원칙).
