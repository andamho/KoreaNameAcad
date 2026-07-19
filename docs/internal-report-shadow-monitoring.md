# internal-report shadow observation monitoring baseline

> 현재 shadow 4건(needs_review)을 기준선으로 동결. 신규 유입·provenance 변화만 **read-only** 관측. 신규 발견돼도 자동 INSERT 안 함. promotion·worker·자동 배선 계속 금지.

## 1. 검증 명령 고정 (즉석 URL one-liner 금지)
운영 검증은 아래 **검증된 경로만** 사용(코드 변경 없이 실행). `.env` 내용 직접 읽기·즉석 URL 파싱·민감 컬럼 추가 SQL 금지. 모두 값 미출력(key/id/URL 원문 미로그).
- **read-only baseline·신규 candidate·drift**: `node --import tsx/esm scripts/monitorInternalReportShadow.ts` (BEGIN TRANSACTION READ ONLY, SELECT만).
- **write 후보 판정(안전)**: `SHADOW_WRITE_MODE=inspect … writeInternalReportShadowObservations.ts`.
- **write 시뮬(rollback)**: `SHADOW_WRITE_MODE=dry-run EXPECTED_DATABASE_HOST_HASH=<full> … writeInternalReportShadowObservations.ts`.
- 실행 환경: local report-sync(KoreaNameAcad, dotenv 로 .env 로드). Claude 는 key 값·길이·fingerprint 미열람.

## 2. observation drift 정의
같은 protected source reference(source_record_ref + key version)에 대해 다음 중 하나가 바뀌면 **drift**:
prospectiveIdempotencyKey · observedPipelineHash · rendererHash · rendererLibraryVersion · sourceStatus · validationStatus · provenanceComplete.
- **observedAt 차이는 drift 아님**(observation_hash 계산에서 제외).
- drift 시: 자동 신규 observation 생성 **금지** · **변경 필드명만** 보고(원문·ID·hash 전체값 미출력) · 별도 version-change write 승인 요청.

## 3. 신규 유입 정책 (후보 판정만, write 안 함)
신규 report 중 다음 **전부** 충족만 shadow write 후보:
source status 정책 허용 · source hash 유효 · preview validation 통과 · provenanceComplete=true · 기존 observation 없음 · 동일 source hash 중복 없음 · reportType 지원 · renderer version pin 일치.
이번 단계는 후보 판정만. **INSERT 없음.**

## 4. 수동 one-shot 절차 (자동 스케줄·reportSync hook 금지)
1. read-only baseline inspect(monitor)
2. unobserved candidate 집계
3. 예상 대상 수 고정
4. **별도 승인**
5. dry-run
6. rollback 후 기준선 확인
7. apply
8. idempotency 재검증

## 5. 관측 기간 기준
자동 배선 전 최소 관측: **신규 report 3~5건 또는 최소 7일**(먼저 충족 시점까지 수동 read-only 관측).
**중단 조건(발생 시 자동 배선 검토 보류)**: identity drift 1건 · 민감정보 validation 오류 1건 · renderer provenance mismatch 1건 · 예상 밖 중복 1건 · target status 오분류 1건.

## 6. 다음 Gate 진입 조건
- **shadow writer manual one-shot for new ingest**: unobservedEligible>0 · drift=0 · invalid=0 · provenance mismatch=0 · 대상 수 명시 · 별도 승인.
- **reportSync automatic shadow hook**: 수동 신규 observation 3~5건 성공 · idempotency 문제 0 · 민감정보 문제 0 · drift 문제 0 · writer failure 0 · jobs/job_executions 계속 0.
- **shadow→jobs promotion**: 위보다 이후, 이번 범위 밖.

## 7. 모니터 출력 계약 (집계만)
`selected` · `eligible` · `invalid`(+invalidCodes) · `alreadyObserved` · `unobservedEligible` · `drift`(+driftFields 필드명만) · `provenanceMismatch` · `duplicateExcluded` · `write=false` · shadow_total · jobs · job_executions.
행별 source ref·key·hash **미출력**. write 항상 false(read-only).
