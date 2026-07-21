# disposable Neon orchestration role/pooler capability verification (운영자 실행 절차)

> **이 문서는 준비물이다. 이번 Gate 에서 실제 Neon 실행은 하지 않았다(= Neon capability 결과는 `not-run`).**
> 하네스: `scripts/neonOrchestrationCapabilityCheck.ts` · 자체 테스트: `tests/knop/neonCapabilityHarness.test.ts`.
> 목적: embedded PostgreSQL 로 재현할 수 없는 **Neon 고유 role·credential·pooler 동작**을 disposable branch 에서 실측.
> **production branch/DB 는 절대 대상이 아니다.** Neon API key 는 저장소/Claude 에 제공하지 않는다.

## 0. 왜 별도 Gate 인가
embedded PG17 로 이미 확인된 것: role 생성·membership·ALTER OWNER(NOLOGIN)·SET ROLE·컬럼 UPDATE·identity INSERT·trigger 발화·PUBLIC/function REVOKE·session_replication_role(superuser 전용)·OA001–OA004·owner-only DISABLE TRIGGER.
**embedded 로 확인 불가(=이 Gate 대상)**: Neon **pooled(PgBouncer transaction mode)** 에서의 role/session 상태 · direct vs pooled URL 차이 · credential rotation 후 기존 pooled connection · prepared statement ↔ role 변경 · Neon branch 에서의 role cleanup(DROP/REASSIGN OWNED).

## 1. 환경변수 계약 (단일 정본 = `scripts/neonCheck/envContract.ts`)
| 변수 | 필수 | 설명 |
|---|---|---|
| `NEON_CHECK_DIRECT_URL` | ✓ | disposable **direct** 연결 **[secret]** |
| `NEON_CHECK_POOLED_URL` | ✓ | 동일 환경 **pooled** 연결 **[secret]** — pooled 5종의 유일한 정본이라 필수 |
| `NEON_CHECK_EXPECTED_DIRECT_HOST_HASH` | ✓ | direct host 의 `sha256` 64hex — **direct 독립 pin** |
| `NEON_CHECK_EXPECTED_POOLED_HOST_HASH` | ✓ | pooled host 의 `sha256` 64hex — **pooled 독립 pin** |
| `NEON_CHECK_FORBIDDEN_DIRECT_HOST_HASH` | ✓ | **production direct** host hash — forbidden set 구성원 |
| `NEON_CHECK_FORBIDDEN_POOLED_HOST_HASH` | ✓ | **production pooled** host hash — forbidden set 구성원 |
| `PREFLIGHT_ONLY` | 모드 | `true` 면 **select-only-preflight**(읽기 전용 연결). CONFIRM_EXECUTE 와 동시 설정 금지 |
| `NEON_CHECK_DISPOSABLE_CONFIRM` | ✓ | 반드시 `i-confirm-disposable-neon-branch` |
| `NEON_CHECK_RUN_ID` | ✓ | `[a-z0-9]{4,16}` — 모든 object 이름 suffix |
| `CONFIRM_EXECUTE` | 실행 시 | `true` 일 때만 실제 DDL. 기본은 **offline contract validation(dry-run)** |

> **폐기**: `NEON_CHECK_FORBIDDEN_HOST_HASH`(단일 forbidden hash) — production 도 direct/pooled 두 host 이므로
> 하나로는 **production pooled 를 차단하지 못한다**. `NEON_CHECK_FORBIDDEN_URL` 도 폐기(helper 전용 계약으로 분리).
> **폐기**: `NEON_CHECK_EXPECTED_HOST_HASH`(단일 hash). 하나의 hash 로는 host 가 서로 다른 direct/pooled 두 endpoint 를
> 동시에 pin 할 수 없어 **pooled 가 사실상 미고정**이었다. 설정돼 있으면 **fail-closed 로 거부**한다(호환성 유지 안 함).

host hash 계산은 전용 도구를 쓴다(**URL 을 argv 로 받지 않고 환경변수에서만 읽으며 hash 만 출력**):
```powershell
node --import tsx/esm scripts/neonCheck/hashTool.ts     # direct#<64hex> / pooled#<64hex>
```

## 2. production 오접속 방지 다층 가드 (하나라도 걸리면 fail-closed)
1. disposable confirmation 토큰 불일치/누락 → 거부
2. `EXPECTED_DIRECT_HOST_HASH`/`EXPECTED_POOLED_HOST_HASH` 누락·형식오류·**각 endpoint 실제 host hash 불일치**·**교차 입력**·**두 값 동일** → 거부
3. **forbidden set 비교** — disposable direct/pooled 각각을 production direct/pooled **양쪽과 대조(4개 조합)**. 하나라도 일치 → 즉시 중단.
   forbidden 두 hash 가 동일해도 거부(production 두 endpoint 를 구분해 차단하지 못함)
