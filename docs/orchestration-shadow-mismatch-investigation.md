# shadow monitor `alreadyObserved` 4→0 — read-only 원인 조사

> Gate 항목 10: migration/hardening 과 **별도 원인**으로 분리해 확인. 집계만, raw report ID·고객 원문 미출력, shadow row 무수정·무삭제·무삽입, backfill·key rotation 없음.

## 관측
| 시점 | alreadyObserved | unobservedEligible | job_shadow_previews |
|---|---|---|---|
| 이전(0004 apply 전후) | 4 | 0 | 4 |
| 현재(2026-07-20) | **0** | **4** | **4** |

## read-only 집계 (monitor + shadow 테이블)
- monitor: `key configured=true keyVersion=v1` · renderer pin 1.28.0 ok · **selected=4 eligible=4 invalid=0** · **alreadyObserved=0 unobservedEligible=4 write=false** · **drift=0 driftFields=[] provenanceMismatch=0** · **duplicateExcluded=110** · shadow_total=4 · jobs=0 · job_executions=0.
- 저장된 shadow 4행(집계): source_status=**needs_review**×4 · observation_kind=needs-review×4 · source_ref_key_version=**v1**×4 · provenance_complete=**true**×4 · observed_window = **2026-07-19T09:50:11Z 단일 배치**.

## 정정된 표현 수준 (개별 전이 미확정)
| 지표 | 값 |
|---|---|
| stored shadow rows | 4 |
| current eligible reports | 4 |
| **observation_hash match** | **0** |
| **source_record_ref match** | **0** |
| **field drift** | **0** |
| **provenance mismatch** | **0** |
| most likely explanation | **eligible population replacement** |
| individual record transition reason | **unverified**(원문·식별자 비열람 조건에서 확정 불가) |

자동 write/backfill/delete **계속 금지**. 개별 레코드가 정확히 어떤 status 로 이동했는지는 **확정하지 않음**.

## 원인 판정 = **report 모집단 시프트(population shift)** — drift 아님
- `alreadyObserved=0` **그리고** `drift=0` 이 **동시** 성립: 현재 eligible 4건이 저장된 4건과 **observation_hash 도, source_record_ref(HMAC) 도 일치하지 않음**.
  - 만약 *같은 report* 인데 파이프라인/버전만 바뀐 것이면 → source_record_ref 는 같고 → **drift>0** 이어야 함. 그러나 drift=0.
  - 따라서 현재 eligible 4건은 저장된 4건과 **다른 report**(다른 raw id → 다른 HMAC ref)다.
- 즉 2026-07-19 09:50 에 needs_review 였던 4건이 **현재 eligible 상위 집합에서 빠졌고**(상태 변경 또는 최신 report 로 대체), **다른 4건이 needs_review-eligible** 로 진입. `duplicateExcluded=110` 은 활발한 report 테이블과 정합.
- 저장된 shadow 4행은 **09:50 시점의 불변 스냅샷**으로 그대로 유지(shadow_total=4).

## migration/hardening 과의 관계 = **무관**
- 0004 migration 은 report/shadow 데이터를 건드리지 않음(shadow_total 4 불변, jobs/exec 0).
- `write=false` → 자동 관측/backfill 없음. `drift=0`·`provenanceMismatch=0` → 무결성 신호 이상 없음.
- **결론**: 운영 report 모집단의 **자연 변동**. 조치 불필요. (원한다면 후속에서 "관측 이후 상태가 바뀐 source" 를 추적하는 별도 read-only drift-over-time 리포트를 둘 수 있으나 이번 범위 밖.)

## 미확정/후속(선택)
- 어떤 4건이 빠지고 어떤 4건이 들어왔는지의 *raw 매핑* 은 고객 식별정보라 **출력하지 않음**. 필요 시 protected-reference 수준 집계로만.
