# ADR: Orchestration Runtime & Agent SDK Selection

- **Status**: Proposed — 조건부 승인(2026-07-20) 반영. 채택은 후속 Gate 별 별도 승인.
- **Date**: 2026-07-20 (조사 시작 UTC 2026-07-19 21:12)
- **Context Gate**: official agent SDK and orchestration runtime evaluation
- **관련**: [open-source-agent-orchestration-evaluation](../open-source-agent-orchestration-evaluation.md) · [cross-agent-orchestration-contract](../cross-agent-orchestration-contract.md) · [orchestration-schema-migration](../orchestration-schema-migration.md)

## Context
우리는 PostgreSQL 기반 durable job 시스템(`jobs`/`job_executions` + lease/heartbeat/retry/reaper/idempotency/version snapshot)과 cross-agent orchestration 계약(0004: `job_artifacts`/`job_dependencies`/`automated_reviews`/`human_approvals`/`orchestration_audit_log`/`emergency_stops`)을 보유·설계했다. 미구현은 GPT/Claude execution adapter·AI-to-AI handoff 런타임·automated review loop·human approval UI. 자체 구현 전에 검증된 공식 SDK·runtime 과의 중복을 평가한다. 배포=Railway, DB=Neon PostgreSQL 17, 고객 민감정보=protected reference/최소화.

## Decision Drivers
보안/개인정보 · 현행 아키텍처 적합(단일 SoR) · 운영 단순성 · 신뢰성/durability · TS 성숙도 · vendor lock-in · migration 비용 · license/commercial 명확성. **하드스톱**: license/데이터정책 불명, secret boundary 불가, production 버전 없음, 필수 기능 experimental 뿐, SoT 이중화 불가피, fail-closed 불가, de-adoption 경로 없음.

## Options Considered
1. **Existing PostgreSQL orchestration only** — 단일 SoR·추가 dep/서비스 0이나 GPT/Claude 실행엔진 전량 자체 구현(재발명·높은 유지비).
2. **PostgreSQL + official agent SDK wrappers** ★ — 기존 PG=SoR/큐 유지 + GPT/Claude 를 SDK wrap + MCP v1.x tool. 실행엔진 개발량 high reduction, 단일 SoR, 신규 서비스 0.
3. **PostgreSQL + LangGraphJS limited** — 리뷰 DAG 표현 우수하나 durable checkpointer=SoT 이중화(하드스톱), node 재실행 부작용 중복.
4. **Temporal runtime + PostgreSQL business records** — 검증된 durable execution 이나 Server(+PG+ES)/Cloud 운영·비용·migration 부담, 반쪽 도입 시 SoT 이중화.
5. **Hybrid adoption deferred** — SoR 확정만, adapter/runtime 은 후속 Gate 순차(=Option 2 의 시간축).

## Decision
**Option 2 를 Option 5 의 단계적 채택으로 실행.**

### 최종 판정표 (조건부 승인 확정)
| 대상 | 판정 |
|---|---|
| **Existing PostgreSQL orchestration** | **Adopt / retain** |
| **OpenAI Agents SDK** | **Wrap** |
| **Claude Agent SDK** | **Wrap, conditional** (governance + isolation approval required) |
| **LangGraphJS** | **Borrow patterns / Defer runtime** |
| **MCP v1.x** | **Defer pending read-only spike** |
| **MCP v2** | **Defer** (전 필드 unverified; v2 기능 production 설계 근거 금지) |
| **Temporal** | **Borrow patterns / Defer** |

### 판정별 근거·조건
- **OpenAI Agents (Wrap)**: 내부 `GptAdapter` 계약 뒤. **model exact identifier 필수·SDK default model 금지**·system instruction version pin·tracing off/redaction·structured output schema 필수·max turns/token/cost/time fail-closed. **일반 review adapter 와 Sandbox Agent(beta) 분리** — Sandbox 는 별도 Gate.
- **Claude Agent SDK (Wrap, conditional)**: stability = **unclear / rapidly changing 0.x** → **exact version pin 필수·자동 minor/patch update 금지**. package version 뿐 아니라 **실행 binary/version/hash 기록**. license 는 MIT 아님 — **package license `SEE LICENSE IN README` · governing terms Anthropic Commercial Terms · data collection/retention 별도 검토 · dependency+platform binary license 별도 inventory**. **거버넌스+격리 승인**(Windows·binary hardening 체크리스트 통과) 전 채택 금지.
- **MCP v1.x (Defer pending read-only spike)**: 바로 확정하지 않음. **최초 spike `get-orchestration-job-summary`**(read-only·고객 원문 없음·protected reference 만·auth·tool allowlist·exact schema version pin·timeout·reconnect·audit event·prompt injection 방어·GPT/Claude 양쪽 consumer mock·write capability 0) 성공 시 Wrap/Adopt-limited 재평가. **spike 전 운영 MCP server/client 배선 금지.**
- **MCP v2 (Defer)**: package/version/tag/SHA/release/license/prod 를 공식 근거로 확정 못함 → 전 필드 unverified. v2 기능 production 설계 근거 금지.
- **LangGraphJS (Borrow patterns / Defer runtime)**: graph/reducer/interrupt/review-loop **설계 패턴만 차용**, **runtime 도입 Defer**. **MemorySaver 는 test/disposable spike 전용**(production persistence 금지). **PostgreSQL checkpointer 도입 금지 또는 별도 승인**(현재 jobs/job_executions 와 SoT 이중화 금지). MemorySaver 보안 수정 이력은 unverified → 확정 필요.
- **Temporal (Borrow patterns / Defer)**: deterministic boundary·versioning·signal HITL 패턴 차용. Server 운영·비용·migration·SoT 이중화로 채택 Defer(scale threshold 후 재평가).