4. **direct == pooled URL** → pooler 검증 불가로 거부
5. `RUN_ID` 형식 오류 → 거부
6. 접속 후 카탈로그 관찰: **업무/운영 테이블 존재**(customers·consultations·calls·jobs·job_executions·job_shadow_previews·job_artifacts·orchestration_audit_log 등) 또는 **기존 행 > 0** → 거부
7. **production 이름 `orchestration_*` role 존재** → 거부(동일 이름 생성 금지)
8. 이전 run 의 run-id 잔여 object 발견 → 거부(수동 cleanup 선행)
9. synthetic namespace `oc_chk_<runId>` **밖 DDL 금지**
10. 기본 dry-run(**offline contract validation**) — 실제 생성은 `CONFIRM_EXECUTE=true` 필요
11. 폐기된 `NEON_CHECK_EXPECTED_HOST_HASH` 사용 → 거부
> **dry-run 은 6~9 를 검증하지 못한다**(DB 연결 0). 그 항목들은 SELECT-only preflight 또는 execute 에서만 확인된다 — [계약](neon-select-only-preflight-contract.md).
> 판정 불가 시에도 **거부**(fail-closed). 로그에는 URL/host/username/password 원문 대신 `url#<hash8>…` 만 출력.

## 3. 생성 object 이름 규칙 (production 충돌 방지)
schema `oc_chk_<runId>` · role `oc_{owner,admin,deployer,writer,reader,appsim}_<runId>` · table `oc_{artifact,audit,approval}_<runId>` · function `oc_{deny_write,deny_delete,guard_update,deny_truncate}_<runId>`.
**production 의 `orchestration_*` 와 이름이 절대 겹치지 않는다.** 모든 이름에 run-id suffix 강제(`assertRunScoped`).

## 4. 검증 capability (**45종**, `CAPABILITIES` 정본 — 개수·ID·순서 불변)
- **Role**: CREATE ROLE NOLOGIN/LOGIN · GRANT/REVOKE membership · SET ROLE / RESET ROLE · membership 회수 후 SET ROLE 실패 · writer/reader/app escalation 실패.
- **Ownership**: current owner → NOLOGIN owner table transfer · function owner transfer · **bootstrap A 임시 membership 부여 → transfer → 즉시 회수 → 잔여 membership 0**. (**B 경로는 실행하지 않고 위험 분석만**.)
- **Privilege**: PUBLIC table/sequence/function-EXECUTE 0 · reader SELECT-only · writer 허용 INSERT · writer UPDATE/DELETE/TRUNCATE 거부 · writer business-table 접근 거부 · app simulation write 거부 · trigger function 직접 호출 거부 · **전역 default privileges 가 미래 함수를 보호(`default-privileges-secure`)**.
- **Direct connection**: reader/writer/deployer 별도 LOGIN · deployer→admin→owner · escalation 실패 · startup self-check(enabled 성공 / disabled 실패 / re-enable 성공).
- **Pooled connection**: reader/writer 별도 credential · transaction 종료 후 role/session 상태 · **SET ROLE 비의존** · prepared statement 재사용 · credential rotation 후 기존 connection · pool 재연결 전후 권한 · 잘못된 credential/pool 사용 시 fail-closed.
- **Emergency**: session_replication_role 변경 실패 · owner 만 DISABLE TRIGGER · **종료 후 전체 trigger enabled**(하나라도 disabled 잔존 시 전체 Gate 실패).

## 5. cleanup (run-id 범위만)
`DROP SCHEMA oc_chk_<runId> CASCADE` → 각 role `DROP OWNED BY ... CASCADE` → `DROP ROLE ...` → **잔여 run-id object 0 · 잔여 role 0 확인**.
`DROP ROLE` 은 소유 객체가 있으면 실패(2BP01)하므로 **DROP OWNED / REASSIGN OWNED 선행**이 필수. cleanup SQL 은 run-id 검증을 통과한 이름에만 적용된다(production object 에 적용 불가).
**결과 분류**: `passed-clean` · `passed-branch-disposal-required` · `failed-cleanup` · `aborted-safety-guard`. **cleanup 실패를 성공으로 보고하지 않는다** — 실패 시 branch 자체를 폐기하고 잔여 위험을 보고.

## 6. 운영자 실행 절차 (14단계)
1. **별도 disposable project 생성(1순위)** — branch 는 copy-on-write 로 고객 데이터가 따라올 수 있어 기본 권고가 아니다
2. **production 데이터 복제 없음** 확인(빈 DB 권장)
3. 빈 DB 또는 synthetic-only DB 준비
4. **direct TEST credential** 생성(ephemeral)
5. **pooled TEST credential** 생성(ephemeral)
6. expected host hash 계산(§1 명령, 값 미기록/미공유)
7. 환경변수를 **실행 프로세스에만 일시 주입**(`.env` 파일에 쓰지 않음, shell history 주의)
8. **dry-run 실행**(offline contract validation): `node --import tsx/esm scripts/neonOrchestrationCapabilityCheck.ts`
9. dry-run plan 확인(대상 host hash·run-id·생성 예정 object·cleanup 범위)
10. `CONFIRM_EXECUTE=true` 설정
11. 하네스 실행
12. 결과 저장(마스킹된 capability 결과만)
13. **credential 폐기**(rotation/삭제)
14. **disposable branch 삭제**
> **Neon API key 를 저장소나 Claude 에 제공하지 않는다.** branch 생성·credential 발급·삭제는 운영자가 Neon 콘솔/CLI 에서 직접 수행한다.

