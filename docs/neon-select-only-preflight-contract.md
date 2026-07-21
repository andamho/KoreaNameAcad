# SELECT-only preflight — 계약과 구현

> **상태: implemented (격리 검증 완료) · 실제 Neon 실행은 not-run.**
> 구현: `scripts/neonCheck/preflightQueries.ts`(query ID allowlist) · `readOnlyAdapter.ts`(read-only 세션) ·
> `selectOnlyPreflight.ts`(probe·상태·evidence) · `runPreflight.ts`(CLI 경로) · `evidenceStore.ts`(secret 0 보관).
> 검증: `tests/knop/neonSelectOnlyPreflight.test.ts`(PGlite + pooled mock + 실패 주입) + embedded PG 17.10.
> 실제 Neon 접속·credential·project 생성 **0**.

## 0. 왜 필요한가 — dry-run 이 못 보는 것
dry-run 은 **offline contract validation** 이라 DB 연결이 0 이다. 따라서 다음은 **전부 미검증**이며,
현재 설계에서는 `CONFIRM_EXECUTE=true`(= DDL 이 실제로 도는 단계)에서 **처음** 드러난다:

credential 유효성 · 접속 가능성 · `CREATE ROLE` capability · public user table 0 · business table/row 0 ·
migration history 0 · 기존 `orchestration_*` role 0 · 이전 run 잔여 object 0 · PgBouncer transaction mode · direct/pooled 실제 권한 차이.

**문제**: 위 조건 중 하나라도 어긋나면 그 사실을 "이미 DDL 을 시작한 뒤"에 알게 된다. preflight 는 이 간극을 없앤다.
**읽기 전용 연결로 위험 조건을 먼저 확인하고, 통과했을 때만 execute 를 승인**한다.

## 1. 실행 모드 — `PREFLIGHT_ONLY=true` (권고안)
| 모드 | env | DB 연결 | write | 용도 |
|---|---|--:|--:|---|
| offline contract validation | (기본) | 0 | 0 | env·catalog·plan 검증 |
| **SELECT-only preflight** | `PREFLIGHT_ONLY=true` | **있음(읽기 전용)** | **0** | 실제 DB 안전 조건 확인 |
| execute | `CONFIRM_EXECUTE=true` | 있음 | 있음 | 실제 capability 검증 |

**플래그 계약(확정)**: **미설정=비활성** · **정확한 `true`=활성** · **빈 문자열/공백=거부**(변수를 제거하라고 안내) ·
`TRUE`/`True`/`1`/`yes`/`on`/`false`/`0`/앞뒤 공백 포함 변형 **전부 거부** · `PREFLIGHT_ONLY` 와 `CONFIRM_EXECUTE` **동시 `true` 거부**.
빈 문자열을 미설정과 동일하게 취급하지 않는 이유: 변수를 지웠다고 착각한 상태를 조용히 통과시키면 모드 오인의 원인이 되기 때문이다.

**타입 검사**: 하네스 코드는 루트 `tsconfig.json` 의 include 밖이라 검사되지 않았다 → **`tsconfig.neoncheck.json`** 을 추가했다.
고정 명령: `npx tsc -p tsconfig.neoncheck.json --noEmit` (package.json 변경 없음).
env 계약 단일 정본(`scripts/neonCheck/envContract.ts`)에 `PREFLIGHT_ONLY` 를 추가하고 문서·CLI 도움말·테스트가 함께 파생되게 한다.

## 2. 읽기 전용 강제 — 2중 방어 (구현됨)
**방어층 1 (서버)**: `BEGIN` → `SET TRANSACTION READ ONLY` → probe → **항상 `ROLLBACK`**. `COMMIT` 경로가 코드에 없다.
트랜잭션마다 `SET TRANSACTION READ ONLY` 를 **다시 건다** — pooler transaction mode 에서 session 설정 유지가 보장되지 않기 때문이다.
`SET` 직후 `transaction_read_only` 를 되읽어 `on` 이 아니면 즉시 중단한다(fail-closed).

**방어층 2 (애플리케이션)**: **query ID allowlist**. `ReadOnlySession` 은 `run(queryId, params)` 만 제공하며
`exec()`·`rawQuery()` 같은 임의 SQL 실행 API 가 **존재하지 않는다**. SQL 은 `preflightQueries.ts` 의 고정 문자열이고,
파라미터는 고정 shape(`none`/`text`/`text[]`)로만 바인딩된다. 사용자·환경 입력이 SQL identifier 로 들어가는 경로가 없다.

