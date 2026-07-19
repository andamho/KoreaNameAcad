# internal-report shadow persistence & promotion 계약

> 이번 Gate = 조사·계약·**격리 prototype** 만. 운영 DB write·schema.ts·migration 파일 없음. jobs/job_executions 0행 유지.

## 1. jobs 직접 shadow write 불채택(안 A 기각)
- claim predicate(코드 확인, `server/jobQueue/claim.ts`): `WHERE status='queued' AND available_at<=now() ... FOR UPDATE SKIP LOCKED`.
- 다음 우회안 **전부 기각**: shadow 를 queued 저장 / available_at 먼 미래 / priority 극저 / blocked·needs_review 재사용 / executionOptions 내 shadow 플래그만 믿기. 이유: 상태 의미 왜곡·미래 코드 변경 오실행·claim predicate 가 플래그 무지·운영자 구분난.
- **안 A(jobs.status='shadow') 기각**: 상태 계약·validator·migration·claim/UI/통계 전반 변경 유발. 실제 worker 전환 임박 시 재검토.

## 2·3. persistence 모델 — 채택: 안 B(별도 테이블), jobs 0행 유지
- **안 B `job_shadow_previews`(채택, 격리 prototype)**: worker 는 `jobs` 만 claim → **별도 테이블이면 구조적으로 claim 불가**(FK 없음·claim index 없음·execution 관계 없음). 기존 상태머신 무변경. 요청별 지속 관측·dedup·provenance gap 탐지 가능.
- 안 C(외부 집계 artifact): 위험 최저, Stage B 근접. 지속 관측·시계열 비교 약함 → **초기 병행 가능**.
- **권장**: 구조적 관측이 필요하면 B, 즉시 저위험이면 C 병행. **이번 Gate 는 운영 migration 미실행** — 격리 PostgreSQL/PGlite 에서만 schema prototype·조회 검증(테스트 통과).

## 4. shadow 저장 목적 / 금지
- 목적: idempotency candidate 안정성·version provenance 누락·동일 source 재수집·reportType mapping 변화·기존 상태 vs candidate identity·코드 버전 변경에 따른 key 변화 관측.
- **저장 금지**: 보고서 원문·고객명·전화·extracted_name·rendered_url 원문·로컬 경로·artifact URI 원문·상담/고객 ID 원문·raw canonical input 전체.
- **source 참조**: raw `report_matches.id` 대신 **keyed HMAC/hash** 로 저장(단순 SHA-256 은 ID 공간 좁으면 역추측 가능). **비밀키는 코드에 두지 않음**(주입). prototype 은 이미 안전한 ref(hash) 를 받는다.

## 5. terminal historical vs active 후보 (운영 read-only 집계 근거)
- **duplicate 110**: created_at 전부 2026-07-18 단일 batch = **terminal historical**. shadow 관측 = **aggregate baseline 1회면 충분**(개별 지속 관측 불필요).
- **needs_review 4**: 2026-07-18~19, **rendered artifact 4/4 존재**(렌더 완료), match/review 만 대기 = **개별 shadow observation 대상**.
- **신규 유입**: 지속 shadow observation 대상.
- distinct file_hash 114 · 동일 file_hash 다중등장 0 → identity 유일.
- ⚠️ 이번 Gate 는 대상 **확정만**, INSERT 안 함.

## 6. renderer provenance (완성·gap)
- render_pdf.py: `import fitz`(**PyMuPDF**), `fitz.Matrix(4,4)`≈288DPI. **repo 에 lib 버전 고정 없음**(requirements 부재, 외부 venv `video-caption-bot/venv`).
- snapshot: rendererVersion(label)·rendererLibrary=`pymupdf`·**rendererLibraryVersion=null(미고정)**·rendererHash(코드+DPI manifest).
- **provenanceComplete=false**(lib 버전 미고정) → shadow persistence 는 가능하나 **worker 실행 승격 금지**. 실제 lib 버전 고정(requirements/lock) 후 provenanceComplete=true.

## 7. pipeline manifest 재현성
- 대상: reportSync.ts·reportProcessor.ts·reportMatch.ts·render_pdf.py + 고정 파라미터(DPI 4x, pdf→png). **route/UI/로그 제외**.
- 계산: path 정렬 → 각 파일 CRLF→LF 정규화 sha256 → canonical JSON({files,params}) → sha256. 같은 checkout 반복=동일(골든 테스트). 관련 파일 1 byte 변경→hash 변경, 무관 UI 변경→불변(대상 목록에 없음). lib 버전 미포함(별도 rendererLibraryVersion 슬롯).

## 8·9. preview 114 valid 의미 / historical vs prospective (중요)
- 114건 valid 이유: **Stage B script 가 현재 checkout provenance(pipeline/renderer)를 각 행에 주입**했기 때문. report row 자체가 버전 보유한 것 아님.
- **정확한 표현**: 과거 114건에 대한 preview = "현재 코드로 재표현한 **prospective candidate**". 과거 실제 실행 버전이 확인된 것 **아님**.
- **금지 표현**: "과거 114건 실행 버전 확인됨" / "historical execution == 현재 manifest".
- 필드 의미 명시: `prospectiveIdempotencyKey`(과거 identity 증명 아님)·`observedPipelineHash`·`historicalExecutionVersionKnown=false`.

## 10. shadow schema prototype (격리 전용, migrations/·schema.ts 아님)
`job_shadow_previews`(prototype DDL = `shadowObservation.ts` 상수, 테스트에서만 적용):
id·preview_schema_version·source_domain·source_record_ref(HMAC/hash)·job_type·owner_scope·project_id·prospective_idempotency_key·payload_hash·execution_options_hash·request_version_snapshot(jsonb)·observed_pipeline_hash·source_status·validation_status·validation_error_codes(jsonb)·provenance_complete·historical_execution_version_known(default false)·observed_at·observation_hash·created_at.
제약: **jobs/job_executions FK 없음·claim index 없음·execution 관계 없음·원문/URI 컬럼 없음**. `UNIQUE(observation_hash)`=동일 source+prospective key+pipeline hash 중복 관측 방지.

## 11. 승격(promotion) 계약
- 승격 = **UPDATE·row 복사 아님**. shadow→jobs SQL 복사 **금지**. 적격 시 호출자가 **새 `createJob(client, input)`** 호출(jobs 전역 UNIQUE(idempotency_key) 로 중복 방지). shadow row 는 감사 기록 유지.
- 적격 조건(`checkShadowPromotion`): validationStatus=valid · **provenanceComplete=true** · 승격시점 재계산 idempotencyKey == prospectiveIdempotencyKey · sourceStatus 정책 통과. 하나라도 실패 시 사유 코드(VALIDATION_NOT_VALID/PROVENANCE_INCOMPLETE/KEY_RECOMPUTE_MISMATCH/SOURCE_STATUS_NOT_ELIGIBLE) 반환. worker 는 별도 승인 전 OFF.

## 12. Shadow persistence migration Gate 진입 조건
1. 모델 확정(B 별도 테이블) — prototype 검증 완료.
2. rendererLibraryVersion 고정(requirements/lock) → provenanceComplete=true 가능.
3. source_record_ref HMAC 비밀키 관리 방식(코드 밖) 확정.
4. shadow write 대상 상태 필터(terminal historical=aggregate baseline / needs_review·신규=개별) 확정.
5. 격리 검증 통과분을 명시 migration(별도 Gate, db:push 금지)으로 → 그 후에야 운영 shadow write(C) 승인. 운영 DB write 는 그 Gate 부터.
