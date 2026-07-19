# ADR: Orchestration Runtime & Agent SDK Selection

- **Status**: Proposed (평가 Gate 산출물; 채택은 후속 Gate 별 별도 승인)
- **Date**: 2026-07-20 (조사 시작 UTC 2026-07-19 21:12)
- **Context Gate**: official agent SDK and orchestration runtime evaluation
- **관련 문서**: [open-source-agent-orchestration-evaluation](../open-source-agent-orchestration-evaluation.md) · [cross-agent-orchestration-contract](../cross-agent-orchestration-contract.md) · [orchestration-schema-migration](../orchestration-schema-migration.md)

## Context
우리는 이미 PostgreSQL 기반 durable job 시스템(`jobs`/`job_executions` + lease/heartbeat/retry/reaper/idempotency/version snapshot)과, cross-agent orchestration 계약(0004: `job_artifacts`/`job_dependencies`/`automated_reviews`/`human_approvals`/`orchestration_audit_log`/`emergency_stops`)을 보유·설계했다. 남은 미구현은 **GPT/Claude execution adapter, AI-to-AI handoff 런타임, automated review loop, human approval UI**다. 이를 자체 구현하기 전에, 검증된 공식 SDK·runtime 과의 중복을 평가해 불필요한 자체 개발을 줄인다.

핵심 제약: 운영자는 AI 사이 중계자가 아니며, 시스템이 job·artifact·review 를 자동 연결한다. 고객 민감정보(전사·녹음·이름·전화)는 protected reference/최소화. 배포는 Railway, DB 는 Neon PostgreSQL 17.

## Decision Drivers
보안/개인정보(고객 민감데이터, secret boundary, tracing egress) · 현행 아키텍처 적합(단일 SoR) · 운영 단순성(Railway/Neon, 추가 서비스 최소) · 신뢰성/durability · TypeScript 성숙도 · vendor lock-in · migration 비용 · license/commercial 명확성. **하드스톱**: license/데이터정책 불명, secret boundary 불가, production 버전 없음, 필수 기능 experimental 뿐, SoT 이중화 불가피, fail-closed 불가, de-adoption 경로 없음.

## Options Considered
### Option 1 — Existing PostgreSQL orchestration only (자체 전량)
- **장점**: 단일 SoR, 추가 dependency/서비스 0, 완전 제어, 이미 상당 구현.
- **단점**: GPT/Claude execution 엔진·tool 권한·worktree·구조화 파싱을 **전량 자체 구현**(높은 개발/유지비, 재발명).
- **평가**: SoR·큐로는 정답이나, adapter 실행엔진까지 자체 구현은 낭비.

### Option 2 — PostgreSQL + official agent SDK wrappers  ★제안
- 기존 PG 를 SoR/큐로 유지 + GPT=OpenAI Agents(wrap)·Claude=Claude Agent SDK(wrap)·tool=MCP v1.x.
- **장점**: 실행엔진 개발량 **high reduction**, 단일 SoR 유지, 신규 운영 서비스 0, de-adoption 용이(계약 뒤 격리).
- **단점**: 2개 SDK(0.x, 잦은 릴리스) pin·거버넌스 필요; OpenAI tracing egress·모델 drift, Claude 독점 license/native binary 를 wrapper 로 통제.
- **평가**: 개발량 감소 대비 위험이 wrapper 로 통제 가능 → **채택 제안**.

### Option 3 — PostgreSQL + LangGraphJS limited use
- 리뷰 DAG(GPT→Claude→GPT)를 LangGraphJS 로.
- **장점**: StateGraph+Zod 로 DAG/HITL 표현 깔끔.
- **단점**: durable checkpointer(PostgresSaver) 사용 시 **SoT 이중화**(하드스톱); node 전체 재실행에 따른 **부작용 중복** 위험; JS resume/timeout open issue.
- **평가**: **MemorySaver(휘발)** 로 job_execution 안에서만 = Borrow 수준. durable 사용은 금지.

### Option 4 — Temporal runtime + PostgreSQL business records
- Temporal 이 durable 실행/재시도/타이머/시그널/버저닝 담당, PG 는 business record.
- **장점**: 검증된 durable execution·append-only history·replay; 우리 큐를 개념적으로 대체.
- **단점**: **Server(+PG+ES) self-host 또는 Cloud(≈$100/mo~ + per-action) 필요**(운영/비용); 반쪽 도입 시 SoT 이중화; migration 비용 high; Neon 적합성 공식 미확인.
- **평가**: 규모/복잡도 임계 전에는 부담 과다 → **Defer**(패턴은 Borrow).

### Option 5 — Hybrid adoption deferred
- 지금은 SoR 확정만, adapter/runtime 은 후속 Gate 로 순차.
- **평가**: Option 2 의 시간축 표현. 채택 순서를 Gate 로 통제(아래).

