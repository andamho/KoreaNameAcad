// 달력에 상담 일정이 잡히면 고객정보를 만든다.
//
// 원장님 요청(2026-10-01): 지금까지 고객은 홈페이지 상담신청서나 직접 등록으로만 생겼다.
// 전화·문자로 받은 상담은 달력에만 적히고 고객정보가 없어, 이름분석표·새이름 PDF 가
// 붙을 곳이 없었다(→ '확인 필요'로 멈춤).
//
// 규칙
//  · 대상: 달력 '상담' 일정 중 오늘(KST) 이후 날짜. 지난 상담은 건드리지 않는다.
//  · 이미 있는 고객이면 만들지 않는다: 전화번호 → 이름(개명 전 이름·괄호 옛 이름 포함) 순으로 찾는다.
//  · 제목의 인원이 2명 이상(예 "정다인3")이면 "정다인가족" 으로 만든다(기존 고객명 규칙).
//  · 만들면 텔레그램으로 알린다.
//
// 깨우는 방식: Firestore 실시간 구독(watchEvents). 달력이 저장될 때만 돈다.
// 상담 일정(오늘 이후)이 지난번과 똑같으면 DB 를 아예 보지 않는다 → 개인 일정만 고쳐도 Neon 을 안 깨운다.
import { calendarAvailable, parseNameCount, watchEvents, type CalEvent } from "./calendar";
import { baseName } from "./reports";
import { knopStore } from "./store";

function 오늘KST(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}

// 달력 전화번호는 "+82 10-…" 국제형식으로 적힌 것도 있다. 그대로 숫자만 남기면 "8210…" 이 되어
// 문자 발송·번호로 고객 찾기가 어긋난다(2026-10-01 정다인). 국내형식 010-0000-0000 으로 맞춘다.
export function 국내번호(p?: string | null): string | null {
  let d = (p || "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("82") && (d.length === 11 || d.length === 12)) d = "0" + d.slice(2);
  if (/^01\d{8,9}$/.test(d)) return d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return p!.trim();
}

export type 등록후보 = { date: string; title: string; name: string; people: number; phone: string | null };

// 오늘 이후 상담 일정 → 등록 후보(이름이 한글 2자 이상인 것만)
export function 상담후보(events: CalEvent[]): 등록후보[] {
  const today = 오늘KST();
  const out: 등록후보[] = [];
  for (const e of events) {
    if (e.cat !== "상담" || !e.date || e.date < today) continue;
    const { name, people } = parseNameCount(e.title || "");
    const nm = baseName(name);
    if (!/^[가-힣]{2,}$/.test(nm)) continue;
    const phone = 국내번호(e.clientPhone);
    out.push({ date: e.date, title: e.title || "", name: nm, people, phone });
  }
  return out;
}

export async function 달력상담고객등록(events: CalEvent[], opts: { dryRun?: boolean } = {}) {
  const 만든것: Array<등록후보 & { customerName: string; code?: string }> = [];
  const 본이름 = new Set<string>(); // 같은 사람이 상담 일정 두 개면 한 번만
  for (const c of 상담후보(events)) {
    if (본이름.has(c.name)) continue;
    본이름.add(c.name);
    const existing = await knopStore.resolveCustomerId(c.phone, c.name, { strict: true });
    if (existing) continue;
    const customerName = c.people >= 2 ? `${c.name}가족` : c.name;
    if (opts.dryRun) {
      만든것.push({ ...c, customerName });
      continue;
    }
    const row = await knopStore.createCustomer(
      { name: customerName, phone: c.phone || "미입력", memo: `달력 상담 일정(${c.date})으로 자동 등록` } as any,
      "달력 상담 자동",
    );
    만든것.push({ ...c, customerName, code: row.customerCode || undefined });
    console.log(`[KOP] 달력 상담 → 고객 등록: ${customerName} (${c.date})`);
  }
  if (만든것.length && !opts.dryRun) {
    try {
      const { sendAlert, esc, alertAvailable } = await import("./alertBot");
      if (alertAvailable()) {
        await sendAlert(
          [
            "👤 <b>달력 상담으로 고객 등록</b>",
            ...만든것.map((m) => `${esc(m.customerName)} · 상담 ${m.date.slice(5).replace("-", "/")}${m.phone ? "" : " · 전화 없음"}`),
          ].join("\n"),
        );
      }
    } catch {
      /* 알림 실패는 무시 */
    }
  }
  return 만든것;
}

let _started = false;
let _지난모양 = "";
let _running = false;
let _timer: ReturnType<typeof setTimeout> | null = null;

export function startCalendarCustomerWatch() {
  if (_started || !calendarAvailable()) return;
  // 로컬 개발 서버도 운영 DB 를 쓰므로, 고객을 실제로 만드는 건 운영 서버(Railway)만.
  if (process.env.NODE_ENV !== "production" && process.env.KOP_CAL_CUSTOMER_WATCH !== "1") return;
  _started = true;
  watchEvents(
    (events) => {
      // 상담 일정(오늘 이후)이 그대로면 DB 를 보지 않는다.
      const 모양 = JSON.stringify(상담후보(events));
      if (모양 === _지난모양) return;
      // 달력은 한 번에 여러 번 저장되기도 해서 잠깐 모았다가 한 번만 돈다.
      if (_timer) clearTimeout(_timer);
      const run = async () => {
        if (_running) { _timer = setTimeout(run, 3000); return; } // 도는 중이면 끝난 뒤 다시(변경을 잃지 않게)
        _running = true;
        try {
          await 달력상담고객등록(events);
          _지난모양 = 모양;
        } catch (e: any) {
          console.error(`[KOP] 달력 상담 → 고객 등록 실패: ${e?.message}`);
        } finally {
          _running = false;
        }
      };
      _timer = setTimeout(run, 3000);
    },
    (e) => console.error(`[KOP] 달력 구독 오류: ${e?.message}`),
  );
  console.log("[KOP] 달력 상담 → 고객 자동 등록 감시 시작 (달력 저장 시에만 동작)");
}
