# orchestration DB immutability & append-only hardening (설계, 조건부 최종 승인 반영 v3)

> Gate "orchestration database immutability and append-only hardening". **설계·migration preparation·격리 PG17 검증만.**
> **운영 apply 0 · 운영 role/ownership/GRANT/REVOKE/trigger 0 · 신규 orchestration row 0 · adapter/runtime wiring 0 · connection pool runtime 0 · 외부 AI 0 · calls 0 · package/lock 0 · main merge/push 0 · feature branch push 0. 기존 0004 무수정.**
> 산출물: 이 문서 · draft `migrations/hardening/0001_orchestration_immutability_roles.sql` · `server/migrations/hardening/{hardeningRunner,tables}.ts` · `tests/knop/orchestrationHardening.test.ts` · [shadow mismatch 조사](orchestration-shadow-mismatch-investigation.md).

## 1. 기준선 (read-only)
main(local) `868ce2b` · **origin/main 은 이후 운영자 커밋으로 `06a7706`(UI, 무관)** · 0004 already-applied · base 39 · FK 16 · 6테이블 0행 · jobs/exec 0 · shadow 4 · wiring 0.
운영 app role = 6테이블 OWNER · rolsuper=false · **rolcreaterole=true · rolbypassrls=true** · 6테이블 전 권한.

## 2. 격리 PG17 로 검증한 provider(Neon 동등) capability
CREATE ROLE NOLOGIN/LOGIN · membership GRANT/REVOKE · **ALTER TABLE/FUNCTION OWNER TO NOLOGIN** · SET ROLE(**real login 기준 membership 강제**) · 컬럼 UPDATE · **identity INSERT(시퀀스 grant 불요)** · **trigger 발화(EXECUTE grant 불요)** · REVOKE ALL FROM PUBLIC(=0) · **PUBLIC function EXECUTE REVOKE(=0)** — 모두 OK.
**session_replication_role=replica = SUPERUSER 전용**(비-superuser 42501). DROP ROLE(grants 보유)=2BP01 → cleanup=DROP/REASSIGN OWNED 선행.
> **⚠️ Neon 실환경 미확정(계속 unverified)**: pooled connection 의 SET ROLE/session 상태 · direct URL vs pooled URL 차이 · credential rotation 후 기존 pool connection · prepared statement ↔ role 변경 상호작용 · disposable Neon branch role cleanup. **embedded PG 결과를 Neon pooler 실측으로 표현하지 않음.** → §16 별도 Gate.

## 3. 연결 경계 분리 (전체 DATABASE_URL 교체 금지)
| 연결 | 용도 | role |
|---|---|---|
| existing application | 기존 CRM·상담·보고서 | 기존 app role |
| orchestration reader | 6테이블 SELECT 전용 | orchestration_reader |
| orchestration writer | 6테이블 INSERT + 승인 컬럼 UPDATE 전용 | orchestration_writer |
| orchestration migration/admin | migration·승인된 emergency | **orchestration_deployer(LOGIN) → SET ROLE orchestration_admin** |
쓰기 코드는 **전용 writer pool/client**. 기존 app client 를 orchestration writer 로 쓰는 것은 **startup self-check 로 fail-closed 차단**(writer pool→business table 접근 실패 & app pool→orchestration write 실패 & trigger 전부 enabled 확인, 하나라도 어긋나면 부팅 거부).

## 4. 5-role 모델 (개정)
| role | LOGIN | 권한/역할 | 직접 접속 |
|---|---|---|---|
| `orchestration_owner` | **NOLOGIN** | 6테이블·trigger function **소유** | **금지** |
| `orchestration_admin` | **NOLOGIN** | 관리 capability 묶음(owner 멤버십) | **금지** |
| `orchestration_deployer` | **LOGIN** | migration/hardening/emergency 전용. 평상시 비활성/격리. **SET ROLE admin(→owner)**. 사용 후 rotation/비활성 | 허용(전용) |
| `orchestration_writer` | **LOGIN** | 비소유자. INSERT/SELECT + 승인 컬럼 UPDATE | 런타임 |
| `orchestration_reader` | **LOGIN** | 비소유자. SELECT | 런타임 |
- **실제 migration 실행 주체 = `orchestration_deployer` LOGIN → `SET ROLE orchestration_admin`**(admin/owner 는 NOLOGIN 이라 스스로 접속하지 않음). 멤버십 그래프: deployer∈admin∈owner. writer/reader/app 은 admin/owner **비멤버**.
- **owner model A**(NOLOGIN owner 로 소유권 이전) 채택 — 기존 app owner 암묵권한 소멸.

