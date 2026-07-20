# disposable Neon 검증 — 운영자 준비 안내서

> 대상: 서호님(운영자). 목적: Neon 콘솔에서 **폐기용(disposable) branch** 와 **임시 TEST credential** 을 안전하게 준비하는 절차.
> 이 문서 자체는 **Neon 접속·branch 생성·credential 생성·DB 실행을 하지 않았습니다.** 준비 절차와 검증 명령만 적었습니다.
> 하네스: `scripts/neonOrchestrationCapabilityCheck.ts` · 계약 문서: [disposable-neon-orchestration-verification.md](disposable-neon-orchestration-verification.md)

---

## ⚠️ 0. 먼저 읽어주세요 — 현재 상태 (Phase 2 완료 시점)

**execute 실행 본체와 capability 45종 구현이 모두 완료**되었고, 격리 환경에서 검증했습니다.
**그러나 실제 Neon 은 아직 한 번도 접속하지 않았습니다(not-run).**

| 항목 | 현재 상태 |
|---|---|
| 안전 가드 · 실행 계획(dry-run) | **complete** |
| execute core(연결·preflight·cleanup·잔여검증·결과판정) | **complete** |
| **capability 45종 구현** | **complete** |
| `pglite` profile 검증 | **verified** (applicable 22 / 45) |
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

## 3. production 과 분리된 disposable branch 생성
> 목표: **데이터가 복제되지 않은 빈 branch**. Neon 의 기본 branch 생성은 부모 데이터를 함께 가져올 수 있으므로 주의합니다.

1. 프로젝트 화면에서 **Branches** 메뉴로 이동합니다.
2. **Create branch** 를 클릭합니다.
3. **Branch name** 에 폐기용임이 드러나는 이름을 입력합니다. 예: `disposable-orch-check` *(production branch 이름과 확실히 달라야 합니다)*
4. 데이터 포함 옵션이 보이면 **데이터를 복제하지 않는 옵션**(빈 branch / schema-only 등)을 선택합니다.
   - 해당 옵션이 없다면 → **branch 대신 별도의 새 Project 를 만들어** 완전히 빈 데이터베이스를 사용하세요(가장 안전).
5. **Create** 를 클릭합니다.

## 4. production 데이터가 복제되지 않았는지 확인 (필수)
아래 중 **하나라도 해당하면 그 branch 를 삭제하고 다시 만드세요.**

- [ ] 기존 **CRM·상담·보고서 테이블**(customers, consultations, calls 등)이 **존재함**
- [ ] business table 에 **행(row)이 1건이라도 존재함**
- [ ] **migration history 가 production 과 동일하게 복제**되어 있음
- [ ] 기존 **`orchestration_*` role** 이 존재함
- [ ] **고객 데이터가 한 건이라도** 존재함
- [ ] branch 이름 / database 이름이 **production 과 구분되지 않음**

> 하네스는 위와 같은 **production-like fingerprint 를 발견하면 즉시 fail-closed 로 중단**합니다(업무 테이블 존재·기존 행 > 0·production 이름 `orchestration_*` role 존재·이전 run 잔여 객체). 판정이 애매해도 **중단**합니다. 그래도 **1차 방어선은 운영자의 위 확인**입니다.

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
> **원칙**: `.env` 파일 저장 금지 · 메모장/문서/Git 저장 금지 · PowerShell 세션에만 일시 주입 · 실행 후 제거 · 터미널에 URL 재출력 금지 · **URL·비밀번호를 채팅(Claude)으로 보내지 않기**.

명령 기록에 URL 이 남지 않도록 **`Read-Host` 로 입력**받습니다.

```powershell
# 1) URL 입력 (화면·기록에 남지 않게 Read-Host 사용)
$env:NEON_CHECK_DIRECT_URL = Read-Host "direct URL 붙여넣기"
$env:NEON_CHECK_POOLED_URL = Read-Host "pooled URL 붙여넣기"

# 2) host hash (§11 에서 계산한 값 붙여넣기)
$env:NEON_CHECK_EXPECTED_HOST_HASH  = Read-Host "direct host hash"
$env:NEON_CHECK_FORBIDDEN_HOST_HASH = Read-Host "production host hash"

# 3) 고정 값
$env:NEON_CHECK_DISPOSABLE_CONFIRM = "i-confirm-disposable-neon-branch"
$env:NEON_CHECK_RUN_ID             = "<RUN_ID>"   # §12 규칙 참고
```

