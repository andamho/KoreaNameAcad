// ── 인스타 게시 조정(reconciliation) ────────────────────────────────────────
// 게시권·리스·재확인 상태의 정본은 ig_publications 하나다.
// video_jobs.ig_status / ig_media_id 는 화면 호환용 사본이며 기존 어휘만 쓴다.
//
// 핵심 불변식
//  1) 컨테이너 ERROR 를 즉시 최종 실패로 확정하지 않는다 → 30/60/120초 유예 재조회
//  2) 유예 대기 때문에 HTTP 요청을 붙잡아두지 않는다 → 커밋 후 즉시 반환, setTimeout 예약
//  3) media_publish 는 리스를 쥔 실행만 호출한다(펜싱 UPDATE 0행이면 호출 자체를 안 한다)
//  4) PUBLISHED 면 media_id 를 못 찾아도 완료 처리한다. 못 찾았다고 재게시하지 않는다
//  5) EXPIRED 일 때만 컨테이너를 교체한다. 행은 지우지 않고 generation 을 올린다
import crypto from "crypto";
import { sql } from "drizzle-orm";
import { db } from "../db";
import { scheduleDaily } from "../knop/dailyCheckpoint";
import { resolveAccountIdOrFail } from "./accountBinding";
import { igCreateReelContainer, igFetchContainerStatus, igMediaPublish, igToken } from "./publish";
import {
  decideNextAction,
  GRACE_DELAYS_MS,
  LEASE_MS,
  toLegacyJobStatus,
  type PublicationView,
} from "./publishDecision";

export type Outcome =
  | { state: "published"; mediaId: string | null; publicationId: string }
  | { state: "pending"; attempt: number; delayMs: number; reason: string }
  | { state: "failed"; reason: string }
  | { state: "blocked"; reason: string };

/** IN_PROGRESS 정상 대기(기존 동작 유지). ERROR 는 여기서 빠져나가 유예 경로로 간다 */
const INPROGRESS_POLL_MS = 4000;
const INPROGRESS_MAX_POLLS = 45; // 약 3분

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const requireDb = () => {
  if (!db) throw new Error("DB 사용 불가 — 인스타 게시를 진행할 수 없습니다");
  return db;
};

// ── 이벤트 기록 ──────────────────────────────────────────────────────────────
type EventInput = {
  publicationId?: string | null;
  videoJobId: string;
  creationId?: string | null;
  eventType: string;
  statusCode?: string | null;
  rawResponse?: unknown;
  fromState?: string | null;
  toState?: string | null;
  attempt?: number | null;
  note?: string | null;
};

async function recordEvent(exec: any, e: EventInput): Promise<void> {
  await exec.execute(sql`
    insert into ig_publish_events
      (publication_id, video_job_id, creation_id, event_type, status_code,
       raw_response, from_state, to_state, attempt, note)
    values
      (${e.publicationId ?? null}, ${e.videoJobId}, ${e.creationId ?? null}, ${e.eventType},
       ${e.statusCode ?? null},
       ${e.rawResponse === undefined ? null : JSON.stringify(e.rawResponse)}::jsonb,
       ${e.fromState ?? null}, ${e.toState ?? null}, ${e.attempt ?? null}, ${e.note ?? null})
  `);
}

/** video_jobs 는 사본일 뿐이다. 정본(ig_publications)에 맞춰 같은 트랜잭션에서 따라간다 */
async function syncJobMirror(
  exec: any,
  jobId: string,
  state: PublicationView["state"] | "failed",
  mediaId: string | null,
): Promise<void> {
  const legacy = state === "failed" ? "failed" : toLegacyJobStatus(state);
  await exec.execute(sql`
    update video_jobs
       set ig_status = ${legacy},
           ig_media_id = coalesce(${mediaId}, ig_media_id),
           updated_at = now()
     where id = ${jobId}
  `);
}

