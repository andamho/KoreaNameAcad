// 관리자 페이지 전용 "바른이름 달력" 화면 (일정 추가/수정/삭제)
//
// 왜 직접 그리는가: 달력 앱을 iframe 으로 끼우면 크롬의 3rd-party 저장소 분리 때문에
// iframe 안에서는 구글 로그인이 유지되지 않는다 → 로그인 배너만 반복되고 일정 수정이 불가능했다.
// 여기서는 서버(서비스계정)를 거쳐 같은 Firestore events 배열을 직접 고치므로 로그인이 필요 없다.
// 저장하는 필드 이름/모양은 달력 앱(휴대폰)과 동일해야 한다 — 같은 배열을 함께 읽고 쓴다.
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, Plus, Trash2, Loader2, UserCheck, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { knopApi, type FbCalEvent } from "@/lib/knopApi";

// 달력 앱과 같은 분류/색 (CAT_COLORS 이식)
const CATS = ["상담", "작명완료", "WITH", "개완CHK", "개인"] as const;
const CAT_COLOR: Record<string, string> = {
  상담: "#FF8A80",
  작명완료: "#82B1FF",
  WITH: "#FFD54F",
  개완CHK: "#CE93D8",
  개인: "#90A4AE",
};
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

type Draft = Partial<FbCalEvent> & { date: string };

export function FbCalendarView({ onOpenCustomer }: { onOpenCustomer: (id: string) => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const today = kstTodayStr();
  const [year, setYear] = useState(() => Number(today.slice(0, 4)));
  const [month, setMonth] = useState(() => Number(today.slice(5, 7))); // 1~12
  const [draft, setDraft] = useState<Draft | null>(null); // 열려 있는 편집/추가 대상

  const { data: events = [], isLoading, isError, refetch, isFetching } = useQuery({
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
      // 지난 달 일정의 반복 표시 (원본 날짜가 이 달보다 이전일 때만)
      const before = ey < year || (ey === year && em < month);
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

  const move = (delta: number) => {
    const m = month + delta;
    if (m < 1) { setYear(year - 1); setMonth(12); }
    else if (m > 12) { setYear(year + 1); setMonth(1); }
    else setMonth(m);
  };

  // 편집창을 열면 그 일정의 고객을 미리 찾아둔다(이름 표시 + 클릭 시 즉시 이동).
  const matched = useQuery({
    queryKey: ["knop-fb-cal-match", draft?.id, draft?.clientPhone, draft?.title],
    enabled: !!draft?.id,
    queryFn: async () => {
      const { customerId } = await knopApi.resolveCustomer(draft?.clientPhone || "", draft?.title || "");
      if (!customerId) return { customerId: null as string | null, customerName: null as string | null };
      const c = await knopApi.getCustomer(customerId); // 상세를 미리 받아두면 이동이 즉시 끝난다
      qc.setQueryData(["knop-customer", customerId], c);
      return { customerId, customerName: c.customer?.name ?? null };
    },
  });

  const openCustomer = async (e: FbCalEvent) => {
    try {
      const { customerId } = await knopApi.resolveCustomer(e.clientPhone || "", e.title || "");
      if (customerId) {
        qc.prefetchQuery({ queryKey: ["knop-customer", customerId], queryFn: () => knopApi.getCustomer(customerId) });
        onOpenCustomer(customerId);
      } else toast({ title: "연결된 고객이 없습니다", description: e.title });
    } catch {
      toast({ title: "고객 이동 실패", variant: "destructive" });
    }
  };

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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => move(-1)} aria-label="이전 달">
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="text-base font-bold text-gray-900 w-32 text-center">
            {year}년 {month}월
          </div>
          <Button variant="ghost" size="icon" onClick={() => move(1)} aria-label="다음 달">
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { setYear(Number(today.slice(0, 4))); setMonth(Number(today.slice(5, 7))); }}>
            오늘
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {isFetching && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-1" /> 새로고침
          </Button>
          <Button size="sm" onClick={() => setDraft({ date: today, cat: "상담", repeat: "none" })}>
            <Plus className="w-4 h-4 mr-1" /> 일정 추가
          </Button>
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
        <Card className="overflow-hidden">
          <div className="grid grid-cols-7 border-b bg-gray-50 text-xs font-semibold">
            {["일", "월", "화", "수", "목", "금", "토"].map((d, i) => (
              <div key={d} className={`py-2 text-center ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-gray-600"}`}>
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((d, i) => {
              const key = d ? dateKey(year, month, d) : `empty-${i}`;
              const list = d ? byDate.get(key) || [] : [];
              const isToday = key === today;
              return (
                <div
                  key={key}
                  className={`min-h-[92px] border-b border-r p-1 ${d ? "cursor-pointer hover:bg-violet-50/60" : "bg-gray-50/50"}`}
                  onClick={() => d && setDraft({ date: key, cat: "상담", repeat: "none" })}
                >
                  {d && (
                    <>
                      <div className={`text-xs mb-1 ${isToday ? "font-bold text-violet-700" : i % 7 === 0 ? "text-red-500" : i % 7 === 6 ? "text-blue-500" : "text-gray-500"}`}>
                        {isToday ? `${d} ·오늘` : d}
                      </div>
                      <div className="space-y-1">
                        {list.map((e, k) => (
                          <button
                            key={`${e.id}-${k}`}
                            className="w-full text-left text-[11px] leading-tight px-1.5 py-1 rounded truncate text-gray-900"
                            style={{ background: `${CAT_COLOR[e.cat] || "#ddd"}55` }}
                            title={`${e.cat} · ${e.title}${e.memo ? ` · ${e.memo}` : ""}`}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              setDraft({ ...e, date: key });
                            }}
                          >
                            {e.cat === "작명완료" && e.phoneChange ? "📞 " : ""}
                            {e.hongik ? "⭕ " : ""}
                            {e.title}
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

      <div className="flex flex-wrap gap-3 text-xs text-gray-500">
        {CATS.map((c) => (
          <span key={c} className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: CAT_COLOR[c] }} /> {c}
          </span>
        ))}
      </div>

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-w-md">
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
                      className={`px-2.5 py-1 rounded-full text-xs border ${draft.cat === c ? "border-violet-500 font-semibold" : "border-gray-200 text-gray-600"}`}
                      style={{ background: draft.cat === c ? `${CAT_COLOR[c]}55` : undefined }}
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
                    ⭕ 홍익 상담
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

              {/* 일정 → 고객 자료 바로 열기. 누르기 전에 누구인지 보이도록 이름을 미리 찾아 표시한다. */}
              {draft.id && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  disabled={matched.isLoading || !matched.data?.customerId}
                  onClick={() => openCustomer(draft as FbCalEvent)}
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
    </div>
  );
}
