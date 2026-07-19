# orchestration DB immutability & append-only hardening (설계, 조건부 승인 개정판)

> Gate "orchestration database immutability and append-only hardening". **설계·migration preparation·격리 PG17 검증만.**
> **운영 apply 0 · 운영 role/ownership/GRANT/REVOKE/trigger 0 · 신규 orchestration row 0 · adapter/runtime wiring 0 · 외부 AI 0 · calls 0 · package/lock 0 · main merge/push 0 · feature branch push 0.**
> 산출물: 이 문서 · draft `migrations/hardening/0001_orchestration_immutability_roles.sql` · `server/migrations/hardening/hardeningRunner.ts`(+tables.ts) · `tests/knop/orchestrationHardening.test.ts` · [shadow mismatch 조사](orchestration-shadow-mismatch-investigation.md). **기존 0004 migration 무수정.**

## 1. 기준선 (read-only)
main=origin=`868ce2b` · 0004 already-applied · base 39 · FK 16 · 6테이블 0행 · jobs/exec 0 · shadow 4 · wiring 0.
**운영 DB 권한 조사**: app 접속 role = **6테이블 OWNER · rolsuper=false · rolcreaterole=true · rolbypassrls=true · 6테이블 전 권한**. 비-시스템 role 4 · login role 3.

## 2. 격리 PG17 로 검증한 provider(Neon 동등) capability
| 능력 | 결과 | 설계 반영 |
|---|---|---|
| CREATE ROLE NOLOGIN / LOGIN(pw/nopw) | **OK** | owner/admin=NOLOGIN, writer/reader=LOGIN |
| GRANT/REVOKE role membership | **OK** | admin ← owner 멤버십 |
| **ALTER TABLE / FUNCTION OWNER TO NOLOGIN** | **OK** | **owner model A(소유권 이전) 채택** |
| SET ROLE / RESET ROLE | OK | admin→owner 긴급 |
| 컬럼 UPDATE grant | OK | business-state 제한 UPDATE |
| **identity INSERT — 시퀀스 USAGE grant** | **불요(OK without)** | audit_log seq 에 sequence grant 안 함 |
| **trigger 발화 — function EXECUTE grant** | **불요(OK without)** | writer 에 EXECUTE grant 안 함 |
| REVOKE ALL FROM PUBLIC | OK(PUBLIC=0) | 6테이블 PUBLIC 제거 |
| **session_replication_role=replica** | **SUPERUSER 전용(비-superuser 42501)** | **긴급 우회는 replica 아님** → owner DISABLE TRIGGER |
| 별도 login connection(writer/reader) | OK(컬럼 권한 강제) | **역할별 credential 우선(SET ROLE 아님)** |
| DROP ROLE(grants 보유) | **거부 2BP01** | cleanup=DROP OWNED/REASSIGN OWNED 선행 |
> 실제 Neon **pooler(PgBouncer transaction mode)** 에서의 SET ROLE/session 상태는 embedded PG 로 재현 불가 → **unverified**, 완화책=역할별 **독립 credential/connection string**(SET ROLE 회피)로 설계(§6).

## 3. 연결 경계 분리 (전체 DATABASE_URL 교체 금지)
| 연결 | 용도 | role |
|---|---|---|
| **existing application** | 기존 CRM·상담·보고서 업무 | 기존 app role(변경 최소) |
| **orchestration reader** | 신규 6테이블 SELECT 전용 | orchestration_reader |
| **orchestration writer** | 6테이블 INSERT + 승인 컬럼 UPDATE 전용 | orchestration_writer |
| **orchestration migration/admin** | migration·승인된 emergency | orchestration_admin(→owner) |
- `job_artifacts`·`orchestration_audit_log` 등 **쓰기 코드는 반드시 전용 writer pool/client** 사용. 기존 일반 app DB client 를 orchestration writer 로 쓰는 것은 **fail-closed 로 차단**(startup self-check: writer pool 로 기존 business table 접근 실패 & 일반 app pool 로 orchestration write 실패를 확인, 실패 시 부팅 중단).

