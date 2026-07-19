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
- **default privileges**: `ALTER DEFAULT PRIVILEGES FOR ROLE orchestration_owner IN SCHEMA public REVOKE ALL ON {TABLES,SEQUENCES,FUNCTIONS} FROM PUBLIC` — **실행 role = deployer→SET ROLE admin(=owner 멤버)** 또는 owner. 미래 객체 PUBLIC 누수 차단.

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

## 12. migration 원자성 & 단계 복구
Phase1(role 5개; deployer/writer/reader=LOGIN, credential 은 secret store 별도) → Phase2(REVOKE PUBLIC/app → 최소 GRANT → trigger fn/trigger → **ownership 이전**(전제: 실행 role 이 현재 owner+owner 멤버; Gate 가 GRANT/REVOKE 로 처리) → default privileges; **단일 tx**) → Phase3(별도 연결 capability + 기존 app write 실패 검증) → Phase4(adapter 미배선 종료·런타임 writer 전환). **role 생성+credential provisioning 은 한 tx 로 완전 rollback 안 될 수 있음** → Phase1(role) / Phase2(구조) 분리, 부분 실패 시 **DROP OWNED → DROP ROLE** 정리 절차.

## 13. hardeningRunner fail-closed (보강)
exact sha256 allowlist `c6fe354e…` + host pin + 아래 하나라도 불일치 → 미적용/ROLLBACK:
role 부재(pre)/**5개**(post) · **trigger ≥15 & 전부 enabled**(aborted-trigger-disabled) · function 4 · **owner=orchestration_owner**(owner-mismatch) · **PUBLIC table 0**(public-privilege) · **비-orchestration grantee 0**(app-privilege) · **PUBLIC function EXECUTE 0**(function-public) · **신규 6테이블 행수 0**(rows-present) · already-applied. `startupTriggerSelfCheck` export(앱 부팅 시 15 trigger enabled 확인). 범용 additive 스캐너 불변.

## 14. 검증 결과
- **PGlite `tests/knop/orchestrationHardening.test.ts` 17/17**(구조·권한 4 + enforcement 6 + startup self-check 1 + 러너 6). 전체 **test:knop 207/207 · tsc 0**.
- **격리 PG17(embedded 17.10) e2e 24/24**: 5 role · owner 이전 · PUBLIC table/function-EXECUTE 0 · 비-orch grantee 0 · **deployer login→SET ROLE admin→owner** · **writer/reader/app real-login SET ROLE admin/owner 거부** · app write 실패 · writer INSERT ok·UPDATE 거부·jobs 격리·**session_replication_role 42501**·**직접 function call 거부** · OA001–OA004 · **writer DISABLE TRIGGER 거부·owner 가능·긴급 종료 후 15 trigger enabled·재작동**.

## 15. shadow mismatch (정정 표현)
stored 4 · current eligible 4 · observation_hash match 0 · source_record_ref match 0 · field drift 0 · provenance mismatch 0 · most likely = eligible population replacement · individual transition = **unverified**. 자동 write/backfill/delete 금지. migration/hardening 무관. [문서](orchestration-shadow-mismatch-investigation.md).

## 16. 다음 Gate 제안
1. **[선행] Neon disposable branch capability Gate**: disposable Neon branch(또는 동등)에서 pooled/direct SET ROLE·session 상태·credential rotation 후 pool·prepared statement↔role·role cleanup(DROP/REASSIGN OWNED) **실측**. embedded 미검증 항목 확정.
2. **orchestration hardening production apply Gate**: Neon role 프로비저닝(reader/writer/deployer LOGIN credential=secret store) → deployer 에 현재 owner 멤버십+owner 멤버십 부여 → hardeningRunner inspect/dry-run(host-pin·sha·post-verify) → **별도 승인** apply(단일 tx, 5role·owner이전·PUBLIC0·app0·fn0·enabled 검증) → Phase3 별도연결 검증 → **런타임 writer credential 전환 + startup self-check** → 이후 adapter Gate.
3. 후속: **tamper-evidence(hash chain) Gate**.

## 17. 유지 금지(이번 Gate)
운영 role/ownership/GRANT/REVOKE/trigger/apply/credential·adapter·connection pool runtime·신규 row·외부 AI·calls·package/lock·main merge/push·feature branch push **전부 미수행**.
