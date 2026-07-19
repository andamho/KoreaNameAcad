# cross-agent orchestration contract (설계)

> 설계·스키마·순수 로직·테스트만. **운영 adapter 실행·외부 AI 호출·production job 생성·자동 배선·worker 가동 없음.** migration 미적용.

## 최상위 원칙
**모든 통합관리 파이프라인은 시스템이 AI 간 작업·결과·검토를 자동 연결하며, 운영자는 정답 확정과 최종 승인만 수행한다.** GPT↔Claude 결과 교환은 채팅 복사가 아니라 **versioned artifact + job dependency**. 승인 전 운영 반영 금지. 모든 자동 흐름 fail-closed. 민감정보는 artifact·로그에 최소화(protected reference/hash).

## 공통 구조(10단계)
입력/이벤트 → 영속 job → adapter/worker 실행 → versioned artifact 저장 → 다음 검토 job 자동 생성 → 다른 AI/검증기 검토 → 실패 시 수정 job 자동 생성 → 재실행·재검토 → (필요 시)human-approval → 승인 후 운영 반영. 전 단계 jobs/job_executions/artifacts/version snapshot 추적.

## 1. job dependency model (`JobDependency`, `dependencyResolver.ts`)
- 필드: jobId·dependsOnJobId·**dependencyType**·requiredArtifactKind·requiredArtifactSchemaVersion·resolutionStatus·resolvedExecutionId·resolvedArtifactId·created/resolvedAt.
- dependencyType: requires-success · requires-approved-review · requires-human-approval(게이트) / supersedes · retry-of · correction-of(lineage).
- 판정(`resolveRunnable`): queued job 만 후보. gating dep 전부 충족 + version pin 일치 시 runnable. 미충족/실패/취소/cycle/version 불일치 = **blocked(fail-closed)**. 다중 선행 fan-in, root job(dep 없음) 지원. **순환 차단**(`detectCycleJobs`). 동일 dependency 중복 next-job 방지=`nextJobIdempotencyKey`.

## 2. artifact handoff schema (`ArtifactManifest`, zod)
- artifactId·producerJobId·producerExecutionId·**artifactKind**·schemaVersion·**contentHash·manifestHash**·contentLocation|protectedReference·**sensitivityClass·redactionStatus**·createdAt·**immutable:true**·lineageParentArtifactIds·expiresAt.
- artifactKind: transcription-source·corrected-transcript·transcription-diff·error-analysis·correction-rule-proposal·code-change-plan·code-test-result·automated-review·human-approval-request·release-manifest.
- **secret content 저장 금지·customer-sensitive 는 protected reference/redaction 필요**(스키마 superRefine). 원문 고객명·전화·녹음 URL·경로는 protected reference/HMAC.

## 3-4. GPT / Claude adapter contract (`types.ts`, 실제 호출 없음)
- **GPT**: 입력=jobSnapshot·dependency artifact manifests·허용 content·modelPin·systemInstructionVersion·budget·sensitivityPolicy. 출력=structuredResult(**schema validation 통과 필수, 자유텍스트만 금지**)·produced artifact manifest·reviewDecision|analysis·usage·errorClassification·retryable·contentHash·modelVersionSnapshot.
- **Claude**: 입력=instruction artifact·repo ref·baseCommit·**allowed/forbidden file scope**·test allowlist·write permission policy·budget·dependency refs. 출력=changed file manifest·diffHash·commitHash·testsExecuted·testResults·produced artifacts·**policyViolations**·logs ref·finalStatus·retryable. 보호(스키마): **out-of-scope write·base-commit-drift·secret 탐색·미승인 DB write·force push·미승인 deploy/migration·테스트 미실행 성공·결과 없는 성공 금지**.
- 오류 분류(`OrchestrationErrorCode`): transient-provider-error·rate-limited·timeout·invalid-output-schema·sensitive-data-policy-failure·dependency-missing·artifact-integrity-failure·budget-exceeded·permanent-model-error·(코드)out-of-scope-write·base-commit-drift·secret-access-attempt·unauthorized-db-write·force-push-attempt·unauthorized-deploy·unauthorized-migration·tests-not-run·empty-result·(orchestration)cycle-detected·version-pin-mismatch·stale-execution·duplicate-next-job·retry/correction-limit-exceeded·approval-ambiguous·provenance-incomplete·emergency-stopped.

## 5. automated review result (`AutomatedReviewResult`, `reviewReducer.ts`)
- decision: approve/revise/reject/human-review + findings(severity)·failedInvariants·regressionResults·evidenceArtifactIds·correctionInstructions·nextJobKind·humanApprovalRequired·reviewerVersion·reviewedExecutionId·reviewedArtifactHash.
- 전이: **approve→release-dependency**(humanApprovalRequired 면 await-human-approval) · **revise→create-correction-job**(correctionInstructions 필수) · **reject→stop-pipeline** · **human-review→await-human-approval**.

## 6. correction / retry loop (`retryPolicy.ts`)
- **retry**=같은 job·같은 입력·일시 실패 → 새 execution. **correction**=논리/품질 검토 실패 → correction instruction artifact + 새 job(correction-of).
- 권장 기본(근거, 운영 미적용): transient retry 3 · correction loop 3 · **같은 failed invariant 2회 반복→human-review** · budget 초과→fail-closed. `classifyFailure`: transient(<max retry / 소진 fail)·review-revise(<max correction / 초과 human-review)·permanent(fail)·ambiguous(human-review)·budget(human-review)·반복오류(human-review).