> ⚠️ **왜 keyword 검사만으로 부족한가**: PostgreSQL 은 `SELECT dangerous_function()` 처럼 **SELECT 로도 부수효과**를 낼 수 있다.
> 그래서 "SELECT 로 시작하면 허용"을 쓰지 않고 **ID allowlist** 에 보안을 둔다. keyword 검사(`FORBIDDEN_SQL_KEYWORDS`)와
> 함수 호출 감사(`ALLOWED_SYSTEM_FUNCTIONS`)는 **정본 무결성 검사용 보조**이며, 등록된 SQL 자체를 정적으로 검문한다.

금지(등록 자체가 불가): `CREATE`/`ALTER`/`DROP`/`GRANT`/`REVOKE`/`INSERT`/`UPDATE`/`DELETE`/`TRUNCATE`/`COPY`/`CALL`/`DO`/`VACUUM`/`ANALYZE`/`REFRESH`/`SET ROLE`.
**synthetic role·schema·object 생성 0 · COMMIT 0.**

## 3. 수집 항목 (전부 카탈로그 introspection)
| # | 항목 | 근거 |
|---|---|---|
| 1 | credential 유효성 | 연결 성공 자체 |
| 2 | `server_version` | `SHOW server_version` |
| 3 | `current_user` / `session_user` | **이름은 hash 로만 보고** |
| 4 | public user table count | `pg_class` relkind r/p, extension 소유 제외 |
| 5 | business table/row fingerprint | 표식 테이블 존재 여부 + 행수 합(값 미출력) |
| 6 | migration history | `__drizzle_migrations` 등 흔적 |
| 7 | production `orchestration_*` role | `pg_roles` |
| 8 | 이전 run 잔여 | `oc_chk_*` / `oc_*_<runid>` |
| 9 | 허용 밖 user schema | `pg_namespace` |
| 10 | **`CREATE ROLE` capability** | `pg_roles.rolcreaterole` / `rolsuper` **속성 조회로 판정**(실제 CREATE 시도 금지) |
| 11 | direct/pooled endpoint 동작 차이 | 아래 §4 |

`evaluatePreflight()` 의 기존 `CatalogProbe` 계약을 재사용한다(새 판정 로직을 만들지 않는다).
단 `canCreateRole` 은 **속성 조회 기반**으로 바뀌므로 "실제 CREATE ROLE 성공"보다 약한 증거임을 결과에 명시한다.

## 4. pooler mode 판정 — 읽기 전용으로 가능한 범위
| 관찰 | 방법 | 한계 |
|---|---|---|
| pooled 연결이 direct 와 다른 endpoint 인가 | host hash 비교(연결 전) + `inet_server_addr()`/`inet_server_port()` | Neon 이 값을 감출 수 있음 |
| session 상태 유지 여부 | 같은 connection 에서 `SET LOCAL` 후 별도 트랜잭션에서 관찰 | **transaction mode 판정의 핵심 근거** |
| prepared statement 재사용 가능 여부 | 동일 statement 재실행 시 오류 발생 여부 | 드라이버 구현에 따라 달라짐 |
| `pg_stat_activity` 의 backend 재사용 | `pg_backend_pid()` 반복 조회 | 풀 크기·부하에 따라 비결정적 |

> **정직한 한계**: 위 관찰은 "transaction mode 로 **보인다**"까지만 말할 수 있다.
> **`SET ROLE` 비의존성 같은 성질은 write 를 동반하는 execute 단계에서만 확정된다.** preflight 결과를 pooler 정본 evidence 로 승격하지 않는다.

## 5. connection close 이후 세션 상태
preflight 는 **연결을 닫는 것까지만** 책임진다. close 이후 pooler 가 backend 를 재사용하며 남는 상태는
읽기 전용 세션에서는 관찰할 수 없다(관찰하려면 write 가 필요). → **execute 단계 capability 로 남긴다**(현행 `pooled-*` 5종).

## 6. 결과 계약 (구현됨)
- 출력 prefix `[preflight]` — capability(`[neon-check]`)·assertion(`[hardening-assertions]`) 과 **분리**. 세 숫자를 합산하지 않는다.
- 모든 식별자(URL/host/db/user/role/table/migration)는 **hash 또는 count** 로만. 원문 0. 예외는 `sanitizeError` 통과.
- **상태 5종**: `preflight-passed` · `preflight-aborted-safety-guard` · `preflight-target-identity-unverified` ·
  `preflight-connection-failed` · `preflight-readonly-enforcement-failed`.
- **`preflight-passed` 가 아니면 execute 승인 불가.**
- preflight 결과는 **Neon capability 45 에 포함하지 않는다**(별도 축).

