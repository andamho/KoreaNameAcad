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
| **SELECT-only preflight** | **implemented** (실제 Neon 실행은 not-run) |
| **forbidden direct/pooled 분리** | **complete** (4개 조합 set 비교) |
| **execute evidence gating** | **complete** (HMAC-SHA256 + nonce + 만료 + 1회 소비, 단순 sha256 제거) |
| **typecheck ownership coverage** | **pass** (310/310 귀속 · unclaimed 0) |
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

## 3. 확정된 Neon 파라미터 — **운영자가 선택할 것이 없습니다**
아래 값은 현재 운영 환경과 검증 목적을 근거로 **이미 결정**했습니다. 그대로 입력만 하시면 됩니다.

| 항목 | 확정값 | 근거 |
|---|---|---|
| 형태 | **새 project**(branch 아님) | 저장소에 격리된 기존 테스트 환경 기록이 **0건**. Neon branch 는 copy-on-write 라 부모 데이터가 따라올 수 있음. 별도 project 여야 forbidden host hash 도 명확히 구분됨 |
| Project 이름 | `kna-orchcheck-disposable` | 폐기용임이 이름에서 드러나고 production 과 혼동 불가 |
| Region | `Asia Pacific (Singapore) ap-southeast-1` | Neon 지원 region 중 한국에서 가장 가까움(왕복 지연 최소). 별도 project 라 production region 과 결합되지 않음 |
| PostgreSQL version | **17** | 운영 Neon 이 **17.10** 이므로 major 일치가 검증의 전제. 16/18 이면 결과를 정본으로 쓸 수 없음 |
| Database 이름 | `orchcheck` | 기본값(`neondb`)과 구분해 오접속 방지 |
| Role 이름 | `orchcheck_owner` | 기본 owner role. **권한은 변경하지 마세요** — `CREATE ROLE` 가능 여부가 이번 측정 대상입니다 |
| Direct endpoint | Connection Details 에서 **Pooled connection 끄기** | 원 endpoint |
| Pooled endpoint | 동일 화면에서 **Pooled connection 켜기**(`-pooler` 포함) | PgBouncer 경로 |
| 검증 후 삭제 대상 | **project 전체** | 부분 삭제보다 확실 |

> ⚠️ PostgreSQL **17** 을 고를 수 없으면 **거기서 멈추고 알려주세요.** 다른 major 로 진행하면
> 이번 측정 결과를 운영 판단 근거로 쓸 수 없습니다.

> ⚠️ 고객 데이터가 **한 건이라도** 있는 환경은 사용하지 않습니다. 새 project 는 처음부터 비어 있습니다.

## 4. 실행 — **명령 하나**
환경변수 조립·hash 계산·모드 전환·정리를 **스크립트가 전부 처리**합니다.
운영자가 할 일은 **URL 4개를 붙여넣는 것뿐**입니다.

```powershell
cd C:\Users\iimoo\koreanameacad\kna-orchmig-wt
powershell -ExecutionPolicy Bypass -File scripts\neonCheck\runDisposablePreflight.ps1
```

스크립트가 순서대로 물어봅니다(입력한 문자는 **화면에 표시되지 않고 명령 기록에도 남지 않습니다**):

```
1/4 disposable  direct URL
2/4 disposable  pooled URL
3/4 production  direct URL (차단 대상)
4/4 production  pooled URL (차단 대상)
```

그다음은 자동입니다.
- host hash 4개 내부 계산(URL 원문은 출력하지 않음)
- 접속 **전** 로컬 검문(direct=pooled 오입력, production 과 일치 등)
- **STEP 1 offline dry-run** → 성공했을 때만
- **STEP 2 SELECT-only preflight**(읽기 전용 연결, DDL 0 · DML 0)
- 환경변수·평문 정리(성공·실패 무관)
- **마스킹된 보고서 파일 1개** 생성

`CONFIRM_EXECUTE` 는 스크립트가 **절대 설정하지 않으며**, 이미 설정돼 있으면 시작할 때 제거합니다.

### 결과 공유
마지막 줄에 보고서 경로가 나옵니다.

```
보고서(마스킹됨): C:\Users\...\Temp\neon-preflight-report-YYYYMMDD-HHMMSS.txt
```

이 **파일 내용을 그대로 복사해서** 보내주시면 됩니다. URL·비밀번호·hostname 원문은 들어 있지 않습니다.
(직접 요약해 옮겨 적다가 hostname 을 넣는 사고가 가장 흔하므로, **그대로 복사**를 권합니다.)

### 실패했다면
그대로 보고서를 보내주세요. 특히 다음은 **정상적인 방어 동작**이며 잘못 하신 게 아닙니다.
- `preflight-aborted-safety-guard` — 대상 DB 에 테이블/데이터가 있음
- `preflight-target-identity-unverified` — direct/pooled 가 다른 DB 를 가리킴
- `preflight-connection-failed` — credential 문제
- `입력 검문 실패` — URL 4개 중 잘못 붙여넣은 것이 있음

### 종료 후
1. Neon 콘솔에서 **credential 폐기**(role password rotate 또는 삭제)
2. **project 전체 삭제**
3. PowerShell 창 닫기

> 스크립트가 환경변수를 정리하지만, 창을 닫는 것이 가장 확실합니다.

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
