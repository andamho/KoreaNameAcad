# AI orchestration cost, context and escalation policy — **설계 Gate (queued, not started)**

> **상태: queued, not started.** 이 문서는 **정책 등록본**이며 구현 파일이 아니다.
> 착수 시점: **현재 hardening + actual disposable Neon 검증이 끝난 뒤**. 그 전에 임의 선행 구현 금지.
> 이 문서를 근거로 코드를 만들지 말 것 — 착수는 별도 Gate 승인으로만 시작한다.

## 0. 최상위 원칙 (고정)
> **이 시스템의 목표는 AI 호출을 최대화하는 것이 아니라, 시간이 지날수록 AI가 필요 없는 업무 비율을 높이는 것이다.**
> **GPT 와 Claude 의 관계는 자유 토론자가 아니라 주담당(primary)과 조건부 감사자(conditional reviewer)다.**

기본값: **AI 한 번 → 자동검증 → 필요 시 검토 한 번 → 그 이상은 사람 승인.**
"합의할 때까지 토론"·무한 수정 루프·AI 간 무제한 왕복은 **금지**한다.

## 1. 업무 처리 등급 (4단계)
| Level | 이름 | 처리 방식 | 예시 |
|---|---|---|---|
| **0** | deterministic | **AI 호출 0** — 규칙·DB·상태 머신 | 예약 알림 · 날짜 기반 후속관리 · 중복 방지 · 정확한 금액 일치 · 고정 발신번호/문구 판정 · 확정 파일 ID 연결 · 상태 전이 · 재시도/lease/timeout · 감사 로그 |
| **1** | single-agent | **한 모델 1회** | 통화 요약 · 상담 구조화 · 문의 유형 분류 · 문자 초안 · 전사 오류 후보 표시 · 영상 제목 후보 |
| **2** | conditional review | 조건 충족 시에만 **두 번째 모델 1회** | schema 검증 실패 · 필수 필드 누락 · DB 충돌 · 금액/날짜/이름/관계 불일치 · 신뢰도 임계치 미달 · 자동검증 실패 · 고위험 독립 검토 |
| **3** | human approval | AI 는 **추천 + 근거만**, 실행은 운영자 승인 후 | 결제/환불/취소 확정 · 고객 상태 중요 변경 · 실제 문자 발송 · 외부 게시 · 파일 삭제 · production DB 변경 · 보안/권한 변경 · 업무 규칙 변경 · 개인정보 외부 전송 |

**Level 2 의 핵심**: 두 번째 모델은 **전체 작업을 다시 수행하지 않는다.** 실패한 필드와 관련 근거만 검토한다.

## 2. 모델 역할 (주담당 1개 + 조건부 검토자)
| | 주담당 후보 |
|---|---|
| **GPT** | 상담 내용 구조화 · 자연어 분류 · 요약 · 고객 응대 문안 · 의미 충돌 판단 · 전사 오류 후보 검토 · 운영 의사결정 보조 |
| **Claude** | 코드 수정 · 저장소 분석 · 테스트 실행 · 로그/코드 정합성 검사 · migration 작성 · 기술 문서 · 장시간 개발 작업 |

업무마다 **주담당 모델을 하나만** 선택한다. 다른 모델은 다음에만 검토자로 호출한다:
자동검증 실패 · 고위험 변경 · 보안/DB/권한 변경 · 기존 계약과 충돌 · 첫 결과의 신뢰도 부족.

## 3. AI 간 통신 — 구조화 계약만
자유 자연어 토론을 기본값으로 쓰지 않는다. 요청/응답 모두 **고정 schema**.

```json
{
  "task_id": "task_123",
  "candidate_result": {},
  "reason_codes": ["PAYMENT_TYPE_AMBIGUOUS"],
  "evidence_refs": ["event_1", "message_8"],
  "system_confidence": 0.62,
  "requested_review_fields": ["payment_type"]
}
```
검토자 응답은 **제한된 형태**로만:
```json
{ "decision": "approve", "corrections": {}, "reason_codes": [], "confidence": 0.94 }
```
```json
{ "decision": "correct", "corrections": { "payment_type": "analysis_fee" },
  "reason_codes": ["STATUS_AMOUNT_RULE_MATCH"], "confidence": 0.93 }
```
**AI 간 장문 토론 기록을 다음 호출의 전체 context 로 누적하지 않는다.**

## 4. 기본 호출 제한
primary 호출 **최대 1회** · review 호출 **최대 1회** · retry **최대 1회** · AI 간 왕복 **최대 1회** ·
동일 입력 재호출 **금지** · 전체 원문 재전송 **금지** · 관련 근거만 전달 · **한도 초과 시 자동 중단**(추가 호출은 운영자 승인).

## 5. 업무별 예산 정책 (DB 관리)
필수 항목: task type · risk level · primary agent · review agent · max primary calls · max review calls · max retries ·
max input/output/accumulated tokens · max cost · max execution time · review threshold · human approval threshold ·
allowed context sources · external action permission.

```json
{
  "task_type": "call_summary", "risk_level": "low", "primary_agent": "gpt",
  "max_primary_calls": 1, "max_review_calls": 1, "max_retries": 1,
  "max_input_tokens": 30000, "max_output_tokens": 3000, "max_cost_krw": 300,
  "review_threshold": 0.75, "human_threshold": 0.55
}
```
예산 초과 상태: `budget_exceeded` · `review_required` · `human_escalation`.
**추가 AI 호출로 자동 우회하지 않는다.**

## 6. Context 최소화
전체 고객 기록·전체 통화·전체 저장소를 매번 전달하지 않는다.