## 5. 기존 app role·PUBLIC·function 권한 완전 제거 (명시 fingerprint)
ownership transfer 만으로 가정하지 않고 **명시 REVOKE + runner fingerprint** 로 다음을 **0** 보장(격리 PG17 검증):
- 기존 app role 6테이블 **INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER = 0**(DO 블록: orchestration_* 이외 grantee 전 권한 REVOKE) · owner/admin/deployer **비멤버** · **SET ROLE owner/admin 불가**(real login 검증).
- **PUBLIC table 권한 0 · PUBLIC sequence 권한 0 · PUBLIC trigger-function EXECUTE 0**(REVOKE ALL ON FUNCTION FROM PUBLIC) · writer/reader **직접 function EXECUTE 0**(직접 호출 거부, 발화에는 EXECUTE 불요) · writer↔business table 격리 · reader 6테이블 write 불가.
- **default privileges**: `ALTER DEFAULT PRIVILEGES FOR ROLE {owner,admin,deployer} REVOKE {EXECUTE ON FUNCTIONS | ALL ON TABLES,SEQUENCES} FROM PUBLIC` — **스키마 한정자 없음**(아래 §5b). 대상 role 멤버십이 필요하므로 SQL 의 DO 블록이 없으면 임시 부여 후 즉시 회수한다.

### 5b. ⚠️ function privilege 정정 — 결함 원인과 해결 (정정 완료)
**결함(Phase 2 발견)**: `orchestration_owner` 가 **앞으로 만들** 함수가 PUBLIC EXECUTE 를 그대로 보유.

**근본 원인(정정 Gate 에서 규명)** — 이전 판의 "REVOKE 형식은 기록되지 않는다"는 서술은 **부정확**했다. 실제 원인은 **`IN SCHEMA` 한정자**다:

| 형식 | 시작 ACL | `pg_default_acl` 행 | 이후 새 함수 |
|---|---|---|---|
| `… FOR ROLE r **IN SCHEMA s** REVOKE … ON FUNCTIONS FROM PUBLIC` | **빈 ACL** | **생성 안 됨**(no-op) | `proacl=null` → **PUBLIC EXECUTE 보유** ❌ |
| `… FOR ROLE r REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC` (**전역**) | **내장 기본값**(`=X/r` 포함) | `{r=X/r}` (namespace 0) | `proacl={r=X/r}` → **public=false** ✅ |

**정본 증거**: embedded PostgreSQL **17.10** (운영 Neon 과 동일 메이저). PGlite 는 **18.3** 이라 동일 결과가 나와도 **정본이 아니다**(버전 상이).

**default ACL 정책 — 정확한 서술(과장 금지)**
- schema-specific default ACL 은 global default 와 **별도로 계산**된다(합쳐서 적용되며, 서로를 대체하지 않는다).
- 비어 있는 schema-specific ACL 에서 `REVOKE … FROM PUBLIC` 은 **no-op 이 될 수 있다**(행조차 생기지 않음).
- global function default ACL 의 `REVOKE EXECUTE … FROM PUBLIC` 은 **built-in PUBLIC EXECUTE 를 제거할 수 있다**.
- default ACL 은 **`FOR ROLE` 목록 밖 role 이 생성한 함수에는 적용되지 않는다.**
- 따라서 default ACL 은 **보조 방어선**이다.
- **최종 보장 = owner-only creation + exact-signature function REVOKE + security assertion(fingerprint).**

