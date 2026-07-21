# disposable Neon 검증 — 운영자 준비 안내서

> 대상: 서호님(운영자). 목적: Neon 콘솔에서 **폐기용(disposable) branch** 와 **임시 TEST credential** 을 안전하게 준비하는 절차.
> 이 문서 자체는 **Neon 접속·branch 생성·credential 생성·DB 실행을 하지 않았습니다.** 준비 절차와 검증 명령만 적었습니다.
> 하네스: `scripts/neonOrchestrationCapabilityCheck.ts` · 계약 문서: [disposable-neon-orchestration-verification.md](disposable-neon-orchestration-verification.md)

---

## ⚠️ 0. 먼저 읽어주세요 — 현재 상태 (Phase 2 완료 시점)

**execute 실행 본체와 capability **45종** 구현이 모두 완료**되었고, 격리 환경에서 검증했습니다.
**그러나 실제 Neon 은 아직 한 번도 접속하지 않았습니다(not-run).**

| 항목 | 현재 상태 |
|---|---|
| 안전 가드 · 실행 계획(dry-run) | **complete** |
| execute core(연결·preflight·cleanup·잔여검증·결과판정) | **complete** |
| **capability 45종 구현** | **complete** |
| **hardening security assertions** | **complete, 10**(capability 와 별도 catalog) |
| **endpoint independent pinning** | **complete** (direct/pooled 각각 expected hash) |
| **PowerShell history-safe input guidance** | **complete** (§10·§11) |
| **offline dry-run** | **ready** |
| **SELECT-only preflight** | **designed, not implemented** ([계약](neon-select-only-preflight-contract.md)) |
| `pglite` profile 검증 | **verified** (applicable 22 / 45, PG 18.x → 비정본) |
| `embedded-direct` PG17 17.10 검증 | **verified** (applicable 40 / 45, authoritative 40) |
| `pooled-mock` 검증 | **verified** (applicable 5 / 45) — 실제 PgBouncer 아님 |
| **`actual-neon-direct` 실측** | **not-run** |
| **`actual-neon-pooled` 실측** | **not-run** |
| **`neon-full` 45종** | **unverified** (Neon evidence 0) |

> **profile 은 자동 상속되지 않습니다.** PGlite/embedded/pooled-mock 결과는 어떤 경우에도 `neon-full` 통과로 승격되지 않으며, 코드에 hard guard 와 테스트가 걸려 있습니다.

**권고: Neon branch 와 credential 은 운영자 승인 후 실제 실행 직전에 만드세요.**
지금 해보실 수 있는 것은 **§13 dry-run**(DB 연결 0·쓰기 0)이며, **가짜 URL 로도 확인 가능**합니다.

---

## 1. Neon 콘솔 접속
1. 브라우저에서 Neon 콘솔에 로그인합니다.
2. 좌측 상단에서 **조직(Organization)** 이 맞는지 확인합니다.

## 2. 현재 production project 식별
1. 프로젝트 목록에서 **운영(production) 프로젝트**를 찾습니다.
2. 그 프로젝트의 **기본 branch 이름**(보통 `main` 또는 `production`)을 메모해 둡니다. — *이 branch 는 이번 작업에서 절대 건드리지 않습니다.*
3. **production 의 host 이름**을 확인해 둡니다(값은 적어두지 말고, §11 에서 hash 로만 사용).

## 3. disposable 환경 준비 — **별도 project 가 1순위**
> Neon 의 branch 는 부모의 copy-on-write 사본이라 **기본적으로 고객 데이터가 따라옵니다.**
> 그래서 이 문서는 **branch 가 아니라 별도 project 를 기본 권고**로 합니다.

### 1순위 — production 과 완전히 분리된 **disposable Neon project** (권장)
새 project 는 다음을 **한 번에** 만족합니다.

| 조건 | 별도 project |
|---|---|
| 고객 데이터 0 | ✅ 처음부터 비어 있음 |
| migration history 0 | ✅ |
| business table 0 | ✅ |
| production host hash 와 분리 | ✅ endpoint 자체가 다름 |
| 테스트 후 전체 폐기 | ✅ project 통째로 삭제 |

1. Neon 콘솔에서 **New Project** 생성. 이름은 폐기용임이 드러나게(예: `disposable-orch-check`) — production 이름과 확실히 구분.
2. 기본 database 를 그대로 사용합니다(비어 있어야 정상).
3. 테스트 종료 후 **project 를 삭제**합니다.

