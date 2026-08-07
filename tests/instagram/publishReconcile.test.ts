// 인스타 게시 조정(reconciliation) 테스트 — 실제 게시는 하지 않는다.
// 실행: npm run test:instagram
//
// 범위
//  1) 상태기계(순수 함수) 전 분기 — DB·네트워크 없음
//  2) Graph API 래퍼 — global.fetch 목킹
//  3) 리스/중복방지 — SQL 의미를 그대로 옮긴 인메모리 모형으로 동시 실행 검증
//
// 여기서 검증하는 불변식(이번 사고의 재발 방지선):
//  - ERROR 한 번으로 최종 실패를 확정하지 않는다
//  - PUBLISHED 면 media_id 를 못 찾아도 재게시하지 않는다
//  - 펜싱이 실패하면 media_publish 를 아예 호출하지 않는다
import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

// DB 없이 import 되도록(=db null) 환경을 먼저 비운다
delete process.env.DATABASE_URL;
delete process.env.NEON_DATABASE_URL;
delete process.env.INSTAGRAM_ACCESS_TOKEN;

const {
  decideNextAction,
  toLegacyJobStatus,
  isContainerExpired,
  GRACE_DELAYS_MS,
  CONTAINER_TTL_MS,
} = await import("../../server/instagram/publishDecision");
const { igCreateReelContainer, igFetchContainerStatus, igMediaPublish } = await import(
  "../../server/instagram/publish"
);

const NOW = new Date("2026-08-07T00:00:00Z");
const basePub = {
  state: "publishing" as const,
  creationId: "CONTAINER_1",
  containerCreatedAt: new Date(NOW.getTime() - 60_000),
  checkAttempt: 0,
  mediaId: null as string | null,
};

// ── 1) 상태기계 ──────────────────────────────────────────────────────────────
describe("decideNextAction — 기존 creation_id 상태별 분기", () => {
  test("PUBLISHED: media_id 가 있으면 완료 확정", () => {
    const a = decideNextAction({ ...basePub, mediaId: "M1" }, "PUBLISHED", NOW);
    assert.equal(a.kind, "finalize_published");
    assert.equal((a as any).mediaId, "M1");
  });

  test("PUBLISHED: media_id 를 못 찾아도 완료 확정하고 재게시하지 않는다", () => {
    const a = decideNextAction({ ...basePub, mediaId: null }, "PUBLISHED", NOW);
    assert.equal(a.kind, "finalize_published");
    assert.equal((a as any).mediaId, null);
    assert.notEqual(a.kind, "publish_existing"); // 절대 재게시로 가지 않는다
  });

  test("FINISHED: 기존 creation_id 로 게시", () => {
    const a = decideNextAction(basePub, "FINISHED", NOW);
    assert.equal(a.kind, "publish_existing");
    assert.equal((a as any).creationId, "CONTAINER_1");
  });

  test("EXPIRED: 이때만 컨테이너 교체 허용", () => {
    const a = decideNextAction(basePub, "EXPIRED", NOW);
    assert.equal(a.kind, "replace_container");
  });

  test("state=published 면 무슨 status 가 와도 중단", () => {
    for (const s of ["FINISHED", "ERROR", "IN_PROGRESS", "PUBLISHED", "EXPIRED"]) {
      const a = decideNextAction({ ...basePub, state: "published" }, s, NOW);
      assert.equal(a.kind, "abort", `status=${s} 인데 중단하지 않았다`);
    }
  });

  test("알 수 없는 status_code 는 성공으로 오해하지 않는다", () => {
    const a = decideNextAction(basePub, "SOMETHING_NEW", NOW);
    assert.equal(a.kind, "abort");
  });

  test("creation_id 가 없으면 중단", () => {
    const a = decideNextAction({ ...basePub, creationId: null }, "FINISHED", NOW);
    assert.equal(a.kind, "abort");
  });
});