**적용한 해결(3층)**
1. **기존 4함수** — 정확한 signature 기준 명시 `REVOKE ALL ON FUNCTION …() FROM PUBLIC` + reader/writer/deployer 선언적 회수. **소유권 이전 뒤 재선언**(멱등). PG 17.10 실측상 `ALTER FUNCTION … OWNER TO` 는 ACL 을 `{old=X/old}`→`{new=X/new}` 로 재작성하며 PUBLIC 회수를 유지하지만, 엔진 동작에 의존하지 않는다.
2. **미래 함수** — **전역 형식** default privileges 를 **owner·admin·deployer 3 role 전부**에 적용. `FOR ROLE` 목록 밖 role 이 만든 함수는 보호되지 않으므로 3개 모두 필요(실측 확인).
3. **fail-closed assertion** — 러너/게이트가 security assertion 10종으로 상시 검사(§9b). 하나라도 위반 시 `aborted-function-fingerprint` 이며 actual Neon execute 도 차단된다.

**추가 방어층(실측 발견)**: 하드닝은 `REVOKE CREATE ON SCHEMA public FROM PUBLIC` 을 수행하고 owner 에게 CREATE 를 부여하지 않으므로, **owner 조차 기본 상태에서는 public 스키마에 함수를 만들 수 없다**(42501). 미래 함수 생성은 반드시 명시적 `GRANT CREATE ON SCHEMA public TO orchestration_owner` 선행을 요구한다.

**잔여 위험(명시)**: 기존 app/migration owner role(이름을 정적 SQL 이 알 수 없음)이 만드는 함수는 이 default ACL 로 보호되지 않는다. → §9c 미래 migration 규칙과 `fnsec-function-count`(미승인 `orch_*` 함수 탐지)·`fnsec-owner`(소유자 강제)로 보완한다.

**보안 모드 결정**: 4함수는 `SECURITY INVOKER` 유지(`prosecdef=false`), `proconfig=null`. trigger 발화는 EXECUTE 권한을 요구하지 않으므로 `SECURITY DEFINER` 가 불필요하고, DEFINER 는 search_path 주입면을 새로 만든다. 함수 본문은 `RAISE`/`TG_*`/`NEW·OLD` 컬럼 비교만 쓰고 **스키마 미한정 객체·연산자를 참조하지 않아** search_path 의존이 없다. 그래서 `proconfig` 고정을 요구하지 않되, fingerprint 가 두 값의 **무단 변경을 hard stop 으로 탐지**한다.

## 6. connection-pool 설계
reader/writer **각각 독립 pool**(app pool 과 분리). min/max 소량. **pooler transaction mode 에서 SET ROLE 금지 → 역할별 독립 credential**(§2 unverified 완화). rotation 시 pool 재시작. **startup self-check fail-closed**(§3). credential 식별자 미출력, capability(권한 boolean)만 확인.

## 7. privilege matrix (GRANT ALL 미사용)
| 대상 | reader | writer | admin(via owner) | PUBLIC |
|---|---|---|---|---|
| schema public USAGE | ✓ | ✓ | (owner) | CREATE REVOKE |
| job_artifacts / automated_reviews / orchestration_audit_log | SELECT | SELECT,INSERT | ALL(owner) | 0 |
| job_dependencies | SELECT | +UPDATE(resolution_status,resolved_execution_id,resolved_artifact_id,resolved_at) | ALL | 0 |
| human_approvals | SELECT | +UPDATE(approval_status,decided_at,decided_by_protected_ref,decision_reason_code,decision_summary,updated_at) | ALL | 0 |
| emergency_stops | SELECT | +UPDATE(active,released_at,released_by_protected_ref,reason_summary,updated_at) | ALL | 0 |
| audit seq(identity) | — | 불요 | (owner) | 0 |
| trigger function EXECUTE | — | **0(직접 호출 불가)** | (owner) | **0** |
| REFERENCES/TRUNCATE/TRIGGER | — | — | (owner) | — |
| default(TABLES/SEQ/FUNC) | — | — | owner REVOKE FROM PUBLIC | — |
| DB CONNECT | 배포별 | 배포별 | — | — |
SQLSTATE: OA001(immutable/append-only UPDATE·DELETE)·OA002(DELETE)·OA003(식별/created_at)·OA004(TRUNCATE).

## 8. 업무 상태 vs 감사 원장 분리 · 9. append-only vs tamper-evidence(hash chain 별도 Gate) — 이전 판단 유지
job_artifacts/automated_reviews/orchestration_audit_log=immutable/append-only. human_approvals/emergency_stops/job_dependencies=business-state(제한 UPDATE·식별 불변·DELETE 금지) + 상태 전이는 audit_log 불변 이벤트. hash chain(cryptographic tamper-evidence)은 동시성/rollback/위협모델 이유로 **별도 Gate**(단순 append-only 와 혼동 금지).

