// SMS backfill 처리: Automate content://sms → 서버 대조·복구. 실시간 웹훅과 분리.
// 격리 PostgreSQL(PGlite)에서 21/21 검증된 v2 로직. FEATURE_SMS_BACKFILL=1 일 때만 활성.
// 본문·전화번호는 로그·응답·items에 남기지 않는다.
import { sql } from "drizzle-orm";
import { db } from "../db";

export function backfillEnabled(): boolean {
  // 2026-09-24 원장님 지시로 기본 켜짐(일반 문자 누락 실제 확인). 끄려면 FEATURE_SMS_BACKFILL=0
  const v = (process.env.FEATURE_SMS_BACKFILL || "").toLowerCase();
  return !(v === "0" || v === "false");
}

export type BackfillMsg = {
  providerType: string;
  providerId: string;
  direction: string; // 수신 | 발신
  date: number; // epoch ms
  phone: string;
  body: string;
};
export type BackfillInput = {
  deviceId: string;
  dryRun: boolean;
  rangeFrom?: string | null;
  rangeTo?: string | null;
  messages: BackfillMsg[];
};
export type BackfillCounts = {
  total: number;
  existing_exact: number; legacy_linked: number; new: number; ambiguous: number; invalid: number;
  customer_evaluated: number; customer_matched: number; customer_unmatched: number; customer_skipped: number;
};
export type BackfillResult = {
  runId: string;
  counts: BackfillCounts;
  items: { providerId: string | null; state: string; customerState: string }[];
};

const isUuid = (s: unknown) => typeof s === "string" && /^[0-9a-f-]{16,64}$/i.test(s);
function validateMsg(m: BackfillMsg): boolean {
  if (!m || typeof m !== "object") return false;
  if (m.providerType !== "sms") return false; // v1: sms만
  if (typeof m.providerId !== "string" || !/^\d{1,20}$/.test(m.providerId)) return false;
  if (m.direction !== "수신" && m.direction !== "발신") return false;
  if (!Number.isInteger(m.date) || m.date < 1_000_000_000_000 || m.date > 2_000_000_000_000) return false;
  if (typeof m.phone !== "string" || m.phone.length < 3 || m.phone.length > 40) return false;
  if (typeof m.body !== "string" || m.body.length < 1 || m.body.length > 2000) return false;
  return true;
}
const msToNaive = (ms: number) => new Date(ms).toISOString().slice(0, 23).replace("T", " ");

type OneResult = { state: string; customerState: string; incomingId: string | null; candidates: number };