```
음성 → 전사 → 구간 분리 → 구간별 사실 추출 → 구조화된 전체 요약 → 문제 구간만 검토
```
**90분 통화를 두 모델 모두에게 전체 전달 금지.** 두 번째 모델에는 **검토 대상 필드 · 관련 원문 구간 · 기존 DB 값 · 충돌 이유 · 허용 schema** 만.
코드 검토도 전체 저장소가 아니라 **변경 diff · 관련 파일 · 관련 계약 · 관련 테스트 결과 · 영향 schema** 우선.

## 7. 캐시·중복 호출 방지
저장: normalized input hash · context manifest hash · prompt version · model/provider · model version · schema version · output hash · created time.
동일 조합은 **기존 결과 재사용**. 재처리 조건: 입력 변경 · prompt version 변경 · schema 변경 · 모델 정책 변경 · **운영자 명시 재실행 승인**.

## 8. 신뢰도 계산
**모델이 스스로 낸 confidence 숫자만 쓰지 않는다.** system confidence 는 결합 계산:
필수 필드 충족 · schema validation · 원문 evidence 존재 · DB 일치 · 금액/날짜/전화번호 형식 · 이름/관계 충돌 ·
독립 근거 개수 · 과거 실제 정확도 · 사람 수정률 · source 품질.

```
model confidence: 0.92 / schema: pass / amount rule: pass / customer status conflict: fail
→ system confidence: 0.58
```
교차검토·사람 승인 여부는 **system confidence** 로 결정한다.

## 9. 필요한 데이터 모델 (설계 대상)
`task_policy` · `ai_usage_ledger`(task/job/execution ID · provider/model · input/output/cached tokens · estimated/actual cost · latency · status · retry number) ·
`context_manifest`(source type/ID · content hash · selected range · redaction 상태 — **원문 전체 중복 저장 금지, 참조+hash 우선**) ·
`result_cache` · `review_reason` · `budget_guard`(task/고객/일/월/provider 단위) · `loop_guard` · `human_escalation` ·
`quality_metrics`(자동완료율 · 단일 AI 완료율 · 교차검토율 · 사람 수정률 · 오답률 · 재호출률 · 평균 비용 · 평균 latency) · `prompt_registry`.

## 10. 운영 목표 비율
| | 초기 | 안정화 이후 |
|---|---|---|
| 규칙·DB만 | 45~60% | **70~80%** |
| AI 1회 | 30~40% | 15~25% |
| 2차 AI 검토 | 5~10% | 2~5% |
| 사람 검토 | 3~8% | 1~3% |

품질 데이터가 쌓일수록 **반복 업무를 AI → 규칙·교정사전으로 이동**시키는 구조여야 한다.

## 11. 업무별 적용
- **문자**: 고정 패턴·발신번호는 규칙 / 규칙 미일치만 소형 모델 분류 / 저신뢰는 보류 또는 사람 확인
- **통화 전사**: 전사 엔진 → 교정사전 → 고유명사·날짜·금액 검사 → **저신뢰 구간만** AI 검토. **전체 통화 교차검토 금지**
- **통화 요약·CRM**: 확정 전사에서 GPT 1회 구조화 → schema/DB 충돌 검사 → **충돌 필드만** 2차 검토
- **후속관리**: 날짜·상태 규칙으로 추천 생성 / 문구 작성에만 AI / 실제 발송은 정책에 따라 승인
- **이름분석표 자동 연결**: 이름·기간·점수 규칙 우선 / 후보 충돌·파일명 파싱 실패 시에만 AI
- **영상**: 정해진 pipeline·품질 규칙 우선 / 오류 구간·제목·설명 생성에만 AI / **완성본 전체를 두 모델이 반복 검토하지 않음**
- **코드 개발**: Claude 구현 → 자동 테스트·정적검증 → **보안/DB/권한/중요 계약 변경만** GPT 검토 → 자동 수정 왕복 **최대 1회** → 초과 시 운영자 승인

## 12. 감사·설명 가능성
남길 것: 주담당이 누구였는지 · AI 가 호출된 이유 · **두 번째 모델이 호출된 이유** · 전달된 context manifest ·
적용 정책과 버전 · 토큰/비용 · 자동검증 결과 · 최종 승인자 · 실제 실행된 action · 사람이 수정한 내용.
**장문의 AI 사고과정 전체 저장은 요구하지 않는다.** 구조화된 근거와 결과를 저장한다.

## 13. Fail-closed 조건 (자동 실행 금지)
schema validation 실패 · evidence 없음 · 시스템 신뢰도 미달 · 비용 한도 초과 · 호출 횟수 초과 · context 과도 ·
고객 기록 충돌 · 권한 불명확 · 외부 action 승인 없음 · 동일 작업 이미 실행됨 · idempotency 불일치.

## 14. 착수 시 수행 순서 (승인 후)
1. **현재 orchestration schema 와 위 정책의 gap analysis**
2. 필요한 테이블·컬럼·상태 전이 제안
3. **기존 0004 migration 을 수정하지 않고 additive migration 으로 설계**
4. **실제 AI provider 호출 없이** policy engine + budget guard 부터 구현
5. **shadow mode** 로 비용·호출률 시뮬레이션
6. **운영자 승인 후** provider adapter 연결

## 15. 현재 작업과의 관계
Neon endpoint pinning · SELECT-only preflight · hardening · actual disposable Neon 검증을 **그대로 우선 완료**한다.
이 문서 때문에 진행 중인 Gate 의 범위를 넓히거나 구현 파일을 추가하지 않는다.

**AI cost/context/escalation policy Gate: queued, not started**
