// KNOP 운영 플랫폼 데이터 접근 계층 (MVP1)
// Drizzle 직접 사용. DB 미가용 시 DatabaseError 를 던져 라우트에서 503 처리.
import { db } from "../db";
import { DatabaseError } from "../storage";
import { and, desc, eq, gte, lte, like } from "drizzle-orm";
import { formatCode, monthPrefix, parseCode } from "./customerCode";
import { parseContact } from "./smsIntake";
import { statusRank, stageOf, statusToMilestone } from "./stateMachine";
import { readEvents, parseNameCount } from "./calendar";
import { listReports, baseName, reportDateForName } from "./reports";
import { sql } from "drizzle-orm";

export type ResolveResult = {
  match: "code" | "exact" | "alias" | "name" | "ambiguous" | "merge_candidate" | "none";
  customer?: Customer;
  candidates?: Customer[];
  note?: string;
  regDate?: string | null;
};

function safeJsonArr(s: string | null | undefined): any[] {
  try {
    const v = JSON.parse(s || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
import {
  customers,
  projects,
  timelineEvents,
  crmFiles,
  calendarEvents,
  consultations,
  aiInbox,
  calls,
  normalizePhone,
  type Customer,
  type InsertCustomer,
  type Project,
  type InsertProject,
  type TimelineEvent,
  type InsertTimelineEvent,
  type CrmFile,
  type InsertCrmFile,
  type CalendarEvent,
  type InsertCalendarEvent,
  type AiInbox,
  type ParsedPayment,
  type InboxSuggestion,
  type Call,
} from "@shared/schema";

function requireDb() {
  if (!db) throw new DatabaseError("DB 사용 불가", "DATABASE_UNAVAILABLE");
  return db;
}

function fail(op: string, error: any): never {
  console.error(`[KNOP DB ERROR] ${op}: ${error?.message}`, { ts: new Date().toISOString() });
  throw new DatabaseError(`${op} 실패: ${error?.message}`, "DATABASE_QUERY_FAILED");
}

// 타임라인 자동 기록 헬퍼 (내부용)
async function logTimeline(ev: InsertTimelineEvent): Promise<void> {
  const d = requireDb();
  try {
    await d.insert(timelineEvents).values({
      customerId: ev.customerId,
      projectId: ev.projectId ?? null,
      type: ev.type,
      title: ev.title,
      content: ev.content ?? null,
      metadata: ev.metadata ? JSON.stringify(ev.metadata) : null,
    });
  } catch (error: any) {
    // 타임라인 실패가 본 작업을 막지 않도록 로깅만
    console.error(`[KNOP] 타임라인 기록 실패: ${error?.message}`);
  }
}

// 고객번호 다음 순번 계산 (그 달 몇 번째). 예: K26-0102
async function nextCode(d: any, date: Date = new Date()): Promise<string> {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const prefix = monthPrefix(y, m); // "K26-07"
  const rows = await d.select().from(customers).where(like(customers.customerCode, `${prefix}%`));
  return formatCode(y, m, rows.length + 1);
}

// ── Customers ──
export const knopStore = {
  async listCustomers(query?: string): Promise<Customer[]> {
    const d = requireDb();
    try {
      const rows = await d.select().from(customers).orderBy(desc(customers.updatedAt));
      if (!query) return rows;
      const q = query.trim().toLowerCase();
      const nq = normalizePhone(query);
      return rows.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (nq && c.normalizedPhone.includes(nq)) ||
          (c.email || "").toLowerCase().includes(q) ||
          (c.memo || "").toLowerCase().includes(q),
      );
    } catch (e) {
      fail("고객 목록 조회", e);
    }
  },

  async getCustomer(id: string): Promise<Customer | undefined> {
    const d = requireDb();
    try {
      const [row] = await d.select().from(customers).where(eq(customers.id, id));
      return row;
    } catch (e) {
      fail("고객 조회", e);
    }
  },

  // 중복 방지: 정규화 전화번호로 조회
  async findCustomerByPhone(phone: string): Promise<Customer | undefined> {
    const d = requireDb();
    try {
      const nq = normalizePhone(phone);
      if (!nq) return undefined;
      const [row] = await d.select().from(customers).where(eq(customers.normalizedPhone, nq));
      return row;
    } catch (e) {
      fail("전화번호 고객 조회", e);
    }
  },

  async createCustomer(input: InsertCustomer): Promise<Customer> {
    const d = requireDb();
    try {
      const code = await nextCode(d);
      const [row] = await d
        .insert(customers)
        .values({
          customerCode: code,
          name: input.name,
          phone: input.phone,
          normalizedPhone: normalizePhone(input.phone),
          email: input.email ?? null,
          memo: input.memo ?? null,
          tags: input.tags ? JSON.stringify(input.tags) : null,
          sourceConsultationId: input.sourceConsultationId ?? null,
        })
        .returning();
      await logTimeline({
        customerId: row.id,
        type: "customer_created",
        title: "고객 등록",
        content: `${row.customerCode} · ${row.name} (${row.phone})`,
      });
      return row;
    } catch (e) {
      fail("고객 등록", e);
    }
  },

  // 기존 고객에게 고객번호 소급 부여 (createdAt 순, 월별 순번)
  async backfillCustomerCodes(): Promise<number> {
    const d = requireDb();
    try {
      const all = await d.select().from(customers).orderBy(customers.createdAt);
      const seqByPrefix = new Map<string, number>();
      for (const c of all) {
        const pc = c.customerCode ? parseCode(c.customerCode) : null;
        if (pc) {
          const p = monthPrefix(pc.year, pc.month);
          seqByPrefix.set(p, Math.max(seqByPrefix.get(p) || 0, pc.seq));
        }
      }
      let n = 0;
      for (const c of all) {
        if (c.customerCode) continue;
        const dt = c.createdAt ? new Date(c.createdAt) : new Date();
        const y = dt.getFullYear();
        const m = dt.getMonth() + 1;
        const p = monthPrefix(y, m);
        const seq = (seqByPrefix.get(p) || 0) + 1;
        seqByPrefix.set(p, seq);
        await d.update(customers).set({ customerCode: formatCode(y, m, seq) }).where(eq(customers.id, c.id));
        n++;
      }
      return n;
    } catch (e) {
      fail("고객번호 소급부여", e);
    }
  },

  // 전체 고객번호를 '신청일(createdAt) 순서'로 다시 매김 — 월별 순번 정렬
  async renumberCodes(): Promise<{ updated: number }> {
    const d = requireDb();
    try {
      const custs = await d.select().from(customers).orderBy(customers.createdAt); // 오래된→최신
      await d.update(customers).set({ customerCode: null }); // 유니크 충돌 방지로 먼저 비움
      const seqByPrefix = new Map<string, number>();
      let updated = 0;
      for (const c of custs) {
        const dt = c.createdAt ? new Date(c.createdAt) : new Date();
        const y = dt.getFullYear();
        const m = dt.getMonth() + 1;
        const p = monthPrefix(y, m);
        const seq = (seqByPrefix.get(p) || 0) + 1;
        seqByPrefix.set(p, seq);
        await d.update(customers).set({ customerCode: formatCode(y, m, seq) }).where(eq(customers.id, c.id));
        updated++;
      }
      return { updated };
    } catch (e) {
      fail("고객번호 재정렬", e);
    }
  },

  // 가져온 고객의 등록일을 실제 신청서 접수일(상담신청 createdAt)로 맞춤
  async alignRegisteredDates(): Promise<{ updated: number }> {
    const d = requireDb();
    try {
      const custs = await d.select().from(customers);
      let updated = 0;
      for (const c of custs) {
        if (!c.sourceConsultationId) continue;
        const [con] = await d.select().from(consultations).where(eq(consultations.id, c.sourceConsultationId));
        if (con?.createdAt && new Date(con.createdAt).getTime() !== new Date(c.createdAt).getTime()) {
          await d.update(customers).set({ createdAt: con.createdAt }).where(eq(customers.id, c.id));
          updated++;
        }
      }
      return { updated };
    } catch (e) {
      fail("등록일 정렬", e);
    }
  },

  // 상담신청 접수 즉시 KNOP 고객 자동등록 (전화번호 중복이면 기존 반환). 실패해도 신청은 성공하도록 라우트에서 비차단 호출.
  async ensureCustomerFromConsultation(c: any): Promise<Customer | undefined> {
    const d = requireDb();
    try {
      const nq = normalizePhone(c?.phone || "");
      if (!nq) return undefined;
      const [existing] = await d.select().from(customers).where(eq(customers.normalizedPhone, nq));
      if (existing) return existing; // 같은 번호 = 같은 고객
      let name = c.depositorName || "고객";
      let pd: any = c.peopleData;
      if (typeof pd === "string") {
        try {
          pd = JSON.parse(pd);
        } catch {
          pd = [];
        }
      }
      if (Array.isArray(pd) && pd[0]?.name) name = pd[0].name;
      const code = await nextCode(d);
      const [row] = await d
        .insert(customers)
        .values({
          customerCode: code,
          name,
          phone: c.phone,
          normalizedPhone: nq,
          memo: c.reason ?? null,
          sourceConsultationId: c.id ?? null,
        })
        .returning();
      await logTimeline({
        customerId: row.id,
        type: "customer_created",
        title: "고객 등록 (상담신청 자동)",
        content: `${code} · ${name} (${c.phone})`,
      });
      // 파이프라인 케이스 자동 생성 (상담 시작 단계)
      await d.insert(projects).values({
        customerId: row.id,
        type: "이름분석",
        title: `${name} 이름분석`,
        status: "상담 신청",
      });
      return row;
    } catch (e) {
      fail("상담신청 자동 고객등록", e);
    }
  },

  // 이름분석 PDF 폴더 → 빠진 고객 파일 자동생성 (가족 분석이면 "{이름}가족"). PDF·녹음은 이름으로 자동 연결됨.
  async createCustomersFromReports(
    dryRun: boolean
  ): Promise<{ created: number; existing: number; samples: string[] }> {
    const d = requireDb();
    try {
      const reps = listReports();
      const groups = new Map<string, { family: boolean }>();
      for (const r of reps) {
        const bn = baseName(r.name);
        if (!bn) continue;
        const g = groups.get(bn) || { family: false };
        if (r.family) g.family = true;
        groups.set(bn, g);
      }
      const existing = await d.select().from(customers);
      const existBase = new Set(existing.map((c) => baseName(c.name)));
      const res: any = await d.execute(sql`SELECT phone, people_data, depositor_name FROM consultations`);
      const phoneByName = new Map<string, string>();
      for (const r of res.rows || res) {
        try {
          for (const p of JSON.parse(r.people_data || "[]")) if (p?.name) phoneByName.set(baseName(p.name), r.phone);
        } catch {}
        if (r.depositor_name) phoneByName.set(baseName(r.depositor_name), r.phone);
      }
      const seqByPrefix = new Map<string, number>();
      for (const c of existing) {
        const pc = c.customerCode ? parseCode(c.customerCode) : null;
        if (pc) {
          const p = monthPrefix(pc.year, pc.month);
          seqByPrefix.set(p, Math.max(seqByPrefix.get(p) || 0, pc.seq));
        }
      }
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth() + 1;
      const prefix = monthPrefix(y, m);
      let created = 0;
      const samples: string[] = [];
      for (const [bn, g] of Array.from(groups)) {
        if (existBase.has(bn)) continue;
        const name = g.family ? `${bn}가족` : bn;
        const phone = phoneByName.get(bn) || "미입력";
        // 등록일 = PDF 생성일 (없으면 지금)
        const regDate = reportDateForName(bn) || now;
        created++;
        if (samples.length < 12) samples.push(name + (phone !== "미입력" ? ` (…${phone.slice(-4)})` : ""));
        if (!dryRun) {
          const ry = regDate.getFullYear();
          const rm = regDate.getMonth() + 1;
          const rprefix = monthPrefix(ry, rm);
          const seq = (seqByPrefix.get(rprefix) || 0) + 1;
          seqByPrefix.set(rprefix, seq);
          const code = formatCode(ry, rm, seq);
          const [row] = await d
            .insert(customers)
            .values({ customerCode: code, name, phone, normalizedPhone: normalizePhone(phone), memo: "이름분석 PDF 기반 자동생성", createdAt: regDate })
            .returning();
          await d.insert(projects).values({
            customerId: row.id,
            type: g.family ? "가족 개명" : "이름분석",
            title: `${name} ${g.family ? "가족 개명" : "이름분석"}`,
            status: "상담 신청",
          });
          await logTimeline({ customerId: row.id, type: "customer_created", title: "고객 등록 (이름분석 PDF)", content: `${code} · ${name}` });
        }
      }
      return { created, existing: existing.length, samples };
    } catch (e) {
      fail("PDF 기반 고객생성", e);
    }
  },

  // 상담신청 DB → KNOP 고객 일괄 등록 (전화번호로 중복제거, 고객번호=신청월 기준)
  async importConsultations(
    dryRun: boolean
  ): Promise<{
    total: number;
    created: number;
    deduped: number;
    samples: Array<{ code: string; name: string; phoneTail: string; date: string }>;
  }> {
    const d = requireDb();
    try {
      const cons = await d.select().from(consultations).orderBy(consultations.createdAt);
      const existing = await d.select().from(customers);
      const byPhone = new Map<string, boolean>();
      existing.forEach((c) => byPhone.set(c.normalizedPhone, true));
      const seqByPrefix = new Map<string, number>();
      for (const c of existing) {
        const pc = c.customerCode ? parseCode(c.customerCode) : null;
        if (pc) {
          const p = monthPrefix(pc.year, pc.month);
          seqByPrefix.set(p, Math.max(seqByPrefix.get(p) || 0, pc.seq));
        }
      }
      let created = 0;
      let deduped = 0;
      const samples: Array<{ code: string; name: string; phoneTail: string; date: string }> = [];
      for (const c of cons) {
        let name = c.depositorName || "고객";
        try {
          const people = JSON.parse(c.peopleData || "[]");
          if (Array.isArray(people) && people[0]?.name) name = people[0].name;
        } catch {
          /* noop */
        }
        const nq = normalizePhone(c.phone);
        if (!nq || byPhone.has(nq)) {
          deduped++;
          continue;
        }
        const dt = c.createdAt ? new Date(c.createdAt) : new Date();
        const y = dt.getFullYear();
        const m = dt.getMonth() + 1;
        const prefix = monthPrefix(y, m);
        const seq = (seqByPrefix.get(prefix) || 0) + 1;
        seqByPrefix.set(prefix, seq);
        const code = formatCode(y, m, seq);
        byPhone.set(nq, true);
        created++;
        if (samples.length < 8)
          samples.push({ code, name, phoneTail: String(c.phone).slice(-4), date: dt.toISOString().slice(0, 10) });
        if (!dryRun) {
          const [row] = await d
            .insert(customers)
            .values({
              customerCode: code,
              name,
              phone: c.phone,
              normalizedPhone: nq,
              memo: c.reason ?? null,
              sourceConsultationId: c.id,
            })
            .returning();
          await logTimeline({
            customerId: row.id,
            type: "customer_created",
            title: "고객 등록 (상담신청 가져오기)",
            content: `${code} · ${name} (${c.phone})`,
          });
        }
      }
      return { total: cons.length, created, deduped, samples };
    } catch (e) {
      fail("상담신청 가져오기", e);
    }
  },

  async updateCustomer(id: string, input: Partial<InsertCustomer>): Promise<Customer | undefined> {
    const d = requireDb();
    try {
      const [cur] = await d.select().from(customers).where(eq(customers.id, id));
      if (!cur) return undefined;
      const patch: any = { updatedAt: new Date() };
      const now = new Date().toISOString();

      // 이름 변경 → 옛 이름 이력 보관(개명 추적)
      if (input.name !== undefined && input.name !== cur.name) {
        const h = safeJsonArr(cur.nameHistory);
        h.push({ name: cur.name, changedAt: now });
        patch.name = input.name;
        patch.nameHistory = JSON.stringify(h);
        await logTimeline({
          customerId: id,
          type: "name_changed",
          title: "이름 변경(개명)",
          content: `${cur.name} → ${input.name}`,
        });
      } else if (input.name !== undefined) {
        patch.name = input.name;
      }

      // 번호 변경 → 옛 번호 이력 보관(번호변경 추적, 별칭 매칭용)
      if (input.phone !== undefined && normalizePhone(input.phone) !== cur.normalizedPhone) {
        const h = safeJsonArr(cur.phoneHistory);
        h.push({ phone: cur.phone, normalized: cur.normalizedPhone, changedAt: now });
        patch.phone = input.phone;
        patch.normalizedPhone = normalizePhone(input.phone);
        patch.phoneHistory = JSON.stringify(h);
        await logTimeline({
          customerId: id,
          type: "phone_changed",
          title: "전화번호 변경",
          content: `${cur.phone} → ${input.phone}`,
        });
      } else if (input.phone !== undefined) {
        patch.phone = input.phone;
        patch.normalizedPhone = normalizePhone(input.phone);
      }

      if (input.kind !== undefined) patch.kind = input.kind ?? null;
      if (input.phoneNaming !== undefined) patch.phoneNaming = !!input.phoneNaming;
      if (input.email !== undefined) patch.email = input.email ?? null;
      if (input.memo !== undefined) patch.memo = input.memo ?? null;
      if (input.tags !== undefined) patch.tags = input.tags ? JSON.stringify(input.tags) : null;
      const [row] = await d.update(customers).set(patch).where(eq(customers.id, id)).returning();
      return row;
    } catch (e) {
      fail("고객 수정", e);
    }
  },

  // 모든 고객에 케이스(프로젝트) 1개 보장 — 초기상태는 kind로(개명이면 새이름 완료, 아니면 상담신청)
  async ensureCasesForAll(): Promise<{ created: number }> {
    const d = requireDb();
    try {
      const all = await d.select().from(customers);
      const projs = await d.select().from(projects);
      const hasProject = new Set(projs.map((p) => p.customerId));
      let created = 0;
      for (const c of all) {
        if (hasProject.has(c.id)) continue;
        const isRenamed = c.kind === "개명";
        const status = isRenamed ? "새 이름 상담 완료" : "상담 신청";
        const type = isRenamed ? "개인 개명" : "이름분석";
        await d.insert(projects).values({ customerId: c.id, type, title: `${c.name} ${type}`, status });
        created++;
      }
      return { created };
    } catch (e) {
      fail("케이스 생성", e);
    }
  },

  // 파이프라인 보드: 고객 + 대표 케이스 상태 + 마일스톤 인덱스
  async customerBoard(): Promise<Array<Customer & { projectId: string | null; status: string | null; milestone: number }>> {
    const d = requireDb();
    try {
      const custs = await d.select().from(customers).orderBy(desc(customers.createdAt));
      const projs = await d.select().from(projects).orderBy(desc(projects.updatedAt));
      const byCust = new Map<string, (typeof projs)[number]>();
      for (const p of projs) if (!byCust.has(p.customerId)) byCust.set(p.customerId, p);
      return custs.map((c) => {
        const p = byCust.get(c.id);
        return {
          ...c,
          projectId: p?.id ?? null,
          status: p?.status ?? null,
          milestone: p ? statusToMilestone(p.status) : 0,
        };
      });
    } catch (e) {
      fail("보드 조회", e);
    }
  },

  // 달력 자동판정: 작명완료 있으면 개명, phoneChange 있으면 전화번호 작명(☎전번). 수동값은 안 덮음.
  async syncKinds(): Promise<{ 개명: number; 상담: number; 전번: number; updated: number }> {
    const d = requireDb();
    try {
      const events = await readEvents();
      const phones = new Set<string>();
      const names = new Set<string>();
      const pcPhones = new Set<string>(); // phoneChange=true 전화
      const pcNames = new Set<string>();
      const clean = (n: string) => (n || "").replace(/[.\s]+$/, "").replace(/\s*가족\s*$/, "");
      for (const e of events) {
        if (e.cat && e.cat.includes("완료")) {
          if (e.clientPhone) phones.add(normalizePhone(e.clientPhone));
          const nm = parseNameCount(e.title || "").name;
          if (nm) names.add(nm);
        }
        if ((e as any).phoneChange) {
          if (e.clientPhone) pcPhones.add(normalizePhone(e.clientPhone));
          const nm = parseNameCount(e.title || "").name;
          if (nm) pcNames.add(nm);
        }
      }
      const all = await d.select().from(customers);
      let g = 0, s = 0, pn = 0, updated = 0;
      for (const c of all) {
        const cn = clean(c.name);
        const renamed = (c.normalizedPhone && phones.has(c.normalizedPhone)) || names.has(cn);
        const set: any = {};
        if (renamed) {
          g++;
          if (c.kind !== "개명") set.kind = "개명";
        } else {
          s++;
          if (!c.kind) set.kind = "상담";
        }
        const phoneNamed = (c.normalizedPhone && pcPhones.has(c.normalizedPhone)) || pcNames.has(cn);
        if (phoneNamed) {
          pn++;
          if (!c.phoneNaming) set.phoneNaming = true;
        }
        if (Object.keys(set).length) {
          await d.update(customers).set(set).where(eq(customers.id, c.id));
          updated++;
        }
      }
      return { 개명: g, 상담: s, 전번: pn, updated };
    } catch (e) {
      fail("구분 동기화", e);
    }
  },

  // 신원 매칭: 번호우선 → 옛번호(별칭) → 이름+등록일 → 동명이인/새번호는 확인요청
  async resolveCustomer(input: {
    phone?: string;
    contactName?: string;
    customerCode?: string;
  }): Promise<ResolveResult> {
    const d = requireDb();
    try {
      const all = await d.select().from(customers);
      const parsed = input.contactName ? parseContact(input.contactName) : { name: "", regDate: null };
      const name = parsed.name || "";

      // 1) 고객번호(가장 확실) — 명시값 또는 연락처명에서 추출
      const codeStr = input.customerCode || (input.contactName ? parseCode(input.contactName)?.code : null);
      if (codeStr) {
        const c = all.find((x) => x.customerCode === codeStr);
        if (c) return { match: "code", customer: c };
      }

      // 2) 현재 번호
      const nq = input.phone ? normalizePhone(input.phone) : "";
      if (nq) {
        const c = all.find((x) => x.normalizedPhone === nq);
        if (c) return { match: "exact", customer: c };
        // 3) 옛 번호(별칭) — 번호변경된 같은 사람
        const c2 = all.find((x) => safeJsonArr(x.phoneHistory).some((h: any) => h.normalized === nq));
        if (c2) return { match: "alias", customer: c2, note: "옛 번호로 등록된 고객(번호변경됨)" };
      }

      // 4) 이름(+옛이름) 매칭
      if (name) {
        const cands = all.filter(
          (x) => x.name === name || safeJsonArr(x.nameHistory).some((h: any) => h.name === name)
        );
        if (cands.length === 1) return { match: "name", customer: cands[0], note: "번호없이 이름으로 확정(후보 1명)" };
        if (cands.length > 1) {
          return { match: "ambiguous", candidates: cands, note: `동명이인 ${cands.length}명 — 확인 필요`, regDate: parsed.regDate };
        }
      }

      // 5) 새 번호인데 이름이 기존 고객과 일치 → 번호변경 병합 후보
      if (nq && name) {
        const cands = all.filter((x) => x.name === name);
        if (cands.length) return { match: "merge_candidate", candidates: cands, note: "기존 고객과 이름 일치 — 번호변경 가능성(확인 필요)" };
      }

      return { match: "none", note: "신규 고객으로 판단" };
    } catch (e) {
      fail("신원 매칭", e);
    }
  },

  async deleteCustomer(id: string): Promise<boolean> {
    const d = requireDb();
    try {
      // 연결 데이터 정리
      await d.delete(timelineEvents).where(eq(timelineEvents.customerId, id));
      await d.delete(crmFiles).where(eq(crmFiles.customerId, id));
      await d.delete(calendarEvents).where(eq(calendarEvents.customerId, id));
      await d.delete(projects).where(eq(projects.customerId, id));
      const res = await d.delete(customers).where(eq(customers.id, id)).returning();
      return res.length > 0;
    } catch (e) {
      fail("고객 삭제", e);
    }
  },

  // ── Projects ──
  async listProjects(customerId: string): Promise<Project[]> {
    const d = requireDb();
    try {
      return await d
        .select()
        .from(projects)
        .where(eq(projects.customerId, customerId))
        .orderBy(desc(projects.createdAt));
    } catch (e) {
      fail("프로젝트 목록 조회", e);
    }
  },

  async createProject(input: InsertProject): Promise<Project> {
    const d = requireDb();
    try {
      const [row] = await d
        .insert(projects)
        .values({
          customerId: input.customerId,
          type: input.type,
          title: input.title,
          status: input.status ?? "상담 신청",
          paymentStatus: input.paymentStatus ?? "미결제",
          consultDate: input.consultDate ? new Date(input.consultDate) : null,
          nextActionDate: input.nextActionDate ? new Date(input.nextActionDate) : null,
          memo: input.memo ?? null,
        })
        .returning();
      await logTimeline({
        customerId: row.customerId,
        projectId: row.id,
        type: "project_created",
        title: `프로젝트 생성 · ${row.type}`,
        content: row.title,
      });
      return row;
    } catch (e) {
      fail("프로젝트 생성", e);
    }
  },

  async updateProject(id: string, input: Partial<InsertProject>): Promise<Project | undefined> {
    const d = requireDb();
    try {
      const [before] = await d.select().from(projects).where(eq(projects.id, id));
      if (!before) return undefined;
      const patch: any = { updatedAt: new Date() };
      if (input.type !== undefined) patch.type = input.type;
      if (input.title !== undefined) patch.title = input.title;
      if (input.status !== undefined) patch.status = input.status;
      if (input.paymentStatus !== undefined) patch.paymentStatus = input.paymentStatus;
      if (input.consultDate !== undefined)
        patch.consultDate = input.consultDate ? new Date(input.consultDate) : null;
      if (input.nextActionDate !== undefined)
        patch.nextActionDate = input.nextActionDate ? new Date(input.nextActionDate) : null;
      if (input.memo !== undefined) patch.memo = input.memo ?? null;
      const [row] = await d.update(projects).set(patch).where(eq(projects.id, id)).returning();
      // 상태 변경 기록 (설계서 §32: 모든 상태 변경은 기록)
      if (input.status !== undefined && input.status !== before.status) {
        await logTimeline({
          customerId: row.customerId,
          projectId: row.id,
          type: "status_change",
          title: "상태 변경",
          content: `${before.status} → ${row.status}`,
        });
      }
      return row;
    } catch (e) {
      fail("프로젝트 수정", e);
    }
  },

  // 여정 상태기계: 앞으로만 전진(force로 되돌리기/점프 가능) + 다음 후속 안내
  async advanceStatus(
    id: string,
    toStatus: string,
    opts: { force?: boolean } = {}
  ): Promise<
    | undefined
    | { ok: false; reason: string }
    | { ok: true; project: Project; nextFollowup: { template: string; days: number } | null }
  > {
    const d = requireDb();
    try {
      const [before] = await d.select().from(projects).where(eq(projects.id, id));
      if (!before) return undefined;
      const toRank = statusRank(toStatus);
      if (toRank < 0) return { ok: false, reason: `여정에 없는 상태입니다: ${toStatus}` };
      const fromRank = statusRank(before.status);
      if (!opts.force && fromRank >= 0 && toRank < fromRank) {
        return { ok: false, reason: `상태를 뒤로 되돌릴 수 없습니다 (${before.status} → ${toStatus})` };
      }
      const stage = stageOf(toStatus);
      const patch: any = { status: toStatus, updatedAt: new Date() };
      if (stage?.followup) patch.nextActionDate = new Date(Date.now() + stage.followup.days * 86400000);
      const [row] = await d.update(projects).set(patch).where(eq(projects.id, id)).returning();
      if (before.status !== toStatus) {
        await logTimeline({
          customerId: row.customerId,
          projectId: row.id,
          type: "status_change",
          title: "여정 진행",
          content:
            `${before.status} → ${toStatus}` +
            (stage?.followup ? ` · 다음: ${stage.followup.template} (${stage.followup.days}일 후)` : ""),
        });
      }
      return { ok: true, project: row, nextFollowup: stage?.followup ?? null };
    } catch (e) {
      fail("상태 진행", e);
    }
  },

  async deleteProject(id: string): Promise<boolean> {
    const d = requireDb();
    try {
      const res = await d.delete(projects).where(eq(projects.id, id)).returning();
      return res.length > 0;
    } catch (e) {
      fail("프로젝트 삭제", e);
    }
  },

  // ── Timeline ──
  async listTimeline(customerId: string): Promise<TimelineEvent[]> {
    const d = requireDb();
    try {
      return await d
        .select()
        .from(timelineEvents)
        .where(eq(timelineEvents.customerId, customerId))
        .orderBy(desc(timelineEvents.createdAt));
    } catch (e) {
      fail("타임라인 조회", e);
    }
  },

  async addTimelineEvent(input: InsertTimelineEvent): Promise<TimelineEvent> {
    const d = requireDb();
    try {
      const [row] = await d
        .insert(timelineEvents)
        .values({
          customerId: input.customerId,
          projectId: input.projectId ?? null,
          type: input.type,
          title: input.title,
          content: input.content ?? null,
          metadata: input.metadata ? JSON.stringify(input.metadata) : null,
        })
        .returning();
      return row;
    } catch (e) {
      fail("타임라인 추가", e);
    }
  },

  async deleteTimelineEvent(id: string): Promise<boolean> {
    const d = requireDb();
    try {
      const res = await d.delete(timelineEvents).where(eq(timelineEvents.id, id)).returning();
      return res.length > 0;
    } catch (e) {
      fail("타임라인 삭제", e);
    }
  },

  // ── Files ──
  async listFiles(customerId: string): Promise<CrmFile[]> {
    const d = requireDb();
    try {
      return await d
        .select()
        .from(crmFiles)
        .where(eq(crmFiles.customerId, customerId))
        .orderBy(desc(crmFiles.uploadedAt));
    } catch (e) {
      fail("파일 목록 조회", e);
    }
  },

  async addFile(input: InsertCrmFile): Promise<CrmFile> {
    const d = requireDb();
    try {
      const [row] = await d
        .insert(crmFiles)
        .values({
          customerId: input.customerId,
          projectId: input.projectId ?? null,
          fileName: input.fileName,
          fileType: input.fileType ?? null,
          fileUrl: input.fileUrl,
          memo: input.memo ?? null,
        })
        .returning();
      await logTimeline({
        customerId: row.customerId,
        projectId: row.projectId,
        type: "file",
        title: "파일 첨부",
        content: row.fileName,
        metadata: { fileUrl: row.fileUrl, fileId: row.id },
      });
      return row;
    } catch (e) {
      fail("파일 첨부", e);
    }
  },

  async deleteFile(id: string): Promise<boolean> {
    const d = requireDb();
    try {
      const res = await d.delete(crmFiles).where(eq(crmFiles.id, id)).returning();
      return res.length > 0;
    } catch (e) {
      fail("파일 삭제", e);
    }
  },

  // ── Calendar ──
  async listEventsInRange(startISO: string, endISO: string): Promise<CalendarEvent[]> {
    const d = requireDb();
    try {
      return await d
        .select()
        .from(calendarEvents)
        .where(and(gte(calendarEvents.startAt, new Date(startISO)), lte(calendarEvents.startAt, new Date(endISO))))
        .orderBy(calendarEvents.startAt);
    } catch (e) {
      fail("일정 조회", e);
    }
  },

  async listEventsForCustomer(customerId: string): Promise<CalendarEvent[]> {
    const d = requireDb();
    try {
      return await d
        .select()
        .from(calendarEvents)
        .where(eq(calendarEvents.customerId, customerId))
        .orderBy(calendarEvents.startAt);
    } catch (e) {
      fail("고객 일정 조회", e);
    }
  },

  async createEvent(input: InsertCalendarEvent): Promise<CalendarEvent> {
    const d = requireDb();
    try {
      const [row] = await d
        .insert(calendarEvents)
        .values({
          customerId: input.customerId ?? null,
          projectId: input.projectId ?? null,
          title: input.title,
          type: input.type ?? "기타",
          startAt: new Date(input.startAt),
          endAt: input.endAt ? new Date(input.endAt) : null,
          status: input.status ?? "예정",
          memo: input.memo ?? null,
        })
        .returning();
      if (row.customerId) {
        await logTimeline({
          customerId: row.customerId,
          projectId: row.projectId,
          type: "event",
          title: `일정 등록 · ${row.type}`,
          content: `${row.title} (${row.startAt.toISOString()})`,
          metadata: { eventId: row.id },
        });
      }
      return row;
    } catch (e) {
      fail("일정 생성", e);
    }
  },

  async updateEvent(id: string, input: Partial<InsertCalendarEvent>): Promise<CalendarEvent | undefined> {
    const d = requireDb();
    try {
      const patch: any = {};
      if (input.title !== undefined) patch.title = input.title;
      if (input.type !== undefined) patch.type = input.type;
      if (input.startAt !== undefined) patch.startAt = new Date(input.startAt);
      if (input.endAt !== undefined) patch.endAt = input.endAt ? new Date(input.endAt) : null;
      if (input.status !== undefined) patch.status = input.status;
      if (input.memo !== undefined) patch.memo = input.memo ?? null;
      const [row] = await d.update(calendarEvents).set(patch).where(eq(calendarEvents.id, id)).returning();
      return row;
    } catch (e) {
      fail("일정 수정", e);
    }
  },

  async deleteEvent(id: string): Promise<boolean> {
    const d = requireDb();
    try {
      const res = await d.delete(calendarEvents).where(eq(calendarEvents.id, id)).returning();
      return res.length > 0;
    } catch (e) {
      fail("일정 삭제", e);
    }
  },

  // ── 대시보드: 오늘 해야 할 일 (설계서 §21) ──
  async getToday(startISO: string, endISO: string) {
    const d = requireDb();
    try {
      const start = new Date(startISO);
      const end = new Date(endISO);
      const events = await d
        .select()
        .from(calendarEvents)
        .where(and(gte(calendarEvents.startAt, start), lte(calendarEvents.startAt, end)))
        .orderBy(calendarEvents.startAt);
      const actionProjects = await d
        .select()
        .from(projects)
        .where(and(gte(projects.nextActionDate, start), lte(projects.nextActionDate, end)))
        .orderBy(projects.nextActionDate);
      return { events, actionProjects };
    } catch (e) {
      fail("오늘 할 일 조회", e);
    }
  },

  // ── 상담신청 → 고객+프로젝트 전환 (기존 데이터 연결) ──
  async convertConsultation(consultationId: string): Promise<{ customer: Customer; project: Project }> {
    const d = requireDb();
    try {
      const [c] = await d.select().from(consultations).where(eq(consultations.id, consultationId));
      if (!c) throw new DatabaseError("상담신청을 찾을 수 없습니다", "NOT_FOUND");

      // 신청서의 첫 신청자 이름 추출 (peopleData JSON)
      let applicantName = c.depositorName || "고객";
      try {
        const people = JSON.parse(c.peopleData || "[]");
        if (Array.isArray(people) && people[0]?.name) applicantName = people[0].name;
      } catch {
        /* noop */
      }

      // 중복 방지: 같은 전화번호 고객 재사용
      const nq = normalizePhone(c.phone);
      let customer: Customer | undefined;
      if (nq) {
        const [existing] = await d.select().from(customers).where(eq(customers.normalizedPhone, nq));
        customer = existing;
      }
      if (!customer) {
        const code = await nextCode(d);
        [customer] = await d
          .insert(customers)
          .values({
            customerCode: code,
            name: applicantName,
            phone: c.phone,
            normalizedPhone: nq,
            memo: c.reason ?? null,
            sourceConsultationId: c.id,
          })
          .returning();
        await logTimeline({
          customerId: customer.id,
          type: "customer_created",
          title: "고객 등록 (상담신청 전환)",
          content: `${customer.customerCode} · ${customer.name} (${customer.phone})`,
        });
      }

      const projectType = c.type === "naming" ? "개인 개명" : "이름분석";
      const [project] = await d
        .insert(projects)
        .values({
          customerId: customer.id,
          type: projectType,
          title: `${applicantName} · ${projectType}`,
          status: "상담 신청",
          paymentStatus: "미결제",
          memo: c.reason ?? null,
        })
        .returning();

      await logTimeline({
        customerId: customer.id,
        projectId: project.id,
        type: "consultation_intake",
        title: "상담 신청 접수",
        content: `희망시간: ${c.consultationTime} · 입금자명: ${c.depositorName}`,
        metadata: { consultationId: c.id },
      });

      return { customer, project };
    } catch (e) {
      if (e instanceof DatabaseError) throw e;
      fail("상담신청 전환", e);
    }
  },

  // ── AI Inbox (결제 문자 분석·매칭) ──
  async createInboxItem(input: {
    source?: string;
    sender?: string | null;
    rawText: string;
    parsed: ParsedPayment;
    suggestions: InboxSuggestion[];
    suggestedCustomerId: string | null;
    suggestedProjectId: string | null;
    confidence: number;
  }): Promise<AiInbox> {
    const d = requireDb();
    try {
      const [row] = await d
        .insert(aiInbox)
        .values({
          source: input.source ?? "sms",
          sender: input.sender ?? null,
          rawText: input.rawText,
          parsed: JSON.stringify(input.parsed),
          suggestions: JSON.stringify(input.suggestions),
          suggestedCustomerId: input.suggestedCustomerId,
          suggestedProjectId: input.suggestedProjectId,
          confidence: input.confidence,
          status: "pending",
        })
        .returning();
      return row;
    } catch (e) {
      fail("AI Inbox 저장", e);
    }
  },

  async listInbox(status?: string): Promise<AiInbox[]> {
    const d = requireDb();
    try {
      const rows = await d.select().from(aiInbox).orderBy(desc(aiInbox.createdAt));
      return status ? rows.filter((r) => r.status === status) : rows;
    } catch (e) {
      fail("AI Inbox 목록", e);
    }
  },

  async dismissInbox(id: string): Promise<boolean> {
    const d = requireDb();
    try {
      const res = await d
        .update(aiInbox)
        .set({ status: "dismissed", resolvedAt: new Date() })
        .where(eq(aiInbox.id, id))
        .returning();
      return res.length > 0;
    } catch (e) {
      fail("AI Inbox 무시", e);
    }
  },

  // 승인: 선택한 프로젝트를 결제완료 처리 + 타임라인 기록 + inbox approved
  async approveInbox(
    id: string,
    customerId: string,
    projectId: string,
    paymentLabel: string, // "상담비" | "개명비" | 기타
  ): Promise<{ inbox: AiInbox; project: Project }> {
    const d = requireDb();
    try {
      const [item] = await d.select().from(aiInbox).where(eq(aiInbox.id, id));
      if (!item) throw new DatabaseError("Inbox 항목을 찾을 수 없습니다", "NOT_FOUND");
      const [proj] = await d.select().from(projects).where(eq(projects.id, projectId));
      if (!proj) throw new DatabaseError("프로젝트를 찾을 수 없습니다", "NOT_FOUND");

      // 결제 종류에 따른 상태 (상담비 → 상담비 결제완료, 개명비 → 개명비 결제완료)
      const newStatus =
        paymentLabel === "개명비" ? "개명비 결제완료" : paymentLabel === "상담비" ? "상담비 결제완료" : proj.status;

      const [updatedProj] = await d
        .update(projects)
        .set({ paymentStatus: "결제완료", status: newStatus, updatedAt: new Date() })
        .where(eq(projects.id, projectId))
        .returning();

      let parsedAmount = 0;
      try {
        parsedAmount = JSON.parse(item.parsed || "{}").amount || 0;
      } catch {
        /* noop */
      }
      await logTimeline({
        customerId,
        projectId,
        type: "message",
        title: `${paymentLabel} 결제확인`,
        content: `${parsedAmount ? parsedAmount.toLocaleString() + "원 " : ""}입금 확인 (AI Inbox 승인)`,
        metadata: { inboxId: id, raw: item.rawText },
      });

      const [inbox] = await d
        .update(aiInbox)
        .set({
          status: "approved",
          approvedCustomerId: customerId,
          approvedProjectId: projectId,
          resolvedAt: new Date(),
        })
        .where(eq(aiInbox.id, id))
        .returning();

      return { inbox, project: updatedProj };
    } catch (e) {
      if (e instanceof DatabaseError) throw e;
      fail("AI Inbox 승인", e);
    }
  },

  // ── Calls (통화 녹음 + 전사/요약) ──
  async listCalls(customerId: string): Promise<Call[]> {
    const d = requireDb();
    try {
      return await d.select().from(calls).where(eq(calls.customerId, customerId)).orderBy(desc(calls.createdAt));
    } catch (e) {
      fail("통화 목록", e);
    }
  },

  async createCall(input: {
    customerId: string;
    projectId?: string | null;
    phone?: string | null;
    direction?: string;
    callDate?: string | null;
    audioFileUrl?: string | null;
    transcriptText?: string | null;
    summaryText?: string | null;
    actionItems?: string[];
    words?: unknown[];
    memo?: string | null;
    status?: string;
  }): Promise<Call> {
    const d = requireDb();
    try {
      const [row] = await d
        .insert(calls)
        .values({
          customerId: input.customerId,
          projectId: input.projectId ?? null,
          phone: input.phone ?? null,
          direction: input.direction ?? "수신",
          callDate: input.callDate ? new Date(input.callDate) : new Date(),
          audioFileUrl: input.audioFileUrl ?? null,
          transcriptText: input.transcriptText ?? null,
          summaryText: input.summaryText ?? null,
          actionItems: input.actionItems ? JSON.stringify(input.actionItems) : null,
          words: input.words ? JSON.stringify(input.words) : null,
          memo: input.memo ?? null,
          status: input.status ?? "done",
        })
        .returning();
      return row;
    } catch (e) {
      fail("통화 저장", e);
    }
  },

  // 비동기 전사 완료 후 결과 채우기 (+완료 시 타임라인 기록)
  async updateCall(
    id: string,
    patch: {
      transcriptText?: string | null;
      summaryText?: string | null;
      actionItems?: string[];
      words?: unknown[];
      status?: string;
      durationSeconds?: number | null;
    },
  ): Promise<Call | undefined> {
    const d = requireDb();
    try {
      const set: any = {};
      if (patch.transcriptText !== undefined) set.transcriptText = patch.transcriptText;
      if (patch.summaryText !== undefined) set.summaryText = patch.summaryText;
      if (patch.actionItems !== undefined) set.actionItems = JSON.stringify(patch.actionItems);
      if (patch.words !== undefined) set.words = JSON.stringify(patch.words);
      if (patch.status !== undefined) set.status = patch.status;
      if (patch.durationSeconds !== undefined) set.durationSeconds = patch.durationSeconds;
      const [row] = await d.update(calls).set(set).where(eq(calls.id, id)).returning();
      if (row && patch.status === "done") {
        await logTimeline({
          customerId: row.customerId,
          projectId: row.projectId,
          type: "call",
          title: "통화 녹음 · 전사 완료",
          content: row.summaryText || (row.transcriptText || "").slice(0, 200),
          metadata: { callId: row.id, audioFileUrl: row.audioFileUrl },
        });
      }
      return row;
    } catch (e) {
      fail("통화 갱신", e);
    }
  },

  async getCall(id: string): Promise<Call | undefined> {
    const d = requireDb();
    try {
      const [row] = await d.select().from(calls).where(eq(calls.id, id));
      return row;
    } catch (e) {
      fail("통화 조회", e);
    }
  },

  async deleteCall(id: string): Promise<boolean> {
    const d = requireDb();
    try {
      const res = await d.delete(calls).where(eq(calls.id, id)).returning();
      return res.length > 0;
    } catch (e) {
      fail("통화 삭제", e);
    }
  },
};
