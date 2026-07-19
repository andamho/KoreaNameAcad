# Official Agent SDK & Orchestration Runtime Evaluation

> Gate "official agent SDK and orchestration runtime evaluation". 조사·비교·disposable spike·ADR 만.
> **운영 DB write 0 · 외부 AI 호출 0 · production package/lock 변경 0 · runtime wiring 0 · main merge/push 0.**
> 조건부 승인(2026-07-20) 반영 개정판. 최종 판정·근거는 [ADR-orchestration-runtime-selection](adr/ADR-orchestration-runtime-selection.md).

## 0. 조사 기준 시점·재현성
- **시작**: UTC **2026-07-19 21:12:06** / Asia/Seoul **2026-07-20 06:12:06**.
- 근거 우선순위: 공식 docs → release notes → security advisory → package metadata → examples/tests → maintainer 답변 issue → 일반 issue → 제3자. star/issue 수는 품질 근거로 쓰지 않음.
- **issue 검색 = 위험 신호 조사이지 완전한 보안 감사 아님.** "결과 없음"이 "문제 없음"을 뜻하지 않음.
- disposable spike 는 세션 scratchpad 에서만 수행 후 폐기. production `package.json`/lockfile 무변경. API key 미사용·미탐색. 실제 external model 호출 없음.
- **재현성 한계 고지**: 일부 후보의 release-tag→commit SHA 를 이번 Gate 에서 확정했으나(아래), 다른 후보는 main HEAD SHA 만 확보했다. **SHA 가 미확정인 항목은 완전한 reproducibility 로 표현하지 않는다.**

## 1. 재현성 메타데이터 (공식 저장소·npm metadata·docs 기준)
| 후보 | repo | package | prod line | inspected version | commit SHA (근거) | release date | license / governing terms | Node | **stability** | docs |
|---|---|---|---|---|---|---|---|---|---|---|
| Temporal TS | temporalio/sdk-typescript | `@temporalio/{client,worker,workflow,activity,common}` | 1.20.x | **1.20.3** | `9d8916d00e9c6e8ea0c001012b87034c40f21f53` (**main HEAD @inspection**; v1.20.3 tag-commit 별도 미확정) | 2026-07-15 | **MIT** | ≥20.3.0 | **production-recommended / stable** (SECURITY.md 없음) | docs.temporal.io/develop/typescript |
| LangGraph.js | langchain-ai/langgraphjs | `@langchain/langgraph` (+ `-checkpoint-postgres` 1.0.4) | 1.x | **1.4.8** | **`790f3848455cffaf6b9274da3da8114dee076a42`** (tag `@langchain/langgraph@1.4.8` **annotated tag object**, GitHub git ref API로 확정; commit target 미역참조) | 2026-07-15 | **MIT** | ≥18 | **production-recommended / stable** (1.0 GA 2025-10-29) | docs.langchain.com/oss/javascript/langgraph |
| OpenAI Agents JS | openai/openai-agents-js | `@openai/agents` (+core/openai/realtime) | 0.13.x | **0.13.5** | `710cccfd8fd26b395f8e3470419852d76de80967` (**main HEAD @inspection**; 0.13.5 tag-commit 별도 미확정) | 2026-07-17 | **MIT (SDK)** + OpenAI API Terms/retention 별도 | ≥22 | **beta (0.x, high churn)**; Sandbox Agents "beta" 별도 tier | openai.github.io/openai-agents-js |
| Claude Agent SDK | anthropics/claude-agent-sdk-typescript | `@anthropic-ai/claude-agent-sdk` | 0.3.x | **0.3.215** | `cf5a4421352f7411025e3937d97f4f731dc3249b` (**main HEAD @inspection**) | 2026-07-19 | **package license: `SEE LICENSE IN README`** · **governing terms: Anthropic Commercial Terms of Service** · data collection/retention 별도 검토 · peer(zod·@anthropic-ai/sdk·MCP)=MIT · **platform binary=독점(별도 inventory)** | ≥18 | **unclear / rapidly changing 0.x** | code.claude.com/docs/en/agent-sdk |
| MCP SDK **v1.x** | modelcontextprotocol/typescript-sdk (`v1.x`) | `@modelcontextprotocol/sdk` | **1.x (prod)** | **1.29.0** | **`e12cbd7078db388152f6e839abdbe09ba01f3f32`** (tag `v1.29.0`, GitHub tags API로 확정) | ~Q1–Q2 2026 (**unverified**) | **MIT** | ≥18 | **production-recommended / stable** | modelcontextprotocol.io |
| MCP SDK **v2** | 〃 (`main`) | `@modelcontextprotocol/{core,server,client,node,…}` (**unverified**) | 2.x | **2.0.0-beta.4** (**unverified**) | **unverified** | **unverified** (2026-07-13 npm time 관측; 확정 아님) | **unverified** (README MIT vs Apache-2.0 상충) | ≥20 | **beta — NOT production (unverified 항목 다수)** | 〃 |