## Source-of-Truth Principles (필수 명시)
1. **SDK session/checkpoint/workflow state 는 파생·임시 상태**이다.
2. **business state 는 PostgreSQL 만 authoritative** 이다.
3. **동일 execution 상태를 두 곳에 영속 추적하지 않는다**(이중 SoR 금지).
4. **future Temporal/LangGraph adoption 시 source-of-truth 재설계 Gate 가 필요**하다(그들의 실행상태 store 와 우리 business SoR 의 경계 재확정 전 배선 금지).

## Migration (0004) Impact
- **0004 6테이블 = runtime 선택과 독립적인 business system-of-record → migration 수정 불필요.** 제거해야 할 runtime-state 컬럼/테이블 없음.
- Temporal/LangGraph 채택 시에도 우리 테이블 삭제 안 함(그들 상태는 실행상태 store). 조건: 이중 추적 금지 + SoR 재설계 Gate.

## Pre-wiring Hardening Preconditions (운영 배선 전 필수 Gate)
- **R1 immutable artifact DB hardening**: `immutable=true` CHECK 는 삽입만 막음 → **job_artifacts UPDATE/DELETE 금지(role/trigger)**, content/manifest/protected-ref/schema/lineage 변경 금지, 보존기간 예외 처리.
- **R2 append-only audit DB hardening**: `orchestration_audit_log` DB 차원 UPDATE/DELETE 방지, writer/reader role 분리, migration runner·test teardown 충돌 검증, 위변조 방지, emergency admin 절차.
- **R3 secret 취급**: `.env` 복사/symlink/hardlink 금지, secret 파일 타 worktree 연결 금지, 값 미출력 — 운영 read-only 는 부모 프로세스 상속/명시 allowlist/read-only wrapper/ephemeral injection 로만.
- **R4 테스트 env 격리**: 상속된 운영 secret 감지 시 fail-closed, 필요한 env 만 주입, 값·길이·fingerprint 미출력.
- **Claude adapter Windows·binary hardening**: disposable worktree·binary hash snapshot·orphan process 0·command allowlist·filesystem scope·symlink/junction escape 검사·env allowlist(process.env 전체 전달 금지)·DB credential 미전달·force push/deploy/migration 차단·egress 컨테이너 강제.

## Consequences
- **긍정**: adapter 실행엔진 자체 구현 회피(high reduction), 단일 SoR 보존, 신규 운영 서비스 0, 0004 설계 재확정(수정 불필요), de-adoption 경로 명확(계약 뒤 격리, SDK 상태 SoR 미승격).
- **부정/위험**: 0.x SDK 2종 pin·거버넌스·잦은 릴리스 추적; OpenAI tracing egress·모델 drift, Claude 독점 license·opaque binary·network allowlist 미신뢰(#309) → wrapper+외부 격리로 통제; MCP enforcement 는 자체 host 층 보강.
- **불변 조건**: SDK 상태 SoR 승격 금지; 실 API 호출·runtime 배선·production dependency 추가·MCP runtime 생성은 후속 Gate 승인 후; tracing 기본 off·모델 pin 필수·env allowlist(치환) 필수; 미확정 SHA/필드는 완전한 reproducibility 로 표현하지 않음.

## Follow-up Gates
Gate A(0004 apply) → **Gate B(Claude adapter, Wrap conditional; Windows/binary hardening 선행)** → Gate C(GPT adapter, Wrap; Sandbox 분리) → **Gate D(MCP read-only spike)** → Gate E(Temporal 재평가). 추가: **R1/R2 hardening Gate**(운영 배선 전 필수).

## 미확정(채택 전 확정)
Temporal/OpenAI tag-commit SHA(main HEAD 만) · 전 후보 npm provenance · Claude Commercial ToS 데이터/보존·binary hash·Windows 안정성 · OpenAI transitive `openai` 버전·ZDR tracing · MCP 1.29 release date·미검증 GHSA·**v2 전 필드** · LangGraphJS annotated tag commit 역참조·resume/timeout open issue·MemorySaver 보안 수정 이력 · Temporal Neon 적합성·비용 임계.