### 6b. execute 차단 evidence — **HMAC 서명 · nonce · 만료 · 1회 소비**
> ⚠️ **정정 이력**: 초기 구현은 `integrity = sha256(evidence body)` 였다. 이는 **누구나 재계산 가능**하므로
> body 를 원하는 값으로 바꾸고 해시를 다시 계산하면 그대로 통과한다 = **위조 가능**. 해당 방식은 **제거**했다.

현행 계약(`scripts/neonCheck/evidenceAuth.ts`):
- `preflight-passed` 일 때만 발급. 서명 키는 **실행마다 CSPRNG 로 새로 생성**된다.
- MAC = `HMAC-SHA256(key, canonicalBody)` 이며 다음을 **전부 binding**:
  schema version · run-id · expected direct/pooled hash · **forbidden direct/pooled hash** ·
  target identity fingerprint · status · issued-at · **expires-at** · **random nonce**.
- **evidence 와 key 는 서로 다른 파일에 분리 저장**(저장소 밖 임시 경로, mode 0600).
  evidence 파일에는 키가 들어가지 않는다. 내용에 URL·credential 0 (`assertNoSecrets`).
- **TTL 상한 15분**(요구 상한 30분 이하). 요청 TTL 이 더 커도 상한으로 잘린다.
- 검증은 **timing-safe** 비교. `execute` 는 `consumeEvidence()` 로 **읽는 즉시 evidence/key 를 둘 다 삭제**하므로
  **성공·실패 무관하게 재사용(replay)이 불가능**하다. 같은 프로세스 내 재사용은 nonce 소비 기록이 추가로 막는다.
- **legacy(unsigned / `integrity` 필드) evidence 는 무조건 거부**한다(호환성 유지 안 함).
- 이 검증은 **DB adapter 를 만들기 전에** 수행되며 실패 시 **연결 0 · write 0 · exit 5**.

거부되는 위조 시나리오(테스트로 고정): status→passed 변경 · run-id 변경 · expected/forbidden hash 변경 ·
target identity 변경 · nonce 변경 · **MAC 한 글자 변경** · 시각 변조 · schema version 변경 · 다른 run 의 키 ·
key/evidence 누락 · 만료 · 재사용 · legacy evidence.

## 7. 결정된 사항(구현 시점)
1. **pooled read-only 보장** → `SET SESSION CHARACTERISTICS` 에 의존하지 않고 **트랜잭션마다 `SET TRANSACTION READ ONLY` 재설정 + 되읽기 확인**.
2. **allowlist 엄격도** → **query ID allowlist** 채택. 등록 SQL 은 단일 statement(세미콜론 금지)·`SELECT` 시작·금지 keyword 0·허용 system 함수만.
3. **`canCreateRole` 판정** → 카탈로그 속성 조회로 `likely-capable`/`unverified`/`likely-incapable`. **"가능하다"고 단정하지 않으며**
   execute 승인 전 **잔여 위험**으로 보고한다. 실제 확정은 execute 단계의 실 시도.
4. **pooler 판정 실패 처리** → 판정 불가는 `unverified` **경고**로 두고 preflight 자체를 실패시키지 않는다.
   endpoint 구분 실패는 이미 연결 **전** guard 에서 거부된다. `confirmed` 는 authoritative signal 이 생기기 전까지 **어떤 입력으로도 반환되지 않는다**(테스트로 강제).

## 8. 남은 한계(정직한 기록)
- pooler transaction mode 는 읽기 전용 관찰만으로 **확정 불가** → 최대 `consistent-with-transaction-pooling`.
- connection close 이후 backend 재사용 상태는 write 없이 관찰 불가 → **execute 단계 `pooled-*` 5종**에 남는다.
- `business-rows-present` 는 `pg_class.reltuples` 기반 추정이라 **통계 미갱신 시 과소 보고 가능** → 그래서 `publicUserTableCount=0` 을
  더 강한 1차 조건으로 둔다(테이블 자체가 0이면 행도 0).
- **direct/pooled 동일 대상 판정**은 `database/oid/schema-oid/server_version` 지문 비교다. Neon 이 pooled 에서 다른 값을 노출하면
  `preflight-target-identity-unverified` 로 떨어지며 **execute 승인 불가**다. 운영자 marker object 생성은 이번에도 하지 않았다(계약만 유지).

## 9. 다음 Gate 제안
**운영자 offline dry-run + actual SELECT-only preflight** — 별도 disposable project 준비 → offline dry-run → `PREFLIGHT_ONLY=true` 실행 →
masked 결과 공유 → **별도 execute 승인 Gate**.