### 2순위 — 데이터가 없다는 것이 **독립적으로 확인된** branch
별도 project 를 만들 수 없을 때만 사용하고, §4 확인을 **전부** 통과해야 합니다.
**production branch 의 일반 copy-on-write child branch 는 사용하지 마세요.**

> ❌ 고객 데이터가 **한 건이라도** 있으면 실행 금지입니다. 애매하면 중단하세요.

## 4. 고객 데이터·production 흔적이 없는지 확인 (필수)
아래 중 **하나라도 해당하면 그 환경을 폐기하고 다시 만드세요.**

- [ ] 기존 **CRM·상담·보고서 테이블**(customers, consultations, calls 등)이 **존재함**
- [ ] business table 에 **행(row)이 1건이라도 존재함**
- [ ] **migration history 가 production 과 동일하게 복제**되어 있음
- [ ] 기존 **`orchestration_*` role** 이 존재함
- [ ] 이전 테스트의 **`oc_chk_*` object/role** 이 남아 있음
- [ ] **고객 데이터가 한 건이라도** 존재함
- [ ] project/branch/database 이름이 **production 과 구분되지 않음**

> ⚠️ **dry-run 은 이 항목들을 검증하지 못합니다**(DB 연결 0). 하네스의 fail-closed 검문은 **실제 연결이 생긴 뒤에야** 동작하므로,
> 이 단계의 **1차 방어선은 전적으로 운영자의 위 확인**입니다. §13 의 "dry-run 이 검증하지 못하는 것" 표를 함께 보세요.

## 5. 빈 database 또는 synthetic-only database 준비
1. 해당 branch 의 **Databases** 에서 사용할 데이터베이스를 확인합니다.
2. 비어 있는 데이터베이스를 쓰거나, 새 데이터베이스를 만듭니다. 예: `orchcheck`
3. **고객 데이터·운영 데이터를 절대 넣지 않습니다.** 하네스가 자체 synthetic 객체만 만듭니다.

## 6. direct connection string 확인
1. 해당 branch 의 **Connection Details** 를 엽니다.
2. **Direct connection**(pooler 를 거치지 않는 연결) 을 선택합니다.
3. 연결 문자열을 **복사만** 합니다. — 화면에 띄운 채 캡처하거나 문서에 붙여넣지 마세요.
   - 형태(placeholder): `postgresql://<USER>:<PASSWORD>@<DIRECT_HOST>/<DB>?sslmode=require`

## 7. pooled connection string 확인
1. 같은 화면에서 **Pooled connection**(connection pooling 옵션) 을 선택합니다.
2. 연결 문자열을 복사합니다. **direct 와 host 가 달라야** 합니다(보통 `-pooler` 가 붙습니다).
   - 형태(placeholder): `postgresql://<USER>:<PASSWORD>@<POOLED_HOST>/<DB>?sslmode=require`
> **direct 와 pooled 가 완전히 같은 문자열이면** 하네스가 "pooler 검증 불가" 로 **거부**합니다.

## 8. 테스트 전용 임시 LOGIN credential 생성
1. 해당 branch 의 **Roles** 메뉴로 이동합니다.
2. **New Role** 로 이 검증에만 쓸 role 을 만듭니다. 예: `orchcheck_tester`
3. 생성된 비밀번호를 복사합니다(1회성).
4. 이 credential 로 §6·§7 의 direct / pooled 연결 문자열을 각각 구성합니다.

## 9. production credential 과 다른지 확인
- [ ] 사용자 이름이 production 과 **다름**
- [ ] 비밀번호가 production 과 **다름**
- [ ] host 가 production 과 **다름**(§11 hash 로 교차 확인)
- [ ] 이 credential 은 **오직 이 disposable branch** 에만 접근 가능

## 10. 환경변수 입력 방법 (Windows PowerShell, 일회성)
> **원칙**: `.env` 저장 금지 · 문서/Git 저장 금지 · PowerShell 세션에만 일시 주입 · 실행 후 제거 · URL 재출력 금지 · **URL·비밀번호를 채팅(Claude)으로 보내지 않기**.

### ⚠️ 명령 기록(PSReadLine) 누출 주의 — 가장 흔한 실수
```powershell
$env:NEON_CHECK_DIRECT_URL = "postgresql://user:pass@..."   # ❌ 절대 금지
```
이렇게 **명령줄에 URL 리터럴을 타이핑하면** PowerShell 이 그 줄을 `ConsoleHost_history.txt` 에 **평문으로 영구 저장**합니다.
세션을 닫아도 남고, 환경변수를 지워도 남습니다. 반드시 **`Read-Host` 로 입력**받으세요(입력한 값은 history 에 기록되지 않습니다).

