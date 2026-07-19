# internal-report version provenance & operational preview

> 운영 데이터에 없는 버전을 임의 기본값으로 만들지 않는다. 각 버전은 source of truth 를 명시하고,
> semantic **label** 과 실제 영향 **manifest hash** 를 분리한다.

## 민감정보 방지(주 방어선 = allowlist)
- top-level 입력 allowlist 고정: ownerScope·projectId·sourceAssetHash·reportContentHash·reportType·pipelineVersion·pipelineHash·templateVersion·templateHash·rendererVersion·rendererHash·executionOptions·existingDomainStatus·artifactIdentitySummary. 그 외 top-level 키 = **UNEXPECTED_INPUT_FIELD**(값 미열람).
- executionOptions allowlist: outputFormat·outputMode·dpi·pageSize·orientation·imageMode·attachmentMode. 그 외 = **UNEXPECTED_EXECUTION_OPTION**.
- 이름 즉시거부(값 미열람): customerName·phone·email·address·residentNumber·reportBody·consultationText·absolutePath·filePath·fileName·uri·url·databaseUrl·leaseToken·extractedName → **SENSITIVE_FIELD_PRESENT**.
- 값 정규식(전화·이메일·경로·URI·주민번호)은 **2차 검문**일 뿐. "정규식 통과=안전"으로 표현하지 않는다.

## sourceAssetHash / reportContentHash 관계
- `sourceAssetHash` = 입력 파일 bytes SHA-256(= `report_matches.file_hash`). **identity 원천은 이것 하나.**
- 현재 시스템에 별도 canonical content hash 가 없다 → `reportContentHash` 는 **null 만 허용**(비-null 이면 REPORT_CONTENT_HASH_UNSUPPORTED). 같은 값을 이름만 달리해 중복 저장하지 않는다.
- 기존 `hashFile` 은 추출 텍스트가 아니라 **파일 bytes** 를 sha256 → sourceAssetHash 로 직결.

## version source of truth
| 버전 | source of truth | 현재 값/상태 |
|---|---|---|
| **pipelineVersion**(label) | internal-report 전체 실행 의미(render+match+attach+순서). Git SHA 그대로 쓰지 않음 | `internal-report-pipeline-v1` |
| **pipelineHash**(manifest) | 영향 파일·파라미터 manifest sha256 | reportSync·reportProcessor·reportMatch·render_pdf.py + {dpiScale 4, pdf→png} 로 계산 |
| **templateVersion** | 실제 template 자산이 결과를 바꿀 때만 | **null**(별도 template 없음 — 원본 PDF 를 4x PNG 로 렌더/이미지 통과. 가짜 버전 만들지 않음) |
| **templateHash** | template bytes(있을 때만) | null |
| **rendererVersion**(label) | renderer identity(PyMuPDF 기반 render_pdf.py) | `report-renderer-v1`(실제 lib 버전은 조사 시 확인·후속 반영) |
| **rendererHash**(manifest) | 렌더 코드·고정 DPI manifest sha256 | render_pdf.py·reportSync + {dpiScale 4} |

- manifest hash 는 label 과 **분리**된 무결성값(같은 label·다른 코드 = 다른 hash). requestVersionSnapshot 공통 슬롯 밖 값은 `projectSpecific`(reportType·pipelineHash·rendererVersion·rendererHash·templateVersion·templateHash·outputMode)에 두고, **공통 snapshot schema 는 무단 변경하지 않음**. 미사용은 null.
- **manifest 대상**(결과 영향): reportSync.ts·reportProcessor.ts·reportMatch.ts·render_pdf.py + 고정 파라미터(DPI 4x, pdf→png). route·UI·로그 **제외**.

## identity 계약
- idempotencyKey = sha256(canonical[schemaV, ownerScope, projectId, jobType, **inputAssetHash=sourceAssetHash**, pipelineVersion, transcription/dictionary/normalization/correction=null, **executionOptionsHash**]).
- executionOptionsHash = canonical({reportType, templateVersion, templateHash, rendererVersion, rendererHash, pipelineHash, renderOptions}) → reportType·template/renderer(label+hash)·render 옵션 변경 시 key 변경.
- payloadHash(요청 envelope 무결성) ≠ idempotencyKey(작업 identity). 같은 hash 중복 저장 안 함.

## 결과 타입 정리
- `wouldCreate` → **`eligibleForCreate`**(validation 통과 & createJob 구조 완성. DB UNIQUE 충돌·존재 여부 **미확인**, 생성 보장 아님).
- `existingJobId` **제거** + `databaseLookupPerformed: false`(순수 preview = DB 조회 안 함) 명시.

## 운영 read-only preview 결과 (2026-07-19, SELECT-only, READ ONLY tx, 집계만)
- 실행기: `scripts/previewInternalReportQueue.ts`(READ_ONLY_PREVIEW=true 필수·`BEGIN TRANSACTION READ ONLY`·SELECT `file_hash/report_type/status` 만·jobs/job_executions count 만·URL 미로그·결과 미저장·reportSync 미import).
- **jobs=0 · job_executions=0**(0 유지). manifest pipelineHash#3d7989ea… rendererHash#bdb6a7eb….
- **total 114 · valid 114 · invalid 0 · eligibleForCreate 114**(config 버전 주입 시). byErrorCode {}.
- byReportType: family 68 · individual 46. byStatus: duplicate 110 · needs_review 4.
- projectIdNull 114 · sourceHashValid 114 · pipelineVersionPresent 114 · rendererVersionPresent 114 · templateVersionNull 114.
- **중복 분석: duplicateGroups 0 · duplicateRows 0 · sameSourceDiffReportType 0** → 각 report 내용해시 유일 → idempotencyKey 유일. **identity 계약 결함 없음**(서로 다른 의미가 같은 key 되는 사례 0).

## 상태 필터(참고 — shadow write 대상 확정은 후속 Gate)
- 현재 114건: duplicate 110(terminal historical), needs_review 4. preview 는 전체 구조 분석 위해 모두 계산. **shadow write 대상 후보는 별도 필터링**(이번 Gate 미확정).

## Shadow write(C) 진입 조건
1. version label/hash source of truth 확정(pipeline/renderer, template=null) — 완료.
2. rendererVersion 실제 lib 버전 확인 반영(후속).
3. shadow write 대상 상태 필터 확정(terminal historical 제외 등).
4. jobs INSERT 시 idempotency UNIQUE·shadow 상태·worker claim 금지 계약.
5. 그 후에야 C(shadow write) 승인 요청. 운영 DB write 는 C 부터.