## 7. 하네스 자체 검증 상태 (Neon 미접속에서 수행 — **Neon 실측 아님**)
`tests/knop/neonCapabilityHarness.test.ts` **14/14**: env 누락 거부 · disposable 토큰 누락/오타 거부 · host hash mismatch 거부 · production host hash 일치 거부 · direct==pooled 거부 · run-id 형식 거부 · production-like catalog(업무테이블/행/production role/이전 잔여) 거부 · run-id suffix 강제 및 production 이름 미사용 · cleanup plan run-id 범위 한정(production role/table 불포함, DROP OWNED 포함) · **URL/secret 마스킹**(`url#<hash8>…`) · dry-run plan 에 URL 원문 없음·DB write 0 명시 · 결과 분류(4종, disabled trigger 잔존 → 실패) · capability 목록 39종.
CLI 실동작 확인: env 없이 실행 → **fail-closed 거부**; 유효 env → **dry-run plan 만 출력, 연결·DB write 0**.

## 7b. Phase 2 결과 — profile 별 검증 현황 (정본 45에서 파생)
| profile | 성격 | applicable | authoritative | 결과 |
|---|---|--:|--:|---|
| `pglite` | in-process(PG **18.x**), 실제 LOGIN 불가 | **22** | 0 | **passed-clean** (fail 0) |
| `embedded-direct` | embedded PG **17.10**, 실제 LOGIN 4계정 | **40** | **40** | **passed-clean** (pass 25 / expected-denial 15 / fail 0) |
| `pooled-mock` | PgBouncer **아님**(로직 mock) | **5** | 0 | **passed-clean** (fail 0) |
| `actual-neon-direct` | 실제 Neon direct | 40 | 0 | **not-run** |
| `actual-neon-pooled` | 실제 Neon pooled | 5 | **5** | **not-run** |
| `neon-full` | roll-up(직접 실행 아님) | — | — | **unverified** (Neon evidence 0, missing 45) |

- **not-applicable 은 catalog 의 `applicableProfiles` 로만 결정**되며 실행 중 임의 판정하지 않습니다. `skipped` 는 제거되었습니다.
- PGlite 비적용 23종 = 실제 LOGIN/escalation 계열 + TRUNCATE statement trigger + `session_replication_role` + default-ACL 계열(정본 = embedded-direct 로 고정).
- **pooled-mock 은 `actual-neon-pooled` 의 대체 evidence 가 아닙니다**(authoritative = `actual-neon-pooled`).
- 재현: `node --import tsx/esm scripts/runEmbeddedCapabilityCheck.ts` (embedded-postgres 미설치 시 **not-run** 으로 보고, 저장소 의존성 추가 없음).

## 7bb. 실행 모드 3종
| 모드 | 플래그 | DB 연결 | write |
|---|---|--:|--:|
| `offline-dry-run` | (없음) | 0 | 0 |
| `select-only-preflight` | `PREFLIGHT_ONLY=true` | 있음(**읽기 전용**) | 0 |
| `execute` | `CONFIRM_EXECUTE=true` | 있음 | 있음 |

두 플래그 **동시 설정은 거부**하며 값은 `"true"` 정확 일치만 인정한다.
execute 는 **preflight evidence**(run-id·expected/forbidden hash 4종·status·freshness·integrity) 대조를 통과해야만 진입한다.

## 7c. actual Neon execute **전** 관문 (Neon capability 와 별도)
execute 경로는 **DB 연결 전에** hardening security assertion **10종**을 평가하고, 하나라도 실패하면 exit 4 로 중단한다(**Neon 접속 0 · DDL 0**).
정본 = `server/migrations/hardening/functionSecurityAssertions.ts` · 출력 prefix `[hardening-assertions]`.
**보고는 세 줄로 분리한다**: Neon capabilities **45** / hardening security assertions **10** / preflight assertions(guards §2). 세 숫자를 합산하지 않는다.

## 8. 이번 Gate 에서 하지 않은 것 (명시)
**disposable Neon branch 생성 안 함 · Neon API/neonctl 인증 탐색 안 함 · `.env`/secret 탐색 안 함 · 실제 Neon capability 실행 안 함(= not-run) · production DB 접근/변경 0 · production role/credential 생성 0.**
→ §4 의 45종 capability 는 **전부 `unverified (not-run on Neon)`** 상태이며, 운영자가 §6 절차를 수행해야 확정된다.