// ── 조회 ─────────────────────────────────────────────────────────────────────
async function loadPublication(jobId: string, accountId: string): Promise<any | null> {
  const r: any = await requireDb().execute(sql`
    select * from ig_publications
     where video_job_id = ${jobId} and instagram_account_id = ${accountId}
     limit 1
  `);
  return r.rows?.[0] ?? null;
}

function toView(row: any): PublicationView {
  return {
    state: row.state,
    creationId: row.creation_id ?? null,
    containerCreatedAt: row.container_created_at ? new Date(row.container_created_at) : null,
    checkAttempt: Number(row.check_attempt ?? 0),
    mediaId: row.media_id ?? null,
  };
}

// ── 원자적 리스 획득 ─────────────────────────────────────────────────────────
// 행 없음 → 생성 + 리스 획득 / published → 0행(중단) / publishing+유효리스 → 0행(중단)
// publishing+만료리스 → publish_unknown 으로 전환 후 리스 탈취
// COALESCE 로 lease_expires_at NULL 이 영구 잠금이 되지 않게 한다.
async function acquireLease(opts: {
  jobId: string;
  accountId: string;
  creationId: string | null;
  containerCreatedAt: Date | null;
  convertedR2Key?: string | null;
  contentFingerprint?: string | null;
}): Promise<{ row: any; leaseToken: string } | null> {
  const leaseToken = crypto.randomUUID().replace(/-/g, "");
  const r: any = await requireDb().execute(sql`
    insert into ig_publications (
      video_job_id, instagram_account_id, creation_id, container_created_at,
      converted_r2_key, content_fingerprint, container_generation, state,
      lease_token, lease_expires_at, claimed_at, updated_at
    ) values (
      ${opts.jobId}, ${opts.accountId}, ${opts.creationId}, ${opts.containerCreatedAt},
      ${opts.convertedR2Key ?? null}, ${opts.contentFingerprint ?? null}, 1, 'publishing',
      ${leaseToken}, now() + ${`${Math.round(LEASE_MS / 1000)} seconds`}::interval, now(), now()
    )
    on conflict (video_job_id, instagram_account_id) do update
       set lease_token      = excluded.lease_token,
           lease_expires_at = excluded.lease_expires_at,
           state            = case when ig_publications.state = 'publishing'
                                   then 'publish_unknown' else ig_publications.state end,
           updated_at       = now()
     where ig_publications.state <> 'published'
       and coalesce(ig_publications.lease_expires_at, '-infinity'::timestamp) < now()
    returning *
  `);
  const row = r.rows?.[0];
  return row ? { row, leaseToken } : null;
}

/** media_publish 직전 펜싱. 여기서만 publish_attempt_count 를 올린다. 0행이면 게시하지 않는다 */
async function fenceForPublish(opts: {
  jobId: string;
  accountId: string;
  leaseToken: string;
  creationId: string;
}): Promise<number | null> {
  const r: any = await requireDb().execute(sql`
    update ig_publications
       set publish_attempt_count = publish_attempt_count + 1,
           lease_expires_at = now() + ${`${Math.round(LEASE_MS / 1000)} seconds`}::interval,
           updated_at = now()
     where video_job_id = ${opts.jobId}
       and instagram_account_id = ${opts.accountId}
       and lease_token = ${opts.leaseToken}
       and creation_id = ${opts.creationId}
       and state in ('publishing','publish_unknown')
    returning publish_attempt_count
  `);
  const n = r.rows?.[0]?.publish_attempt_count;
  return n === undefined ? null : Number(n);
}

/** EXPIRED 교체 펜싱. 행은 지우지 않고 creation_id 교체 + generation 증가. 0행이면 중단 */
async function fenceReplaceContainer(opts: {
  jobId: string;
  accountId: string;
  leaseToken: string;
  oldCreationId: string;
  newCreationId: string;
  convertedR2Key?: string | null;
}): Promise<number | null> {
  const r: any = await requireDb().execute(sql`
    update ig_publications
       set creation_id = ${opts.newCreationId},
           container_created_at = now(),
           container_generation = container_generation + 1,
           converted_r2_key = coalesce(${opts.convertedR2Key ?? null}, converted_r2_key),
           check_attempt = 0,
           next_check_at = null,
           state = 'publishing',
           last_reconciled_at = now(),
           updated_at = now()
     where video_job_id = ${opts.jobId}
       and instagram_account_id = ${opts.accountId}
       and lease_token = ${opts.leaseToken}
       and creation_id = ${opts.oldCreationId}
       and state <> 'published'
    returning container_generation
  `);
  const g = r.rows?.[0]?.container_generation;
  return g === undefined ? null : Number(g);
}

