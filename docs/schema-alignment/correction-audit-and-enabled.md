# 스키마 정렬 준비: correction_audit 편입 + enabled 기본값 (db:push 미실행)

> 이 문서는 **분석·준비 기록**이다. 실제 `db:push`·DDL·운영 DB 변경은 **아직 하지 않았다.**

## 1. correction_audit — 운영 DB 실제 구조 (읽기 전용 introspection)

| 컬럼 | 타입 | nullable | default |
|---|---|---|---|
| id | character varying | NO | `gen_random_uuid()` |
| action | text | NO | — |
| actor | text | YES | — |
| detail | text | YES | — |
| at | timestamp **without** time zone | NO | `now()` |

- **PK:** `correction_audit_pkey` (UNIQUE btree on `id`)
- **UNIQUE/CHECK/FK:** 없음 (implicit NOT NULL 외 사용자 CHECK 없음, FK 없음)
- **identity/sequence:** 없음 (`is_identity=NO`, id는 `gen_random_uuid()`)
- **인덱스:** PK 인덱스 하나뿐
- **행 수:** 25 (앱 재기동 시 startup export가 `export_blocked`(actor=startup) 감사 1행씩 추가 → 20→21→…→25)
- action 분포: revalidate 11 / manual_override_on 8 / export_blocked 5 / restore_deleted_correction_rules 1

## 2. shared/schema.ts 추가 내용 (운영과 정확히 일치)

```ts
export const correctionAudit = pgTable("correction_audit", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  action: text("action").notNull(),
  actor: text("actor"),
  detail: text("detail"),
  at: timestamp("at").defaultNow().notNull(),
});
```

- 컬럼명·타입·nullable·default·PK 모두 운영 DB와 **필드 단위 일치**.
- INSERT는 기존대로 `learnedDict.ts`의 raw SQL(5곳)이 담당(action/actor/detail만, id·at는 default). 이 Drizzle 정의는 **drizzle-kit이 이 테이블을 인지**하게 해 향후 db:push가 실수로 DROP하지 않도록 하는 목적.
- **correctionRules 스키마는 이번에 변경하지 않음**(origin/main과 byte 동일 확인).

## 3. enabled 기본값 불일치

- 운영 DB `correction_rules.enabled` default = **true**
- 코드(schema.ts) default = **false**

**판정: C (default 사실상 미사용).** 규칙 생성/삽입 경로가 항상 enabled를 명시값으로 넣음:
- `learnedDict.ts:293` `enabled: r.enabled ?? true`
- `learnedDict.ts:370/378` `enabled: active` (upsert patch)
- `:214` `enabled: status==="active"`, `:258` `enabled: on`, `:564` `enabled: false`

**권장 기준: false.** 근거 — 1단계 scope 설계 의도상 신규 규칙은 자동 활성화되면 안 되고(enabled = status==='active'), 신규는 pending/비활성으로 시작. DB의 true는 구 8컬럼 스키마의 잔재. 코드는 이미 false(의도 방향).
→ **default를 코드 기준(false)으로 DB를 정렬**하는 것이 맞으나, Case C라 실사용이 없어 우선순위는 낮음. 이번 단계에서는 **변경하지 않음**(권장·근거만).

## 4. 예상 SQL (내 변경분 기준) + 파괴 검문

내 변경(correction_audit 추가 + enabled 코드=false)만 놓고 보면:

| 대상 | 예상 db:push SQL | 파괴적? |
|---|---|---|
| correction_audit | **없음** — 정의가 운영 구조와 일치 → drizzle-kit이 이미 존재·일치로 판단 | — |
| correction_rules.enabled default | `ALTER TABLE "correction_rules" ALTER COLUMN "enabled" SET DEFAULT false;` | **아니오** (default만 변경, 기존 78행 무변경) |

**파괴 검문 (DROP TABLE/COLUMN · ALTER TYPE · rename · NOT NULL 추가 · index 삭제·재생성 · FK 변경 · 데이터 재작성):** 내 변경분에서 **해당 없음.** correction_rules 78행·correction_audit 25행 데이터 영향 **0**.

## ⚠️ 중요 한계 — 실제 db:push 전 전체 프리뷰 필요

`drizzle-kit push`는 **전체 schema.ts(28테이블) ↔ 운영 DB**를 비교한다. 위 분석은 **내가 바꾼 correction_audit/enabled만** 예측한 것이고, **나머지 27테이블에 기존 드리프트가 있으면 그에 대한 SQL도 함께 생성**된다.

- 운영 DB를 향한 `drizzle-kit push`(프리뷰 포함)는 이번 단계에서 **실행하지 않았다**(운영 대상 db:push 금지).
- 전체 예상 SQL의 확정은 **운영과 동일 스키마를 복제한 임시 Postgres**(동결 계획의 `TEST_DATABASE_URL` 준비조건)에 `drizzle-kit push --dry-run`으로 확인해야 한다. 그 임시 DB가 아직 없어 미실행.
- **따라서 실제 db:push 전에: (a) 임시 Postgres에 운영 스키마 복제 → (b) drizzle-kit 전체 예상 SQL 확인 → (c) 파괴 SQL 0 확인 → (d) 사람 승인** 순서가 남아 있다.

## 5. 이 단계 결과
- 운영 DB 쓰기 **0** (introspection은 `BEGIN READ ONLY` + ROLLBACK)
- db:push **0**, DDL **0**, Railway 배포 **0**
- tsc 통과, test:knop 15/15(PGlite), correctionRules 무변경