**Claude Agent SDK 실행 binary 기록 필수**: package version(`0.3.215`) 뿐 아니라 **실제 실행되는 platform binary 의 경로·버전·hash 를 채택 Gate 에서 snapshot** 해야 한다(package≠binary). 이번 Gate 에서는 미수집(§17 hardening).

**MCP 스펙 버전(패키지 버전과 별개)**: 안정 스펙 **2025-11-25**(직전 2025-06-18), **2026-07-28 = Release Candidate**. Tasks/MCP Apps 등 v2·RC 기능은 experimental → **production 설계 근거로 사용 금지**.

`unverified`(추측 금지, 채택 전 확정): Temporal/OpenAI 의 tag-commit SHA(main HEAD 만 확보), 전 후보 npm provenance/attestation, MCP 1.29.0 정확 release date, MCP 미검증 GHSA(345p·8r9q), **MCP v2 전 필드**.

## 2. MCP 버전 분리 (현재 결정)
- **MCP v1.x = evaluation candidate**(§5 판정: Defer pending read-only spike). 알려진 High CVE(**CVE-2025-66414 / GHSA-w48q-cv73-mx4w**, localhost DNS rebinding 기본 비활성)는 <1.24.0 영향·1.24.0 fix → 1.29.0 patched.
- **MCP v2 = Defer**. package/version/tag/SHA/release/license/prod-recommendation 를 공식 근거로 확정하지 못함 → **전 필드 unverified**. **v2 기능을 production 설계 근거로 사용 금지.**

