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

**적용한 해결(3층)**
1. **기존 4함수** — 정확한 signature 기준 명시 `REVOKE ALL ON FUNCTION …() FROM PUBLIC` + reader/writer/deployer 선언적 회수. **소유권 이전 뒤 재선언**(멱등). PG 17.10 실측상 `ALTER FUNCTION … OWNER TO` 는 ACL 을 `{old=X/old}`→`{new=X/new}` 로 재작성하며 PUBLIC 회수를 유지하지만, 엔진 동작에 의존하지 않는다.
2. **미래 함수** — **전역 형식** default privileges 를 **owner·admin·deployer 3 role 전부**에 적용. `FOR ROLE` 목록 밖 role 이 만든 함수는 보호되지 않으므로 3개 모두 필요(실측 확인).
3. **fail-closed fingerprint** — 러너가 9 hard stop 으로 상시 검사(§9b). 하나라도 위반 시 `aborted-function-fingerprint`.

**추가 방어층(실측 발견)**: 하드닝은 `REVOKE CREATE ON SCHEMA public FROM PUBLIC` 을 수행하고 owner 에게 CREATE 를 부여하지 않으므로, **owner 조차 기본 상태에서는 public 스키마에 함수를 만들 수 없다**(42501). 미래 함수 생성은 반드시 명시적 `GRANT CREATE ON SCHEMA public TO orchestration_owner` 선행을 요구한다.

