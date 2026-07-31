// 관리자 페이지 전용 "바른이름 달력" 화면 (일정 추가/수정/삭제 + 고객 자료 바로 열기)
//
// 왜 직접 그리는가: 달력 앱을 iframe 으로 끼우면 크롬의 3rd-party 저장소 분리 때문에
// iframe 안에서는 구글 로그인이 유지되지 않는다 → 로그인 배너만 반복되고 일정 수정이 불가능했다.
// 여기서는 서버(서비스계정)를 거쳐 같은 Firestore events 배열을 직접 고치므로 로그인이 필요 없다.
// 저장하는 필드 이름/모양은 달력 앱(휴대폰)과 동일해야 한다 — 같은 배열을 함께 읽고 쓴다.
//
// 조작 규칙(예전 iframe 달력과 같게):
//  - PC: 일정 한 번 클릭 = 수정창, 더블클릭 = 그 고객 자료로 바로 이동(커서만 올려도 미리 받아둠)
//  - 모바일: 달력 앱과 똑같이 칸 안에 분류색 막대 + 제목을 보여준다. 관리자 페이지 좌우 여백(px-4)
//    때문에 한 칸이 43px(앱은 53px)까지 좁아져 첫 글자만 보였으므로 그리드만 -mx-4 로 꽉 채운다.
//    제목이 잘려도 날짜를 누르면 아래 목록에 전체 제목·번호·메모가 나온다.
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, Trash2, Loader2, UserCheck, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { knopApi, type FbCalEvent } from "@/lib/knopApi";
import { getLunarDate } from "./lunar";

// 달력 앱과 같은 분류/색 (CAT_COLORS 이식)
const CATS = ["상담", "작명완료", "WITH", "개완CHK", "개인"] as const;
const CAT_COLOR: Record<string, string> = {
  상담: "#FF8A80", // 빨강
  작명완료: "#82B1FF", // 파랑
  WITH: "#FFD54F", // 노랑
  개완CHK: "#CE93D8", // 보라
  개인: "#90A4AE", // 회색
};
// 달력 앱과 동일: 일정은 분류색 단색 배경 + 흰 글씨(.event-chip). 흐린 반투명은 색 구분이 안 된다.
// 노랑(WITH)만 흰 글씨가 안 읽히므로 검정 글씨를 쓴다.
const chipBg = (cat: string) => CAT_COLOR[cat] || "#888";
const chipFg = (cat: string) => (cat === "WITH" ? "#1a1a1a" : "#fff");
const REPEATS: Array<{ v: string; label: string }> = [
  { v: "none", label: "반복 없음" },
  { v: "monthly", label: "매월" },
  { v: "yearly", label: "매년" },
  { v: "lunar-yearly", label: "매년(음력)" },
];

// KST 기준 오늘 (서버/브라우저 시간대와 무관하게 동일한 날짜 문자열)
function kstTodayStr(): string {
  const now = new Date();
  const kst = new Date(now.getTime() + (9 * 60 + now.getTimezoneOffset()) * 60000);
  return `${kst.getFullYear()}-${String(kst.getMonth() + 1).padStart(2, "0")}-${String(kst.getDate()).padStart(2, "0")}`;
}
function dateKey(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
// "8월 12일 (수)" — 날짜 팝업 제목(달력 앱 openDetail 과 같은 형식)
function labelDate(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const w = ["일", "월", "화", "수", "목", "금", "토"][new Date(y, m - 1, d).getDay()];
  return `${m}월 ${d}일 (${w})`;
}
// "2026년 8월 12일 (수)" — 검색 결과에 쓴다(달력 앱과 같은 형식)
function labelFullDate(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const w = ["일", "월", "화", "수", "목", "금", "토"][new Date(y, m - 1, d).getDay()];
  return `${y}년 ${m}월 ${d}일 (${w})`;
}

// 홍익 상담 표시 — 달력 앱의 원형 '홍' 배지(.hongik-badge 13px / .hongik-badge-detail 18px).
// 빨강 바탕 + 흰 글씨.
function HongikBadge({ size }: { size: 13 | 18 }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: "50%",
        background: "#e53935",
        color: "#fff",
        fontSize: size === 13 ? 8 : 10,
        fontWeight: 900,
        lineHeight: 1,
        flexShrink: 0,
      }}
    >
      홍
    </span>
  );
}