// ── 지연 재확인 예약 (상시 폴링 아님) ───────────────────────────────────────
// 작업별 1회성 setTimeout. 프로세스가 죽으면 사라지지만 next_check_at 이 DB 에 남아
// 부팅 복구가 회수한다. 장기 무재시작 상황은 08:40 일일 점검이 안전망으로 걷어간다.
const pendingTimers = new Map<string, NodeJS.Timeout>();

export function scheduleRecheck(jobId: string, delayMs: number): void {
  const prev = pendingTimers.get(jobId);
  if (prev) clearTimeout(prev);
  const t = setTimeout(() => {
    pendingTimers.delete(jobId);
    reconcilePublication(jobId).catch((e) =>
      console.error(`[IG RECONCILE] 예약 재확인 실패 job=${jobId}: ${e?.message}`),
    );
  }, delayMs);
  t.unref?.(); // 이 타이머가 프로세스를 붙잡아두지 않게
  pendingTimers.set(jobId, t);
}

/** 테스트·종료 정리용 */
export function clearScheduledRechecks(): void {
  pendingTimers.forEach((t) => clearTimeout(t));
  pendingTimers.clear();
}

async function markPending(opts: {
  publicationId: string;
  jobId: string;
  accountId: string;
  creationId: string;
  statusCode: string;
  raw: unknown;
  nextAttempt: number;
  delayMs: number;
  fromState: string;
}): Promise<void> {
  const d = requireDb();
  await d.transaction(async (tx: any) => {
    await tx.execute(sql`
      update ig_publications
         set check_attempt = ${opts.nextAttempt},
             next_check_at = now() + ${`${Math.round(opts.delayMs / 1000)} seconds`}::interval,
             state = case when state = 'published' then state else 'publishing' end,
             lease_expires_at = null,
             last_reconciled_at = now(),
             updated_at = now()
       where video_job_id = ${opts.jobId} and instagram_account_id = ${opts.accountId}
         and state <> 'published'
    `);
    await recordEvent(tx, {
      publicationId: opts.publicationId,
      videoJobId: opts.jobId,
      creationId: opts.creationId,
      eventType: "status_poll",
      statusCode: opts.statusCode,
      rawResponse: opts.raw,
      fromState: opts.fromState,
      toState: "publishing",
      attempt: opts.nextAttempt,
      note: `유예 재조회 예약 ${Math.round(opts.delayMs / 1000)}초 후`,
    });
    await syncJobMirror(tx, opts.jobId, "publishing", null);
  });
  scheduleRecheck(opts.jobId, opts.delayMs);
}

async function finalizePublished(opts: {
  publicationId: string;
  jobId: string;
  accountId: string;
  creationId: string | null;
  mediaId: string | null;
  leaseToken?: string;
  note: string;
  raw?: unknown;
}): Promise<void> {
  const d = requireDb();
  await d.transaction(async (tx: any) => {
    // lease_token 펜싱: 뒤늦게 깨어난 좀비가 결과를 덮어쓰지 못하게
    await tx.execute(sql`
      update ig_publications
         set state = 'published',
             media_id = coalesce(${opts.mediaId}, media_id),
             published_at = coalesce(published_at, now()),
             lease_expires_at = now(),
             next_check_at = null,
             last_reconciled_at = now(),
             updated_at = now()
       where video_job_id = ${opts.jobId}
         and instagram_account_id = ${opts.accountId}
         and state <> 'published'
         ${opts.leaseToken ? sql`and lease_token = ${opts.leaseToken}` : sql``}
    `);
    await recordEvent(tx, {
      publicationId: opts.publicationId,
      videoJobId: opts.jobId,
      creationId: opts.creationId,
      eventType: "publish_result",
      rawResponse: opts.raw,
      toState: "published",
      note: opts.note,
    });
    await syncJobMirror(tx, opts.jobId, "published", opts.mediaId);
  });
}

