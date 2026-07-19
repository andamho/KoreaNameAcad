# internal-report shadow write scope & provenance (migration RC)

> job_shadow_previews(안 B) 명시 migration 0003 RC. 운영 apply·dry-run·INSERT 아직 금지. 격리 PG17 검증 완료.

## 1. renderer 버전 고정(완성)
- 실행 환경: **로컬 report-sync 머신 전용**(`reportSync.ts`, 폴더 감시). **Railway 배포 서버는 폴더 없어 no-op** — render 미실행. Electron/Lambda 없음.
- 실제 lib(video-caption-bot/venv, 2026-07-19): **pymupdf 1.28.0**(MuPDF 1.29.0), `fitz.Matrix(4,4)`≈288DPI.
- 고정: `requirements-report-renderer.txt` = `PyMuPDF==1.28.0`(추측 아님, 실제 확인값). 추측 버전 금지.
- guard: `rendererGuard.ts` `checkRendererVersion` — 실제≠기대면 fail-closed(RENDERER_LIBRARY_VERSION_MISMATCH / RENDERER_LIBRARY_NOT_AVAILABLE, 경로·고객정보 없음). **reportSync 미배선**(별도 validator).

## 2. provenanceComplete 조건
pipelineVersion·pipelineHash·rendererVersion·rendererHash·rendererLibrary='pymupdf'·**rendererLibraryVersion=1.28.0(고정)**·DPI·outputFormat·templateVersion=null 의미·snapshot schemaVersion 모두 확보 시 true. PyMuPDF 버전 문자열만 채운 게 아니라 requirements 고정 + manifest 계산 일치가 근거.

## 3. source_record_ref HMAC 계약
- raw `report_matches.id` 저장 **금지**(ID 공간 좁아 단순 sha256 역추측 가능). **keyed HMAC-SHA256**.
- message: `internal-report-shadow:<keyVersion>:<sourceDomain>:<sourceId>`(domain-separated). 결과 lowercase 64 hex.
- key: 환경변수 **`JOB_SHADOW_REF_HMAC_KEY`**(코드·DB·manifest 저장 금지). 미설정→SHADOW_REF_KEY_MISSING, <32자→SHADOW_REF_KEY_TOO_SHORT(fail-closed). 로그·오류에 key·raw id 없음.
- **key version**: `source_ref_key_version`(예 v1) 별도 저장. rotation = 과거 row UPDATE 아님 → 새 key version = 신규 observation(다른 ref·다른 observation_hash). observation uniqueness 에 ref+keyVersion 모두 반영. **이번 Gate rotation 미실행, 실제 비밀키 미생성**.

## 4. 첫 shadow write 대상 정책 (write 는 후속 Gate)
- **포함**: needs_review 4건(개별) · migration 이후 신규 유입 · provenance 변화 후 비교 필요한 신규 observation.
- **제외**: duplicate historical 110 **개별 backfill 금지** · terminal historical 전체 · 이미 관측된 동일 observation_hash · provenance 계산 실패 · validation 실패.
- duplicate 110 = **aggregate baseline 만**(total·reportType 분포·status 분포·당시 observedPipelineHash·historicalExecutionVersionKnown=false). 개별 row 110 backfill 은 별도 필요성 전까지 금지.
- observation_kind: baseline / needs-review / new-ingest / version-change.

## 5. job_shadow_previews 스키마(0003)
- 23컬럼(id·preview_schema_version·source_domain·source_record_ref(varchar64)·source_ref_key_version·observation_kind·job_type·owner_scope·project_id·prospective_idempotency_key·payload_hash·execution_options_hash·request_version_snapshot(jsonb)·observed_pipeline_hash·renderer_library_version·source_status·validation_status·validation_error_codes(jsonb)·provenance_complete·historical_execution_version_known·observed_at·observation_hash·created_at).
- 제약 8: PK + 7 CHECK(hash 6종 `^[0-9a-f]{64}$` + validation_status IN). **FK 0**(jobs/job_executions/customer/consultation 없음). 인덱스 7: **UNIQUE(observation_hash)** + 조회 5(observed_at·source_status·provenance_complete·prospective_idempotency_key·(source_record_ref,source_ref_key_version)) + PK. **claim/lease/queued index 없음**.
- **원문/URI/경로/고객값 컬럼 없음.** schema.ts additive(jobShadowPreviews) — 기존 jobs/jobExecutions 무변경.

## 6. observation_hash 계약
canonical = {previewSchemaVersion·sourceDomain·sourceRecordRef·**sourceRefKeyVersion**·prospectiveIdempotencyKey·observedPipelineHash·sourceStatus·validationStatus·provenanceComplete·**observationKind**}. **제외: observedAt·DB id·로그**. → pipeline hash/source status/prospective key/provenance/validation/kind/keyVersion 변경 시 새 observation.

## 7. migration RC 상태(격리 검증)
- 0003 additive(신규 CREATE만, DROP/ALTER/DML 0, db:push 금지). runner registry 등록(expectedSqlSha256 `0070e6fa…`·fixture `8e11a4bb…`). **기존 0001/0002 checksum 불변**.
- fixture `jobShadowPreviewsFingerprint.json`: 23컬럼·8제약·7인덱스·**FK 0**.
- **실제 PG17.10 CLI e2e 12/12**: 0002→0003 순차, inspect(not-applied)·dry-run(잔존물 0)·apply·already-applied(fingerprint exact)·FK 0·전체 FK 불변·jobs/job_executions 0행·BASE TABLE 3·UNIQUE(observation_hash)·claim/lease index 0.
- test:knop 129/129(shadow observation·HMAC·guard·승격·migration).

## 8. 승격(promotion) 계약
UPDATE·복사 아님 → 적격 시 **새 createJob 호출**. `checkShadowPromotion`: validationStatus=valid·**provenanceComplete=true**·재계산 idempotencyKey==prospective·sourceStatus 정책 → 실패 시 코드(VALIDATION_NOT_VALID/PROVENANCE_INCOMPLETE/KEY_RECOMPUTE_MISMATCH/SOURCE_STATUS_NOT_ELIGIBLE). worker OFF.

## 9. 운영 상태(SELECT-only inspect)
0003 **not-applied**·job_shadow_previews **부재**·jobs 0·job_executions 0·BASE TABLE 32·FK 4·0001/0002 fingerprint exact. 운영 apply/dry-run/write 0.

## 10. production migration apply Gate 진입 조건
1. 0003 RC 동결(checksum·fixture) — 완료.
2. JOB_SHADOW_REF_HMAC_KEY 운영 비밀키 관리(주입, 코드 밖) 확정.
3. write 대상 정책(needs_review·신규만, duplicate backfill 금지) 확정 — 완료.
4. 운영 apply 절차(inspect→dry-run→apply, host 핀, checksum, 실행자) — 기존 migrate.ts 계약 재사용.
5. 그 후에야 운영 0003 apply(별도 승인) → shadow write(C, 별도 승인). 운영 DB write 는 그 Gate 부터.