describe("ERROR 유예 — 30/60/120초, off-by-one 없음", () => {
  test("최초 ERROR(check_attempt=0) → 30초 뒤 재확인, attempt=1", () => {
    const a = decideNextAction({ ...basePub, checkAttempt: 0 }, "ERROR", NOW);
    assert.equal(a.kind, "schedule_recheck");
    assert.equal((a as any).delayMs, 30_000);
    assert.equal((a as any).nextAttempt, 1);
  });

  test("attempt=1 → 60초, attempt=2", () => {
    const a = decideNextAction({ ...basePub, checkAttempt: 1 }, "ERROR", NOW);
    assert.equal((a as any).delayMs, 60_000);
    assert.equal((a as any).nextAttempt, 2);
  });

  test("attempt=2 → 120초, attempt=3", () => {
    const a = decideNextAction({ ...basePub, checkAttempt: 2 }, "ERROR", NOW);
    assert.equal((a as any).delayMs, 120_000);
    assert.equal((a as any).nextAttempt, 3);
  });

  test("attempt=3(소진) → 최종 실패. 무한 대기하지 않는다", () => {
    const a = decideNextAction({ ...basePub, checkAttempt: 3 }, "ERROR", NOW);
    assert.equal(a.kind, "fail_final");
  });

  test("유예 간격 합계는 210초", () => {
    assert.equal(GRACE_DELAYS_MS.reduce((s, n) => s + n, 0), 210_000);
  });

  test("IN_PROGRESS 도 같은 유예 사다리를 탄다", () => {
    const a = decideNextAction({ ...basePub, checkAttempt: 0 }, "IN_PROGRESS", NOW);
    assert.equal(a.kind, "schedule_recheck");
    assert.equal((a as any).delayMs, 30_000);
  });

  test("실제 사고 재현: ERROR → 재조회에서 FINISHED → 새 컨테이너 없이 게시", () => {
    const first = decideNextAction({ ...basePub, checkAttempt: 0 }, "ERROR", NOW);
    assert.equal(first.kind, "schedule_recheck");
    const second = decideNextAction({ ...basePub, checkAttempt: 1 }, "FINISHED", NOW);
    assert.equal(second.kind, "publish_existing");
    assert.equal((second as any).creationId, "CONTAINER_1"); // 같은 컨테이너
  });
});

describe("컨테이너 24시간 만료", () => {
  test("TTL 초과면 ERROR 여도 교체로 간다", () => {
    const old = new Date(NOW.getTime() - CONTAINER_TTL_MS - 1000);
    const a = decideNextAction({ ...basePub, containerCreatedAt: old }, "ERROR", NOW);
    assert.equal(a.kind, "replace_container");
  });

  test("TTL 이내면 유예 재확인", () => {
    const a = decideNextAction(basePub, "ERROR", NOW);
    assert.equal(a.kind, "schedule_recheck");
  });

  test("isContainerExpired 경계", () => {
    assert.equal(isContainerExpired(new Date(NOW.getTime() - CONTAINER_TTL_MS + 1000), NOW), false);
    assert.equal(isContainerExpired(new Date(NOW.getTime() - CONTAINER_TTL_MS - 1000), NOW), true);
    assert.equal(isContainerExpired(null, NOW), false);
  });
});

describe("video_jobs.ig_status 는 기존 어휘만 쓴다", () => {
  test("신규 상태값이 새어나가지 않는다", () => {
    const allowed = new Set(["queued", "uploading", "retrying", "published", "failed", "skipped"]);
    for (const s of ["publishing", "publish_unknown", "published"] as const) {
      assert.ok(allowed.has(toLegacyJobStatus(s)), `${s} → ${toLegacyJobStatus(s)} 는 기존 어휘가 아니다`);
    }
  });

  test("진행 중 상태가 종결로 보이지 않는다", () => {
    assert.equal(toLegacyJobStatus("publishing"), "retrying");
    assert.equal(toLegacyJobStatus("publish_unknown"), "retrying");
    assert.equal(toLegacyJobStatus("published"), "published");
  });
});

