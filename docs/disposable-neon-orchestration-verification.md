# disposable Neon orchestration role/pooler capability verification (운영자 실행 절차)

> **이 문서는 준비물이다. 이번 Gate 에서 실제 Neon 실행은 하지 않았다(= Neon capability 결과는 `not-run`).**
> 하네스: `scripts/neonOrchestrationCapabilityCheck.ts` · 자체 테스트: `tests/knop/neonCapabilityHarness.test.ts`.
> 목적: embedded PostgreSQL 로 재현할 수 없는 **Neon 고유 role·credential·pooler 동작**을 disposable branch 에서 실측.
> **production branch/DB 는 절대 대상이 아니다.** Neon API key 는 저장소/Claude 에 제공하지 않는다.

## 0. 왜 별도 Gate 인가
embedded PG17 로 이미 확인된 것: role 생성·membership·ALTER OWNER(NOLOGIN)·SET ROLE·컬럼 UPDATE·identity INSERT·trigger 발화·PUBLIC/function REVOKE·session_replication_role(superuser 전용)·OA001–OA004·owner-only DISABLE TRIGGER.
**embedded 로 확인 불가(=이 Gate 대상)**: Neon **pooled(PgBouncer transaction mode)** 에서의 role/session 상태 · direct vs pooled URL 차이 · credential rotation 후 기존 pooled connection · prepared statement ↔ role 변경 · Neon branch 에서의 role cleanup(DROP/REASSIGN OWNED).

## 1. 환경변수 계약 (`.env` 미사용 — 프로세스 env 로만 일시 주입)
| 변수 | 필수 | 설명 |
|---|---|---|
| `NEON_CHECK_DIRECT_URL` | ✓ | disposable branch **direct** 연결 |
| `NEON_CHECK_POOLED_URL` | 권장 | 동일 branch **pooled** 연결(없으면 pooled 항목 skip) |
| `NEON_CHECK_EXPECTED_HOST_HASH` | ✓ | `sha256(host)` 64hex — 대상 고정 핀 |
| `NEON_CHECK_FORBIDDEN_HOST_HASH` | 권장 | **production host hash** — 일치 시 즉시 거부 |
| `NEON_CHECK_DISPOSABLE_CONFIRM` | ✓ | 반드시 `i-confirm-disposable-neon-branch` |
| `NEON_CHECK_RUN_ID` | ✓ | `[a-z0-9]{4,16}` — 모든 object 이름 suffix |
| `CONFIRM_EXECUTE` | 실행 시 | `true` 일 때만 실제 DDL. **기본은 dry-run(DB write 0)** |
호스트 hash 계산(값 자체는 출력 금지):
```bash
node -e "console.log(require('crypto').createHash('sha256').update(new URL(process.argv[1]).host.toLowerCase()).digest('hex'))" "<URL>"
```