## 4. role 모델 (개정 — owner model A)
| role | LOGIN | 권한 | 용도 |
|---|---|---|---|
| `orchestration_owner` | **NOLOGIN** | 6테이블·trigger function **소유** | 애플리케이션 사용 금지 |
| `orchestration_admin` | NOLOGIN | owner 멤버십(SET ROLE owner) | migration/emergency 전용, 평소 앱 접근 금지 |
| `orchestration_writer` | **LOGIN**(비-owner) | SELECT+INSERT(6) + 컬럼 UPDATE(business 3) | 런타임 writer |
| `orchestration_reader` | **LOGIN**(비-owner) | SELECT(6) | 조회 전용 |

**owner model 비교**: **A. NOLOGIN owner 로 소유권 이전 ← 채택**(암묵권한을 앱 role 에서 제거, 격리 PG17 검증) · B. 기존 owner 유지+trigger 만(우회 경로 잔존 — writer 는 막아도 앱 owner 는 여전히 owner) · C. 별도 schema owner(과함, 기존 스키마 이동 비용). **A 권고.** LOGIN credential(비밀번호)은 SQL 밖 secret store.

## 5. 기존 app owner credential 위험 (운영 적용 계획에 포함)
- 기존 app role 이 6테이블 owner 로 남으면 hardening 불완전 → **ALTER ... OWNER TO orchestration_owner** 로 이전 시 **기존 owner 의 암묵권한 소멸**(격리 PG17: 이전 후 비-owner app-sim 은 UPDATE/DELETE 거부 검증).
- 계획: ①기존 app role 의 6테이블 직접 privilege 제거 가능 여부 확인 → ②ownership 이전 → ③**기존 app connection 으로 6테이블 UPDATE/DELETE 실패 검증** → ④**기존 app 기능 회귀 없음 검증**(6테이블은 기존 앱과 분리) → ⑤orchestration 코드는 기존 app DB client 사용 금지.

## 6. connection-pool 설계
- orchestration **reader/writer 각각 독립 pool**(기존 app pool 과 분리). min/max 작게(예 writer 2–5, reader 2–5) — 신규 워크로드 소량.
- **pooler transaction mode 에서 SET ROLE 사용 금지**(세션 고정 안 됨) → **역할별 독립 credential** 사용(런타임 SET ROLE 지양, §2 unverified 완화).
- credential rotation 시 **pool 재시작**. **잘못된 pool 사용 감지**=startup self-check(writer pool→business table 접근 실패 / app pool→orchestration write 실패). credential 식별자는 **출력 안 함**, role capability(권한 boolean)만 확인.

## 7. privilege matrix (보강 — GRANT ALL 미사용, 명시 열거)
| 대상 | reader | writer | admin(via owner) | 비고 |
|---|---|---|---|---|
| schema public USAGE | ✓ | ✓ | (owner) | CREATE 는 미부여(REVOKE CREATE FROM PUBLIC) |
| job_artifacts | SELECT | SELECT,INSERT | ALL(owner) | immutable |
| automated_reviews / orchestration_audit_log | SELECT | SELECT,INSERT | ALL(owner) | append-only |
| job_dependencies | SELECT | SELECT,INSERT,UPDATE(resolution_status,resolved_execution_id,resolved_artifact_id,resolved_at) | ALL(owner) | business |
| human_approvals | SELECT | SELECT,INSERT,UPDATE(approval_status,decided_at,decided_by_protected_ref,decision_reason_code,decision_summary,updated_at) | ALL(owner) | business |
| emergency_stops | SELECT | SELECT,INSERT,UPDATE(active,released_at,released_by_protected_ref,reason_summary,updated_at) | ALL(owner) | business |
| sequence(audit seq) | — | **불요**(identity) | (owner) | grant 없음(검증) |
| trigger function EXECUTE | — | **불요**(trigger 발화) | (owner) | grant 없음(검증) |
| REFERENCES / TRUNCATE / TRIGGER(enable/disable) | — | — | (owner) | writer/reader 없음 |
| default privileges | — | — | owner IN schema REVOKE ALL ON TABLES FROM PUBLIC | 미래 테이블 누수 방지 |
| PUBLIC | **0** | **0** | — | REVOKE 후 0(검증) |
| database CONNECT | 배포별 부여 | 배포별 부여 | — | DB명 하드코딩 안 함(프로비저닝) |
- **SQLSTATE**: OA001(immutable/append-only UPDATE·DELETE) · OA002(DELETE) · OA003(식별/created_at 변경) · OA004(TRUNCATE).