## 3. 기능 비교표 (native / official-ext / custom-wrapper / external-system / unsupported / unclear)
| 기능 | Temporal | LangGraphJS | OpenAI Agents | Claude Agent SDK | MCP v1.x |
|---|---|---|---|---|---|
| durable execution | native | native(checkpointer) | run-resume(native) | session-resume(native) | n/a |
| retry/backoff | native | custom-wrapper | native(guard) | custom-wrapper | n/a |
| workflow DAG | custom-wrapper(코드) | **native(StateGraph)** | handoff | subagents | n/a |
| fan-in/out | native | native | native | native | n/a |
| human-in-the-loop | native(signal) | native(interrupt) | native(approval) | native(hooks/permission) | external(host) |
| suspend/resume | native | native(node 재실행 주의) | native(RunState) | native(resume) | n/a |
| replay semantics | native(deterministic) | **node 전체 재실행**(부작용 중복 주의) | n/a | n/a | n/a |
| side-effect isolation | native(activity) | custom-wrapper | custom | hooks | n/a |
| artifact handoff | native(payload) | native(state) | native | custom-wrapper(manifest) | native(resource link) |
| version pinning | native | native(semver) | native(model/SDK pin) | native(pin) | protocol negotiate |
| audit/history | native(append-only) | native(checkpoint list) | tracing | custom(hook) | external |
| tracing | official-ext(OTel) | opt-in(LangSmith) | **native 기본 ON(egress 주의)** | config(기본 수집) | external |
| cost/token measurement | unsupported | unsupported | native(usage) | native(cost/budget) | n/a |
| sandbox/worktree | n/a | n/a | **beta(Sandbox Agent, 별도 tier)** | native(worktree, 협조적) | n/a |
| command permission | n/a | n/a | tool guardrail | native(Bash allow/deny+hook) | annotation only |
| secret boundary | codec(opt-in) | app | env/tracing 제어 | **native(env 치환 allowlist)** | token audience(passthrough 금지) |
| structured output validation | data converter | native(Zod) | native(Zod outputType) | native(zod) | native(Zod I/O) |
| cancellation | native | native(bug 이력) | native(AbortSignal) | native(AbortController) | n/a |
| timeout | native | native(open bug #1373) | custom-wrapper | 부분(Bash timeout) | n/a |
| PostgreSQL integration | external(server backend) | official-ext(PostgresSaver 1.0.4) | n/a | n/a | n/a |
| Railway/self-host | worker=가능, **service 별도 필요·high** | 라이브러리 low | 라이브러리 none | 라이브러리+native binary | 라이브러리 none |
| telemetry/retention | payload codec opt-in | opt-in | **기본 ON egress** | 기본 feedback(off 가능) | 없음(추정) |

## 4. 정량 점수표 (가중치: 보안25·적합20·운영15·신뢰15·TS10·lock5·mig5·license5)
> **점수만으로 자동 채택하지 않음**. hard-stop 우선. **SHA/필드 unverified 후보는 신뢰도 하향**(별표).

| 후보(용도) | 보안25 | 적합20 | 운영15 | 신뢰15 | TS10 | lock5 | mig5 | lic5 | **합** | 판정 | 신뢰도 |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|---|---|
| **OpenAI Agents** (GPT adapter, wrapped) | 17 | 17 | 13 | 11 | 8 | 3 | 4 | 4 | **77** | **Wrap** | 중(0.x, tag-SHA main HEAD) |
| **MCP v1.x** (tool interface) | 18 | 14 | 12 | 12 | 8 | 5 | 4 | 5 | **78** | **Defer pending read-only spike** | 중(release date unverified) |
| **Claude Agent SDK** (Claude adapter, wrapped) | 16 | 17 | 12 | 11 | 8 | 2 | 4 | 2 | **72** | **Wrap, conditional (governance+isolation approval)** | 하(0.x rapidly changing, 독점, binary 미검증) |
| **LangGraphJS** (design patterns) | 17 | 13 | 10 | 9 | 8 | 4 | 4 | 5 | **70** | **Borrow patterns / Defer runtime** | 중(tag=annotated, commit 미역참조) |
| **Temporal** (durable runtime 대체) | 17 | 11 | 5 | 14 | 9 | 4 | 1 | 5 | **66** | **Borrow patterns / Defer** | 중(tag-SHA main HEAD) |

**hard-stop 점검**: MCP **v2**(필수 stable 기능이 beta·unverified 다수)→Defer · LangGraph **PostgresSaver/durable**(우리 큐와 SoT 이중화)→금지 · Temporal 반쪽 도입(history+우리 status 병존)→SoT 이중화 조건. Claude license 는 **명확한 독점(Commercial ToS)** 이라 "불명"은 아니나, **거버넌스+격리 승인 없이는 Adopt 금지**. OpenAI default-model drift·tracing egress 는 wrapper 강제로 완화.

## 5. source-of-truth 중복 지도
| 상태 저장소 | 소유 | 성격 | 우리 PG 와 관계 |
|---|---|---|---|
| 우리 PG `jobs`/`job_executions` | 우리 | **business + 실행 SoR** | 기준(authoritative) |
| 우리 PG `job_artifacts`/`reviews`/`approvals`/`audit`/`stops`(0004) | 우리 | **business SoR(도메인 진실)** | 기준 — 어떤 SDK 도 대체 안 함 |
| Temporal event history | Temporal service | 실행 상태 | 채택 시 중복 위험 → 분리 필요(재설계 Gate) |
| LangGraph checkpoints(PostgresSaver) | LangGraph | run 상태 | durable 사용 시 이중화 → **금지/별도 승인** |
| OpenAI `RunState` / Claude session | SDK | run 재개/세션 | **파생·임시**(job_execution 수명 내) — SoR 아님 |

**원칙**: business/실행 SoR 은 **우리 PostgreSQL 단일**. SDK session/checkpoint/workflow state 는 **파생·임시 상태**로만. **동일 execution 상태의 이중 영속 추적 금지.**

## 6. 자체 구현 대체 지도
| 자체 구현/계약 | 완전 대체 | wrapper 뒤 유지 | 반드시 유지(사업 핵심) | 비고 |
|---|---|---|---|---|
| jobs/executions/lease/heartbeat/retry/reaper/idempotency | (Temporal 개념상) | — | **유지** | Temporal Defer → 지금 유지, 패턴 borrow |
| 0004 6테이블 계약 | 없음 | — | **유지(business SoR)** | **runtime 독립** → 수정 불필요 |
| GPT execution adapter(실행엔진) | — | **OpenAI Agents 로 위임** | wrapper+정책 | high reduction |
| Claude execution adapter(실행엔진) | — | **Claude Agent SDK 로 위임** | wrapper+증거수집 | high reduction |
| tool/data interface | — | **MCP v1.x**(spike 후) | 권한/승인 enforcement 자체 | annotation=advisory |
| shadow observation/monitoring | 없음 | — | **유지** | 자체 로직 |

## 7. 보안·라이선스 매트릭스
| 후보 | SECURITY.md | 알려진 CVE | provenance | telemetry 기본 | retention | license | 독점 binary |
|---|---|---|---|---|---|---|---|
| Temporal TS | 없음 | SDK 없음/**Server CVE(self-host)** | unverified | off(SDK) | Cloud ≤90d | MIT | 없음 |
| LangGraphJS | org 정책 | 스캔상 없음(미감사) | unverified | opt-in | LangSmith SaaS | MIT | 없음 |
| OpenAI Agents | 있음 | 스캔상 없음 | unverified | **ON(egress)** | OpenAI API terms | MIT+API terms | 없음 |
| Claude Agent SDK | **없음** | 스캔상 없음 | **없음(빈 attestation)** | feedback(off 가능) | Commercial ToS | **독점** | **있음** |
| MCP v1.x | 사설 신고 | **CVE-2025-66414 fix@1.24**(1.29 patched); 미검증 GHSA 2건 | unverified | 없음(추정) | — | MIT | 없음 |

### npm audit 해석 (참고 지표로만)
scratchpad `npm audit --omit=dev` = 5개 SDK 전부 0. **그러나**:
- **audit 0 은 안전 보증이 아님**(알려진 취약점 DB 대조일 뿐).
- **native/platform binary(예: Claude SDK)는 npm audit 만으로 평가 불가.**
- **package provenance·release signature·binary hash 는 별도 검증 필요.**
- **transitive dependency 와 실제 runtime capability(파일·네트워크·subprocess)는 별도 평가.**

license inventory(설치 트리 집계): 대부분 MIT/ISC/BSD/Apache-2.0; **Claude SDK 본체만 독점 + platform binary 독점(별도 inventory 필요)**.

## 8. disposable spike 결과 (scratchpad, 폐기 완료)
- **설치·컴파일**: 5 SDK 격리 설치 성공. adapter mock 2종(GPT: @openai/agents Agent+Runner+Zod outputType, 모델 미지정 throw, tracingDisabled / Claude: @anthropic-ai/claude-agent-sdk query+Options, `env` **치환** allowlist, disallowedTools force-push/deploy/WebFetch/WebSearch, maxTurns) — **tsc 0**. OpenAI `Agent` 타입이 outputType 으로 parametrize → **구조화 출력 컴파일 강제**(장점).
- **safety spike 19/19**: 구조화 출력 검증(자유텍스트/필드누락/타입불일치 거부) · env allowlist · **child process env 치환 실측**(자식이 부모 DATABASE_URL/HMAC 못 봄) · protected reference(HMAC 결정적·원문 미포함) · dependency version pin · timeout→aborted fail-closed.
- **footprint(top-level 근사)**: openai ~103 · claude ~104(runtime dep 0, peer 3+platform binary 8) · mcp ~92 · temporal ~155 · langgraph ~37. **MCP 는 두 adapter SDK 의 transitive**.

## 9. 개발량 감소 산정
| 축 | 값/등급 | 근거 |
|---|---|---|
| 제거 가능한 자체 파일 | **0** | SoR·큐·0004 전부 유지 |
| 회피되는 자체 구현(adapter 엔진) | **high reduction** | agent loop·tool 권한·worktree·구조화 파싱·retry/turn/budget 을 SDK 위임 |
| 신규 dependency | +3(openai/agents·claude-agent-sdk·mcp/sdk) | zod 이미 존재; MCP 는 transitive |
| 신규 운영 서비스 | **0** (Temporal 시 +1↑) | Temporal Defer 이유 |
| 신규 migration | **0(추가)** | 0004 로 충분 — runtime 독립 |
| 배포 단계 증가 | 0(라이브러리) | Temporal 시 +service |

**총평: system-of-record 감소=negligible(현행 유지 정답) · adapter 실행엔진 감소=high · Temporal 지금=negative, scale 후=moderate.**

## 10. 최종 stack 제안 (계층별)
| 계층 | 제안 | 판정 |
|---|---|---|
| durable orchestration runtime | 기존 PostgreSQL jobs/job_executions | **Adopt/retain** (Temporal=Defer) |
| persistent business system-of-record | 기존 PostgreSQL(0004 포함) | **Keep** |
| GPT execution adapter SDK | OpenAI Agents JS(0.13.x) wrap | **Wrap** |
| Claude execution adapter SDK | Claude Agent SDK(0.3.x) wrap | **Wrap, conditional** |
| tool/data protocol | MCP v1.x(1.29) | **Defer pending read-only spike** / v2=Defer |
| artifact metadata / approval / audit | 기존 PG(0004) | **Keep** |
| sandbox/worktree execution | Claude SDK worktree **+ 실제 disposable checkout/container** | Wrap + 외부 강화 |
| observability | OpenTelemetry(borrow, 필수 아님) | Borrow |
| secrets management | env allowlist + Railway env | Keep |

## 11. migration Gate 관계 (핵심 답, 유지)
- **0004 6테이블 = runtime 선택과 독립적인 business system-of-record** → **migration 수정 불필요.** 제거해야 할 runtime-state 컬럼/테이블 **없음**.
- Temporal/LangGraph 채택해도 그들 상태는 실행상태 store → 우리 테이블 삭제 안 함. 유일 조건: 채택 시 실행상태 **이중 추적 금지**(단일 SoR) + **source-of-truth 재설계 Gate 필요**.

## 12. staged adoption plan
1. **Gate A**: 0004 main 통합 + 운영 apply(별도 승인). runtime 무관 확인.
2. **Gate B (Claude adapter, Wrap conditional)**: **거버넌스+격리 승인** 선행 — §14 Windows·binary hardening 체크리스트 전부 통과. exact version pin·자동 minor/patch 금지·실행 binary hash snapshot. 실 API 는 승인 후.
3. **Gate C (GPT adapter, Wrap)**: §13 OpenAI/Sandbox 분리 조건. 일반 adapter 만; Sandbox 별도 Gate.
4. **Gate D (MCP)**: **read-only spike 선행**(§15 `get-orchestration-job-summary`). 성공 시 Wrap/Adopt-limited 재평가. 그 전 운영 MCP server/client 배선 금지. v2 는 2026-07-28 스펙 GA 후.
5. **Gate E (Temporal 재평가)**: scale/branching 임계.

## 13. OpenAI Agents / Sandbox 분리
- **일반 GPT analysis/review adapter = Wrap 후보**(stable text-Agent+tools+guardrails 표면만).
- **Sandbox Agent = beta surface, 별도 Gate**(filesystem/repo-materialization 별도 평가).
- 공통 필수: **model exact identifier 필수 / SDK default model 사용 금지 / system instruction version pin / tracing off·redaction / structured output schema 필수 / max turns·token·cost·time fail-closed.**

## 14. Claude adapter — Windows·binary hardening (구현 전 필수 Gate 항목)
- Windows disposable worktree 실행 · **platform binary 실제 위치 확인 · binary/version/hash snapshot** · child process lifecycle · **cancellation 후 orphan process 0** · shell command allowlist · filesystem scope · **symlink/junction escape 검사** · network 최소화 · **explicit env allowlist(process.env 전체 전달 금지)** · **운영 DB credential 전달 금지** · **force push/deploy/migration 명령 차단**(PreToolUse hook). SDK network allowlist 미신뢰(#309) → **egress 는 컨테이너/방화벽에서 강제**.

## 15. MCP read-only spike Gate 제안 (v1.x 판정 전제)
- **최초 spike 후보: `get-orchestration-job-summary`.**
- 조건: read-only · 고객 원문 없음 · **protected reference 만** · authentication · tool allowlist · **exact schema version pin** · timeout · reconnect · **audit event** · **prompt injection 방어** · **GPT/Claude 양쪽 consumer mock** · **write capability 0**.
- **이 spike 전에는 운영 MCP server/client 를 배선하지 않는다.** 성공 후 v1.x 를 Wrap/Adopt-limited 로 재평가.

## 16. Architecture risks / hardening backlog (운영 배선 전 필수)
> AI adapter·자동 handoff·automated review loop 운영 배선 전에 아래를 **별도 hardening Gate** 로 통과해야 한다.

### R1. immutable artifact DB hardening (미완성)
현재 `job_artifacts_immutable_ck`(immutable=true CHECK)는 `immutable=false` **삽입**만 막고, 기존 행의 **컬럼 UPDATE/삭제는 막지 못함**. 필요:
- **job_artifacts UPDATE 금지 · DELETE 금지** · content/manifest/protected_content_ref/schema_version/lineage 변경 금지.
- 예외적 보존기간(expires_at) 처리 방식 정의.
- **DB role privilege 또는 BEFORE UPDATE/DELETE trigger 기반 강제**(범용 러너 정적 스캐너의 UPDATE/DELETE 키워드 거부와 충돌 검증 포함).

### R2. append-only audit DB hardening (미완성)
`orchestration_audit_log` 는 현재 schema+app contract 만, **DB 차원 UPDATE/DELETE 방지 없음**. 운영 전 필수:
- **append-only DB enforcement** · **writer/reader role 분리** · **UPDATE/DELETE 권한 제거 또는 거부 trigger** · migration runner·test teardown 충돌 검증 · 감사 이벤트 위변조 방지 · emergency administrator 절차.

### R3. `.env` hardlink 재사용 금지 (프로세스 위험)
이번 migration Gate 에서 격리 worktree 에 **원본 `.env` hardlink** 를 만들어 운영 read-only inspect 를 수행한 사실을 기록한다(사용 후 제거함). **앞으로 금지**: `.env` 복사/symlink/hardlink, secret 파일을 다른 worktree 에 연결, secret 파일 내용 탐색. 향후 운영 read-only 검증은 **①운영자 시작 부모 프로세스의 필요한 변수만 상속 / ②명시적 env allowlist / ③전용 read-only wrapper / ④ephemeral secret injection** 중 하나로 제한하고 **값을 출력하지 않는다.**

### R4. 테스트 inherited-env hardening (오탐 위험)
`JOB_SHADOW_REF_HMAC_KEY` 가 shell 에서 상속돼 shadowWriter "key 없음" 테스트가 **오탐**한 사례 기록. hardening 후보(이번엔 코드 미수정, 위험 항목만): 테스트 runner 시작 시 운영 민감 env 제거 · 필요한 env 만 명시 주입 · 테스트별 env snapshot/restore · **inherited production secret 감지 시 fail-closed** · **secret 값·길이·fingerprint 출력 금지**.

### R5. LangGraphJS MemorySaver 경고
MemorySaver/InMemorySaver 는 **RAM 전용·재시작 시 소실·교차 프로세스 공유 없음** → **test/disposable spike 전용, production persistence 금지**. **최근 MemorySaver 관련 보안 수정 이력**(사용자 지적)은 이번 Gate 에서 **정확한 advisory ID 미확인 → unverified**; 채택/사용 전 공식 Advisory DB 로 확정 필요. PostgreSQL checkpointer 도입은 **금지 또는 별도 승인**(SoT 이중화).

## 17. 미확정 사항 (채택 전 확정)
- Temporal/OpenAI **tag-commit SHA**(main HEAD 만 확보) · 전 후보 **npm provenance/attestation** · Claude **Commercial ToS 데이터/학습/보존**, **platform native binary 위치·hash·감사 가능성**, Windows 안정성(#359/#259).
- OpenAI: pinned 0.13.5 의 `openai` transitive 버전(root vs core 불일치), usage 필드 shape, ZDR tracing 제약.
- MCP: **v1.29.0 정확 release date(unverified)**, 미검증 GHSA(345p·8r9q), **v2 전 필드(package/version/tag/SHA/release/license/prod) unverified**.
- LangGraphJS: annotated tag `790f384…` 의 commit target 역참조, JS resume/timeout open issue(#1308·#1373·#792), **MemorySaver 보안 수정 이력(unverified)**.
- Temporal: Neon 적합성, self-host vs Cloud 비용 임계.

## 18. 후속 Gate 제안
Gate A(0004 apply) → **Gate B(Claude adapter, Wrap conditional — Windows/binary hardening 선행)** → Gate C(GPT adapter, Wrap — Sandbox 분리) → **Gate D(MCP read-only spike `get-orchestration-job-summary`)** → Gate E(Temporal 재평가). 추가 hardening Gate: **R1 immutable artifact / R2 append-only audit**(운영 배선 전 필수). 상세 판정은 [ADR](adr/ADR-orchestration-runtime-selection.md).
