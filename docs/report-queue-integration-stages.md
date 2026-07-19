# internal-report ↔ queue 통합 단계 계획

> 현재 구현 = **A(offline fixture preview)까지만**. B~E 는 각각 별도 승인 Gate. 운영 DB write 는 C 부터.

## 배경(read-only 재조사)
- report 처리 진입점: 폴더 감시 `reportSync.syncReports()`(로컬 전용) → `reportProcessor.processFile()`. 배포 서버는 폴더 없어 no-op.
- **content hash**: `hashFile`=sha256(파일 내용) → 경로 무관 identity(`report_matches.file_hash`). sourceAssetHash=reportContentHash 동일 원천.
- 산출물: PDF→4x PNG 렌더(`render_pdf.py`) 또는 이미지 통과 → R2 업로드(`rendered_url`). 첨부=`crm_files`.
- terminal guard: `TERMINAL`(auto_matched/manually_matched/ignored/rejected/duplicate) + `needs_review` 는 재처리 안 함(멱등성).
- 실행 단위: 현재 processFile = **render + match + attach** 한 흐름. 초기 queue 최소 단위는 `internal-report` 하나로 표현(render 은 내용해시로 결정적, match 는 고객 DB 상태 의존=실행 결과이지 identity 아님, attach 는 match 결과). render/match/attach 분리(internal-report-render/-match/-attach)는 **후속 검토**, 이번엔 registry 무단 확대 금지.

## 운영 데이터 gap (SELECT-only 집계 2026-07-19)
| 항목 | 확보 | 비고 |
|---|---|---|
| report_matches 총건 | 114 | family 68 / individual 46 |
| file_hash(content) | 114 (100%) | idempotency 원천 완비 |
| report_type | 114 (100%) | |
| rendered_url(artifact) | 114 | |
| projects.id 연결 | **없음(GAP)** | matched_customer 110건은 projectId 아님 → projectId=null |
| pipeline/template/renderer version | **없음(GAP)** | 컬럼 미존재. preview 필수 3버전 → **통합 시 config 로 주입** 필요 |
- **preview validation 통과 예상**: content hash·report_type 는 114건 전부 확보되나, pipeline/template/renderer version 부재로 **현재 데이터만으론 0건 통과**. 버전은 코드/config 상수로 공급해야 함(운영 데이터 임의 생성 금지).

## 단계
### A. Offline fixture preview (이번 Gate, 구현 완료)
- `buildInternalReportQueuePreview(input)` **순수 함수**(DB client 없음). fixture/테스트만. reportSync/route 미연결.
- idempotencyKey·payloadHash·executionOptionsHash·requestVersionSnapshot 메모리 계산 + validation + 민감정보 방지.
- **jobs/job_executions INSERT 0 · 기존 상태·artifact 무변경 · 운영 DB write 0.**

### B. Operational read-only preview (별도 승인)
- 기존 report 요청/`report_matches` 행을 **SELECT** 로 읽어 preview 를 메모리 계산.
- 결과는 **집계만**(통과/누락 건수·gap). DB write 0. 고객 원문 미출력.
- 목적: 실제 데이터로 매핑 gap·버전 공급 방식 확정.

### C. Shadow write (별도 승인)
- 검증된 candidate 를 `jobs` 에 기록(shadow 상태). **worker claim 금지·adapter 실행 없음.** 운영 DB write 발생.
- 목적: 스키마·인덱스·멱등 UNIQUE 실동작 확인.

### D. Dual-write (별도 승인, 고위험)
- 도메인 report 요청 생성과 동시에 queue job 생성. **worker OFF, 기존 경로만 실제 실행.** 중복·누락 비교.

### E. Worker shadow execution (별도 승인)
- worker 가 claim·adapter 실행하되 **결과는 운영 반영 안 함**. 기존 reportSync 결과와 hash 비교.
- 통과 후에야 실제 전환(FEATURE_JOB_QUEUE) 검토.

## Operational read-only preview(B) 진입 조건
1. A 의 preview 계약·테스트 동결(idempotency 결정성·민감정보 방지).
2. pipeline/template/renderer version 공급 방식 확정(코드 상수/config, 운영 데이터 아님).
3. projectId 정책 확정(projects 무연결 → null 유지, 고객/상담 ID 대체 금지).
4. read-only 조회 범위·집계 항목·고객값 비노출 검문 계획.
5. 그 후에야 B(운영 read-only preview) 승인 요청.

## 계약 요약(A)
- **ownerScope** = `korea-name-acad`(임의 신규 문자열 아님). **projectId** = null(projects 무연결 근거). **jobType** = `internal-report`(registry 일치).
- **input identity(idempotencyKey)** = ownerScope·projectId·jobType·inputAssetHash(content hash)·pipelineVersion·(transcription/dictionary/normalization/correction=null)·executionOptionsHash. reportType/templateVersion/rendererVersion 는 executionOptions → executionOptionsHash 로 identity 반영.
- **requestVersionSnapshot**: schemaVersion·pipelineVersion·transcription* null·**dictionary/normalization/correction null(report 는 이름교정사전·정규화 미사용)**·executorRequirement·projectSpecific{reportType,templateVersion,rendererVersion,outputMode}.
- **payloadHash**(요청 envelope 무결성) ≠ **idempotencyKey**(작업 identity). payloadHash=비민감 envelope canonical hash(보고서 본문 미포함).
- **민감정보 방지**: 입력 전체 스캔 → 고객명·전화·경로·URI·본문·DB URL·token 키/값 발견 시 SENSITIVE_FIELD_PRESENT 거부(fail-closed). identitySummary 는 hash prefix·reportType·project 유무·version label 만.
