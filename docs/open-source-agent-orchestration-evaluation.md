# Official Agent SDK & Orchestration Runtime Evaluation

> Gate "official agent SDK and orchestration runtime evaluation". 조사·비교·disposable spike·ADR 만.
> **운영 DB write 0 · 외부 AI 호출 0 · production package/lock 변경 0 · runtime wiring 0 · main merge/push 0.**
> 결론: 현재 자체 구현 대체 결정은 [ADR-orchestration-runtime-selection](adr/ADR-orchestration-runtime-selection.md).

## 0. 조사 기준 시점·재현성
- **시작**: UTC **2026-07-19 21:12:06** / Asia/Seoul **2026-07-20 06:12:06**.
- 근거 우선순위: 공식 docs → release notes → security advisory → package metadata → examples/tests → maintainer 답변 issue → 일반 issue → 제3자. GitHub star/issue 수는 품질 근거로 쓰지 않음.
- **issue 검색 = 위험 신호 조사이지 완전한 보안 감사 아님.** "결과 없음"이 "문제 없음"을 뜻하지 않음.
- disposable spike 는 세션 scratchpad(`scratchpad/sdk-spike`, `scratchpad/pg-e2e`)에서만 수행. production `package.json`/lockfile 무변경. API key 미사용·미탐색. 실제 external model 호출 없음.

## 1. 재현성 메타데이터 (공식 저장소·npm metadata·docs 기준)
| 후보 | repo | package | prod line | inspected version | inspected commit SHA | release date | license / governing terms | Node | package mgr | **stability** | docs |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Temporal TS | temporalio/sdk-typescript | `@temporalio/{client,worker,workflow,activity,common}` | 1.20.x (main) | **1.20.3** | `9d8916d00e9c6e8ea0c001012b87034c40f21f53` (main HEAD) | 2026-07-15 | **MIT** | **≥20.3.0** | npm/pnpm/yarn | **production-recommended / stable** (1.20.x, MIT, 활발; SECURITY.md 없음) | docs.temporal.io/develop/typescript |
| LangGraph.js | langchain-ai/langgraphjs | `@langchain/langgraph` (+ `-checkpoint-postgres` 1.0.4) | 1.x | **1.4.8** | unclear (main HEAD 미취득) | 2026-07-15 | **MIT** | **≥18** | any | **production-recommended / stable** (1.0 GA 2025-10-29) | docs.langchain.com/oss/javascript/langgraph |
| OpenAI Agents JS | openai/openai-agents-js | `@openai/agents` (+core/openai/realtime) | 0.13.x | **0.13.5** | `710cccfd8fd26b395f8e3470419852d76de80967` | 2026-07-17 | **MIT (SDK)** + OpenAI API Terms/retention 별도 | **≥22** | pnpm(dev)/any | **beta (0.x, high churn)**; Sandbox Agents "beta" 별도 tier | openai.github.io/openai-agents-js |
| Claude Agent SDK | anthropics/claude-agent-sdk-typescript | `@anthropic-ai/claude-agent-sdk` | 0.3.x | **0.3.215** | `cf5a4421352f7411025e3937d97f4f731dc3249b` | 2026-07-19 | **Proprietary — Anthropic Commercial ToS (MIT 아님)**; peer(zod·@anthropic-ai/sdk·MCP)=MIT; platform binary=독점 | **≥18** | any | **stable-but-volatile (0.x, ~daily)** | code.claude.com/docs/en/agent-sdk |
| MCP SDK **v1.x** | modelcontextprotocol/typescript-sdk (`v1.x`) | `@modelcontextprotocol/sdk` | **1.x (prod)** | **1.29.0** | unclear | ~Q1–Q2 2026 (unclear) | **MIT** | **≥18** | any | **production-recommended / stable** | modelcontextprotocol.io |
| MCP SDK **v2** | 〃 (`main`) | `@modelcontextprotocol/{core,server,client,node,…}` | 2.x | **2.0.0-beta.4** | unclear | 2026-07-13 | MIT/Apache-2.0 (per-package 확인 필요) | **≥20** | any | **beta (NOT production)** | 〃 |