또한 다음을 지켜주세요.
- **전체 환경변수 dump 금지**: `Get-ChildItem Env:` · `dir env:` · `set` · `printenv` 등을 실행하지 마세요.
- **터미널 transcript/화면 녹화가 켜져 있지 않은지** 먼저 확인하세요(`Start-Transcript` 사용 중이면 중단).
- 붙여넣기 후 **clipboard 를 비우세요**: `Set-Clipboard -Value " "`
- URL 을 **script argument/argv 로 전달하지 마세요**(프로세스 목록에 노출됩니다).

### 입력
```powershell
# 1) URL — 화면·기록에 남지 않게 Read-Host 사용
$env:NEON_CHECK_DIRECT_URL = Read-Host "direct URL 붙여넣기"
$env:NEON_CHECK_POOLED_URL = Read-Host "pooled URL 붙여넣기"

# 2) host hash — §11 에서 계산한 값(hash 는 secret 이 아니지만 URL 은 다시 타이핑하지 않습니다)
$env:NEON_CHECK_EXPECTED_DIRECT_HOST_HASH = Read-Host "direct host hash"
$env:NEON_CHECK_EXPECTED_POOLED_HOST_HASH = Read-Host "pooled host hash"
$env:NEON_CHECK_FORBIDDEN_HOST_HASH       = Read-Host "production host hash"

# 3) 고정 값
$env:NEON_CHECK_DISPOSABLE_CONFIRM = "i-confirm-disposable-neon-branch"
$env:NEON_CHECK_RUN_ID             = "<RUN_ID>"   # §12 규칙 참고
```

> **폐기된 변수**: `NEON_CHECK_EXPECTED_HOST_HASH` 는 더 이상 쓰지 않습니다. 단일 hash 로는 direct/pooled 두 endpoint 를
> 동시에 고정할 수 없어 **pooled 가 사실상 미고정 상태**가 되기 때문입니다. 설정돼 있으면 하네스가 **거부**합니다.
> 이전 세션에서 설정했다면 제거하세요: `Remove-Item Env:NEON_CHECK_EXPECTED_HOST_HASH -ErrorAction SilentlyContinue`

### 화면에 보이지 않게 입력하고 싶다면 (선택)
`Read-Host` 는 입력 문자가 화면에 보입니다. 어깨너머 노출까지 막으려면 `-AsSecureString` 을 쓸 수 있습니다.

```powershell
$sec = Read-Host "direct URL" -AsSecureString
$env:NEON_CHECK_DIRECT_URL =
  [Runtime.InteropServices.Marshal]::PtrToStringBSTR(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
Remove-Variable sec
```

> **정직한 한계**: 환경변수는 결국 **평문**이어야 하므로 위 방법도 마지막에 평문으로 변환합니다.
> 이 방법이 막아주는 것은 **화면 노출·디스크 history·argv 노출**이며, **프로세스 메모리의 평문까지 제거하지는 못합니다.**
> 프로세스 메모리 보호를 주장하지 마세요. 진짜 방어는 **ephemeral credential 을 쓰고 테스트 직후 폐기**하는 것입니다.

### 종료 시 제거 (필수)
```powershell
Remove-Item Env:NEON_CHECK_DIRECT_URL, Env:NEON_CHECK_POOLED_URL, `
            Env:NEON_CHECK_EXPECTED_DIRECT_HOST_HASH, Env:NEON_CHECK_EXPECTED_POOLED_HOST_HASH, `
            Env:NEON_CHECK_FORBIDDEN_HOST_HASH, Env:NEON_CHECK_DISPOSABLE_CONFIRM, `
            Env:NEON_CHECK_RUN_ID, Env:CONFIRM_EXECUTE, Env:NEON_CHECK_FORBIDDEN_URL `
            -ErrorAction SilentlyContinue
```
그다음 **PowerShell 세션을 종료**하고 **credential 을 폐기**합니다.

> ⚠️ history 파일을 직접 열거나 지우지 마세요. 다른 작업 기록까지 훼손됩니다. 애초에 리터럴을 타이핑하지 않는 것이 정답입니다.

## 11. host hash 계산 방법 (URL 원문 출력 0 · argv 노출 0)
하네스와 **동일한 방식**입니다: `sha256( new URL(url).host.toLowerCase() )` → 64자리 소문자 hex.
전용 도구는 **URL 을 인자로 받지 않고 환경변수에서만 읽으며**, `direct#<hash>` / `pooled#<hash>` 형식으로 **hash 만** 출력합니다.