## 8. 업무 상태 vs 감사 원장 분리
- 완전 immutable/append-only: `job_artifacts`·`automated_reviews`·`orchestration_audit_log`.
- business-state(제한 UPDATE): `human_approvals`·`emergency_stops`·`job_dependencies`(식별·created_at 불변 OA003, DELETE 금지 OA002). 상태 전이는 audit_log 에 **불변 이벤트**로도 남김(current projection + immutable event log). **모든 UPDATE 를 무조건 금지하지 않음.**

## 9. append-only vs cryptographic tamper-evidence — 분리 유지
이번=**단순 append-only**(REVOKE+trigger+seq identity). **hash chain(previous/event_hash)=별도 tamper-evidence Gate**(동시 INSERT 직렬화·rollback hash 소비·위협모델 차이). 혼동 금지.

## 10. session_replication_role 제한 & 긴급 절차 (개정)
- **격리 테스트에서 trigger bypass 검증: 허용**(superuser 세션).
- **운영 정상 정정: 금지** — 정정은 **새 correction 이벤트 추가**(과거 이벤트 덮어쓰기 금지).
- **운영 emergency 최후 수단: 이중 승인 필요.** 단 **replica 는 superuser 전용이라 런타임/admin(비-superuser)에겐 불가**(검증). → 긴급 우회 = **owner(admin→SET ROLE owner)의 `ALTER TABLE DISABLE TRIGGER`**(brief·global window·감사·이중승인) 후 재 ENABLE. writer 는 DISABLE TRIGGER 불가(검증). 또는 Neon superuser 지원.
- **runtime credential 의 session_replication_role 권한 = 0**(writer 42501 검증).

## 11. trigger/function 구조 검토 (약화 금지)
| 방식 | 함수 수 | 유지보수 | 보안 | 결론 |
|---|---|---|---|---|
| **공용 function + 테이블별 trigger(현행)** | **4** | DRY·정책 유형별 명확 | 강 | **채택** |
| 테이블별 function + trigger | 15+ | 중복 | 동일 | ✗(중복) |
| privilege-only(무 trigger) | 0 | 단순 | **약**(owner/특권 우회) | ✗ |
| immutable/business 분리(현행에 내포) | — | — | — | 이미 반영 |
현행 **4 함수(orch_deny_write/deny_delete/guard_business_update/deny_truncate) + 15 trigger** 유지. 보안 낮추는 단순화 금지.

## 12. migration 원자성 & 단계 복구
| Phase | 내용 | 실패 복구 |
|---|---|---|
| 1 | owner/admin/reader/writer role 준비(NOLOGIN owner 확인). credential 은 secret store 별도. | role 생성 부분 실패 → 생성된 role DROP(단, 소유 객체 없을 때만; DROP OWNED 선행) |
| 2 | REVOKE(PUBLIC/비소유자) → 최소 GRANT → trigger fn/trigger → **ownership 이전** → default privileges. **단일 tx**(runner) → 실패 시 ROLLBACK. | tx ROLLBACK 로 원자. |
| 3 | **별도 연결**로 reader/writer/admin capability + 기존 app connection 의 orchestration write 실패 검증. | 검증 실패 → 적용 롤백/중단, 원인 조사. |
| 4 | adapter 배선 없이 종료. 런타임 접속을 writer credential 로 전환. | — |
- **주의**: role 생성 + credential provisioning 은 **한 tx 로 완전 rollback 안 될 수 있음**(credential 은 SQL 밖) → Phase 1(role)과 Phase 2(구조)를 분리, Phase 1 부분 실패 시 수동 정리 절차(DROP OWNED → DROP ROLE) 문서화.