## Decision
**Option 2(PostgreSQL + official agent SDK wrappers)를, Option 5 의 단계적 채택으로 실행한다.**
- **System-of-record / durable queue**: 기존 PostgreSQL 유지. **0004 6테이블은 runtime 선택과 독립적인 business SoR 로 확인 → migration 수정 불필요, 별도 승인으로 통합·apply.**
- **GPT adapter**: OpenAI Agents JS(`@openai/agents` 0.13.x) — 내부 `GptAdapter` 계약 뒤 **Wrap**.
- **Claude adapter**: Claude Agent SDK(`@anthropic-ai/claude-agent-sdk` 0.3.x) — 내부 `ClaudeAdapter` 계약 뒤 **Wrap**(거버넌스 승인 조건).
- **Tool/data protocol**: MCP **v1.x**(1.29) read-only 우선 **Adopt-limited**; **v2 Defer**.
- **LangGraphJS**: 필요 시 리뷰 DAG 한정 **Borrow**, MemorySaver 만.
- **Temporal**: **Defer**(scale threshold 후 재평가), 지금은 패턴 borrow(deterministic boundary·versioning·signal HITL).

### 판정별 근거 요약
| 후보 | 해결 문제 | 현행 대비 장점 | 제거 가능 코드 | 유지 코드 | 신규 dep | 신규 서비스 | 보안 위험 | 운영 위험 | 비용 | lock-in | migration 영향 | de-adoption | 시점 | **판정** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| OpenAI Agents | GPT 실행엔진 | agent loop/guardrail/구조화 native | GPT 엔진 자작 | wrapper+재검증 | +1 | 0 | tracing egress·모델 drift(wrapper 통제) | 0.x churn | API 사용료 | OpenAI | 0(추가 migration 없음) | 계약 뒤 교체 | Gate C | **Wrap** |
| Claude Agent SDK | Claude 실행엔진 | worktree/hook/deny/env 치환 native | Claude 엔진 자작 | wrapper+증거수집 | +1(runtime dep 0) | 0 | 독점/ToS·opaque binary·network allowlist 미신뢰(#309) | 0.x ~daily·Win 주의 | API 사용료 | Anthropic | 0 | 계약 뒤 교체 | Gate B | **Wrap** |
| MCP v1.x | 공통 tool 계약 | 프로토콜 표준·구조화 | 자체 tool 배선 일부 | 권한/승인 enforcement | +1(이미 transitive) | 0 | confused-deputy·injection(설계로 회피) | 낮음 | 0 | 없음 | 0 | 도구 계약 제거 | Gate D | **Adopt(제한)** |
| LangGraphJS | 리뷰 DAG 표현 | StateGraph+Zod | (선택) 리뷰 배선 | job 안 임시 | +1(선택) | 0 | node 재실행 중복·SoT(회피) | open issue | 0 | 낮음 | 0 | MemorySaver 라 무상태 | 필요 시 | **Borrow** |
| Temporal | durable 실행 대체 | history/replay/versioning | (미래)큐 일부 | SoR=PG | +다수 | **+1↑(Server)** | payload codec opt-in·SECURITY.md 없음 | **높음(self-host/Cloud)** | Cloud/운영 | 낮음(OSS) | high(큐 대체) | Server 제거 | Gate E | **Defer** |

## Consequences
- **긍정**: adapter 실행엔진 자체 구현 회피(high reduction), 단일 SoR 보존, 신규 운영 서비스 0, 0004 설계 재확정(수정 불필요), de-adoption 경로 명확.
- **부정/위험**: 0.x SDK 2종 pin·거버넌스·잦은 릴리스 추적 필요; OpenAI tracing egress·모델 drift·Claude 독점 license 를 wrapper 로 강제 통제해야 함; MCP 는 enforcement 를 자체 host 층에서 보강.
- **불변 조건**: SDK 상태를 SoR 로 승격 금지(단일 SoR); 실 API 호출·runtime 배선·production dependency 추가는 후속 Gate 승인 후; tracing 기본 off·모델 pin 필수·env allowlist(치환) 필수.

## Follow-up Gates
- **Gate A**: 0004 main 통합 + 운영 apply(별도 승인).
- **Gate B**: Claude adapter(wrapped) — 거버넌스 승인 포함.
- **Gate C**: GPT adapter(wrapped).
- **Gate D**: MCP v1.x read-only tool interface.
- **Gate E**: Temporal 재평가(scale threshold).

## 미확정(채택 전 확정)
npm provenance(전 후보) · Claude Commercial ToS 데이터/보존·native binary 감사 · OpenAI transitive `openai` 버전·ZDR tracing · MCP 1.29 release date·미검증 GHSA(345p·8r9q)·v2 license · LangGraphJS resume/timeout open issue · Temporal Neon 적합성·비용 임계.