async function markPublishUnknown(opts: {
  publicationId: string;
  jobId: string;
  accountId: string;
  creationId: string;
  leaseToken: string;
  note: string;
}): Promise<void> {
  const d = requireDb();
  await d.transaction(async (tx: any) => {
    await tx.execute(sql`
      update ig_publications
         set state = 'publish_unknown',
             next_check_at = now() + ${`${Math.round(GRACE_DELAYS_MS[0] / 1000)} seconds`}::interval,
             last_reconciled_at = now(),
             updated_at = now()
       where video_job_id = ${opts.jobId} and instagram_account_id = ${opts.accountId}
         and lease_token = ${opts.leaseToken} and state = 'publishing'
    `);
    await recordEvent(tx, {
      publicationId: opts.publicationId,
      videoJobId: opts.jobId,
      creationId: opts.creationId,
      eventType: "publish_result",
      fromState: "publishing",
      toState: "publish_unknown",
      note: opts.note,
    });
    // 사본은 종결로 보이면 안 된다(진행 중)
    await syncJobMirror(tx, opts.jobId, "publish_unknown", null);
  });
  scheduleRecheck(opts.jobId, GRACE_DELAYS_MS[0]);
}

async function failFinal(opts: {
  publicationId: string;
  jobId: string;
  accountId: string;
  creationId: string | null;
  reason: string;
  statusCode?: string;
  raw?: unknown;
}): Promise<void> {
  const d = requireDb();
  await d.transaction(async (tx: any) => {
    await tx.execute(sql`
      update ig_publications
         set next_check_at = null,
             lease_expires_at = now(),
             last_reconciled_at = now(),
             updated_at = now()
       where video_job_id = ${opts.jobId} and instagram_account_id = ${opts.accountId}
         and state <> 'published'
    `);
    await recordEvent(tx, {
      publicationId: opts.publicationId,
      videoJobId: opts.jobId,
      creationId: opts.creationId,
      eventType: "transition",
      statusCode: opts.statusCode ?? null,
      rawResponse: opts.raw,
      toState: "failed",
      note: opts.reason,
    });
    await syncJobMirror(tx, opts.jobId, "failed", null);
  });
}

// ── 진입점 1: 새 게시 시작 ───────────────────────────────────────────────────
export async function startInstagramPublish(opts: {
  jobId: string;
  videoUrl: string;
  caption: string;
  convertedR2Key?: string | null;
  contentFingerprint?: string | null;
}): Promise<Outcome> {
  const accountId = await resolveAccountIdOrFail(); // fail-closed
  const token = await igToken();

  // 이미 이 (job, 계정) 조합의 게시 기록이 있으면 새 컨테이너를 만들지 않는다
  const existing = await loadPublication(opts.jobId, accountId);
  if (existing) {
    return reconcilePublication(opts.jobId);
  }

  const created = await igCreateReelContainer({ token, videoUrl: opts.videoUrl, caption: opts.caption });
  const lease = await acquireLease({
    jobId: opts.jobId,
    accountId,
    creationId: created.creationId,
    containerCreatedAt: new Date(),
    convertedR2Key: opts.convertedR2Key,
    contentFingerprint: opts.contentFingerprint,
  });
  if (!lease) {
    // 그 사이 다른 실행이 선점 — 컨테이너는 버려두고(게시 안 함) 중단
    return { state: "blocked", reason: "다른 실행이 이미 게시권을 쥐고 있음" };
  }
  await recordEvent(requireDb(), {
    publicationId: lease.row.id,
    videoJobId: opts.jobId,
    creationId: created.creationId,
    eventType: "container_created",
    rawResponse: created.raw,
    toState: "publishing",
    note: `generation=${lease.row.container_generation}`,
  });

  return pollThenAct({
    jobId: opts.jobId,
    accountId,
    token,
    publicationId: lease.row.id,
    creationId: created.creationId,
    leaseToken: lease.leaseToken,
    containerCreatedAt: new Date(),
    checkAttempt: 0,
  });
}