## 13. hardeningRunner fail-closed 조건 (보강)
전용 러너(키워드 스캔 대신 **exact sha256 allowlist** `adde6010…`) + 아래 **하나라도 불일치 → 미적용/ROLLBACK**:
- sha allowlist · host pin(호출부) · 신규 role 부재(pre)/4개 존재(post) · trigger ≥15 · function 4 · **6테이블 소유자=orchestration_owner(owner-mismatch fail-closed)** · **PUBLIC 권한 0(public-privilege fail-closed)** · **신규 6테이블 행수 0(rows-present fail-closed)** · already-applied 판정(재실행 DDL 0). 범용 additive 스캐너는 **불변**.

## 14. 검증 결과
- **PGlite `tests/knop/orchestrationHardening.test.ts` 18/18** (enforcement 13 + 러너 5, owner/PUBLIC/app-sim/writer-격리/replica-제한/owner-DISABLE-TRIGGER/owner-mismatch/rows-present 포함). 전체 **test:knop 208/208** · **tsc 0**.
- **격리 PG17(embedded 17.10) e2e 23/23**: role 4 · **6테이블 owner=orchestration_owner** · PUBLIC 0 · reader/writer/admin · **writer↔jobs 격리** · **writer session_replication_role 42501** · OA001–OA004 · **real login connection(writer/reader) 컬럼 강제** · **owner DISABLE TRIGGER 긴급(writer 불가)+재작동**.

## 15. shadow mismatch (정정 표현)
[별도 문서](orchestration-shadow-mismatch-investigation.md): stored 4 · current eligible 4 · **observation_hash match 0 · source_record_ref match 0 · field drift 0 · provenance mismatch 0** · most likely = **eligible population replacement** · individual record transition reason = **unverified**(원문·식별자 비열람). 자동 write/backfill/delete 금지 유지. migration/hardening 무관.

## 16. 다음 production hardening apply Gate 제안
**Gate: orchestration hardening production apply**
1. Neon 에 owner/admin/reader/writer 프로비저닝(reader/writer LOGIN credential=secret store, DB CONNECT 부여). role 은 아직 운영 미생성(이번 Gate).
2. migration 계정에 GRANT orchestration_owner(ALTER OWNER 전제) → hardeningRunner **inspect/dry-run**(host-pin·sha·post-verify).
3. **별도 승인** 후 apply(단일 tx) → owner-이전/role/trigger/PUBLIC-0/rows-0 post-verify.
4. Phase 3 별도 연결 검증(기존 app connection orchestration write 실패, reader/writer capability).
5. **런타임 DB 접속을 writer credential 로 전환**(전체 DATABASE_URL 교체 아님·전용 pool) + startup self-check.
6. 이후에야 adapter/writer 배선 Gate.
- 후속: **tamper-evidence(hash chain) Gate** · Neon pooler(SET ROLE/transaction mode) 실검증 · role credential rotation 절차.

## 17. 유지 금지(이번 Gate)
운영 role/ownership/GRANT/REVOKE/trigger/migration apply/credential 생성·adapter·runtime wiring·신규 row·외부 AI·calls·package/lock·main merge/push·feature branch push **전부 미수행**. hardening 완료 전 어떤 writer 도 신규 6테이블에 운영 write 하지 않음.