## 10. emergency runbook (DISABLE TRIGGER = 최후 수단, 일반 정정 금지)
**기본 정정 원칙**: 기존 immutable/audit row 수정 금지 · **correction/reversal 이벤트 새로 INSERT** · 원본 보존 · 최신 projection 에 반영.
**DISABLE TRIGGER runbook**(이중승인·짧은 창):
1. emergency stop 활성화 → 2. orchestration writer pool 중지 → 3. active writer connection 0 확인 → 4. **이중 human approval** → 5. deployer credential 활성화 → 6. `SET ROLE orchestration_admin`(→owner) → 7. 대상 table·SQL fingerprint 고정 → 8. `ALTER TABLE ... DISABLE TRIGGER` → 9. **승인된 최소 작업** → 10. **즉시 ENABLE TRIGGER** → 11. **15 trigger 전부 활성 재검증** → 12. privilege/owner fingerprint 재검증 → 13. deployer credential rotation/비활성 → 14. writer pool 재가동.
**fail-closed 감시**: trigger disabled 발견 시 앱 writer 기동 거부 · expected trigger count/name/enabled-state 불일치 시 **startup 실패** · **hardeningRunner 종료 시 trigger 하나라도 비활성이면 실패** · emergency 종료 전 writer 재가동 금지. **DISABLE/ENABLE·emergency 는 runbook 으로만, 평상시 코드에 기능 없음.** (replica 는 superuser 전용이라 런타임/admin 불가.)

## 11. trigger/function 구조 (약화 금지) — 공용 4 function + 테이블별 15 trigger 유지
공용 function(orch_deny_write/deny_delete/guard_business_update/deny_truncate) + 테이블별 trigger. privilege-only(무 trigger)는 owner/특권 우회로 **불충분** → 유지. 보안 낮추는 단순화 금지.

## 12. ownership transfer bootstrap — **A 채택 / B Reject**
| 방식 | 내용 | 판정 |
|---|---|---|
| **A** | **현재 owner(기존 app/migration-owner) 연결이 직접** 소유권 이전 후 **임시 membership 즉시 회수** | **채택(기본)** |
| B | deployer 에 **기존 app role membership** 부여 | **Reject** — app role 의 CRM·업무 테이블 광범위 권한을 deployer 가 상속 → **privilege explosion**, hardening 범위 초과 |
| C | Neon 관리 계정이 transfer 수행 | 대안(A 불가 시) — 별도 위험/승인 보고 |

**A 절차(정확한 순서)**
1. 현재 6테이블 owner 인 **기존 app/migration-owner 연결**로 시작
2. `orchestration_owner` **NOLOGIN** 생성
3. **현재 owner 를 `orchestration_owner` 의 임시 member 로 추가**
4. 6테이블 소유권 → `orchestration_owner` 이전
5. 4개 trigger function 소유권 → `orchestration_owner` 이전
6. **현재 owner 의 `orchestration_owner` membership 즉시 REVOKE**
7. **membership 회수 확인**(잔여 0)
8. 기존 app role 의 신규 6테이블 **explicit privilege 전부 REVOKE**
9. 기존 app role 이 **owner/admin/deployer 의 member 가 아님** 확인
10. 이후 관리 경로는 **deployer → admin → owner** 로만 제한

**방향 혼동 금지**
- ✅ 허용: **기존 app owner 가 잠시 `orchestration_owner` 의 member** 가 됨(권한 범위가 하드닝 대상 안에 갇힘)
- ❌ 금지: **deployer 가 기존 app role 의 member** 가 됨(= B, privilege explosion)
- ❌ 금지: **`orchestration_owner` 가 기존 app role 의 member** 가 됨