/** IN_PROGRESS 동안만 요청 안에서 대기한다. ERROR 를 만나면 즉시 커밋하고 반환 */
async function pollThenAct(ctx: {
  jobId: string;
  accountId: string;
  token: string;
  publicationId: string;
  creationId: string;
  leaseToken: string;
  containerCreatedAt: Date | null;
  checkAttempt: number;
}): Promise<Outcome> {
  let last: { statusCode: string; raw: any } = { statusCode: "IN_PROGRESS", raw: null };
  for (let i = 0; i < INPROGRESS_MAX_POLLS; i++) {
    await sleep(INPROGRESS_POLL_MS);
    last = await igFetchContainerStatus({ token: ctx.token, creationId: ctx.creationId });
    if (last.statusCode !== "IN_PROGRESS") break;
  }
  return applyDecision({ ...ctx, statusCode: last.statusCode, raw: last.raw });
}

// ── 진입점 2: 재확인/재시도 (예약·부팅복구·수동재시도 공통) ─────────────────
export async function reconcilePublication(jobId: string): Promise<Outcome> {
  const accountId = await resolveAccountIdOrFail(); // fail-closed
  const pub = await loadPublication(jobId, accountId);
  if (!pub) return { state: "blocked", reason: "게시 기록 없음 — 먼저 배포를 실행해야 합니다" };
  if (pub.state === "published") {
    return { state: "published", mediaId: pub.media_id ?? null, publicationId: pub.id };
  }
  if (!pub.creation_id) return { state: "blocked", reason: "creation_id 없음" };

  const token = await igToken();
  const status = await igFetchContainerStatus({ token, creationId: pub.creation_id });

  // 기존 컨테이너 상태를 먼저 확인한 뒤에만 리스를 잡는다
  const lease = await acquireLease({
    jobId,
    accountId,
    creationId: pub.creation_id,
    containerCreatedAt: pub.container_created_at ? new Date(pub.container_created_at) : null,
  });
  if (!lease) {
    return { state: "blocked", reason: "이미 게시됐거나 다른 실행이 리스를 쥐고 있음" };
  }

  return applyDecision({
    jobId,
    accountId,
    token,
    publicationId: pub.id,
    creationId: pub.creation_id,
    leaseToken: lease.leaseToken,
    containerCreatedAt: pub.container_created_at ? new Date(pub.container_created_at) : null,
    checkAttempt: Number(pub.check_attempt ?? 0),
    statusCode: status.statusCode,
    raw: status.raw,
    stateOverride: lease.row.state,
  });
}

