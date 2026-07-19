# orchestration schema migration (0004) — 준비 매니페스트

> Gate "orchestration schema migration preparation". additive migration 코드 완성 + 격리 PG17 검증까지.
> **운영 apply·registry 활성 배선·adapter 실행 없음.** 운영 apply 는 별도 승인 Gate.

계약 근거: [cross-agent-orchestration-contract](cross-agent-orchestration-contract.md) · `shared/orchestration/{types,schema}.ts` · `server/orchestration/*`.

## 산출물
- `migrations/0004_cross_agent_orchestration.sql` — additive 6테이블(내부 FK RESTRICT, audit/emergency 무FK).
- `shared/schema.ts` — drizzle 6테이블 정의(컬럼·FK·인덱스 parity; CHECK 는 SQL 단일 소스).
- `server/migrations/registry.ts` — 0004 등록(SQL·fixture sha256 핀).
- `tests/knop/fixtures/orchestrationFingerprint.json` — 구조 fingerprint(PGlite 생성, 실제 PG17 과 일치 확인).
- `tests/knop/orchestrationMigration.test.ts` — 격리 검증 21 테스트.

## 6 테이블 (총 77컬럼 · PK6 · FK12 · CHECK21 · 인덱스18[PK6+UNIQUE6+일반6, 부분3])
| 테이블 | 역할 | FK(RESTRICT) | 주요 무결성 |
|---|---|---|---|
| job_artifacts | immutable artifact handoff·lineage | producer_job→jobs, producer_exec→job_executions | UNIQUE(exec,kind,content_hash) · immutable=true · secret plaintext 금지 · customer-sensitive→protected ref 필수 · hash hex |
| job_dependencies | job 간 의존·version pin | job→jobs, depends_on→jobs, resolved_exec→job_executions, resolved_artifact→job_artifacts | UNIQUE(job,depends_on,type) · no-self CHECK · type/status CHECK |
| automated_reviews | 자동 검토 결과 | reviewed_job→jobs, reviewed_exec→job_executions, reviewed_artifact→job_artifacts, correction→job_artifacts | UNIQUE(exec,reviewer_kind,version) · decision/reviewer/severity CHECK |
| human_approvals | 사람 승인 게이트 | job→jobs, review→automated_reviews | 부분 UNIQUE(job) WHERE awaiting-approval · status CHECK |
| orchestration_audit_log | append-only 감사 | 없음(의도) | seq bigint identity · actor CHECK |
| emergency_stops | 수동 정지 | 없음(의도) | 부분 UNIQUE(scope_type,scope_key) WHERE active · scope CHECK |

## 설계 결정(사전 조사 대비 확정)
- **artifact 중복 UNIQUE = (producer_execution_id, artifact_kind, content_hash)**. 사전 조사의 `(execution,kind)` 는 과도 —
  한 execution 이 같은 kind 의 복수 artifact(다른 content)를 합법적으로 낼 수 있으므로 content_hash 를 포함해 "동일 content 재기록"만 차단(멱등 writer).
- **review 중복 UNIQUE = (reviewed_execution_id, reviewer_kind, reviewer_version)**. 수정/재시도는 새 execution → reviewed_execution_id 가 달라져 라운드마다 자연히 유일. reviewer_kind 추가로 다중 검증기 병행 허용.
- **emergency_stops.scope_key = NOT NULL DEFAULT ''**(nullable+COALESCE 대신). ''=scope 전체(global 등). 부분 UNIQUE(scope_type,scope_key) WHERE active 하나로 "활성 global 중복"과 "동일 scope 활성 중복"을 모두 차단하며 표현식 인덱스의 엔진 간 렌더링 차이(fingerprint 위험)를 제거.
- **순환 dependency = 애플리케이션 가드(detectCycleJobs)**. DB 는 self-dependency CHECK 만(행 간 재귀 불가).
- **immutable = CHECK(immutable=true)** 로 immutable=false 삽입을 DB 거부(약속의 DB 표현).
- **append-only(audit)·immutable UPDATE 물리차단 trigger 는 이번 범위 제외** → 별도 hardening Gate. 근거: 범용 러너의
  정적 안전 스캐너가 트리거 본문의 `UPDATE`/`DELETE` 키워드를 위험 SQL 로 거부(충돌), 운영/테스트 role·teardown 상호작용 검증 별도 필요.
  이번엔 컬럼 + CHECK + 애플리케이션 계약으로만 보장.

## 민감정보 계약(전 테이블)
고객 원문·이름·전화·녹음 URL·로컬 경로·secret 저장 컬럼 없음. 민감 참조 = protected reference(HMAC hex, `~ '^[0-9a-f]{64}$'`) 또는 비민감 content_location. calls/customers/consultations 등 외부 도메인에 FK 없음.

## 검증
- PGlite: `tests/knop/orchestrationMigration.test.ts` 21/21 · test:knop 190/190 · tsc 0.
- 실제 PG17(embedded-postgres 17.10, 격리): 0001→0004 순차 적용 · dry-run ROLLBACK · commit · 재적용 거부 · fingerprint 일치 · FK 강제 · 18 시나리오 constraint 거부/허용 전부 통과.
- 운영 read-only inspect: state=not-applied · safety-scan pass · SQL 체크섬 일치 · base 33/FK 4 불변.

## 남은 승인(이 Gate 아님)
1. **운영 apply**(0004): 별도 승인 → inspect→dry-run→apply(CONFIRM_APPLY + host 핀).
2. **append-only/immutable DB 강제**(role/trigger) hardening Gate.
3. GPT/Claude adapter 구현 Gate · automated review loop · human approval UI.