```powershell
# §10 에서 이미 URL 환경변수를 설정했다면 그대로 실행하면 됩니다
node --import tsx/esm scripts/neonCheck/hashTool.ts
```

출력 예(값은 예시):
```
[neon-hash] direct#2b0bf1de………………
[neon-hash] pooled#6c34f59d………………
[neon-hash] forbidden#<미설정> (NEON_CHECK_FORBIDDEN_URL 없음)
```

- `direct#…` → `NEON_CHECK_EXPECTED_DIRECT_HOST_HASH`
- `pooled#…` → `NEON_CHECK_EXPECTED_POOLED_HOST_HASH`
- **두 값은 서로 달라야 정상입니다**(같으면 하네스가 거부합니다). Neon 은 pooled host 가 `-pooler` 형태로 다릅니다.

### production forbidden hash 계산
production URL 도 **저장소 파일이나 명령 기록에 남기지 않고** 일시 주입으로만 계산합니다.
```powershell
$env:NEON_CHECK_FORBIDDEN_URL = Read-Host "production URL(계산용, 즉시 제거)"
node --import tsx/esm scripts/neonCheck/hashTool.ts        # forbidden#<hash> 확인
Remove-Item Env:NEON_CHECK_FORBIDDEN_URL                    # 즉시 제거
$env:NEON_CHECK_FORBIDDEN_HOST_HASH = Read-Host "위에서 나온 forbidden hash"
```

> 도구는 `URL` 을 인자로 주면 **거부**합니다(명령 기록·프로세스 목록 노출 방지). malformed URL 이어도 원문을 출력하지 않습니다.

## 12. run-id 생성 규칙
하네스 정규식은 **`^[a-z0-9]{4,16}$`** 입니다 — **영문 소문자와 숫자만, 4~16자**. **밑줄(_)·대문자·하이픈 불가.**

| 예시 | 사용 가능 |
|---|---|
| `seoho20260720` | ✅ (13자) |
| `sh26072001` | ✅ (10자) |
| `orchchk01` | ✅ (9자) |
| `seoho_20260720_01` | ❌ 밑줄 포함·18자 |
| `SEOHO2026` | ❌ 대문자 |

run-id 는 다음 이름에 **접미사로 강제 사용**되어 운영 객체와 절대 겹치지 않게 합니다.
- synthetic schema: `oc_chk_<RUN_ID>`
- test roles: `oc_owner_<RUN_ID>`, `oc_admin_<RUN_ID>`, `oc_deployer_<RUN_ID>`, `oc_writer_<RUN_ID>`, `oc_reader_<RUN_ID>`, `oc_appsim_<RUN_ID>`
- functions / triggers: `oc_deny_write_<RUN_ID>` 등
- **cleanup 범위**: 위 `_<RUN_ID>` 이름에만 적용됩니다(운영 객체에는 적용 불가).

## 13. dry-run 실행 = **offline contract validation** (연결 0 · DB 쓰기 0)
저장소 루트에서:

```powershell
node --import tsx/esm scripts/neonOrchestrationCapabilityCheck.ts
```
`CONFIRM_EXECUTE` 를 **설정하지 않은 상태**가 dry-run 입니다. 이미 설정돼 있다면 먼저 제거하세요.
```powershell
Remove-Item Env:CONFIRM_EXECUTE -ErrorAction SilentlyContinue
```

### dry-run 이 검증하는 것 / 못 하는 것 (중요)
| 검증 **가능** (연결 없이) | 검증 **불가능** (연결이 필요) |
|---|---|
| env 구조·필수 변수 | credential 유효성 |
| URL 파싱(protocol/host/port) | DB 접속 가능성 |
| direct/pooled host hash **독립 pin** | `CREATE ROLE` capability |
| forbidden(production) hash 불일치 | public user table 0 |
| run-id 형식 | business table/row 0 |
| disposable token | migration history 0 |
| capability catalog 45 | 기존 `orchestration_*` role 0 |
| hardening assertion 10 | 이전 run 잔여 object 0 |
| synthetic 이름 scope | PgBouncer transaction mode |
| cleanup plan scope | direct/pooled 실제 권한 차이 |
| masked report · DB connection 0 · DB write 0 | |