async function applyDecision(ctx: {
  jobId: string;
  accountId: string;
  token: string;
  publicationId: string;
  creationId: string;
  leaseToken: string;
  containerCreatedAt: Date | null;
  checkAttempt: number;
  statusCode: string;
  raw: unknown;
  stateOverride?: PublicationView["state"];
}): Promise<Outcome> {
  const view: PublicationView = {
    state: ctx.stateOverride ?? "publishing",
    creationId: ctx.creationId,
    containerCreatedAt: ctx.containerCreatedAt,
    checkAttempt: ctx.checkAttempt,
    mediaId: null,
  };
  const action = decideNextAction(view, ctx.statusCode, new Date());

  switch (action.kind) {
    case "finalize_published":
      await finalizePublished({
        publicationId: ctx.publicationId,
        jobId: ctx.jobId,
        accountId: ctx.accountId,
        creationId: ctx.creationId,
        mediaId: action.mediaId,
        leaseToken: ctx.leaseToken,
        note: action.reason,
        raw: ctx.raw,
      });
      return { state: "published", mediaId: action.mediaId, publicationId: ctx.publicationId };

    case "publish_existing": {
      const attempt = await fenceForPublish({
        jobId: ctx.jobId,
        accountId: ctx.accountId,
        leaseToken: ctx.leaseToken,
        creationId: action.creationId,
      });
      if (attempt === null) {
        // 펜싱 실패 → 절대 게시하지 않는다
        return { state: "blocked", reason: "펜싱 UPDATE 0행 — 다른 실행이 선점했거나 상태가 바뀜" };
      }
      await recordEvent(requireDb(), {
        publicationId: ctx.publicationId,
        videoJobId: ctx.jobId,
        creationId: action.creationId,
        eventType: "publish_attempt",
        attempt,
        note: "media_publish 호출 직전",
      });
      try {
        const r = await igMediaPublish({ token: ctx.token, creationId: action.creationId });
        await finalizePublished({
          publicationId: ctx.publicationId,
          jobId: ctx.jobId,
          accountId: ctx.accountId,
          creationId: action.creationId,
          mediaId: r.mediaId,
          leaseToken: ctx.leaseToken,
          note: "media_publish 성공",
          raw: r.raw,
        });
        return { state: "published", mediaId: r.mediaId, publicationId: ctx.publicationId };
      } catch (e: any) {
        // 실제로는 게시됐는데 응답만 유실됐을 수 있다 → failed 로 되돌리지 않는다
        await markPublishUnknown({
          publicationId: ctx.publicationId,
          jobId: ctx.jobId,
          accountId: ctx.accountId,
          creationId: action.creationId,
          leaseToken: ctx.leaseToken,
          note: `media_publish 응답 확인 불가: ${e?.message}`,
        });
        return {
          state: "pending",
          attempt: ctx.checkAttempt,
          delayMs: GRACE_DELAYS_MS[0],
          reason: "publish_unknown — 기존 컨테이너부터 재확인",
        };
      }
    }

    case "schedule_recheck":
      await markPending({
        publicationId: ctx.publicationId,
        jobId: ctx.jobId,
        accountId: ctx.accountId,
        creationId: ctx.creationId,
        statusCode: ctx.statusCode,
        raw: ctx.raw,
        nextAttempt: action.nextAttempt,
        delayMs: action.delayMs,
        fromState: view.state,
      });
      return {
        state: "pending",
        attempt: action.nextAttempt,
        delayMs: action.delayMs,
        reason: `status=${ctx.statusCode} — ${Math.round(action.delayMs / 1000)}초 후 재확인`,
      };

    case "replace_container":
      // 여기서는 교체 "허용"만 판정한다. 새 컨테이너 생성은 재배포 경로에서 변환본과 함께 처리한다.
      await recordEvent(requireDb(), {
        publicationId: ctx.publicationId,
        videoJobId: ctx.jobId,
        creationId: ctx.creationId,
        eventType: "transition",
        statusCode: ctx.statusCode,
        rawResponse: ctx.raw,
        toState: "expired",
        note: action.reason,
      });
      return { state: "failed", reason: `${action.reason} — 새 영상 변환 후 재배포가 필요합니다` };

    case "fail_final":
      await failFinal({
        publicationId: ctx.publicationId,
        jobId: ctx.jobId,
        accountId: ctx.accountId,
        creationId: ctx.creationId,
        reason: action.reason,
        statusCode: ctx.statusCode,
        raw: ctx.raw,
      });
      return { state: "failed", reason: action.reason };

    case "abort":
      return { state: "blocked", reason: action.reason };
  }
}

