# SELECT-only preflight — 계약 설계 (**미구현**)

> **상태: designed, not implemented.** 이번 Gate 에서는 계약만 확정하고 코드를 작성하지 않았다.
> 실제 Neon 접속·credential·branch/project 생성 **0**.

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

**상호배타**: `PREFLIGHT_ONLY=true` 와 `CONFIRM_EXECUTE=true` 가 동시에 설정되면 **거부**한다(모드 혼동은 fail-closed).
env 계약 단일 정본(`scripts/neonCheck/envContract.ts`)에 `PREFLIGHT_ONLY` 를 추가하고 문서·CLI 도움말·테스트가 함께 파생되게 한다.

## 2. 읽기 전용 강제 — 3중
1. **연결 직후 세션 고정**: `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY`
2. **트랜잭션 단위 재확인**: 모든 probe 를 `BEGIN; SET TRANSACTION READ ONLY; … ; ROLLBACK` 안에서 수행
3. **adapter-level write rejection**: preflight 전용 adapter 가 `exec()` 를 **아예 제공하지 않고**, `query()` 는 SQL 앞부분이
   `SELECT`/`WITH … SELECT`/`SHOW`/`EXPLAIN` 이 아니면 **던진다**. allowlist 방식(부정 목록 아님).

> ⚠️ **allowlist vs adapter rejection 결정**: 둘 다 채택한다. SQL 문자열 검사만으로는 `WITH x AS (INSERT …)` 류를 놓칠 수 있고,
> `READ ONLY` 트랜잭션만으로는 서버가 허용하는 부수효과(예: 임시 객체·`SET`)를 놓칠 수 있다. **서버 강제 + 클라이언트 allowlist 를 겹친다.**

허용 0 (하나라도 시도되면 preflight 실패): `CREATE`/`ALTER`/`DROP`/`GRANT`/`REVOKE`/`INSERT`/`UPDATE`/`DELETE`/`TRUNCATE`/`COMMENT`/`SET ROLE`.
**synthetic role·schema·object 생성 0.**

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

## 6. 결과 계약
- 출력 prefix `[preflight]` — capability(`[neon-check]`)·assertion(`[hardening-assertions]`) 과 **분리**.
- 모든 식별자(user/db/host)는 hash 또는 count 로만. 원문 0. 예외는 `sanitizeError` 통과.
- 상태: `preflight-passed` · `preflight-refused`(안전 조건 위반) · `preflight-error`(연결/권한 오류).
- **`preflight-passed` 가 아니면 execute 승인 불가**(운영자·Claude 양쪽 판단 기준).
- preflight 결과는 **Neon capability 45 에 포함하지 않는다**(별도 축, 합산 금지).

## 7. 구현 전 남은 결정
1. **pooled 에서 read-only 트랜잭션이 보장되는가** — PgBouncer transaction mode 에서 `SET SESSION CHARACTERISTICS` 가 다음 트랜잭션까지 유지된다는 보장이 없다. → **트랜잭션마다 `SET TRANSACTION READ ONLY` 를 다시 거는 것을 필수**로 한다.
2. **allowlist 파서의 엄격도** — 주석·`WITH` 절·다중 statement 를 어떻게 다룰지. 초안: **단일 statement 만 허용**, 세미콜론 분리 금지, 주석 제거 후 첫 토큰 판정.
3. **`canCreateRole` 판정 근거** — 속성 조회로 대체하되, execute 진입 시 실제 시도로 재확인하는 이중 구조.
4. **pooler 판정 실패 시 처리** — 판정 불가를 `preflight-refused` 로 볼지, 경고 후 통과시킬지. 초안: **판정 불가는 경고로 두고, endpoint 구분 실패만 거부**(구분 실패는 이미 연결 전 guard 에서 거부됨).

## 8. 다음 Gate 범위 제안
**Gate: SELECT-only preflight implementation**
- `PREFLIGHT_ONLY` env 계약 추가(단일 정본) + 상호배타 guard
- read-only adapter(allowlist + `exec()` 미제공) + 트랜잭션 강제
- probe 구현 → 기존 `evaluatePreflight()` 재사용
- PGlite/embedded PG17 격리 테스트(write 시도 전부 거부 · 결과 sanitize · 상태 3종)
- **실제 Neon 접속은 그 다음 Gate**(운영자 준비 + 별도 승인)
