# orchestration DB immutability & append-only hardening (설계)

> Gate "orchestration database immutability and append-only hardening". **설계·migration preparation·격리 PG17 검증만.**
> **운영 DB apply 0 · 운영 role 변경 0 · 운영 GRANT/REVOKE 0 · 운영 trigger 0 · 신규 orchestration row 0 · adapter/runtime wiring 0 · 외부 AI 0 · package/lock 0 · main merge/push 0.**
> 산출물: 이 문서 · [privilege matrix](#4-privilege-matrix) · 초안 `migrations/hardening/0001_orchestration_immutability_roles.sql` · 전용 러너 `server/migrations/hardening/hardeningRunner.ts` · 테스트 `tests/knop/orchestrationHardening.test.ts` · [shadow mismatch 조사](orchestration-shadow-mismatch-investigation.md).

## 1. 기준선 (read-only, 2026-07-20)
main=origin=`868ce2b` · 0004 **already-applied** · base **39** · FK **16** · 신규 6테이블 존재·**전부 0행** · jobs 0 · job_executions 0 · shadow 4 · runtime wiring 0.
**현재 DB 권한 구조(운영 조사)**: app 접속 role = **테이블 OWNER · rolsuper=false · rolcreaterole=true · rolbypassrls=true**, 6테이블에 **SELECT/INSERT/UPDATE/DELETE/TRUNCATE 전 권한**. 비-시스템 role 4, login role 3.
**provider(Neon) 능력**: `rolcreaterole=true` → **CREATE ROLE / GRANT / REVOKE 가능**. LOGIN credential(비밀번호)은 마이그레이션에 넣지 않고 Neon console/API·secret store 로 별도 프로비저닝.

## 2. 우선 설계 원칙 (확정)
- **역할 분리 + REVOKE = 1차 방어선**, **trigger = 2차 방어선**(역할 우회·admin 실수 대비). 애플리케이션 계약만으로 불변성 보장하지 않음.
- **핵심 제약(운영 조사로 확정)**: app role 이 **테이블 OWNER + rolbypassrls** 이므로 **OWNER 로부터의 REVOKE 는 무효**(소유자 암묵 권한) · **RLS 도 무력**. → **런타임은 반드시 비-owner `orchestration_writer` role 로 접속**해야 하고, OWNER/admin 실수는 **trigger** 가 막는다. (이 설계에서 trigger 가 필수인 이유.)
- 운영 writer 배선 **전에** 적용. 실패 시 fail-closed. 기존 0004 테이블 의미 변경 없음 · backfill 없음 · 신규 row 없음.

## 3. DB role 모델
| role | LOGIN | 권한 | 용도 |
|---|---|---|---|
| `orchestration_reader` | (멤버십) | SELECT(6테이블) | 조회 전용 |
| `orchestration_writer` | (멤버십) | append-only/immutable=SELECT+INSERT · business-state=+컬럼 제한 UPDATE · **DELETE/TRUNCATE 없음** | **런타임 adapter/writer** |
| `orchestration_admin` | (멤버십) | ALL | 마이그레이션·긴급 전용, **런타임 사용 금지** |

- NOLOGIN 그룹 role 로 권한 번들 → 실제 LOGIN 계정에 **멤버십만** 부여(비밀번호는 SQL 밖).
- **connection pooling**: role 은 login 계정에 고정(SET ROLE 런타임 전환 대신 계정 분리 권장 — pool 재사용 시 role 누수 방지). writer/reader/admin 은 **서로 다른 credential**.
- **migration runner 는 admin 계정만** 사용, 런타임 서비스는 **writer 계정만**. credential rotation: writer/reader 정기 교체, admin 은 평소 비활성/별도 보관.
- **잔여 위험**: Neon 에서 SQL 로 만든 role 은 콘솔 UI 에 안 보일 수 있음(관리 혼선) → 프로비저닝 절차 문서화 필요. OWNER 교체(테이블 소유자를 admin 전용 role 로)까지 하면 더 강하나 이번 범위 밖(별도 검토).

## 4. privilege matrix
| 테이블 | 성격 | reader | writer | admin | trigger |
|---|---|---|---|---|---|
| `job_artifacts` | **immutable** | SELECT | SELECT, INSERT | ALL | BEFORE UPDATE/DELETE→**OA001** · BEFORE TRUNCATE→OA004(+FK-ref 선차단) |
| `automated_reviews` | **append-only** | SELECT | SELECT, INSERT | ALL | UPDATE/DELETE→**OA001** · TRUNCATE→OA004 |
| `orchestration_audit_log` | **append-only** | SELECT | SELECT, INSERT | ALL | UPDATE/DELETE→**OA001** · TRUNCATE→OA004 |
| `job_dependencies` | business-state | SELECT | SELECT, INSERT, UPDATE(resolution_status,resolved_execution_id,resolved_artifact_id,resolved_at) | ALL | DELETE→OA002 · UPDATE 식별변경→OA003 · TRUNCATE→OA004 |
| `human_approvals` | business-state | SELECT | SELECT, INSERT, UPDATE(approval_status,decided_at,decided_by_protected_ref,decision_reason_code,decision_summary,updated_at) | ALL | DELETE→OA002 · 식별변경→OA003 · TRUNCATE→OA004 |
| `emergency_stops` | business-state | SELECT | SELECT, INSERT, UPDATE(active,released_at,released_by_protected_ref,reason_summary,updated_at) | ALL | DELETE→OA002 · 식별변경→OA003 · TRUNCATE→OA004 |

**SQLSTATE(machine-readable)**: `OA001`=immutable/append-only UPDATE·DELETE, `OA002`=DELETE 금지, `OA003`=식별/created_at 변경 금지, `OA004`=TRUNCATE 금지.

## 5. 업무 상태 vs 감사 원장 분리 (모든 UPDATE 를 무조건 금지하지 않음)
- **완전 append-only/immutable**: `job_artifacts`(불변), `orchestration_audit_log`·`automated_reviews`(append-only).
- **business-state(제한 UPDATE 허용)**: `human_approvals`(approval_status 전이), `emergency_stops`(active/released 전이), `job_dependencies`(resolution 전이). 식별·created_at 은 trigger 가 고정(OA003), DELETE 금지(OA002).
- **원장은 audit_log 로 분리**: 승인 결정·정지 activate/release 등 상태 전이는 `orchestration_audit_log` 에 **불변 이벤트**로도 남긴다(current projection = business 테이블, immutable ledger = audit_log). → "상태 UPDATE 대신 event 추가" 요구를 **current projection + immutable event log** 로 충족.

## 6. job_artifacts 불변성 — 특수 상황 처리
- **만료(expires_at)**: 물리삭제 금지 → 별도 **tombstone/상태 이벤트**(예: audit_log 에 `artifact-expired` 이벤트, 또는 파생 projection). row 자체는 유지.
- **잘못 생성된 artifact**: 삭제 대신 **supersede 관계**(새 artifact + dependency `supersedes`) + audit 이벤트.
- **법적 삭제 요청 vs append-only 충돌**: artifact 에 **원문 없음**(protected reference/hash 만)이 1차 방어. 그래도 삭제가 불가피하면 **emergency 절차**(§9)로만, **정정 이벤트를 남기며**.
- **secret/고객 원문 실수 저장 emergency remediation**: emergency 절차로 replica 모드에서 해당 값만 redaction + audit 이벤트. (애초 계약상 원문 저장 금지이므로 예외적.)

## 7. append-only vs cryptographic tamper-evidence — **분리 결정**
- **이번 Gate = 단순 append-only 강제**: REVOKE(UPDATE/DELETE) + trigger(OA001) + `seq`(identity 단조). 이는 **정상 경로의 조용한 변조를 차단**한다.
- **hash chain(previous_event_hash/event_hash) = 별도 tamper-evidence Gate 로 분리.** 근거:
  1. **동시 INSERT 경쟁**: 체인은 "직전 이벤트 hash"에 의존 → 동시 삽입 시 직렬화(advisory lock/serializable) 필요, 경합·성능 비용.
  2. **rollback 의미**: 롤백된 tx 가 hash 소비·gap 을 남기지 않도록 설계 필요.
  3. **위협 모델 차이**: append-only 는 *정상 경로 변조* 차단(지금 필요). hash chain 은 *DB 관리자 수준 외부 변조 탐지*(더 높은 바) → 별도.
- **혼동 금지**: append-only ≠ cryptographic tamper-evidence. 이번엔 전자만. seq 연속성(gap 의미)·canonical payload hashing 은 tamper-evidence Gate 에서.

## 8. migration runner scanner 충돌 — 해결안
일반 additive 러너의 정적 스캐너는 **GRANT/REVOKE/UPDATE/DELETE/CREATE TRIGGER 를 위험 SQL 로 거부** → hardening SQL 은 일반 러너로 못 통과.
| 대안 | 우회 가능성 | 유지보수 위험 | 채택 |
|---|---|---|---|
| A. role/revoke 만 | GRANT/REVOKE 도 스캐너가 거부 → 여전히 불가 | — | ✗(단독 불가) |
| B. **hardening 전용 러너** | 낮음(전용·checksum) | 낮음 | **채택** |
| C. 스캐너가 trigger body 구조 인식 | 스캐너 완화 = 전 마이그레이션 additive 보증 약화 | **높음** | ✗ |
| D. **exact checksum + statement allowlist** | 낮음 | 낮음 | **채택(B와 결합)** |
| E. 수동 DBA | 재현성·감사 약화 | 중 | 긴급 fallback |
**결론: B+D** — `hardeningRunner.ts`(프로토타입): **키워드 스캔 안 함**, 대신 **exact sha256 allowlist**(`82d18efa…`) + host-pin + CONFIRM_APPLY + 단일 tx + **post-verify(role 3·trigger ≥15·function 4)**. 범용 스캐너는 **그대로 엄격 유지**(느슨화 금지). 문자열 예외로 UPDATE/DELETE 를 광범위 허용하지 않음.

## 9. emergency administrator 절차
- **누가**: 지정된 DBA/원장 승인자. **credential**: `orchestration_admin`(또는 owner) — **평소 런타임 env 에 없음·별도 보관·사용 후 rotation**.
- **사용 전**: human approval + **reason code**. **기록**: 시작·종료 시각 · 실행 SQL fingerprint · 변경 전/후 hash · 별도 감사 기록.
- **trigger 우회**: 오직 `SET session_replication_role=replica` 로만(단일 감사 tx 안에서). 작업 후 `DEFAULT` 복귀 — 격리 PG17 에서 **우회 후 trigger 재작동** 검증됨.
- **원칙**: **과거 감사 이벤트를 조용히 덮어쓰지 않는다** → **정정 이벤트를 새로 추가**. 운영 애플리케이션(writer)은 admin/replica 에 **접근 불가**.

## 10. 테스트 teardown
- **disposable PostgreSQL**(embedded PG17 / PGlite) — **인스턴스 전체 폐기**로 정리. **테이블별 DELETE cleanup 금지**(trigger 가 막음, 또한 원칙 위반).
- 테스트용 admin/owner 로 seed, role 검증은 SET ROLE, trigger 검증은 owner, 긴급 경로는 replica. **운영 trigger 를 테스트 편의로 비활성화하지 않음**(폐기로 해결).
- 검증: role privilege · trigger 거부(SQLSTATE) · admin emergency path · migration 재실행 already-applied.

## 11. 검증 결과
- **PGlite `tests/knop/orchestrationHardening.test.ts` 16/16** (enforcement 12 + 러너 4). 전체 **test:knop 206/206** · **tsc 0**.
- **격리 PG17(embedded 17.10) e2e 19/19**: role 3 · reader SELECT-only · writer INSERT/제한UPDATE·UPDATE/DELETE/TRUNCATE 거부 · **OWNER UPDATE/DELETE=OA001** · DELETE=OA002 · 식별변경=OA003 · **TRUNCATE=OA004**(+job_artifacts 는 FK-ref 선차단) · **replica 긴급 우회 가능 + 우회 종료 후 trigger 재작동**.
- **부수 발견(문서화)**: `job_artifacts`·`automated_reviews` 등 FK-참조 테이블은 PG 의 "FK 참조 테이블 TRUNCATE 금지"로 trigger 이전에 이미 차단 → TRUNCATE 다층 방어.

## 12. 운영 적용 Gate 제안 (이번 Gate 아님)
**Gate: orchestration hardening production apply**
1. Neon 에 `orchestration_reader/writer/admin` 프로비저닝(LOGIN credential 은 secret store, SQL 밖).
2. hardeningRunner inspect/dry-run(운영, host-pin) → post-verify.
3. **별도 승인** 후 apply(단일 tx). role/trigger/function 생성.
4. **런타임 DB 접속을 writer credential 로 전환**(Railway env; owner/admin 분리) — 이게 immutability 실질 경계.
5. post-apply: reader/writer/admin 권한·trigger 거부 재검증(운영 read-only).
6. 이후에야 adapter/writer 배선 Gate 진입 가능.
- 별도 후속: **tamper-evidence(hash chain) Gate** · **OWNER 를 admin 전용 role 로 이전** 검토.

## 13. 유지 금지(이번 Gate)
운영 apply·role 변경·GRANT/REVOKE·trigger 생성·신규 row·adapter·runtime wiring·외부 AI·calls·package/lock·main merge/push **전부 미수행**. hardening 완료 전 어떤 writer 도 신규 6테이블에 운영 write 하지 않음(빈 상태 유지).