## 2. production 오접속 방지 다층 가드 (하나라도 걸리면 fail-closed)
1. disposable confirmation 토큰 불일치/누락 → 거부
2. `EXPECTED_HOST_HASH` 누락/형식오류/**실제 host hash 불일치** → 거부
3. **`FORBIDDEN_HOST_HASH`(production) 와 일치** → 거부
4. **direct == pooled URL** → pooler 검증 불가로 거부
5. `RUN_ID` 형식 오류 → 거부
6. 접속 후 카탈로그 관찰: **업무/운영 테이블 존재**(customers·consultations·calls·jobs·job_executions·job_shadow_previews·job_artifacts·orchestration_audit_log 등) 또는 **기존 행 > 0** → 거부
7. **production 이름 `orchestration_*` role 존재** → 거부(동일 이름 생성 금지)
8. 이전 run 의 run-id 잔여 object 발견 → 거부(수동 cleanup 선행)
9. synthetic namespace `oc_chk_<runId>` **밖 DDL 금지**
10. 기본 dry-run — 실제 생성은 `CONFIRM_EXECUTE=true` 필요
> 판정 불가 시에도 **거부**(fail-closed). 로그에는 URL/host/username/password 원문 대신 `url#<hash8>…` 만 출력.

## 3. 생성 object 이름 규칙 (production 충돌 방지)
schema `oc_chk_<runId>` · role `oc_{owner,admin,deployer,writer,reader,appsim}_<runId>` · table `oc_{artifact,audit,approval}_<runId>` · function `oc_{deny_write,deny_delete,guard_update,deny_truncate}_<runId>`.
**production 의 `orchestration_*` 와 이름이 절대 겹치지 않는다.** 모든 이름에 run-id suffix 강제(`assertRunScoped`).

## 4. 검증 capability (**46종**, `CAPABILITIES` 정본)
- **Role**: CREATE ROLE NOLOGIN/LOGIN · GRANT/REVOKE membership · SET ROLE / RESET ROLE · membership 회수 후 SET ROLE 실패 · writer/reader/app escalation 실패.
- **Ownership**: current owner → NOLOGIN owner table transfer · function owner transfer · **bootstrap A 임시 membership 부여 → transfer → 즉시 회수 → 잔여 membership 0**. (**B 경로는 실행하지 않고 위험 분석만**.)
- **Privilege**: PUBLIC table/sequence/function-EXECUTE 0 · reader SELECT-only · writer 허용 INSERT · writer UPDATE/DELETE/TRUNCATE 거부 · writer business-table 접근 거부 · app simulation write 거부 · trigger function 직접 호출 거부 · **전역 default privileges 가 미래 함수를 보호(`default-privileges-secure`)** · **회귀: `IN SCHEMA` 한정 형식은 여전히 no-op(`schema-qualified-default-privileges-noop`)**.
- **Direct connection**: reader/writer/deployer 별도 LOGIN · deployer→admin→owner · escalation 실패 · startup self-check(enabled 성공 / disabled 실패 / re-enable 성공).
- **Pooled connection**: reader/writer 별도 credential · transaction 종료 후 role/session 상태 · **SET ROLE 비의존** · prepared statement 재사용 · credential rotation 후 기존 connection · pool 재연결 전후 권한 · 잘못된 credential/pool 사용 시 fail-closed.
- **Emergency**: session_replication_role 변경 실패 · owner 만 DISABLE TRIGGER · **종료 후 전체 trigger enabled**(하나라도 disabled 잔존 시 전체 Gate 실패).

## 5. cleanup (run-id 범위만)
`DROP SCHEMA oc_chk_<runId> CASCADE` → 각 role `DROP OWNED BY ... CASCADE` → `DROP ROLE ...` → **잔여 run-id object 0 · 잔여 role 0 확인**.
`DROP ROLE` 은 소유 객체가 있으면 실패(2BP01)하므로 **DROP OWNED / REASSIGN OWNED 선행**이 필수. cleanup SQL 은 run-id 검증을 통과한 이름에만 적용된다(production object 에 적용 불가).
**결과 분류**: `passed-clean` · `passed-branch-disposal-required` · `failed-cleanup` · `aborted-safety-guard`. **cleanup 실패를 성공으로 보고하지 않는다** — 실패 시 branch 자체를 폐기하고 잔여 위험을 보고.

## 6. 운영자 실행 절차 (14단계)
1. Neon 에서 **production 과 분리된 disposable branch** 생성
2. **production 데이터 복제 없음** 확인(빈 DB 권장)
3. 빈 DB 또는 synthetic-only DB 준비
4. **direct TEST credential** 생성(ephemeral)
5. **pooled TEST credential** 생성(ephemeral)
6. expected host hash 계산(§1 명령, 값 미기록/미공유)
7. 환경변수를 **실행 프로세스에만 일시 주입**(`.env` 파일에 쓰지 않음, shell history 주의)
8. **dry-run 실행**: `node --import tsx/esm scripts/neonOrchestrationCapabilityCheck.ts`
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
| `pglite` | in-process(PG **18.3**), 실제 LOGIN 불가 | **24** | 0 | **passed-clean** (fail 0) |
| `embedded-direct` | embedded PG **17.10**, 실제 LOGIN 4계정 | **41** | **41** | **passed-clean** (pass 26 / expected-denial 15 / fail 0) |
| `pooled-mock` | PgBouncer **아님**(로직 mock) | **5** | 0 | **passed-clean** (fail 0) |
| `actual-neon-direct` | 실제 Neon direct | 41 | 0 | **not-run** |
| `actual-neon-pooled` | 실제 Neon pooled | 5 | **5** | **not-run** |
| `neon-full` | roll-up(직접 실행 아님) | — | — | **unverified** (Neon evidence 0, missing 46) |

- **not-applicable 은 catalog 의 `applicableProfiles` 로만 결정**되며 실행 중 임의 판정하지 않습니다. `skipped` 는 제거되었습니다.
- PGlite 비적용 22종 = 실제 LOGIN/escalation 계열 + TRUNCATE statement trigger + `session_replication_role`. **default-ACL 계열은 재분류돼 PGlite 적용 가능**(이전 판의 '엔진 미지원' 서술은 부정확 — 실제로는 `IN SCHEMA` 한정 형식이 no-op 이었다). 정본은 여전히 embedded-direct.
- **pooled-mock 은 `actual-neon-pooled` 의 대체 evidence 가 아닙니다**(authoritative = `actual-neon-pooled`).
- 재현: `node --import tsx/esm scripts/runEmbeddedCapabilityCheck.ts` (embedded-postgres 미설치 시 **not-run** 으로 보고, 저장소 의존성 추가 없음).

## 8. 이번 Gate 에서 하지 않은 것 (명시)
**disposable Neon branch 생성 안 함 · Neon API/neonctl 인증 탐색 안 함 · `.env`/secret 탐색 안 함 · 실제 Neon capability 실행 안 함(= not-run) · production DB 접근/변경 0 · production role/credential 생성 0.**
→ §4 의 46종 capability 는 **전부 `unverified (not-run on Neon)`** 상태이며, 운영자가 §6 절차를 수행해야 확정된다.