type Draft = Partial<FbCalEvent> & { date: string };

export function FbCalendarView({ onOpenCustomer }: { onOpenCustomer: (id: string) => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const isMobile = useIsMobile();
  const today = kstTodayStr();
  const [year, setYear] = useState(() => Number(today.slice(0, 4)));
  const [month, setMonth] = useState(() => Number(today.slice(5, 7))); // 1~12
  const [selected, setSelected] = useState<string>(today); // 아래 목록에 펼칠 날짜
  const [draft, setDraft] = useState<Draft | null>(null); // 열려 있는 편집/추가 대상
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null); // 한 번 클릭 vs 더블클릭 구분
  const swipe = useRef<{ x: number; y: number } | null>(null); // 좌우로 밀어 달 넘기기
  const [detailDate, setDetailDate] = useState<string | null>(null); // 날짜를 누르면 뜨는 그날 일정 팝업
  const [searchOpen, setSearchOpen] = useState(false); // 일정 검색창 (달력 앱과 같은 기능)
  const [query, setQuery] = useState("");

  const { data: events = [], isLoading, isError, isFetching } = useQuery({
    queryKey: ["knop-fb-calendar"],
    queryFn: () => knopApi.listFbCalendar(),
  });

  const done = (msg: string) => {
    qc.invalidateQueries({ queryKey: ["knop-fb-calendar"] });
    qc.invalidateQueries({ queryKey: ["knop-today"] }); // 오늘탭도 같은 달력을 보여준다
    setDraft(null);
    toast({ title: msg });
  };
  const fail = (e: unknown) => toast({ title: "실패", description: String((e as Error)?.message || e), variant: "destructive" });

  const createM = useMutation({
    mutationFn: (d: Draft) => knopApi.createFbEvent(d as Draft & { title: string }),
    onSuccess: () => done("일정을 추가했습니다"),
    onError: fail,
  });
  const updateM = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<FbCalEvent> }) => knopApi.updateFbEvent(id, patch),
    onSuccess: () => done("일정을 수정했습니다"),
    onError: fail,
  });
  const deleteM = useMutation({
    mutationFn: (id: string) => knopApi.deleteFbEvent(id),
    onSuccess: () => done("일정을 삭제했습니다"),
    onError: fail,
  });
  const busy = createM.isPending || updateM.isPending || deleteM.isPending;

  // 날짜별 묶음. 반복 일정(매월/매년)은 이 달에도 보이게 펼친다 — 달력 앱과 같은 규칙.
  const byDate = useMemo(() => {
    const map = new Map<string, FbCalEvent[]>();
    const push = (k: string, e: FbCalEvent) => map.set(k, [...(map.get(k) || []), e]);
    for (const e of events) {
      if (!e.date) continue;
      const [ey, em, ed] = e.date.split("-").map(Number);
      if (ey === year && em === month) {
        push(e.date, e);
        continue;
      }
      const before = ey < year || (ey === year && em < month); // 지난 일정의 반복 표시
      if (!before) continue;
      if (e.repeat === "monthly") push(dateKey(year, month, ed), e);
      else if ((e.repeat === "yearly" || e.repeat === "lunar-yearly") && em === month) push(dateKey(year, month, ed), e);
    }
    return map;
  }, [events, year, month]);

  const first = new Date(year, month - 1, 1);
  const lead = first.getDay(); // 0=일
  const days = new Date(year, month, 0).getDate();
  const cells: Array<number | null> = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  // 달을 넘기면 아래 목록도 그 달로 따라간다(지난 달 날짜에 머물면 "0건"만 보인다).
  const move = (delta: number) => {
    let y = year;
    let m = month + delta;
    if (m < 1) { y -= 1; m = 12; }
    else if (m > 12) { y += 1; m = 1; }
    setYear(y);
    setMonth(m);
    const t = today.startsWith(`${y}-${String(m).padStart(2, "0")}`) ? today : dateKey(y, m, 1);
    setSelected(t);
  };

  // ── 일정 → 고객 자료 ──
  const resolveKey = (e: FbCalEvent) => ["knop-fb-cal-match", e.clientPhone || "", e.title || ""];
  const resolveCust = (e: FbCalEvent) =>
    qc.fetchQuery({
      queryKey: resolveKey(e),
      queryFn: () => knopApi.resolveCustomer(e.clientPhone || "", e.title || ""),
      staleTime: 60_000,
    });
  // 커서만 올려도 미리 찾아둔다 → 더블클릭하면 즉시 열린다(예전 iframe 달력과 같은 동작)
  const prefetchCust = async (e: FbCalEvent) => {
    try {
      const { customerId } = await resolveCust(e);
      if (customerId) qc.prefetchQuery({ queryKey: ["knop-customer", customerId], queryFn: () => knopApi.getCustomer(customerId) });
    } catch {
      /* 미리받기 실패는 무시 */
    }
  };
  const goCustomer = async (e: FbCalEvent) => {
    try {
      const { customerId } = await resolveCust(e);
      if (customerId) {
        qc.prefetchQuery({ queryKey: ["knop-customer", customerId], queryFn: () => knopApi.getCustomer(customerId) });
        // 창이 열려 있으면 그 기록을 먼저 걷어내고 이동한다.
        // 안 그러면 고객 화면에서 뒤로가기를 눌렀을 때 빈 기록 하나를 더 지나야 한다.
        if (draft && (window.history.state as any)?.fbCalDialog) {
          const afterClose = () => {
            window.removeEventListener("popstate", afterClose);
            onOpenCustomer(customerId);
          };
          window.addEventListener("popstate", afterClose);
          setDraft(null); // 효과 정리에서 history.back() 이 실행된다
        } else {
          setDraft(null);
          onOpenCustomer(customerId);
        }
      } else {
        toast({ title: "연결된 고객이 없습니다", description: `${e.title} — 이름·번호가 고객자료와 다릅니다` });
      }
    } catch {
      toast({ title: "고객 이동 실패", variant: "destructive" });
    }
  };

  // 편집창을 열었을 때 그 일정의 고객 이름을 미리 보여준다
  const matched = useQuery({
    queryKey: ["knop-fb-cal-match-name", draft?.id, draft?.clientPhone, draft?.title],
    enabled: !!draft?.id,
    queryFn: async () => {
      const { customerId } = await knopApi.resolveCustomer(draft?.clientPhone || "", draft?.title || "");
      if (!customerId) return { customerId: null as string | null, customerName: null as string | null };
      const c = await knopApi.getCustomer(customerId);
      qc.setQueryData(["knop-customer", customerId], c);
      return { customerId, customerName: c.customer?.name ?? null };
    },
  });

  const save = () => {
    if (!draft) return;
    const title = (draft.title || "").trim();
    if (!title) return toast({ title: "제목을 입력해주세요", variant: "destructive" });
    if (draft.cat === "상담" && !(draft.clientPhone || "").trim()) {
      return toast({ title: "상담 일정에는 전화번호가 필요합니다", description: "문자 자동발송이 번호로 나갑니다", variant: "destructive" });
    }
    const payload: Partial<FbCalEvent> = {
      date: draft.date,
      title,
      cat: draft.cat || "상담",
      repeat: draft.repeat || "none",
      phoneChange: draft.cat === "작명완료" ? !!draft.phoneChange : false,
      hongik: draft.cat === "상담" ? !!draft.hongik : false,
      gaemyeong: draft.cat === "상담" ? Number(draft.gaemyeong) || 0 : 0,
      clientPhone: (draft.clientPhone || "").trim(),
      memo: (draft.memo || "").trim(),
    };
    if (draft.id) updateM.mutate({ id: draft.id, patch: payload });
    else createM.mutate(payload as Draft & { title: string });
  };

  // 휴대폰 뒤로가기: 일정 창이 열려 있으면 창만 닫는다.
  // 기록을 안 남기면 뒤로가기가 관리자 페이지 자체를 빠져나가 버린다.
  const dialogOpen = !!draft;
  useEffect(() => {
    if (!dialogOpen) return;
    const onPop = () => setDraft(null);
    window.history.pushState({ fbCalDialog: true }, "");
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      // 화면의 닫기/저장으로 닫은 경우엔 우리가 넣은 기록을 되돌려 놓는다
      // (뒤로가기로 닫혔으면 이미 사라져 있으므로 건드리지 않는다)
      if ((window.history.state as any)?.fbCalDialog) window.history.back();
    };
  }, [dialogOpen]);

  const detailList = detailDate ? byDate.get(detailDate) || [] : [];

  // 검색 결과 — 달력 앱과 같게 제목·메모에서 찾고 최신 날짜순
  const searchHits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return events
      .filter((e) => (e.title || "").toLowerCase().includes(q) || (e.memo || "").toLowerCase().includes(q))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [events, query]);

  return (
    <div className="space-y-3">
      {/* 달력 앱처럼 연회색 바탕(#eaeaf2) 위에 달력이 떠 있게 한다. 모바일은 화면 끝까지 편다. */}
      <div className="-mx-4 px-[5px] pt-1 pb-4 sm:mx-0 sm:rounded-2xl" style={{ background: "#eaeaf2" }}>
      {/* 월 이동 */}
      <div className="flex items-center justify-between gap-2 px-1 pb-1">
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="icon" onClick={() => move(-1)} aria-label="이전 달">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="text-base font-bold text-gray-900 w-24 sm:w-32 text-center">
            {year}. {month}
          </div>
          <Button variant="ghost" size="icon" onClick={() => move(1)} aria-label="다음 달">
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setYear(Number(today.slice(0, 4)));
              setMonth(Number(today.slice(5, 7)));
              setSelected(today);
            }}
          >
            오늘
          </Button>
        </div>
        {/* 오른쪽: 검색 + 슬로건 (달력 앱과 같은 자리·문구) */}
        <div className="flex items-center gap-2">
          {isFetching && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
          <button
            type="button"
            aria-label="일정 검색"
            className="p-1 text-gray-700"
            onClick={() => {
              setSearchOpen(true);
              setQuery("");
            }}
          >
            <Search className="w-[21px] h-[21px]" strokeWidth={2.2} />
          </button>
          <div
            className="text-right font-semibold whitespace-nowrap"
            style={{ fontSize: 9.5, color: "#6a5acd", lineHeight: 1.35 }}
          >
            바른 이름으로
            <br />
            널리 세상을 이롭게
          </div>
        </div>
      </div>

      {isError ? (
        <Card className="p-6 text-sm text-red-600">
          달력을 읽지 못했습니다. 서버에 달력 키(KOP_FIREBASE_KEY)가 설정되어 있는지 확인해주세요.
        </Card>
      ) : isLoading ? (
        <Card className="p-10 flex justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </Card>
      ) : (
        <Card
          // 달력 앱 .calendar-grid 와 같은 라운드 12px + 그림자(떠 있는 느낌).
          // 좌우 5px 여백도 앱과 동일(.calendar-page padding: 0 5px).
          className="overflow-hidden border-0"
          style={{ borderRadius: 12, boxShadow: "0 8px 32px rgba(80, 80, 140, 0.18), 0 2px 8px rgba(80, 80, 140, 0.10)" }}
          // 좌우로 밀면 달 이동 (달력 앱과 같은 조작)
          onTouchStart={(ev) => {
            const t = ev.touches[0];
            swipe.current = { x: t.clientX, y: t.clientY };
          }}
          onTouchEnd={(ev) => {
            const s = swipe.current;
            swipe.current = null;
            if (!s) return;
            const t = ev.changedTouches[0];
            const dx = t.clientX - s.x;
            const dy = t.clientY - s.y;
            // 가로로 충분히(50px) 밀었고 세로 움직임보다 클 때만 (스크롤과 헷갈리지 않게)
            if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) move(dx < 0 ? 1 : -1);
          }}
        >
          {/* 요일 머리: 색·크기는 달력 앱과 같게, 배경은 흰색 */}
          <div className="grid grid-cols-7 bg-white">
            {["일", "월", "화", "수", "목", "금", "토"].map((d, i) => (
              <div
                key={d}
                className="text-center font-bold"
                style={{ fontSize: 14, padding: "5px 0", color: i === 0 ? "#e53935" : i === 6 ? "#1565c0" : "#444" }}
              >
                {d}
              </div>
            ))}
          </div>
          {/* 구분선 없이 전부 흰 바탕. 아래 목록을 없앤 대신 달력이 화면 높이를 채운다
              (달력 앱 .calendar-grid 의 grid-auto-rows: 1fr 과 같은 방식 — 주마다 같은 높이) */}
          <div
            className="grid grid-cols-7 bg-white"
            style={{ gridAutoRows: "1fr", height: `calc(100dvh - ${isMobile ? 230 : 260}px)`, minHeight: 420 }}
          >
            {cells.map((d, i) => {
              const key = d ? dateKey(year, month, d) : `empty-${i}`;
              const list = d ? byDate.get(key) || [] : [];
              const isToday = key === today;
              const isSel = key === selected;
              return (
                <div
                  key={key}
                  className={`flex flex-col overflow-hidden bg-white ${d ? "cursor-pointer" : ""}`}
                  onClick={() => {
                    if (!d) return;
                    // 달력 앱과 같게: 날짜를 누르면 그날 일정 팝업이 뜬다(보기 + 추가)
                    setSelected(key);
                    setDetailDate(key);
                  }}
                >
                  {d && (
                    <>
                      {/* 날짜 + 음력: 달력 앱 .date-num(14px/700, 오늘은 원형) / .lunar-date(8px, #aaa) */}
                      <div className="flex flex-col items-center" style={{ padding: "2px 1px 1px" }}>
                        <span
                          className="flex items-center justify-center font-bold"
                          style={{
                            fontSize: 14,
                            lineHeight: 1,
                            width: 22,
                            height: 22,
                            borderRadius: "50%",
                            background: isToday ? "#18a999" : "transparent",
                            // 칸 바탕이 모두 흰색이라, 고른 날짜는 테두리로만 표시한다
                            border: !isToday && isSel ? "1.5px solid #6a5acd" : "1.5px solid transparent",
                            color: isToday ? "#fff" : i % 7 === 0 ? "#e53935" : i % 7 === 6 ? "#1565c0" : "#222",
                          }}
                        >
                          {d}
                        </span>
                        <span style={{ fontSize: 8, color: "#aaa", lineHeight: 1 }}>{getLunarDate(year, month, d)}</span>
                      </div>

                      {/* 일정: 달력 앱 .events-list(padding 0 1px 1px, gap 1px) + .event-chip(11px/600, 1px 3px, radius 3px) */}
                      <div className="flex flex-col overflow-hidden" style={{ padding: "0 1px 1px", gap: 1 }}>
                          {list.map((e, k) => (
                            <button
                              key={`${e.id}-${k}`}
                              className="w-full text-left font-semibold whitespace-nowrap overflow-hidden flex items-center"
                              style={{
                                background: chipBg(e.cat),
                                color: chipFg(e.cat),
                                fontSize: 11,
                                lineHeight: 1.4,
                                padding: "1px 3px",
                                borderRadius: 3,
                                gap: 2, // 달력 앱 .event-chip 과 동일
                              }}
                              title={`${e.cat} · ${e.title}\n한 번 클릭=수정 · 더블클릭=고객 자료`}
                              onMouseEnter={() => prefetchCust(e)}
                              onClick={(ev) => {
                                ev.stopPropagation();
                                // 한 번 누르면 그날 일정 팝업(앱과 동일), 더블클릭이면 아래에서 이 타이머를 취소한다
                                if (clickTimer.current) clearTimeout(clickTimer.current);
                                clickTimer.current = setTimeout(() => {
                                  setSelected(key);
                                  setDetailDate(key);
                                }, 220);
                              }}
                              onDoubleClick={(ev) => {
                                ev.stopPropagation();
                                if (clickTimer.current) clearTimeout(clickTimer.current);
                                goCustomer(e);
                              }}
                            >
                              {e.cat === "작명완료" && e.phoneChange ? <span style={{ fontSize: 8 }}>📞</span> : null}
                              {e.hongik ? <HongikBadge size={13} /> : null}
                              {/* 말줄임(…) 없이 자른다 — 앱과 같은 방식이라야 글자가 한 자 더 보인다 */}
                              <span className="overflow-hidden">{e.title}</span>
                            </button>
                          ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}
      </div>

      {/* 날짜 팝업 — 달력 앱 detail-modal 과 같은 구성: 그날 일정 목록 + "새 일정 추가" */}
      <Dialog open={!!detailDate} onOpenChange={(o) => !o && setDetailDate(null)}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col" style={{ background: "#f2f2f7" }}>
          <DialogHeader>
            <DialogTitle>{detailDate ? labelDate(detailDate) : ""}</DialogTitle>
          </DialogHeader>
          <div className="text-[13px] text-gray-400 font-medium -mt-2 mb-1">
            {detailList.length ? `일정 ${detailList.length}건` : "오늘의 일정"}
          </div>

          <div className="overflow-y-auto flex flex-col gap-2.5 flex-1">
            {detailList.length === 0 ? (
              <div className="text-center text-gray-300 py-6 text-sm">일정 없음</div>
            ) : (
              detailList.map((e, k) => (
                <div
                  key={`${e.id}-${k}`}
                  className="flex items-center gap-2 px-3.5 py-4"
                  style={{ background: chipBg(e.cat), color: chipFg(e.cat), borderRadius: 18 }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-[15px] flex items-center gap-1.5 flex-wrap">
                      {e.hongik ? <HongikBadge size={18} /> : null}
                      <span className="break-all">{e.title}</span>
                      {e.gaemyeong ? (
                        <span style={{ fontSize: 10, background: "#fff3e0", color: "#e65100", borderRadius: 4, padding: "1px 5px" }}>
                          개명 {e.gaemyeong}회
                        </span>
                      ) : null}
                      {e.phoneChange ? (
                        <span style={{ fontSize: 10, background: "rgba(255,255,255,0.9)", color: "#1565c0", borderRadius: 4, padding: "1px 5px" }}>
                          📞번호변경
                        </span>
                      ) : null}
                    </div>
                    <div className="text-[11px] opacity-80">
                      {e.cat}
                      {e.repeat && e.repeat !== "none" ? " · 반복" : ""}
                      {e.clientPhone ? ` · ${e.clientPhone}` : ""}
                      {e.memo ? ` · ${e.memo}` : ""}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    className="shrink-0 bg-white/95 text-gray-900 hover:bg-white"
                    onMouseEnter={() => prefetchCust(e)}
                    onClick={() => goCustomer(e)}
                  >
                    <UserCheck className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    className="shrink-0 bg-black/25 text-white hover:bg-black/35"
                    onClick={() => {
                      setDetailDate(null);
                      setDraft({ ...e, date: detailDate! });
                    }}
                  >
                    수정
                  </Button>
                </div>
              ))
            )}
          </div>

          <button
            type="button"
            className="w-full text-white font-bold"
            style={{
              marginTop: 8,
              padding: 15,
              borderRadius: 18,
              fontSize: 16,
              background: "linear-gradient(135deg, #5b6ef5, #a855f7)",
            }}
            onClick={() => {
              const date = detailDate!;
              setDetailDate(null);
              setDraft({ date, cat: "상담", repeat: "none" });
            }}
          >
            + 새 일정 추가
          </button>
        </DialogContent>
      </Dialog>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "일정 수정" : "새 일정 추가"}</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-500">날짜</label>
                <Input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-gray-500">제목</label>
                <Input
                  value={draft.title || ""}
                  maxLength={30}
                  placeholder='예: "430김유진" (앞 숫자=시간)'
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">분류</label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {CATS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setDraft({ ...draft, cat: c })}
                      className={`px-2.5 py-1 rounded-full text-xs border ${draft.cat === c ? "border-transparent font-bold" : "border-gray-200 text-gray-600"}`}
                      style={draft.cat === c ? { background: chipBg(c), color: chipFg(c) } : undefined}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {draft.cat === "상담" && (
                <>
                  <div>
                    <label className="text-xs text-gray-500">고객 전화번호 (문자 자동발송에 사용)</label>
                    <Input
                      value={draft.clientPhone || ""}
                      placeholder="01012345678"
                      onChange={(e) => setDraft({ ...draft, clientPhone: e.target.value })}
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={!!draft.hongik} onCheckedChange={(v) => setDraft({ ...draft, hongik: !!v })} />
                    <HongikBadge size={18} /> 홍익 상담
                  </label>
                  <div>
                    <label className="text-xs text-gray-500">개명 횟수 (0=개명 아님)</label>
                    <div className="flex gap-1.5 mt-1">
                      {[0, 1, 2, 3, 4].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setDraft({ ...draft, gaemyeong: n })}
                          className={`px-2.5 py-1 rounded-full text-xs border ${(Number(draft.gaemyeong) || 0) === n ? "border-violet-500 bg-violet-50 font-semibold" : "border-gray-200 text-gray-600"}`}
                        >
                          {n === 0 ? "아님" : `${n}회`}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {draft.cat === "작명완료" && (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={!!draft.phoneChange} onCheckedChange={(v) => setDraft({ ...draft, phoneChange: !!v })} />
                  📞 전화번호 작명 포함
                </label>
              )}

              <div>
                <label className="text-xs text-gray-500">반복</label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {REPEATS.map((r) => (
                    <button
                      key={r.v}
                      type="button"
                      onClick={() => setDraft({ ...draft, repeat: r.v })}
                      className={`px-2.5 py-1 rounded-full text-xs border ${(draft.repeat || "none") === r.v ? "border-violet-500 bg-violet-50 font-semibold" : "border-gray-200 text-gray-600"}`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500">메모</label>
                <Textarea rows={2} value={draft.memo || ""} onChange={(e) => setDraft({ ...draft, memo: e.target.value })} />
              </div>

              {draft.id && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={matched.isLoading || !matched.data?.customerId}
                  onClick={() => goCustomer(draft as FbCalEvent)}
                >
                  {matched.isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" /> 고객 찾는 중…
                    </>
                  ) : matched.data?.customerId ? (
                    <>
                      <UserCheck className="w-4 h-4 mr-1" /> 고객 자료 열기
                      {matched.data.customerName ? ` · ${matched.data.customerName}` : ""}
                    </>
                  ) : (
                    "연결된 고객 없음 (이름·번호가 고객자료와 다릅니다)"
                  )}
                </Button>
              )}
            </div>
          )}
          <DialogFooter className="gap-2 sm:justify-between">
            {draft?.id ? (
              <Button
                variant="destructive"
                size="sm"
                disabled={busy}
                onClick={() => {
                  if (confirm("이 일정을 삭제할까요? 휴대폰 달력에서도 사라집니다.")) deleteM.mutate(draft.id!);
                }}
              >
                <Trash2 className="w-4 h-4 mr-1" /> 삭제
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setDraft(null)} disabled={busy}>
                취소
              </Button>
              <Button size="sm" onClick={save} disabled={busy}>
                {busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} 저장
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 일정 검색 — 달력 앱과 같은 규칙: 제목·메모에서 찾고 최신 날짜순, 누르면 그 날짜로 이동 */}
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>일정 검색</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={query}
            placeholder="제목 또는 메모로 검색"
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="overflow-y-auto flex flex-col gap-2 mt-1">
            {!query.trim() ? (
              <div className="text-center text-gray-400 py-10 text-sm">검색어를 입력하세요</div>
            ) : searchHits.length === 0 ? (
              <div className="text-center text-gray-400 py-10 text-sm">검색 결과 없음</div>
            ) : (
              searchHits.map((e, k) => (
                <button
                  key={`${e.id}-${k}`}
                  className="text-left rounded-2xl px-3.5 py-3"
                  style={{ background: chipBg(e.cat), color: chipFg(e.cat) }}
                  onClick={() => {
                    const [ey, em] = e.date.split("-").map(Number);
                    setYear(ey);
                    setMonth(em);
                    setSelected(e.date);
                    setSearchOpen(false);
                  }}
                >
                  <div className="text-[15px] font-bold flex items-center gap-1.5">
                    {e.cat === "작명완료" && e.phoneChange ? <span>📞</span> : null}
                    {e.hongik ? <HongikBadge size={18} /> : null}
                    {e.title}
                  </div>
                  <div className="text-xs opacity-80">
                    {labelFullDate(e.date)} · {e.cat}
                  </div>
                  {e.memo ? <div className="text-xs opacity-70 truncate">{e.memo}</div> : null}
                </button>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
