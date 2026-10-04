// ── 쇼츠 썸네일 장면 선택 작업 배분 ──────────────────────────────────────────
// 서버(업로드 완료) → 이 서비스 → PC 워커(롱폴링)로 작업을 넘긴다.
//
// [DB 조회 최소화] 워커는 50초짜리 롱폴링으로 계속 묻지만, 서버는 "다음에 넘길 일이 생기는 시각"을
//   메모리에 들고 있다가 그 시각이 되기 전에는 DB 를 전혀 조회하지 않는다. DB 를 건드리는 것은
//   ① 부팅 1회 ② 작업 등록 ③ 넘길 때(선점) ④ 워커 보고 ⑤ 매일 1회 점검 뿐이다.
// [복구] 상태의 정본은 DB(yt_frame_tasks)다. 서버가 재시작되면 부팅 1회 조회로 힌트를 복원하고,
//   워커(PC)가 꺼져 있던 동안 쌓인 작업은 PC 가 다시 연결되는 즉시 넘어간다. 워커가 작업 중에 죽으면
//   리스(15분) 만료 후 다시 넘긴다.
// [출고 전 확인] 넘기기 직전에 유튜브 처리 상태를 조회한다. 처리 중이면 2분 뒤로 미루고(시도로 안 셈),
//   처리 실패·영상 없음이면 실패로 종결하고 알린다.
import {
  type Q, type FrameTask,
  enqueueFrameTask, claimFrameTask, heartbeatFrameTask, deferFrameTask,
  markFrameSaved, markFrameVerified, type VerifyResult, markFrameFailed, secondsUntilNextWork, getFrameTask, MAX_ATTEMPTS,
} from "./store";
import { type ProcessingCheck, isProcessingDone, isProcessingFailed } from "./processing";

export type HandOut = FrameTask & { live_privacy: string | null; live_title: string | null };

export type FrameServiceDeps = {
  q: Q;
  checkProcessing: (videoId: string) => Promise<ProcessingCheck>;
  /** 텔레그램 알림(HTML). 실패해도 본 흐름을 막지 않는다 */
  alert: (html: string) => Promise<void>;
  esc: (v: unknown) => string;
  processingDeferSec?: number;
  lookupErrorDeferSec?: number;
  log?: (msg: string) => void;
};