> ⚠️ **"dry-run 통과 = 실행 준비 완료"가 아닙니다.**
> 정확한 표현은 **`offline contract validation passed` · `actual DB safety remains unverified`** 입니다.
> 오른쪽 열은 **SELECT-only preflight**(읽기 전용 연결) 단계에서 확인합니다 → [계약 문서](neon-select-only-preflight-contract.md).

### 정상 dry-run 결과 체크리스트
- [ ] **masked fingerprint 만 보임** (`url#xxxxxxxx…`, 실제 주소·아이디·비밀번호 없음) — direct·pooled 각각
- [ ] `status=offline-contract-validation` 표시
- [ ] **run-id 가 내가 입력한 값**과 같음
- [ ] endpoint pin 줄에 **direct/pooled 각각 독립 고정** + forbidden 불일치 표시
- [ ] **capability catalog = 45**
- [ ] **actual-neon-direct applicable = 40**
- [ ] **actual-neon-pooled applicable = 5**
- [ ] **hardening security assertions = 10** (capability 와 **합산하지 않음**)
- [ ] synthetic schema = `oc_chk_<RUN_ID>` · 모든 role 이름이 `_<RUN_ID>` 로 끝남
- [ ] **cleanup plan 이 run-id 범위에만** 있음(statement 수 기록)
- [ ] **DB connection 0 · DB write 0** 문구 확인
- [ ] 마지막 줄에 **actual DB safety remains unverified** 안내

가드에 걸리면 이런 형태로 **거부**됩니다(정상 동작입니다). 거부 메시지에는 URL·host 원문이 **절대 나오지 않습니다**:
```
[neon-check] ❌ 실행 거부(fail-closed):
  - pooled URL host hash ≠ expected pooled pin
  - NEON_CHECK_EXPECTED_HOST_HASH 는 폐기된 계약입니다 → ...
```

### dry-run 이 실패하면
**실제 실행을 하지 마세요.** 원인만 고치고 dry-run 을 다시 수행합니다. 특히 다음은 즉시 중단 사유입니다:
host hash mismatch · direct/pooled 구분 실패 · forbidden hash 일치 · catalog≠45 · assertion≠10 ·
cleanup 이 run-id 밖 참조 · raw URL/host/user/password 출력 · DB 연결이나 write 발생 ·
synthetic 이름이 run-id 밖 · `CONFIRM_EXECUTE` 없이 executor 진입 · status 가 aborted/error · **결과를 이해할 수 없음**.

## 14. 결과 공유 규칙 (Claude·문서·메신저 공통)
**공유 가능**: dry-run status · run-id · **masked** direct/pooled fingerprint(`url#xxxxxxxx…`) ·
expected/forbidden hash match 여부(일치/불일치만) · capability 45 · direct applicable 40 · pooled applicable 5 ·
hardening assertion 10 · cleanup statement 수 · synthetic schema/role prefix · DB connection 0 · DB write 0 · warning/error 코드.

**공유 금지**: direct URL · pooled URL · hostname 원문 · database 이름 · username · password ·
Neon API key · branch credential · 전체 environment dump · secret 이 섞였을 수 있는 raw exception stack.

> 애매하면 **보내지 마세요.** 하네스 출력은 이미 마스킹돼 있으므로, **출력 그대로 복사**하는 것이 가장 안전합니다.
> 직접 요약해 옮겨 적다가 host 원문을 넣는 사고가 가장 흔합니다.

## 15. 실제 실행 (⚠️ Phase 2 완료 후 진행)
`CONFIRM_EXECUTE=true` 는 이제 **실제로 실행**됩니다(execute core 구현 완료). capability 45종 개별 구현도 완료됐습니다. 아래 순서로 진행하세요.

```powershell
$env:CONFIRM_EXECUTE = "true"
node --import tsx/esm scripts/neonOrchestrationCapabilityCheck.ts
```

**다음 중 하나라도 해당하면 실행하지 않습니다.**
- host hash mismatch · production forbidden hash 일치 · existing business table 발견 · customer row 발견
- 기존 `orchestration_*` role 발견 · previous run object 발견 · direct/pooled URL 동일
- cleanup plan 이 run-id 밖을 참조 · dry-run 결과가 aborted · **운영자 별도 승인 없음**