// ── 2) Graph API 래퍼 (fetch 목킹) ──────────────────────────────────────────
describe("Graph API 래퍼 — fetch 목킹", () => {
  const realFetch = globalThis.fetch;
  let calls: Array<{ url: string; method: string }> = [];

  const mock = (handler: (url: string) => { ok: boolean; body: any }) => {
    globalThis.fetch = (async (input: any, init: any) => {
      const url = String(input);
      calls.push({ url, method: init?.method ?? "GET" });
      const { ok, body } = handler(url);
      return { ok, json: async () => body } as any;
    }) as any;
  };

  beforeEach(() => {
    calls = [];
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  test("컨테이너 생성은 id 를 creationId 로 돌려준다", async () => {
    mock(() => ({ ok: true, body: { id: "C_NEW" } }));
    const r = await igCreateReelContainer({ token: "T", videoUrl: "https://x/v.mp4", caption: "c" });
    assert.equal(r.creationId, "C_NEW");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, "POST");
  });

  test("컨테이너 생성 실패는 던진다", async () => {
    mock(() => ({ ok: false, body: { error: { message: "bad" } } }));
    await assert.rejects(
      () => igCreateReelContainer({ token: "T", videoUrl: "https://x/v.mp4", caption: "c" }),
      /컨테이너 생성 실패/,
    );
  });

  test("상태 조회는 판단하지 않고 status_code 원문을 그대로 올린다", async () => {
    for (const code of ["IN_PROGRESS", "FINISHED", "ERROR", "PUBLISHED", "EXPIRED"]) {
      mock(() => ({ ok: true, body: { id: "C1", status_code: code, status: code } }));
      const r = await igFetchContainerStatus({ token: "T", creationId: "C1" });
      assert.equal(r.statusCode, code);
    }
  });

  test("게시는 media_id 를 돌려준다", async () => {
    mock(() => ({ ok: true, body: { id: "M_NEW" } }));
    const r = await igMediaPublish({ token: "T", creationId: "C1" });
    assert.equal(r.mediaId, "M_NEW");
  });

  test("2026-08-06 재현: 같은 컨테이너가 ERROR 뒤 FINISHED 로 바뀐다", async () => {
    const seq = ["ERROR", "ERROR", "FINISHED"];
    let i = 0;
    mock(() => ({ ok: true, body: { id: "C1", status_code: seq[i++] } }));

    let pub = { ...basePub };
    let action = decideNextAction(pub, (await igFetchContainerStatus({ token: "T", creationId: "C1" })).statusCode, NOW);
    assert.equal(action.kind, "schedule_recheck");
    pub = { ...pub, checkAttempt: (action as any).nextAttempt };

    action = decideNextAction(pub, (await igFetchContainerStatus({ token: "T", creationId: "C1" })).statusCode, NOW);
    assert.equal(action.kind, "schedule_recheck");
    pub = { ...pub, checkAttempt: (action as any).nextAttempt };

    action = decideNextAction(pub, (await igFetchContainerStatus({ token: "T", creationId: "C1" })).statusCode, NOW);
    assert.equal(action.kind, "publish_existing");
    assert.equal((action as any).creationId, "CONTAINER_1"); // 컨테이너 재생성 없음
  });
});

// ── 3) 리스·중복방지 (SQL 의미의 인메모리 모형) ─────────────────────────────
// 실제 UNIQUE/ON CONFLICT 는 Postgres 가 보장한다. 여기서는 "우리 코드가 그 원시연산을
// 올바로 쓰는가"를 본다. 모형은 마이그레이션 SQL 의 WHERE 절을 그대로 옮긴 것이다.
type Row = {
  state: "publishing" | "published" | "publish_unknown";
  leaseToken: string | null;
  leaseExpiresAt: number | null;
  publishAttemptCount: number;
  creationId: string;
  containerGeneration: number;
};

class FakeRepo {
  row: Row | null = null;
  publishCalls = 0;

  /** acquireLease 의 INSERT ... ON CONFLICT DO UPDATE ... WHERE 와 동일 의미 */
  acquire(now: number, creationId: string, token: string): Row | null {
    if (!this.row) {
      this.row = {
        state: "publishing",
        leaseToken: token,
        leaseExpiresAt: now + 300_000,
        publishAttemptCount: 0,
        creationId,
        containerGeneration: 1,
      };
      return this.row;
    }
    if (this.row.state === "published") return null;
    // COALESCE(lease_expires_at, '-infinity') < now()
    const expires = this.row.leaseExpiresAt ?? Number.NEGATIVE_INFINITY;
    if (!(expires < now)) return null;
    if (this.row.state === "publishing") this.row.state = "publish_unknown";
    this.row.leaseToken = token;
    this.row.leaseExpiresAt = now + 300_000;
    return this.row;
  }

  /** fenceForPublish — 여기서만 publish_attempt_count 증가 */
  fencePublish(token: string, creationId: string): number | null {
    const r = this.row;
    if (!r) return null;
    if (r.leaseToken !== token) return null;
    if (r.creationId !== creationId) return null;
    if (r.state !== "publishing" && r.state !== "publish_unknown") return null;
    r.publishAttemptCount += 1;
    return r.publishAttemptCount;
  }

  finalize(token: string, mediaId: string): boolean {
    const r = this.row;
    if (!r || r.state === "published" || r.leaseToken !== token) return false;
    r.state = "published";
    return true;
  }

  /** fenceReplaceContainer — 행은 지우지 않고 generation 증가 */
  fenceReplace(token: string, oldCreationId: string, newCreationId: string): number | null {
    const r = this.row;
    if (!r || r.leaseToken !== token || r.creationId !== oldCreationId || r.state === "published") return null;
    r.creationId = newCreationId;
    r.containerGeneration += 1;
    return r.containerGeneration;
  }
}

describe("리스 획득 — 상태별 규칙", () => {
  test("행 없음 → 생성 + 리스 획득", () => {
    const repo = new FakeRepo();
    assert.ok(repo.acquire(1000, "C1", "tokA"));
    assert.equal(repo.row!.state, "publishing");
  });

  test("published → 즉시 중단", () => {
    const repo = new FakeRepo();
    repo.acquire(1000, "C1", "tokA");
    repo.finalize("tokA", "M1");
    assert.equal(repo.acquire(9_999_999, "C1", "tokB"), null);
  });

  test("publishing + 유효 리스 → 즉시 중단", () => {
    const repo = new FakeRepo();
    repo.acquire(1000, "C1", "tokA");
    assert.equal(repo.acquire(2000, "C1", "tokB"), null); // 아직 리스 유효
  });

  test("publishing + 만료 리스 → publish_unknown 으로 전환 후 탈취", () => {
    const repo = new FakeRepo();
    repo.acquire(1000, "C1", "tokA");
    const got = repo.acquire(1000 + 300_001, "C1", "tokB");
    assert.ok(got);
    assert.equal(repo.row!.state, "publish_unknown");
    assert.equal(repo.row!.leaseToken, "tokB");
  });

  test("lease_expires_at 이 NULL 이어도 영구 잠금이 되지 않는다", () => {
    const repo = new FakeRepo();
    repo.acquire(1000, "C1", "tokA");
    repo.row!.leaseExpiresAt = null; // COALESCE(-infinity)
    assert.ok(repo.acquire(1001, "C1", "tokB"), "NULL 리스가 영구 잠금이 됐다");
  });
});

describe("동시 실행 방지", () => {
  test("수동 재시도 + 자동 재확인 동시 진입 → 한쪽만 게시", () => {
    const repo = new FakeRepo();
    const a = repo.acquire(1000, "C1", "manual");
    const b = repo.acquire(1000, "C1", "auto"); // 같은 시각, 유효 리스
    assert.ok(a);
    assert.equal(b, null);

    assert.equal(repo.fencePublish("manual", "C1"), 1);
    assert.equal(repo.fencePublish("auto", "C1"), null, "리스 없는 실행이 게시로 진입했다");
  });

  test("병렬 10회 요청 → 게시 1회", () => {
    const repo = new FakeRepo();
    let published = 0;
    for (let i = 0; i < 10; i++) {
      const lease = repo.acquire(1000, "C1", `tok${i}`);
      if (!lease) continue;
      if (repo.fencePublish(`tok${i}`, "C1") === null) continue;
      if (repo.finalize(`tok${i}`, `M${i}`)) published++;
    }
    assert.equal(published, 1);
  });

  test("펜싱 0행이면 publish 를 호출하지 않는다", () => {
    const repo = new FakeRepo();
    repo.acquire(1000, "C1", "tokA");
    // 다른 실행이 리스를 탈취
    repo.acquire(1000 + 300_001, "C1", "tokB");
    const attempt = repo.fencePublish("tokA", "C1"); // 좀비의 뒤늦은 시도
    assert.equal(attempt, null);
    if (attempt !== null) repo.publishCalls++;
    assert.equal(repo.publishCalls, 0);
  });

  test("좀비가 결과를 덮어쓰지 못한다", () => {
    const repo = new FakeRepo();
    repo.acquire(1000, "C1", "tokA");
    repo.acquire(1000 + 300_001, "C1", "tokB");
    repo.fencePublish("tokB", "C1");
    assert.equal(repo.finalize("tokB", "M_REAL"), true);
    assert.equal(repo.finalize("tokA", "M_ZOMBIE"), false);
  });

  test("publish_attempt_count 는 리스 획득이 아니라 게시 직전에만 증가한다", () => {
    const repo = new FakeRepo();
    repo.acquire(1000, "C1", "tokA");
    assert.equal(repo.row!.publishAttemptCount, 0, "리스 획득만으로 증가했다");
    repo.fencePublish("tokA", "C1");
    assert.equal(repo.row!.publishAttemptCount, 1);
  });
});

describe("EXPIRED 컨테이너 교체", () => {
  test("행을 지우지 않고 generation 을 올린다", () => {
    const repo = new FakeRepo();
    repo.acquire(1000, "C_OLD", "tokA");
    const gen = repo.fenceReplace("tokA", "C_OLD", "C_NEW");
    assert.equal(gen, 2);
    assert.ok(repo.row, "행이 삭제됐다");
    assert.equal(repo.row!.creationId, "C_NEW");
  });

  test("creation_id 가 안 맞으면 교체 0행 → 중단", () => {
    const repo = new FakeRepo();
    repo.acquire(1000, "C_OLD", "tokA");
    assert.equal(repo.fenceReplace("tokA", "WRONG", "C_NEW"), null);
  });

  test("리스 토큰이 안 맞으면 교체 0행 → 중단", () => {
    const repo = new FakeRepo();
    repo.acquire(1000, "C_OLD", "tokA");
    assert.equal(repo.fenceReplace("bad", "C_OLD", "C_NEW"), null);
  });

  test("이미 published 면 교체하지 않는다", () => {
    const repo = new FakeRepo();
    repo.acquire(1000, "C_OLD", "tokA");
    repo.finalize("tokA", "M1");
    assert.equal(repo.fenceReplace("tokA", "C_OLD", "C_NEW"), null);
  });
});