## 7. human approval state (`HumanApprovalState`)
- not-required·awaiting-approval·approved·rejected·revision-requested·expired·cancelled. **approve 만 applyAllowed=true**(승인 후에만 운영 반영). 승인 화면=목적·변경요약·검증결과·위험·비용/실행횟수·영향·롤백·**민감원문 제외 evidence**. 서호님에게 raw log 해석·메시지 복사·경로 전달·명령 입력·재시도 트리거·dependency 정리 **요구 안 함**(승인/거절/보류만).

## 8. fail-closed (`orchestrationPreflight`)
dependency 미충족·artifact hash 불일치·schema 실패·model/version pin 불일치·base commit drift·테스트 실패·민감정보 위반·예산 초과·retry/correction 한도 초과·승인 모호·중복 idempotency·lease 소유 불명·provenance incomplete·emergency stop 중 **하나라도** → 다음 job 자동 생성·운영 반영 **금지**, machine-readable code.

## 9. cost/time/token limits (`JobBudget`)
maxPrompt/Completion/Total Tokens·maxCostUsd·maxExecutionSeconds·maxToolCalls·maxRetries·maxCorrections·maxArtifactBytes. 초과 시 자동 축약·임의 모델 변경 금지 → **fail-closed 또는 human-review**.

## 10. sensitive-data boundary
public·internal·confidential·customer-sensitive·secret. secret은 AI artifact 저장 금지 · customer-sensitive 최소 범위+protected reference · 전화/이름/녹음 URL/경로=protected reference · raw 음성=필요 adapter 만 · 로그는 reference/hash · adapter별 접근 민감도 차등.

## 11. audit log (`AuditLogEntry`, append-only)
누가/무엇이 job 생성·dependency 해제·artifact 소비/생성·model/tool/version·검토 승인/수정/거절·사람 최종 승인·retry/correction lineage·비용/시간·정책 위반·emergency stop. append-only.

## 12. manual emergency stop (`EmergencyStop`, `isStopped`)
scope: global·pipeline-kind·adapter·customer-source·promotion·write-action. 정지 시 신규 job 중단·실행 중 안전지점/lease 만료·운영 반영 차단·artifact 보존·감사 기록·**수동 해제 전 자동 재개 금지**.

## 13. 첫 적용 예시 DAG (통화 전사 교정, 실제 실행 없음)
```
human-corrected-transcript-registered
  → transcription-diff
  → golden-dataset-analysis (GPT)        → artifact: error-analysis(v1)
  → correction-rule-proposal
  → correction-logic-implementation (Claude) → artifact: code-test-result(v1)
  → correction-logic-review (GPT)
      ├─ revise  → correction-logic-implementation (correction-of)
      ├─ reject  → stopped
      └─ approve → human-approval → release-approved
```
이은혜 통화=개발용 골든 1건으로만 예시 반영. **실제 원문·고객 ID·녹음 경로 미사용·미출력.**

## 14. 파이프라인 적용성
| 파이프라인 | root job | producer | 주요 artifact | reviewer | human approval 시점 | 운영 반영 |
|---|---|---|---|---|---|---|
| call transcription | corrected-transcript 등록 | GPT/Claude | error-analysis·correction-rule·code-test-result | GPT | 교정 로직 릴리스 전 | 승인 후 사전/엔진 반영 |
| correction dictionary | rule-proposal | GPT | correction-rule-proposal·test-result | 검증기 | 규칙 활성화 전 | correction_rules 반영 |
| internal report | report 유입 | Claude/renderer | preview candidate·render artifact | 검증기 | shadow→job 승격 전 | jobs 생성 |
| PDF generation | 생성 요청 | renderer adapter | pdf artifact·content hash | 검증기 | 첨부 전(필요 시) | crm_files 첨부 |
| video/caption | video-caption job | Claude/engine | caption·keep/cut·result | GPT | 게시 전(비멱등) | SNS 게시 |
| customer timeline | event | 집계 adapter | timeline artifact | 검증기 | 필요 시 | CRM 반영 |
| follow-up recommendation | trigger | GPT | recommendation artifact | 검증기 | 발송 전 | 메시지 초안 |
| message automation | schedule/event | adapter | message artifact | 검증기 | 발송 전(비멱등) | 발송 |

## 현재 구현/미구현
- 구현(기반): jobs·job_executions·lease/retry/reaper·version snapshot·shadow observation·read-only monitoring·artifact contract 일부.
- **미구현**: GPT/Claude execution adapter·AI-to-AI artifact handoff·dependency-driven next-job creation·automated review loop·correction request loop·human approval UI·cross-agent orchestration(런타임). 이 문서는 **계약·순수 로직·스키마·테스트**까지만.

## migration 초안
`docs/drafts/orchestration-schema-draft.sql` — job_dependencies·job_artifacts·automated_reviews·human_approvals·audit_log·emergency_stops 초안. **미적용·미등록(migrations/ 아님)**. 실제 적용은 별도 승인 migration Gate.