## 16. 실행 후 결과 판정과 다음 행동 (설계 확정, 실행 본체 구현 후 적용)
| 결과 | 판정 | 운영자 다음 행동 |
|---|---|---|
| `passed-clean` | **성공** | 결과 저장 → §17 종료 절차 |
| `passed-branch-disposal-required` | **성공(단, 정리 필요)** | 결과 저장 → **branch 를 반드시 삭제** → §17 |
| `failed-cleanup` | **실패** | 잔여 객체/role 확인 → **branch 삭제로 정리** → 실패 사유 보고 |
| `aborted-safety-guard` | **실패** | 어떤 가드에 걸렸는지 확인 → branch 가 disposable 이 맞는지 재점검 → 필요 시 새 branch |
| partial execution | **실패** | branch 삭제 → 재시도 |
| disabled trigger 잔존 | **실패** | branch 삭제 → 재시도(운영 반영 금지) |
| role/object 잔존 | **실패** | branch 삭제(가장 확실) |
| membership revoke 실패 | **실패** | branch 삭제 → bootstrap 절차 재검토 |
| privilege mismatch | **실패** | 결과 보고 → 설계 수정 필요 |
| pooled/direct boundary mismatch | **실패** | 결과 보고 → pool 설계 수정 필요 |
> **실패를 성공으로 보고하지 않습니다.** 애매하면 **branch 폐기**가 가장 안전합니다.

## 17. 종료 절차
1. 결과 저장(마스킹된 항목만)
2. PowerShell 환경변수 제거(§10 `Remove-Item` 명령)
3. 임시 credential 폐기(Neon 콘솔 → Roles → 해당 role 삭제 또는 비밀번호 재발급)
4. pooled/direct 연결 종료(열어둔 터미널·툴 닫기)
5. **disposable branch 삭제**(Neon 콘솔 → Branches → 해당 branch → Delete)
6. 삭제 후 **해당 credential 로 접속이 안 되는지** 확인
7. Git working tree 변경 여부 확인(`git status`) — 변경 없어야 정상
8. **production 변경 0** 확인(운영 프로젝트는 이번 작업에서 건드리지 않음)

---

## 18. 정합성 검증 결과 (문서 ↔ 실제 코드)
아래는 이 문서를 쓰면서 `scripts/neonOrchestrationCapabilityCheck.ts` 를 직접 읽고 **실측**한 값입니다.

| 항목 | 코드 실측값 | 문서 반영 |
|---|---|---|
| 환경변수명 | `NEON_CHECK_DIRECT_URL` · `NEON_CHECK_POOLED_URL` · `NEON_CHECK_EXPECTED_HOST_HASH` · `NEON_CHECK_FORBIDDEN_HOST_HASH` · `NEON_CHECK_DISPOSABLE_CONFIRM` · `NEON_CHECK_RUN_ID` · `CONFIRM_EXECUTE` | 일치 ✓ |
| disposable 토큰 | `i-confirm-disposable-neon-branch` | 일치 ✓ |
| run-id 정규식 | `/^[a-z0-9]{4,16}$/` | 일치 ✓ (`seoho_20260720_01` 은 **부적합** 으로 명시) |
| hash 방식 | `sha256(new URL(url).host.toLowerCase())` 64hex | 일치 ✓ |
| capability 정본 | **45** (`scripts/neonCheck/capabilities.ts` 단일 정본에서 파생, 숫자 하드코딩 없음) | 일치 ✓ |
| cleanup statement count | **16** (enable-triggers 1 + DROP SCHEMA 1 + membership revoke 2 + DROP OWNED 6 + DROP ROLE 6) | 일치 ✓ |
| 실행 명령/경로 | `node --import tsx/esm scripts/neonOrchestrationCapabilityCheck.ts` | 일치 ✓ |
| synthetic 이름 | schema `oc_chk_<id>` · roles `oc_*_<id>` (production `orchestration_*` 와 불일치, 예약 접두 차단) | 일치 ✓ |
| **execute core** | **구현 완료**(guard 재검증→preflight→smoke→cleanup→잔여검증→분류) | **§0·§15 반영** ✓ |
| **capability 45 개별 구현** | **complete** | ✓ |
| credential 방식 | 하이브리드 B — 운영자는 bootstrap URL 한 쌍, synthetic LOGIN password 는 CSPRNG·메모리 전용·출력 0 | 일치 ✓ |
| public schema 가드 | user table > 0 이면 hard stop | 일치 ✓ |

- secret 을 출력하는 명령 **없음**(hash 만 출력, URL 은 `Read-Host` 입력·마스킹 출력).
- production 실행을 유도하는 문구 **없음**(production 은 "건드리지 않음" 대상으로만 등장).
- **Neon 실측을 완료했다고 표현하지 않음** — Neon capability 45종은 전부 `unverified (not-run)`.