/** EXPIRED 뒤 새 컨테이너로 교체 — 펜싱 UPDATE 로만. 0행이면 게시하지 않는다 */
export async function replaceExpiredContainer(opts: {
  jobId: string;
  videoUrl: string;
  caption: string;
  convertedR2Key?: string | null;
}): Promise<Outcome> {
  const accountId = await resolveAccountIdOrFail();
  const pub = await loadPublication(opts.jobId, accountId);
  if (!pub) return { state: "blocked", reason: "게시 기록 없음" };
  if (pub.state === "published") return { state: "blocked", reason: "이미 게시 완료" };

  const token = await igToken();
  const status = await igFetchContainerStatus({ token, creationId: pub.creation_id });
  const view = toView(pub);
  const action = decideNextAction(view, status.statusCode, new Date());
  if (action.kind !== "replace_container") {
    return { state: "blocked", reason: `교체 불가 — 현재 status=${status.statusCode}` };
  }

  const lease = await acquireLease({
    jobId: opts.jobId,
    accountId,
    creationId: pub.creation_id,
    containerCreatedAt: pub.container_created_at ? new Date(pub.container_created_at) : null,
  });
  if (!lease) return { state: "blocked", reason: "리스 획득 실패" };

  const created = await igCreateReelContainer({ token, videoUrl: opts.videoUrl, caption: opts.caption });
  const generation = await fenceReplaceContainer({
    jobId: opts.jobId,
    accountId,
    leaseToken: lease.leaseToken,
    oldCreationId: pub.creation_id,
    newCreationId: created.creationId,
    convertedR2Key: opts.convertedR2Key,
  });
  if (generation === null) {
    return { state: "blocked", reason: "교체 펜싱 UPDATE 0행 — 새 컨테이너를 게시하지 않습니다" };
  }
  await recordEvent(requireDb(), {
    publicationId: pub.id,
    videoJobId: opts.jobId,
    creationId: created.creationId,
    eventType: "container_created",
    rawResponse: created.raw,
    toState: "publishing",
    note: `EXPIRED 교체 generation=${generation}`,
  });

  return pollThenAct({
    jobId: opts.jobId,
    accountId,
    token,
    publicationId: pub.id,
    creationId: created.creationId,
    leaseToken: lease.leaseToken,
    containerCreatedAt: new Date(),
    checkAttempt: 0,
  });
}

// ── 복구 안전망 (부팅 1회 + 08:40 일일 1회. 상시 폴링 아님) ──────────────────
const RECOVERY_BATCH = 20;

export async function recoverPendingPublications(): Promise<{ scanned: number; resumed: number }> {
  if (!db) return { scanned: 0, resumed: 0 };
  const r: any = await db.execute(sql`
    select video_job_id, id, state, check_attempt
      from ig_publications
     where state <> 'published'
       and (
         (next_check_at is not null and next_check_at <= now())
         or (state = 'publishing'
             and coalesce(lease_expires_at, '-infinity'::timestamp) < now()
             and next_check_at is null)
       )
     order by updated_at asc
     limit ${RECOVERY_BATCH}
  `);
  const rows = r.rows ?? [];
  let resumed = 0;
  for (const row of rows) {
    try {
      await recordEvent(db, {
        publicationId: row.id,
        videoJobId: row.video_job_id,
        eventType: "recovery",
        fromState: row.state,
        attempt: Number(row.check_attempt ?? 0),
        note: "미완료 작업 복구 진입",
      });
      await reconcilePublication(row.video_job_id);
      resumed++;
    } catch (e: any) {
      console.error(`[IG RECONCILE] 복구 실패 job=${row.video_job_id}: ${e?.message}`);
    }
  }
  if (rows.length) console.log(`[IG RECONCILE] 복구 스윕 — 대상 ${rows.length}건, 재개 ${resumed}건`);
  return { scanned: rows.length, resumed };
}

/**
 * 복구 등록. scheduleDaily 는 "부팅 후 1회 + 매일 08:40" 구조라 두 요구를 한 번에 만족한다.
 * 새 상시 폴링이나 새 반복 스케줄러를 만들지 않는다 — 30/60/120초 실행은 작업별 setTimeout 이 한다.
 */
let _recoveryRegistered = false;
export function startInstagramPublishRecovery(): void {
  if (_recoveryRegistered) return;
  _recoveryRegistered = true;
  scheduleDaily(
    "인스타 게시 미완료 복구",
    async () => {
      await recoverPendingPublications();
    },
    45_000, // 부팅 직후 DB·토큰이 준비될 시간을 준다
  );
}