**MCP 스펙 버전(패키지 버전과 별개)**: 안정 스펙 **2025-11-25**(직전 2025-06-18), **2026-07-28 = Release Candidate**(2026-07-28 정식 목표). Tasks/MCP Apps 등 v2·RC 기능은 experimental → production 설계 근거로 채택하지 않음.

`unclear`(추측 금지, 채택 전 확정): LangGraphJS·MCP main HEAD SHA, MCP 1.29.0 정확 release date, 전 후보 npm provenance/attestation, MCP 미검증 GHSA(345p·8r9q), MCP v2 per-package license.

## 2. MCP 버전 분리 판정
- **v1.x(1.29.0)만 production-recommended** (maintainer README). 알려진 High CVE(**CVE-2025-66414 / GHSA-w48q-cv73-mx4w**, localhost DNS rebinding 기본 비활성)는 **<1.24.0 영향·1.24.0 fix** → 1.29.0 patched.
- **v2(2.0.0-beta.4)**: beta·패키지 전면 rename(breaking)·스펙 RC 추적 → 기능 많다는 이유로 production 후보로 올리지 않음.
- **최종**: **지금 v1.x 사용(read-only 도구 우선)** · v2 는 2026-07-28 스펙+stable v2 GA 후 재검토 · Tasks/v2 기능 production 미채택.