실행이 끝나면 **반드시 제거**합니다.

```powershell
Remove-Item Env:NEON_CHECK_DIRECT_URL, Env:NEON_CHECK_POOLED_URL, `
            Env:NEON_CHECK_EXPECTED_HOST_HASH, Env:NEON_CHECK_FORBIDDEN_HOST_HASH, `
            Env:NEON_CHECK_DISPOSABLE_CONFIRM, Env:NEON_CHECK_RUN_ID, Env:CONFIRM_EXECUTE -ErrorAction SilentlyContinue
```

## 11. host hash 계산 방법 (URL 원문 출력 0)
하네스와 **동일한 방식**입니다: `sha256( new URL(url).host.toLowerCase() )` → 64자리 hex.
아래는 URL 을 화면에 출력하지 않고 **hash 만** 출력합니다(표준입력으로 전달하므로 프로세스 인자에도 남지 않습니다).

```powershell
$u = Read-Host "URL 붙여넣기 (direct / pooled / production 각각 따로)"
$u | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const{createHash}=require('crypto');console.log(createHash('sha256').update(new URL(s.trim()).host.toLowerCase()).digest('hex'))})"
Remove-Variable u
```

- **direct host hash** → `NEON_CHECK_EXPECTED_HOST_HASH`
- **production host hash** → `NEON_CHECK_FORBIDDEN_HOST_HASH` (같으면 하네스가 거부)
- pooled host 는 direct 와 **달라야** 정상입니다(확인용으로만 계산).

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

## 13. dry-run 실행 명령 (연결 0 · DB 쓰기 0)
저장소 루트에서:

```powershell
node --import tsx/esm scripts/neonOrchestrationCapabilityCheck.ts
```

`CONFIRM_EXECUTE` 를 **설정하지 않은 상태**가 dry-run 입니다.

### 정상 dry-run 결과 체크리스트
- [ ] **masked URL 만 보임** (`url#xxxxxxxx…` 형태, 실제 주소·아이디·비밀번호 없음)
- [ ] **run-id 가 내가 입력한 값**과 같음
- [ ] **production-like object 0** (거부 메시지가 없음)
- [ ] **실제 실행 not-run** (마지막 줄이 `dry-run 종료(DB write 0)`)
- [ ] **DB write 0** 문구 확인
- [ ] **capability count = 39**
- [ ] **cleanup plan 이 run-id 범위에만** 있음 (statement 13개, 전부 `_<RUN_ID>` 포함)

가드에 걸리면 이런 형태로 **거부**됩니다(정상 동작입니다):
```
[neon-check] ❌ 실행 거부(fail-closed):
  - NEON_CHECK_DIRECT_URL 없음
  - disposable 확인 토큰 불일치/누락
```

## 14. 결과 공유 규칙 (Claude·문서·메신저 공통)
**공유해도 되는 것**: masked host fingerprint(`url#xxxxxxxx…`) · run-id · capability count · production-like fingerprint count · cleanup statement count · dry-run status
**절대 공유 금지**: connection URL · hostname 원문 · username · password · Neon API key · branch credential
> dry-run 출력을 그대로 복사해도 URL 은 마스킹되어 있지만, **붙여넣기 전에 한 번 눈으로 확인**해 주세요.

## 15. 실제 실행 (⚠️ Phase 2 완료 후 진행)
`CONFIRM_EXECUTE=true` 는 이제 **실제로 실행**됩니다(execute core 구현 완료). 다만 **capability 45종 개별 구현이 Phase 2 예정**이므로, **Phase 2 완료 후**에 아래 순서로 진행하세요.

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
| **capability 45 개별 구현** | **partial**(Phase 1 = smoke 4종) | **§0 에 명시** ✓ |
| credential 방식 | 하이브리드 B — 운영자는 bootstrap URL 한 쌍, synthetic LOGIN password 는 CSPRNG·메모리 전용·출력 0 | 일치 ✓ |
| public schema 가드 | user table > 0 이면 hard stop | 일치 ✓ |

- secret 을 출력하는 명령 **없음**(hash 만 출력, URL 은 `Read-Host` 입력·마스킹 출력).
- production 실행을 유도하는 문구 **없음**(production 은 "건드리지 않음" 대상으로만 등장).
- **Neon 실측을 완료했다고 표현하지 않음** — Neon capability 39종은 전부 `unverified (not-run)`.