## 12b. migration 원자성 & 단계 복구
Phase1(role 5개; deployer/writer/reader=LOGIN, credential 은 secret store 별도) → Phase2(REVOKE PUBLIC/app → 최소 GRANT → trigger fn/trigger → **ownership 이전(§12 A 절차)** → default privileges; **단일 tx**) → Phase3(별도 연결 capability + 기존 app write 실패 검증) → Phase4(adapter 미배선 종료·런타임 writer 전환). **role 생성+credential provisioning 은 한 tx 로 완전 rollback 안 될 수 있음** → Phase1(role) / Phase2(구조) 분리, 부분 실패 시 **DROP OWNED → DROP ROLE** 정리 절차(빈 role 이 아니면 DROP ROLE 은 2BP01 로 실패).

## 13. hardeningRunner fail-closed (보강)
exact sha256 allowlist **`71c83e66…`**(function privilege 정정 + 문구 정정으로 재고정) + host pin + 아래 하나라도 불일치 → 미적용/ROLLBACK:
role 부재(pre)/**5개**(post) · **trigger ≥15 & 전부 enabled**(aborted-trigger-disabled) · function 4 · **owner=orchestration_owner**(owner-mismatch) · **PUBLIC table 0**(public-privilege) · **비-orchestration grantee 0**(app-privilege) · **PUBLIC function EXECUTE 0**(function-public) · **function security assertion 10종**(function-fingerprint, §9b) · **신규 6테이블 행수 0**(rows-present) · already-applied. `startupTriggerSelfCheck` export(앱 부팅 시 15 trigger enabled 확인). 범용 additive 스캐너 불변.

### 9b. hardening security assertion (10종) — Neon capability 와 **별도 catalog**
정본: `server/migrations/hardening/functionSecurityAssertions.ts` · 평가기: `functionSecurityCheck.ts` · 관문: `scripts/neonCheck/securityGate.ts`.

> **세 catalog 를 섞지 않는다.** 보고는 항상 세 줄로 분리한다.
> - **Neon capabilities: 45** (`scripts/neonCheck/capabilities.ts`) — disposable Neon 에서 실측할 항목. **ID·순서·개수 불변**(order hash 로 고정).
> - **hardening security assertions: 10** (이 절) — actual Neon 실행 **전에 반드시 통과**해야 하는 관문. capability count 에 **포함하지 않는다**.
> - **preflight assertions: 10** (`scripts/neonCheck/guards.ts` §2) — production-like DB·host·run-id 안전 검문.
> assertion ID 는 `fnsec-` prefix 를 강제해 capability ID 와 충돌이 구조적으로 불가능하다.

| # | id | 검사 | 탐지 대상 |
|---|---|---|---|
| 1 | `fnsec-function-count` | `public` 의 `orch\_%` 함수 집합 = 명세 4개 | **미승인 함수 도입**·누락 |
| 2 | `fnsec-signatures` | identity arguments·반환형·언어 = 명세 | signature 변조 |
| 3 | `fnsec-owner` | 최종 소유자 = `orchestration_owner` | admin/deployer/app 소유 |
| 4 | `fnsec-security-mode` | `prosecdef=false` | **SECURITY DEFINER 무단 도입** |
| 5 | `fnsec-search-path` | `proconfig IS NULL` | search_path 고정/주입 |
| 6 | `fnsec-public-execute-zero` | PUBLIC EXECUTE = 0 | PUBLIC 재부여 |
| 7 | `fnsec-runtime-role-execute-zero` | app/writer/reader EXECUTE = 0 **및** ACL grantee ⊆ {owner} | 런타임 role 직접 부여 |
| 8 | `fnsec-default-acl-policy` | 전역(ns 0) FUNCTIONS default ACL 존재 & PUBLIC 미포함 | 미래 함수 보호 해제 |
| 9 | `fnsec-trigger-connection-count` | 함수별 trigger 연결 = 3/6/3/3 (합계 **15**) | trigger 분리·삭제 |
| 10 | `fnsec-schema-create-privilege-zero` | orchestration_* 의 public CREATE = 0 | **전략 A 임시 GRANT 미회수** |

**manifest 필드**(각 assertion): id · expected function signature · expected owner class · security mode · search_path policy · PUBLIC EXECUTE=false · app EXECUTE=false · writer EXECUTE=false · reader EXECUTE=false · expected trigger connection count · authoritative evidence profile(`embedded-direct`).

**관문 동작**: `neonOrchestrationCapabilityCheck` 의 execute 경로는 **DB 연결을 만들기 전에** 이 10종을 평가하고, 하나라도 실패하면 exit 4 로 중단한다(**Neon 접속 0 · DDL 0**). 평가는 격리 PGlite 에 hardening SQL 을 적용해 수행하며, 출력 prefix 는 `[hardening-assertions]` 로 capability 출력과 분리된다.

> **의도된 예외**: `orchestration_deployer`/`admin` 은 owner membership 을 통해 EXECUTE 를 **상속**한다(회수 불가·설계상 break-glass). 그래서 7번은 app/reader/writer 만 강제한다. SQL 의 `REVOKE … FROM orchestration_deployer` 는 **직접 grant** 만 제거하는 선언적 문장이다.

### 9c. 함수 생성 역할 정책 — 정상 migration 경로 (7단계)
```
1. orchestration_deployer 로 LOGIN
2. SET ROLE orchestration_admin
3. SET ROLE orchestration_owner            (필요 시)
4. 함수 생성 — 최종 owner 는 **항상** orchestration_owner
5. exact-signature REVOKE (PUBLIC, reader, writer)
6. security assertion 평가 (§9b 10종)
7. RESET ROLE
```
**원칙**
- deployer 가 평상시 함수 owner 가 되지 않는다 · admin 이 함수 owner 가 되지 않는다 · **최종 owner 는 항상 `orchestration_owner`**.
- app/writer/reader 는 `CREATE FUNCTION` 불가(PG17 실측 **42501**). admin/deployer 도 평상시 public schema CREATE 권한 **0**.
- 함수 생성 직후 **exact-signature REVOKE 필수**(default ACL 에 의존하지 않는다).
- 새 함수를 `FUNCTION_SPECS` 에 등록하지 않으면 `fnsec-function-count` 가 **배포를 막는다**(의도된 fail-closed).
- SQL 변경 시 checksum 재고정 → runner allowlist 동기화 → PGlite 스위트 + embedded PG17 e2e 통과 후에만 apply Gate 로 넘긴다.

### 9d. default ACL 적용 role 범위 — 재평가 결과
| role | 지위 | 근거 |
|---|---|---|
| `orchestration_owner` | **authoritative policy** | owner-only creation 정책의 짝. 정상 경로로 만들어지는 모든 함수를 덮는다. |
| `orchestration_admin` · `orchestration_deployer` | **defense-in-depth 유지** | 아래 실측 근거 |

**유지 근거(PG 17.10 실측)**: deployer 의 전역 default ACL 을 해제한 뒤 deployer 로 함수를 만들면 `has_function_privilege('public',…,'EXECUTE')=true` 로 **누수가 실제 재현**된다. 즉 이 두 항목은 장식이 아니라 동작하는 방어선이다. 미래 migration 이 실수로 `SET ROLE` 을 빠뜨리거나 deployer 에게 CREATE 를 부여하는 경우를 덮는다.

> ⚠️ **명시**: admin/deployer 에 default ACL 을 두는 것은 **그 role 에 함수 생성 권한을 허용한다는 뜻이 아니다.** 세 role 모두 public schema CREATE 권한이 0 이며, 정책상 최종 owner 는 언제나 `orchestration_owner` 다.

### 9e. public schema CREATE 전략 — **A 채택**(B 는 후속 개선)
하드닝이 `REVOKE CREATE ON SCHEMA public FROM PUBLIC` 을 수행하므로 owner 조차 함수 생성 전 명시적 CREATE 권한이 필요하다.

| | A. public schema 유지 (**현재 적용 후보**) | B. orchestration 전용 internal schema (**후속**) |
|---|---|---|
| 절차 | 단일 tx 안 임시 `GRANT CREATE` → 생성 → exact REVOKE → **CREATE 즉시 REVOKE** → tx 종료 전 privilege 0 확인 | owner 만 CREATE 인 전용 schema, PUBLIC CREATE/USAGE 0, trigger function 만 이전(테이블은 기존 schema 유지), schema-qualified 참조 |
| 장점 | 스키마 이동 없음 · 0004 의미 무변경 · 즉시 적용 가능 | 임시 권한 자체가 불필요 · 노출면 구조적 축소 |
| 단점 | 매 migration 마다 임시 권한 구간 존재 | search_path/참조 경로 변경 → 별도 검증 Gate 필요 |

**A 의 안전성 — PG 17.10 실측 14/14 통과**
- 커밋 **전** CREATE privilege 0 · 커밋 **후** 0
- **rollback 후 0**(`GRANT` 은 트랜잭션 대상이라 되돌려진다)
- **실패 주입**(문법오류 함수 + 없는 테이블 trigger) → rollback 후 CREATE 0 · 잔여 함수 0
- 회수 실패 시 `fnsec-schema-create-privilege-zero` 가 **fail-closed** 로 잡는다

→ **판정: 현재 적용 후보는 A. B 는 후속 개선 항목**(이번 Gate 에서 구현하지 않음).

## 14. 검증 결과
**상태 표현(정본)**
| 항목 | 상태 |
|---|---|
| Neon capability implementation | **complete, 45** |
| function security assertions | **complete, 10** |
| preflight assertions | complete (guards §2) |
| embedded PG17 verification | **complete** |
| actual Neon direct / pooled | **not-run** |
| `neon-full` | **unverified** |

- **PGlite(PostgreSQL 18.x · 비정본)**: `orchestrationHardening.test.ts` 17/17 + `orchestrationFunctionPrivilege.test.ts` **34/34**(catalog 경계 6 + 정상 상태 5 + 역할 정책 4 + 전략 A 3 + 실패 주입 11 + 게이트 연동 5). 전체 **test:knop 267/267 · tsc 0**.
- **격리 PG17(embedded 17.10) — 정본**
  - hardening e2e 24/24 (5 role · owner 이전 · PUBLIC 0 · SET ROLE 경계 · OA001–OA004 · DISABLE TRIGGER runbook)
  - function privilege e2e 20/20 (미래 함수 `public=false` · deployer 생성분도 보호 · owner 기본 CREATE 차단 42501 · trigger 발화 OA001 · writer 직접 호출 42501 · 임시 멤버십 잔여 0)
  - **security assertion 10/10 통과 + 실패 주입 4종 전부 탐지**(PUBLIC 재부여 · default ACL 해제 · 임시 CREATE 미회수 · trigger 제거)
  - **전략 A 14/14**(커밋 전/후·rollback·실패 주입 후 CREATE privilege 0, deployer default ACL 해제 시 누수 재현)
- **Phase 2 capability 회귀 없음**: catalog **45**, embedded-direct applicable **40** / pass 25 / expected-denial 15 / **fail 0** / authoritative 40, pooled-mock 5 passed-clean, 잔여 object·role·membership·disabled-trigger **0**, `neon-full` **unverified**(actual Neon evidence 0, missing 45).

## 15. shadow mismatch (정정 표현)
stored 4 · current eligible 4 · observation_hash match 0 · source_record_ref match 0 · field drift 0 · provenance mismatch 0 · most likely = eligible population replacement · individual transition = **unverified**. 자동 write/backfill/delete 금지. migration/hardening 무관. [문서](orchestration-shadow-mismatch-investigation.md).

## 16. 다음 Gate 제안
1. **[선행] Neon disposable branch capability Gate**: disposable Neon branch(또는 동등)에서 pooled/direct SET ROLE·session 상태·credential rotation 후 pool·prepared statement↔role·role cleanup(DROP/REASSIGN OWNED) **실측**. embedded 미검증 항목 확정.
2. **orchestration hardening production apply Gate**: Neon role 프로비저닝(reader/writer/deployer LOGIN credential=secret store) → deployer 에 현재 owner 멤버십+owner 멤버십 부여 → hardeningRunner inspect/dry-run(host-pin·sha·post-verify) → **별도 승인** apply(단일 tx, 5role·owner이전·PUBLIC0·app0·fn0·enabled 검증) → Phase3 별도연결 검증 → **런타임 writer credential 전환 + startup self-check** → 이후 adapter Gate.
3. 후속: **tamper-evidence(hash chain) Gate**.

## 17. 유지 금지(이번 Gate)
운영 role/ownership/GRANT/REVOKE/trigger/apply/credential·adapter·connection pool runtime·신규 row·외부 AI·calls·package/lock·main merge/push·feature branch push **전부 미수행**.