## 3. 기능 비교표 (native / official-ext / custom-wrapper / external-system / unsupported / unclear)
| 기능 | Temporal | LangGraphJS | OpenAI Agents | Claude Agent SDK | MCP v1.x |
|---|---|---|---|---|---|
| durable execution | native | native(checkpointer) | run-resume(native) | session-resume(native) | n/a |
| crash recovery | native | native(persistent saver) | via RunState | via session | n/a |
| retry/backoff | native | custom-wrapper | native(maxTurns/guard) | custom-wrapper | n/a |
| workflow DAG | custom-wrapper(코드) | **native(StateGraph)** | handoff | subagents | n/a |
| fan-in/out | native | native | native | native | n/a |
| human-in-the-loop | native(signal) | native(interrupt) | native(approval) | native(hooks/permission) | external(host) |
| suspend/resume | native | native(with 재실행 주의) | native(RunState) | native(resume) | n/a |
| replay semantics | native(deterministic) | **node 전체 재실행**(부작용 중복 주의) | n/a | n/a | n/a |
| side-effect isolation | native(activity) | custom-wrapper | custom | hooks | n/a |
| idempotency | official-ext | custom-wrapper | custom | custom | n/a |
| artifact handoff | native(payload) | native(state) | native | custom-wrapper(manifest 직접) | native(resource link) |
| version pinning | native(worker versioning) | native(semver) | native(model/SDK pin) | native(pin) | protocol negotiate |
| audit/history | native(append-only) | native(checkpoint list) | tracing | custom(hook 로그) | external |
| tracing | official-ext(OTel) | opt-in(LangSmith) | native(기본 ON, egress 주의) | config(기본 수집) | external |
| cost/token measurement | unsupported | unsupported | native(usage) | native(total_cost_usd/maxBudgetUsd) | n/a |
| sandbox/worktree isolation | n/a | n/a | beta(Sandbox Agent) | native(worktree, 협조적) | n/a |
| filesystem permission | n/a | n/a | beta | native(cwd/deny, OS sandbox 아님) | n/a |
| command permission | n/a | n/a | tool guardrail | native(Bash allow/deny + hook) | annotation only |
| secret boundary | codec(opt-in) | app | env/tracing 제어 | **native(env 치환 allowlist)** | token audience(MUST NOT passthrough) |
| structured output validation | data converter | native(Zod) | native(Zod outputType) | native(zod) | native(Zod I/O) |
| cancellation | native | native(open bug 이력) | native(AbortSignal) | native(AbortController) | n/a |
| timeout | native(timer) | native(open bug #1373) | custom-wrapper | 부분(Bash timeout, 벽시계 custom) | n/a |
| emergency stop | 앱 | 앱 | 앱 | disallowedTools/hook | 앱 |
| PostgreSQL integration | external(server backend) | official-ext(PostgresSaver 1.0.4) | n/a | n/a | n/a |
| TypeScript maturity | mature | mature(GA) | good(0.x) | good(0.x) | good |
| Railway 적합성 | worker=가능, **service 별도 배포 필요** | 라이브러리(가능) | 라이브러리 | 라이브러리+native binary | 라이브러리 |
| Neon PG 적합성 | unclear | PostgresSaver 사용가(Neon 명시 없음) | n/a | n/a | n/a |
| self-hosting 부담 | **high(Server+PG+ES)** | low(라이브러리) | none | none | none |
| vendor lock-in | low(OSS)~Cloud 시 | low(OSS) | OpenAI API 종속 | Anthropic 종속+Commercial ToS | 없음(개방 프로토콜) |
| telemetry/retention | 사용자측 payload(codec opt-in) | opt-in only | **기본 ON egress** | 기본 feedback 수집(flag off) | 없음(추정) |

## 4. 정량 점수표 (가중치: 보안/개인정보25·현행 적합20·운영단순15·신뢰성15·TS성숙10·lock-in5·migration비용5·license명확5)
> 점수는 근거 요약이며 **점수만으로 자동 채택하지 않음**. hard-stop 우선.

| 후보(용도) | 보안25 | 적합20 | 운영15 | 신뢰15 | TS10 | lock5 | mig5 | lic5 | **합** | 판정 |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|---|
| **MCP v1.x** (tool interface) | 18 | 14 | 12 | 12 | 8 | 5 | 4 | 5 | **78** | Adopt(v1.x, read-only 우선) |
| **OpenAI Agents** (GPT adapter, wrapped) | 17 | 17 | 13 | 11 | 8 | 3 | 4 | 4 | **77** | Wrap |
| **Claude Agent SDK** (Claude adapter, wrapped) | 16 | 17 | 12 | 11 | 8 | 2 | 4 | 2 | **72** | Wrap(거버넌스 조건) |
| **LangGraphJS** (review DAG, MemorySaver) | 17 | 13 | 10 | 9 | 8 | 4 | 4 | 5 | **70** | Borrow(→Wrap 제한) |
| **Temporal** (durable runtime 대체) | 17 | 11 | 5 | 14 | 9 | 4 | 1 | 5 | **66** | Defer + Borrow |

**hard-stop 점검**(하나라도 해당 시 Adopt 금지): license 불명 / 고객데이터 정책 불명 / secret boundary 구현 불가 / production 버전 없음 / 필수 기능 experimental 뿐 / SoT 이중화 불가피 / fail-closed 불가 / de-adoption 경로 없음.
- **MCP v2**: 필수(우리가 원하는 stable) 기능이 beta·spec RC → **Defer**(v2 자체가 hard-stop, v1.x 는 통과).
- **LangGraphJS + PostgresSaver(durable)**: 우리 jobs/executions 와 **SoT 이중화 불가피** → 그 모드는 hard-stop → **MemorySaver(휘발) 로 제한**하면 통과.
- **Temporal 반쪽 도입**(history + 우리 status 병존): SoT 이중화 → 채택 시 실행상태 SoT=Temporal, 비즈니스 SoR=PG 로 **명확 분리** 조건. 현시점 운영부담·migration비용으로 **Defer**.
- Claude SDK: license 는 **명확**(Anthropic Commercial ToS) → hard-stop 아님(거버넌스 승인 항목). 고객데이터=Commercial ToS 관할(확인 필요). secret boundary=env allowlist 로 구현 가능(spike 검증). fail-closed=wrapper 로 가능.
- OpenAI: default-model drift·tracing egress 는 wrapper 강제(모델 미지정 거부·tracing off)로 완화 → hard-stop 아님.

## 5. source-of-truth 중복 지도
| 상태 저장소 | 소유 | 성격 | 우리 PG 와 중복? |
|---|---|---|---|
| 우리 PG `jobs`/`job_executions` | 우리 | **business + 실행 SoR** | 기준 |
| 우리 PG `job_artifacts`/`reviews`/`approvals`/`audit`/`stops`(0004) | 우리 | **business SoR(도메인 진실)** | 기준 — 어떤 SDK 도 대체 안 함 |
| Temporal event history | Temporal service | **실행 상태**(execution) | 채택 시 실행상태 중복 위험 → 분리 필요 |
| LangGraph checkpoints(PostgresSaver) | LangGraph | **run 상태**(next-node/pending) | durable 사용 시 이중화 → MemorySaver 로 회피 |
| OpenAI `RunState`/Conversations | OpenAI/우리 | run 재개 상태 | job_execution 안에서 임시 사용 → SoR 아님 |
| Claude session(JSONL/resume) | Claude SDK | 실행 세션 | job_execution 안에서 임시 → SoR 아님 |

**결론**: business/실행 SoR 은 **우리 PostgreSQL 단일 유지**. SDK/runtime 의 상태는 job_execution 수명 안의 **파생·임시 상태**로만 사용. 이중 SoR 금지.

## 6. 자체 구현 대체 지도 (전체 프레임워크 vs SDK-only wrapper 분리)
| 자체 구현/계약 | 완전 대체 가능 | wrapper 뒤 유지 | 반드시 유지(사업 핵심) | 비고 |
|---|---|---|---|---|
| jobs/job_executions/lease/heartbeat/retry/reaper/idempotency | (Temporal 이 개념상 대체 가능) | — | **유지**(현행 SoR) | Temporal 은 Defer → 지금은 유지, 패턴만 borrow |
| version snapshot | — | — | **유지** | SDK 무관 |
| job dependency / immutable artifact / automated review / human approval / audit / emergency stop 계약(0004) | 없음 | — | **유지(business SoR)** | **runtime 선택과 독립** → 0004 수정 불필요 |
| GPT execution adapter(내부 실행엔진) | — | **OpenAI Agents 로 대체**(직접 agent loop 미구현) | wrapper+정책 유지 | high reduction |
| Claude execution adapter(내부 실행엔진) | — | **Claude Agent SDK 로 대체**(worktree/hook/deny) | wrapper+증거수집 유지 | high reduction |
| tool/data interface | — | **MCP v1.x**(read-only 우선) | 권한/승인 enforcement 자체 유지 | annotation 은 advisory |
| shadow observation / read-only monitoring | 없음 | — | **유지** | 자체 로직 |

## 7. 보안·라이선스 매트릭스
| 후보 | SECURITY.md | 알려진 CVE/advisory | npm provenance | telemetry 기본 | data retention | license | 독점 binary |
|---|---|---|---|---|---|---|---|
| Temporal TS | 없음 | SDK 없음 / **Server CVE(self-host)** | unclear | off(SDK) | Cloud retained ≤90d | MIT | 없음 |
| LangGraphJS | org 정책 | 스캔상 없음(미감사) | unclear | opt-in | LangSmith 시 SaaS | MIT | 없음 |
| OpenAI Agents | 있음 | 스캔상 없음 | unclear | **ON(egress)** | OpenAI API terms | MIT+API terms | 없음 |
| Claude Agent SDK | **없음** | 스캔상 없음 | **없음(빈 attestation)** | feedback 수집(off 가능) | Commercial ToS | **독점/Commercial ToS** | **있음(platform)** |
| MCP v1.x | 사설 신고 | **CVE-2025-66414 fix@1.24**(1.29 patched); 미검증 GHSA 2건 | unclear | 없음(추정) | — | MIT | 없음 |

**disposable `npm audit --omit=dev`(scratchpad, 조사시점)**: Temporal·LangGraphJS·OpenAI·Claude·MCP **전부 0 취약점**. **단, audit 0 이 보안 보장을 뜻하지 않음**(감사 아님). license inventory(설치 트리 집계): 대부분 MIT/ISC/BSD/Apache-2.0; **Claude SDK 본체만 독점**.

## 8. production readiness 매트릭스
| 후보 | 안정 릴리스 | prod 사용 근거 | 우리 스택 적합(Railway/Neon) | 채택 즉시성 |
|---|---|---|---|---|
| MCP v1.x | 1.29.0 stable | 광범위 | 라이브러리, 적합 | 지금(제한적) |
| OpenAI Agents | 0.13.5(0.x) | OpenAI 자체 사용 | 라이브러리, 적합 | wrapped 후 |
| Claude Agent SDK | 0.3.215(0.x) | vendor "prod-ready" | 라이브러리+binary, Win 주의 | wrapped 후 |
| LangGraphJS | 1.4.8 GA | Replit/Uber 등 | 라이브러리, 적합(MemorySaver) | review DAG 한정 |
| Temporal | 1.20.3 stable | 광범위 | **Server 별도 배포 필요** | Defer |

## 9. disposable spike 결과 (scratchpad, 폐기 가능)
- **설치·컴파일**: 5개 SDK 격리 설치 성공. resolved: `@openai/agents@0.13.5`·`@anthropic-ai/claude-agent-sdk@0.3.215`·`@modelcontextprotocol/sdk@1.29.0`·`@temporalio/worker@1.20.3`·`@langchain/langgraph@1.4.8`(+checkpoint-postgres@1.0.4).
- **adapter 컴파일**: 우리 GptAdapter mock(@openai/agents: Agent+Runner+Zod outputType, 모델 미지정 시 throw, tracingDisabled) · ClaudeAdapter mock(@anthropic-ai/claude-agent-sdk: query+Options, `env` **치환** allowlist, disallowedTools force-push/deploy/WebFetch/WebSearch, maxTurns) — **둘 다 tsc 0**. 부수 발견: OpenAI `Agent` 타입이 outputType 으로 parametrize → **구조화 출력이 컴파일 단계에서 강제**(장점).
- **safety spike 19/19**: 구조화 출력 검증(자유텍스트/필드누락/타입불일치 거부) · **env allowlist**(DATABASE_URL·HMAC key 미전달) · **child process env 치환 실측**(자식이 부모 secret 못 봄) · protected reference(HMAC 결정적·원문 미포함) · dependency version pin(kind/version 불일치 거부) · timeout→aborted fail-closed.
- **의미**: 우리 wrapper 가설(secret boundary·모델 pin·구조화 재검증·fail-closed)이 **실제 SDK/Node 의미로 성립**. 특히 `spawn({env})` 는 상속이 아니라 **치환** → 운영 DB credential/HMAC 미전달을 보장 가능.
- **의존성 footprint(설치 top-level 근사)**: openai ~103 · claude ~104(본체 runtime dep 0, peer 3 + platform binary 8) · mcp ~92 · temporal ~155(+native core) · langgraph ~37(최소).
- **MCP 는 두 adapter SDK 의 (peer/transitive) 의존** → 어느 adapter 를 쓰든 트리에 이미 들어옴.

## 10. 개발량 감소 산정 (감이 아닌 근거 수치)
| 축 | 값/등급 | 근거 |
|---|---|---|
| 제거 가능한 자체 파일 수 | **0(지금)** | SoR·큐·0004 스키마 전부 유지(어떤 SDK 도 business SoR 대체 안 함) |
| 회피되는 자체 구현(adapter 실행엔진) | **high reduction** | GPT/Claude agent loop·tool 권한엔진·worktree·구조화 파싱·retry/turn/budget 을 직접 구현 대신 SDK 위임. 자체는 wrapper+정책+증거수집(수백 줄)만 |
| 신규 adapter 코드(추가) | moderate | thin wrapper + PreToolUse/guardrail 정책 + 증거(manifest/diff/test) 수집 |
| 신규 dependency | +3(@openai/agents·@anthropic-ai/claude-agent-sdk·@modelcontextprotocol/sdk) | zod 는 이미 존재; MCP 는 어차피 transitive |
| 신규 운영 서비스 | **0**(Temporal/LangGraph Platform 미채택 시) | Temporal 채택 시 +1↑(Server+PG+ES) → Defer 이유 |
| 재작성 테스트 | 신규 adapter 테스트만 | 기존 큐/migration 테스트 무변경 |
| 신규 migration | **0(추가)** | 0004 가 artifact/review/approval/audit/stop 포함 — runtime 무관 |
| 신규 환경변수 | OPENAI_API_KEY·ANTHROPIC_API_KEY·모델 pin·tracing-off flag | 별도 승인 adapter Gate 에서 |
| 배포 단계 증가 | 0(라이브러리) / Temporal 시 +service | — |
| 유지보수 영역 | +adapter wrapper 2 + MCP tool 계약 | SoR 은 그대로 |

**총평: system-of-record 개발량 감소 = negligible(현행 유지가 정답) · adapter 실행엔진 개발량 감소 = high(직접 구현 회피) · Temporal 도입 감소 = 지금은 negative(migration+운영 부담) / 규모 도달 후 moderate.**

## 11. 최종 stack 제안 (계층별, 단일 승자 없음)
| 계층 | 제안 | 판정 |
|---|---|---|
| durable orchestration runtime | **기존 PostgreSQL jobs/job_executions 유지** (Temporal 은 scale 후 재검토) | Keep / Temporal=Defer |
| persistent business system-of-record | **기존 PostgreSQL**(0004 6테이블 포함) | Keep |
| GPT execution adapter SDK | **OpenAI Agents JS(0.13.x) — 내부 계약으로 wrap** | Wrap |
| Claude execution adapter SDK | **Claude Agent SDK(0.3.x) — 내부 계약으로 wrap** | Wrap(거버넌스 조건) |
| tool/data protocol | **MCP v1.x(1.29) — read-only 우선** | Adopt-limited / v2=Defer |
| artifact metadata store | **기존 PG `job_artifacts`** | Keep |
| artifact binary/content store | 기존 S3/GCS(이미 의존) + protected reference | Keep(SDK 무관) |
| human approval | **기존 `human_approvals`** | Keep |
| audit/tracing | **기존 `orchestration_audit_log`** + OTel(선택); SDK tracing 기본 off | Keep + Borrow |
| evaluation/golden dataset | 자체(골든 데이터 계획) | Keep |
| observability | OpenTelemetry(borrow, 필수 아님) | Borrow |
| secrets management | env allowlist + Railway env | Keep |
| sandbox/worktree execution | Claude Agent SDK worktree **+ 실제 disposable checkout/container**(OS 격리는 외부) | Wrap + 외부 강화 |

기본 비교 가설(§17 요청)은 **대체로 확인**: SoR=기존 PG ✓, GPT=OpenAI Agents wrapped ✓, Claude=Claude Agent SDK wrapped ✓, tool=MCP v1.x ✓, Temporal=threshold 후 ✓, LangGraphJS=제한 DAG(단, durable saver 아닌 MemorySaver) — 일부 **반박/정교화**: LangGraphJS 는 고정 3단계 리뷰엔 과할 수 있고 durable checkpointer 는 SoT 이중화라 금지.

## 12. migration Gate 관계 (핵심 답)
- **0004 6테이블은 runtime 선택과 독립적인 business system-of-record** 로 확인됨(jobs/executions/artifacts/reviews/approvals/audit/stops = 도메인 진실이며 어떤 SDK/runtime 도 대체하지 않음). → **migration 수정 불필요.**
- Temporal/LangGraph 를 나중에 채택해도 그들의 상태는 **실행상태 store** 이지 business record 가 아니므로, "그들이 상태를 저장하니 우리 테이블 삭제"는 **하지 않음**. 유일 조건: 채택 시 실행상태를 우리 테이블에 **이중 추적하지 말 것**(단일 SoR).
- 따라서 이 평가 Gate 후 **0004 는 그대로 별도 승인으로 통합·apply** 가능(설계 동결 조건 충족). 단, 이 Gate 종료 전까지 main merge/apply 보류(요청대로).

## 13. staged adoption plan
1. **Gate A (SoR 확정)**: 0004 main 통합 + 운영 apply(별도 승인). runtime 무관 확인 완료.
2. **Gate B (Claude adapter, wrapped)**: `@anthropic-ai/claude-agent-sdk` pin, disposable worktree + env allowlist + PreToolUse 정책 hook, 증거수집(manifest/diff/test), **거버넌스 승인**(Commercial ToS·데이터). 실 API 호출은 이 Gate 승인 후.
3. **Gate C (GPT adapter, wrapped)**: `@openai/agents` pin, **모델 명시 강제**, tracing off + canary 검증, 구조화 출력 자체 재검증.
4. **Gate D (MCP v1.x tool interface)**: read-only 도구부터, write 승인 게이팅·token audience·DNS rebinding 보호. v2 는 2026-07-28 스펙 GA 후 재평가.
5. **Gate E (durable runtime 재검토)**: throughput/branching 임계 도달 시 Temporal 재평가(실행상태 SoR 분리 설계).
6. LangGraphJS 는 필요 시 리뷰 DAG 한정, **MemorySaver(휘발)** 로만.

## 14. de-adoption plan
- adapter 는 **내부 계약(GptAdapterInput/Output·ClaudeAdapterInput/Output) 뒤 wrapper** → SDK 교체/제거 시 wrapper 구현만 교체, 계약·SoR·테스트 무변경.
- SDK 상태를 **SoR 로 승격하지 않음** → 제거해도 business 데이터 손실 없음.
- dependency 는 adapter 모듈에 격리, feature flag off + 미배선으로 즉시 무력화(현행 shadow/queue 선례).
- Temporal 미채택 유지 시 de-adoption 비용 0. MCP 는 도구 계약만 제거.

## 15. 미확정 사항 (채택 전 확정)
- 전 후보 npm provenance/attestation 실측. Claude SDK: Commercial ToS 데이터 학습/보존 조건, platform native binary 감사 가능성, Windows 안정성(#359/#259).
- OpenAI: pinned 0.13.5 의 `openai` transitive 정확 버전(root vs core 불일치), usage 필드 shape, ZDR org 시 tracing 제약.
- MCP: 1.29.0 정확 release date, 미검증 GHSA(345p·8r9q), v2 per-package license.
- LangGraphJS: JS 1.4.8 의 resume/timeout open issue(#1308·#1373·#792) 해결 여부.
- Temporal: Neon 적합성 공식 입장, self-host vs Cloud 비용 임계.

## 16. 후속 Gate 제안
Gate B(Claude adapter wrapped) → Gate C(GPT adapter wrapped) → Gate D(MCP v1.x read-only tools) → Gate E(Temporal 재평가). 각 Gate: SDK exact pin·모델 pin·tracing 정책·env allowlist·fail-closed·거버넌스 승인·실 API 는 승인 후. 상세는 [ADR](adr/ADR-orchestration-runtime-selection.md).