// 한 건 = 한 트랜잭션. exact·레거시·쓰기·item 모두 tx 안(#1). 고객매칭만 tx 밖.
async function processOne(runId: string, deviceId: string, dryRun: boolean, m: BackfillMsg): Promise<OneResult> {
  const d = db!;
  const recv = msToNaive(m.date);
  const cust: any = await d.execute(
    sql`SELECT 1 FROM customers WHERE regexp_replace(phone,'[^0-9]','','g')=regexp_replace(${m.phone},'[^0-9]','','g') LIMIT 1`);
  const customerState = cust.rows.length ? "matched" : "unmatched";

  return await d.transaction(async (tx) => {
    const ex: any = await tx.execute(
      sql`SELECT 1 FROM sms_provider_links WHERE device_id=${deviceId} AND provider_type=${m.providerType} AND provider_id=${m.providerId}`);
    let state: string;
    let incomingId: string | null = null;
    let candidates = 0;
    if (ex.rows.length) {
      state = "existing_exact";
    } else {
      const cand: any = await tx.execute(sql`
        SELECT s.id FROM incoming_sms s
        WHERE regexp_replace(s.phone,'[^0-9]','','g')=regexp_replace(${m.phone},'[^0-9]','','g')
          AND s.direction=${m.direction} AND s.body=${m.body}
          AND s.received_at BETWEEN ${recv}::timestamp - interval '120 seconds' AND ${recv}::timestamp + interval '120 seconds'
          AND NOT EXISTS (SELECT 1 FROM sms_provider_links l WHERE l.incoming_sms_id=s.id)`);
      candidates = cand.rows.length;
      if (candidates >= 2) {
        state = "ambiguous";
      } else if (dryRun) {
        state = candidates === 1 ? "legacy_linked" : "new";
        incomingId = candidates === 1 ? String(cand.rows[0].id) : null;
      } else {
        let linkType: string;
        if (candidates === 1) { incomingId = String(cand.rows[0].id); linkType = "legacy_linked"; }
        else {
          const ins: any = await tx.execute(
            sql`INSERT INTO incoming_sms(phone, body, direction, received_at, ingest_source, backfill_run_id)
                VALUES(${m.phone}, ${m.body}, ${m.direction}, ${recv}::timestamp, 'backfill', ${runId}) RETURNING id`);
          incomingId = String(ins.rows[0].id); linkType = "new";
        }
        const link: any = await tx.execute(
          sql`INSERT INTO sms_provider_links(device_id, provider_type, provider_id, incoming_sms_id, link_type, backfill_run_id)
              VALUES(${deviceId}, ${m.providerType}, ${m.providerId}, ${incomingId}, ${linkType}, ${runId})
              ON CONFLICT (device_id, provider_type, provider_id) DO NOTHING RETURNING id`);
        if (link.rows.length === 0) { // provider_uq 경합 → existing_exact 수렴 (#4)
          if (linkType === "new") await tx.execute(sql`DELETE FROM incoming_sms WHERE id=${incomingId} AND backfill_run_id=${runId}`);
          state = "existing_exact"; incomingId = null; candidates = 0;
        } else state = linkType;
      }
    }
    // items 감사 (dry-run도 기록; dry-run은 customer_state·incoming_sms_id NULL) (#4)
    await tx.execute(
      sql`INSERT INTO sms_backfill_items(backfill_run_id, device_id, provider_type, provider_id, state, customer_state, incoming_sms_id, candidate_count)
          VALUES(${runId}, ${deviceId}, 'sms', ${m.providerId}, ${state}, ${dryRun ? null : customerState}, ${dryRun ? null : incomingId}, ${candidates})
          ON CONFLICT (backfill_run_id, provider_type, provider_id) DO NOTHING`);
    return { state, customerState, incomingId, candidates };
  });
}

export async function processBackfill(input: BackfillInput): Promise<BackfillResult> {
  const d = db;
  if (!d) throw new Error("DB 미초기화");
  if (!isUuid(input.deviceId)) throw new Error("invalid deviceId");

  const runRes: any = await d.execute(sql`SELECT gen_random_uuid() AS id`);
  const runId = String(runRes.rows[0].id); // 서버 생성·검증 (#2)
  // FK 대상이므로 run 먼저 (#2)
  await d.execute(
    sql`INSERT INTO sms_backfill_runs(id, device_id, range_from, range_to, dry_run)
        VALUES(${runId}, ${input.deviceId}, ${input.rangeFrom ?? null}, ${input.rangeTo ?? null}, ${input.dryRun})`);

  const counts: BackfillCounts = {
    total: input.messages.length,
    existing_exact: 0, legacy_linked: 0, new: 0, ambiguous: 0, invalid: 0,
    customer_evaluated: 0, customer_matched: 0, customer_unmatched: 0, customer_skipped: 0,
  };
  const items: { providerId: string | null; state: string; customerState: string }[] = [];

  for (const m of input.messages) {
    if (!validateMsg(m)) {
      counts.invalid++; counts.customer_skipped++;
      const pid = m && typeof m.providerId === "string" && m.providerId ? m.providerId : null;
      if (pid) {
        await d.execute(
          sql`INSERT INTO sms_backfill_items(backfill_run_id, device_id, provider_type, provider_id, state, candidate_count)
              VALUES(${runId}, ${input.deviceId}, 'sms', ${pid}, 'invalid', ${null})
              ON CONFLICT (backfill_run_id, provider_type, provider_id) DO NOTHING`);
      }
      items.push({ providerId: pid, state: "invalid", customerState: "skipped" });
      continue;
    }
    const r = await processOne(runId, input.deviceId, input.dryRun, m);
    (counts as any)[r.state]++;
    counts.customer_evaluated++;
    (counts as any)["customer_" + r.customerState]++;
    items.push({ providerId: m.providerId, state: r.state, customerState: r.customerState });
  }

  await d.execute(sql`UPDATE sms_backfill_runs SET counts=${JSON.stringify(counts)}::jsonb WHERE id=${runId}`);
  return { runId, counts, items }; // body·phone 없음
}
