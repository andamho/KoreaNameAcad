# 사고 기록: correction_rules 2행 삭제·복구 (2026-07-16)

> ⚠️ **이 디렉터리는 역사적 사고 기록 아카이브입니다. 일반 운영 도구가 아니며, 스크립트를 운영 DB에 대고 재실행하지 마세요.**

## 사고 일자
2026-07-16

## 개요
correction_rules(공유 교정사전) 검증 스크립트가 **운영 DB에서 실제 단어를 테스트 키로 사용**하면서, 해당 행을 DELETE 후 INSERT/DELETE했다. 그 과정에서 운영 규칙 2행이 삭제됐다.

## 영향 범위
- 대상 테이블: `correction_rules` (운영 DB)
- 삭제된 행 수: **2행**
- 실제 교정 적용 영향: 삭제된 규칙은 자동 적용 대상이 아니었고(사전이 fail-closed로 동작), 교정 출력에 직접적 오작동은 확인되지 않음. 다만 운영 데이터가 소실된 것 자체가 사고.

## 복구 방식
1. Neon **PITR(Point-in-Time Recovery) 복구 브랜치**를 사고 직전 시점으로 생성.
2. 복구 브랜치에서 삭제된 2행의 **원본 값을 그대로 읽어**, 운영 DB에 단일 트랜잭션으로 복원.
   - 추측값·현재시각·새 UUID·새 count 없음. 원본 그대로.
   - 사전검증(복원 전 기대 상태) → INSERT 2행 → 감사로그 1건 → 사후검증(복원 후 기대 상태) → 전부 통과 시에만 COMMIT, 아니면 ROLLBACK.
   - `ON CONFLICT` 미사용 → 예상치 못한 충돌 시 조용히 덮어쓰지 않고 즉시 실패·롤백.

## 검증 방식
- **읽기 전용 diff**(`recoveryDiff.ts`): 운영 DB vs PITR 복구 브랜치를 양쪽 `BEGIN READ ONLY`로 비교.
- **동결 확인**(`verifyFrozen.ts`): 복구 후 운영 규칙 DB·사전 파일이 그대로인지 SHA-256 지문으로 증명(읽기 전용).
- **문맥 조사**(`legacyContext.ts`): 관련 규칙의 문장 문맥을 읽기 전용으로 확인.

## 복구 완료 기준 (당시)
- `correction_rules` **총 78행**, `status='active' 0`.
- 이 상태가 이후에도 유지됨을 별도 read-only 조회로 확인.

## 재발 방지책
- 교정사전 테스트 안전 가드(`tests/knop/testGuard.ts`) 도입:
  - 운영 접속 문자열/동일 호스트/테스트 표식 없는 DB는 **테스트 실행 자체를 거부**.
  - 모든 테스트는 `BEGIN → … → 항상 ROLLBACK`, 성공해도 COMMIT 안 함.
  - `TEST_DATABASE_URL` 미설정 시 **PGlite(메모리 Postgres)만** 사용.
- 회귀 테스트(`tests/knop/correctionRules.test.ts`)로 이 가드를 상시 검증.

## 재실행 금지 안내
- `recoveryApply.ts`는 **운영 DB 쓰기가 가능했던 일회성 복구 스크립트**다. 아카이브 보관 시:
  - 파일 상단에 재실행 금지 경고를 붙였고, `main()`은 **즉시 종료**하도록 막아뒀다.
  - `RECOVERY_DATABASE_URL` 없으면 실행 불가, 복구 URL과 운영 URL 동일 시 중단, 기대 행 수 불일치 시 ROLLBACK 등 원래 가드도 유지.
  - 현재 운영 상태(78행)에서는 사전검증(당시 기대값 76행)과 어긋나 어차피 ROLLBACK된다.

## 비식별화 안내
- 스크립트에 있던 **실제 고객 이름성 단어·규칙 단어는 `CUSTOMER_TERM_*`/`RULE_TERM_*` placeholder**로, **삭제된 행의 실제 UUID는 `RESTORED_RULE_ID_*` placeholder**로 대체했다.
- **원본 민감값(실제 단어·UUID·DB 접속문자열·토큰)은 Git에 저장하지 않았다.** 실제 식별자가 필요하면 운영 DB의 `correction_audit` 감사로그에 남아 있다.
- 이 비식별화로 스크립트는 그대로 실행되지 않는다(placeholder 값). 이는 의도된 안전장치이며, 문서상 사고 대응 방법론(READ ONLY diff·상태 가드·지문 검증)의 기록 가치는 유지된다.