export function createFrameService(deps: FrameServiceDeps) {
  const { q, esc } = deps;
  const log = deps.log ?? ((m: string) => console.log(`[YT FRAME] ${m}`));
  const processingDeferSec = deps.processingDeferSec ?? 120;
  const lookupErrorDeferSec = deps.lookupErrorDeferSec ?? 300;

  // 다음에 넘길 일이 생기는 시각(로컬 시계, DB 가 준 "남은 초"로만 계산). null = 할 일 없음
  let nextAtMs: number | null = null;
  let timer: NodeJS.Timeout | null = null;
  const waiters = new Set<() => void>();
  let serial: Promise<unknown> = Promise.resolve();
  let dbReads = 0; // 시험용 계측: 힌트 계산·선점 등 DB 를 실제로 건드린 횟수

  const wakeAll = () => { Array.from(waiters).forEach((w) => w()); };

  function setHint(sec: number | null) {
    if (timer) { clearTimeout(timer); timer = null; }
    nextAtMs = sec === null ? null : Date.now() + sec * 1000;
    if (nextAtMs === null) return;
    const d = Math.max(0, nextAtMs - Date.now());
    if (d === 0) { wakeAll(); return; }
    timer = setTimeout(wakeAll, Math.min(d, 2 ** 31 - 1));
    timer.unref?.();
  }
  async function refreshHint(minSec = 0) {
    dbReads++;
    const s = await secondsUntilNextWork(q);
    setHint(s === null ? null : Math.max(s, minSec));
  }
  const due = () => nextAtMs !== null && nextAtMs <= Date.now();

  /** 선점·출고 판정은 한 번에 하나씩 */
  function serialized<T>(fn: () => Promise<T>): Promise<T> {
    const p = serial.then(fn, fn);
    serial = p.catch(() => {});
    return p;
  }

  async function alertFailure(task: Pick<FrameTask, "video_id" | "expected_title" | "attempts">, stage: string, reason: string, extra = "") {
    const html =
      `🖼 <b>쇼츠 썸네일 장면 선택 실패</b>\n` +
      `영상: <a href="https://youtu.be/${esc(task.video_id)}">${esc(task.video_id)}</a>\n` +
      (task.expected_title ? `제목: ${esc(task.expected_title)}\n` : "") +
      `단계: ${esc(stage)}\n이유: ${esc(reason)}\n` +
      `시도: ${task.attempts}/${MAX_ATTEMPTS}${extra}`;
    try { await deps.alert(html); } catch (e: any) { log(`알림 실패: ${e?.message}`); }
  }

  async function safeCheck(videoId: string): Promise<ProcessingCheck> {
    try { return await deps.checkProcessing(videoId); }
    catch (e: any) { return { kind: "lookup_error", error: e?.message ?? String(e) }; }
  }

  /** 넘길 수 있는 작업 1건(처리 완료 확인까지 통과한 것). 없으면 null */
  async function tryHandOut(): Promise<HandOut | null> {
    for (let i = 0; i < 10; i++) {
      dbReads++;
      const task = await claimFrameTask(q);
      if (!task) { await refreshHint(1); return null; }
      const tok = task.lease_token!;
      const pc = await safeCheck(task.video_id);
      if (pc.kind === "ok" && isProcessingDone(pc.state)) {
        log(`출고 ${task.video_id} (시도 ${task.attempts})`);
        return { ...task, live_privacy: pc.state.privacyStatus ?? null, live_title: pc.state.title ?? null };
      }
      if (pc.kind === "not_found" || (pc.kind === "ok" && isProcessingFailed(pc.state))) {
        const reason = pc.kind === "not_found"
          ? "유튜브에서 영상을 찾을 수 없음(삭제?)"
          : `유튜브 처리 실패(${pc.state.processingStatus ?? pc.state.uploadStatus}${pc.state.processingFailureReason ? `: ${pc.state.processingFailureReason}` : ""})`;
        const r = await markFrameFailed(q, task.id, tok, "processing", reason, false);
        if (r.applied) await alertFailure(task, "processing", reason);
        continue;
      }
      const why = pc.kind === "lookup_error"
        ? `처리 상태 조회 실패: ${pc.error}`
        : `유튜브 처리 중(${pc.state.processingStatus ?? pc.state.uploadStatus})`;
      await deferFrameTask(q, task.id, tok, pc.kind === "lookup_error" ? lookupErrorDeferSec : processingDeferSec, "processing", why);
      log(`보류 ${task.video_id}: ${why}`);
    }
    await refreshHint(1);
    return null;
  }

  return {
    /** 부팅 시 1회: DB 의 대기 작업으로 힌트 복원 */
    async init() { await refreshHint(); },

    /** 업로드 완료 직후 호출. 같은 영상 ID 는 다시 만들지 않는다 */
    async enqueue(t: Parameters<typeof enqueueFrameTask>[1]) {
      const r = await enqueueFrameTask(q, t);
      if (r.created) { log(`등록 ${t.videoId}`); setHint(0); }
      return r;
    },

    /** 워커 롱폴링. 넘길 일이 생기기 전에는 DB 를 조회하지 않고 기다린다 */
    async next(waitMs: number, signal?: AbortSignal): Promise<HandOut | null> {
      const deadline = Date.now() + waitMs;
      for (;;) {
        if (signal?.aborted) return null;
        if (due()) {
          const t = await serialized(tryHandOut);
          if (t) {
            // 롱폴링 응답을 받을 연결이 이미 끊겼으면 즉시 돌려놓는다(시도로 안 셈)
            if (signal?.aborted) {
              await deferFrameTask(q, t.id, t.lease_token!, 0, "handout", "워커 연결 끊김 — 출고 취소");
              setHint(0);
              return null;
            }
            return t;
          }
        }
        const remain = deadline - Date.now();
        if (remain <= 0) return null;
        await new Promise<void>((res) => {
          const done = () => { clearTimeout(to); waiters.delete(done); signal?.removeEventListener("abort", done); res(); };
          const to = setTimeout(done, remain);
          waiters.add(done);
          signal?.addEventListener("abort", done);
        });
      }
    },

    async heartbeat(id: string, token: string) { return heartbeatFrameTask(q, id, token); },

    async saved(id: string, token: string) {
      const ok = await markFrameSaved(q, id, token);
      if (ok) log(`저장 성공 ${id}`);
      return ok;
    },

    async verified(id: string, token: string, result: VerifyResult, detail: string) {
      const ok = await markFrameVerified(q, id, token, result, detail);
      if (ok) {
        const t = await getFrameTask(q, id);
        log(`반영 확인 ${t?.video_id}: ${result}`);
        if (t && result === "mismatch") await alertFailure(t, "verify", `저장은 됐으나 실제 썸네일이 고른 장면과 다름 — ${detail}`);
        if (t && result === "uncertain") await alertFailure(t, "verify", `저장은 됐으나 반영 여부 판단이 애매함(확인 필요) — ${detail}`);
      }
      return ok;
    },

    async failed(id: string, token: string, stage: string, reason: string, retryable: boolean) {
      const r = await markFrameFailed(q, id, token, stage, reason, retryable);
      if (r.applied) {
        const t = await getFrameTask(q, id);
        log(`실패 ${t?.video_id} [${stage}] ${reason} → ${r.terminal ? "종결" : "재시도 예정"}`);
        if (t && r.terminal) await alertFailure(t, stage, reason);
        await refreshHint();
      }
      return r;
    },

    /** 매일 1회: 오래 처리되지 못한 작업(예: PC 가 계속 꺼져 있음)을 알린다 */
    async dailyCheck() {
      dbReads++;
      const r = await q.query(
        `select video_id, state, attempts, last_stage, last_error
           from yt_frame_tasks
          where state in ('queued','running','saved') and created_at < now() - interval '6 hours'
          order by created_at limit 10`,
      );
      if (!r.rows.length) return 0;
      const lines = r.rows.map((x: any) => `• ${esc(x.video_id)} — ${esc(x.state)}${x.last_error ? ` (${esc(String(x.last_error).slice(0, 80))})` : ""}`);
      try {
        await deps.alert(`🖼 <b>쇼츠 썸네일 대기 작업 ${r.rows.length}건이 6시간 넘게 남아 있음</b>\n이 PC 의 워커가 꺼져 있는지 확인하세요.\n${lines.join("\n")}`);
      } catch (e: any) { log(`알림 실패: ${e?.message}`); }
      await refreshHint();
      return r.rows.length;
    },

    /** 시험용 */
    _debug: () => ({ nextAtMs, waiters: waiters.size, dbReads }),
    _stop() { if (timer) clearTimeout(timer); timer = null; wakeAll(); },
  };
}

export type FrameService = ReturnType<typeof createFrameService>;