**잔여 위험(명시)**: 기존 app/migration owner role(이름을 정적 SQL 이 알 수 없음)이 만드는 함수는 이 default ACL 로 보호되지 않는다. → §9c 미래 migration 규칙과 fingerprint 의 `fn-count`(미승인 `orch_*` 함수 탐지)로 보완한다.

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
exact sha256 allowlist **`c5649f3f…`**(function privilege 정정으로 재고정) + host pin + 아래 하나라도 불일치 → 미적용/ROLLBACK:
role 부재(pre)/**5개**(post) · **trigger ≥15 & 전부 enabled**(aborted-trigger-disabled) · function 4 · **owner=orchestration_owner**(owner-mismatch) · **PUBLIC table 0**(public-privilege) · **비-orchestration grantee 0**(app-privilege) · **PUBLIC function EXECUTE 0**(function-public) · **function fingerprint 9 hard stop**(function-fingerprint, §9b) · **신규 6테이블 행수 0**(rows-present) · already-applied. `startupTriggerSelfCheck` export(앱 부팅 시 15 trigger enabled 확인). 범용 additive 스캐너 불변.

### 9b. function fingerprint — 9 hard stop
`verifyFunctionFingerprint()` 가 반환하는 위반 목록. 하나라도 있으면 `aborted-function-fingerprint`.

| # | id | 검사 | 탐지 대상 |
|---|---|---|---|
| 1 | `fn-count` | `public` 의 `orch\_%` 함수 집합 = 기대 4개 | **미승인 함수 도입**·누락 |
| 2 | `fn-signature` | identity arguments = `""`(무인자) | signature 변조 |
| 3 | `fn-owner` | 소유자 = `orchestration_owner` | 소유권 탈취 |
| 4 | `fn-shape` | 반환형 `trigger` + 언어 `plpgsql` | 본문 성격 변경 |
| 5 | `fn-secdef` | `prosecdef=false` | **SECURITY DEFINER 무단 도입** |
| 6 | `fn-searchpath` | `proconfig IS NULL` | search_path 고정/주입 |
| 7 | `fn-public-execute` | PUBLIC EXECUTE = 0 | PUBLIC 재부여 |
| 8 | `fn-role-execute` | reader/writer EXECUTE = 0 **및** ACL grantee ⊆ {owner} | 런타임 role 직접 부여 |
| 9 | `fn-default-acl` | 전역(namespace 0) FUNCTIONS default ACL 이 3 role 전부 존재 & PUBLIC 미포함 | **미래 함수 보호 해제** |

> **의도된 예외**: `orchestration_deployer`/`admin` 은 owner membership 을 통해 EXECUTE 를 **상속**한다(회수 불가·설계상 break-glass 경로). 그래서 8번은 reader/writer 만 강제한다. SQL 의 `REVOKE … FROM orchestration_deployer` 는 **직접 grant** 만 제거하는 선언적 문장이다.

### 9c. 미래 migration 규칙 (orchestration 함수를 추가·변경할 때 — 6단계)
1. **생성 주체를 `orchestration_owner` 로 고정**: `SET ROLE orchestration_owner` 로 실행한다(deployer→admin→owner). app/migration owner 로 만들면 default ACL 보호를 받지 못한다.
2. **CREATE 권한 선행 부여**: `GRANT CREATE ON SCHEMA public TO orchestration_owner` (하드닝이 PUBLIC 의 CREATE 를 회수했으므로 필수) — 사용 후 회수 권장.
3. **생성 직후 명시 REVOKE**: `REVOKE ALL ON FUNCTION <정확한 signature> FROM PUBLIC, orchestration_reader, orchestration_writer` — default ACL 에 의존하지 않는 이중 방어.
4. **보안 모드 유지**: `SECURITY INVOKER`(기본) · `SET search_path` 미사용. DEFINER 가 꼭 필요하면 별도 승인 Gate 로 분리하고 `proconfig` 를 명시 고정한다.
5. **fingerprint 갱신**: `HARDENINGS[].functionFingerprint.names` 에 새 함수를 추가한다. 추가하지 않으면 `fn-count` 가 **fail-closed 로 배포를 막는다**(의도된 동작).
6. **checksum 재고정 + 격리 검증**: SQL 변경 시 `expectedSha256` 재계산, PGlite 스위트 + embedded PG17 e2e 를 모두 통과시킨 뒤에만 apply Gate 로 넘긴다.

## 14. 검증 결과
- **PGlite `tests/knop/orchestrationHardening.test.ts` 17/17** + **`tests/knop/orchestrationFunctionPrivilege.test.ts` 21/21**(실제 상태 6 + 9 hard stop 주입 11 + 러너 통합 4). 전체 **test:knop 255/255 · tsc 0**.
  - ⚠️ PGlite = PostgreSQL **18.3**. 운영(Neon PG 17.x)과 메이저가 다르므로 **정본 아님**.
- **격리 PG17(embedded 17.10) e2e 24/24**: 5 role · owner 이전 · PUBLIC table/function-EXECUTE 0 · 비-orch grantee 0 · **deployer login→SET ROLE admin→owner** · **writer/reader/app real-login SET ROLE admin/owner 거부** · app write 실패 · writer INSERT ok·UPDATE 거부·jobs 격리·**session_replication_role 42501**·**직접 function call 거부** · OA001–OA004 · **writer DISABLE TRIGGER 거부·owner 가능·긴급 종료 후 15 trigger enabled·재작동**.
- **격리 PG17(embedded 17.10) function privilege e2e 20/20**(정본): 함수 4 · owner · **PUBLIC EXECUTE 0** · ACL `{orchestration_owner=X/orchestration_owner}` · INVOKER · proconfig null · shape/signature · reader/writer EXECUTE 0 · deployer/admin 상속 4 · **전역 default ACL 3 role & PUBLIC 미포함** · **owner 기본 CREATE 차단(42501)** · ★**미래 함수 public=false** · ★**deployer 생성 미래 함수도 public=false** · trigger 발화 OA001 · writer 직접 호출 42501 · **2g 임시 멤버십 잔여 0**.
- **embedded capability 하네스**(정정 반영): catalog **46** · embedded-direct applicable **41** / pass 26 / expected-denial 15 / **fail 0** / authoritative 41 · 잔여 object·role·membership·disabled-trigger **0** · pooled-mock 5 passed-clean · **neon-full = unverified**(actual Neon evidence 0, missing 46).

## 15. shadow mismatch (정정 표현)
stored 4 · current eligible 4 · observation_hash match 0 · source_record_ref match 0 · field drift 0 · provenance mismatch 0 · most likely = eligible population replacement · individual transition = **unverified**. 자동 write/backfill/delete 금지. migration/hardening 무관. [문서](orchestration-shadow-mismatch-investigation.md).

## 16. 다음 Gate 제안
1. **[선행] Neon disposable branch capability Gate**: disposable Neon branch(또는 동등)에서 pooled/direct SET ROLE·session 상태·credential rotation 후 pool·prepared statement↔role·role cleanup(DROP/REASSIGN OWNED) **실측**. embedded 미검증 항목 확정.
2. **orchestration hardening production apply Gate**: Neon role 프로비저닝(reader/writer/deployer LOGIN credential=secret store) → deployer 에 현재 owner 멤버십+owner 멤버십 부여 → hardeningRunner inspect/dry-run(host-pin·sha·post-verify) → **별도 승인** apply(단일 tx, 5role·owner이전·PUBLIC0·app0·fn0·enabled 검증) → Phase3 별도연결 검증 → **런타임 writer credential 전환 + startup self-check** → 이후 adapter Gate.
3. 후속: **tamper-evidence(hash chain) Gate**.

## 17. 유지 금지(이번 Gate)
운영 role/ownership/GRANT/REVOKE/trigger/apply/credential·adapter·connection pool runtime·신규 row·외부 AI·calls·package/lock·main merge/push·feature branch push **전부 미수행**.
