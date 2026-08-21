// KNOP 운영 플랫폼 루트 — 오늘 / 고객 / 달력 + 고객 상세
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Users,
  CalendarDays,
  Search,
  Plus,
  Phone,
  Wallet,
  SpellCheck,
  MessageSquare,
  Inbox,
  Trash2,
  Bird,
  FileText,
} from "lucide-react";
import { knopApi } from "@/lib/knopApi";
import { useToast } from "@/hooks/use-toast";
import { useAdmin } from "@/contexts/AdminContext";
import type { Customer } from "@shared/schema";
import { KNOP_MILESTONES, KNOP_MILESTONE_ENTRY, KNOP_PHONE_MILESTONE } from "@shared/schema";
import { CustomerDetailView } from "./CustomerDetail";
import { InboxView } from "./InboxView";
import { CorrectionsView } from "./CorrectionsView";
import { ReportReviewView } from "./ReportReviewView";
import { NoticeView } from "./NoticeView";
import { VoiceAssistant } from "./VoiceAssistant";
import { SmsView } from "./SmsView";
import { SmsInboxView } from "./SmsInboxView";
import { FbCalendarView } from "./FbCalendarView";
import { NewCustomerDialog } from "./dialogs";
import { StatusBadge, fmtDate, fmtTime, seqLabel } from "./lib";

type View = "customers" | "inbox" | "sms-inbox" | "sms" | "notice" | "calendar" | "reports" | "corrections";

export function KnopApp() {
  const { isAdmin, isVerifying } = useAdmin();
  // 관리자 페이지를 열면 달력이 먼저 보인다.
  const [view, setView] = useState<View>("calendar");
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);

  // ── 휴대폰 뒤로가기 ──
  // 탭 전환·고객 상세 열기는 React 상태만 바꿔서 브라우저 기록이 남지 않았다.
  // 그래서 뒤로가기를 누르면 직전 화면이 아니라 관리자 페이지 자체를 빠져나갔다.
  // 화면이 바뀔 때마다 기록을 남기고, 뒤로가기 때 그 화면으로 되돌린다.
  const go = (next: { view?: View; customer?: string | null }) => {
    const v = next.view ?? view;
    const c = next.customer !== undefined ? next.customer : selectedCustomer;
    if (v === view && c === selectedCustomer) return;
    window.history.pushState({ ...(window.history.state || {}), knop: { view: v, customer: c } }, "");
    setView(v);
    setSelectedCustomer(c);
  };
  const openCustomer = (id: string) => go({ customer: id });

  useEffect(() => {
    // 첫 화면도 기록에 심어둔다 → 뒤로가기로 여기까지 되돌아올 수 있다
    const st = window.history.state as any;
    if (!st?.knop) {
      window.history.replaceState({ ...(st || {}), knop: { view: "calendar", customer: null } }, "");
    }
    const onPop = (e: PopStateEvent) => {
      const s = (e.state as any)?.knop;
      if (!s) return; // 관리자 페이지 기록 밖 → 브라우저가 평소대로 페이지를 떠나게 둔다
      setView(s.view as View);
      setSelectedCustomer(s.customer ?? null);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  if (!isVerifying && !isAdmin) {
    return (
      <Card className="p-12 text-center text-gray-500">
        관리자 로그인이 필요합니다. 우측 상단 메뉴에서 로그인해 주세요.
      </Card>
    );
  }

  const tabs: { key: View; label: string; icon: typeof CalendarDays }[] = [
    { key: "calendar", label: "달력", icon: CalendarDays },
    { key: "customers", label: "고객", icon: Users },
    { key: "notice", label: "개명후관리", icon: Bird },
    { key: "sms", label: "안내문자", icon: MessageSquare },
    { key: "inbox", label: "입금", icon: Wallet },
    { key: "sms-inbox", label: "문자수신", icon: Inbox },
    { key: "reports", label: "이름분석표", icon: FileText },
    { key: "corrections", label: "교정사전", icon: SpellCheck },
  ];

  return (
    <>
      <VoiceAssistant
        onOpenCustomer={openCustomer}
        onNavigate={(v) => go({ view: v as View, customer: null })}
      />
      <div className="space-y-6">
        {/* 상단 탭은 고객 상세를 열어도 항상 보이게 한다 — 탭을 누르면 고객 상세에서 빠져나온다 */}
        {/* 모바일: 탭이 11개라 넘치므로 가로 스크롤(스크롤바 숨김) */}
        <div className="flex items-center gap-1 border-b border-gray-200 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {tabs.map((t) => {
            const Icon = t.icon;
            const active = !selectedCustomer && view === t.key;
            return (
              <button
                key={t.key}
                onClick={() => go({ view: t.key, customer: null })}
                className={`shrink-0 whitespace-nowrap flex items-center gap-1.5 px-3 sm:px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
                  active
                    ? "border-[#56D5DB] text-gray-900"
                    : "border-transparent text-gray-400 hover:text-gray-600"
                }`}
              >
                <Icon className="w-4 h-4" /> {t.label}
              </button>
            );
          })}
        </div>

        {selectedCustomer ? (
          <CustomerDetailView
            customerId={selectedCustomer}
            // 화면의 "뒤로" 도 브라우저 뒤로가기와 같은 동작이어야 기록이 어긋나지 않는다
            onBack={() => {
              if ((window.history.state as any)?.knop?.customer) window.history.back();
              else go({ customer: null });
            }}
          />
        ) : (
          <>
            {view === "customers" && <CustomersView onOpenCustomer={openCustomer} />}
            {view === "inbox" && <InboxView onOpenCustomer={openCustomer} />}
            {view === "sms-inbox" && <SmsInboxView />}
            {view === "sms" && <SmsView />}
            {view === "notice" && <NoticeView onOpenCustomer={openCustomer} />}
            {view === "calendar" && <CalendarView onOpenCustomer={openCustomer} />}
            {view === "reports" && <ReportReviewView />}
            {view === "corrections" && <CorrectionsView />}
          </>
        )}
      </div>
    </>
  );
}

// ── 고객 파이프라인 보드 ──
// 보드 6단계 — 정의는 shared/schema.ts 하나(서버·목록·상세 공용)
const MILESTONES = KNOP_MILESTONES as readonly string[];
const MILESTONE_ENTRY = KNOP_MILESTONE_ENTRY as readonly string[];
const PHONE_MILESTONE = KNOP_PHONE_MILESTONE; // shared 와 동일(고객상세와 어긋나지 않게)
const TEAL = "#1D9E75";
const AMBER = "#F59E0B"; // 새이름 단계 랜드마크 색(스크롤 중 위치 파악용)
const AMBER_MILESTONE = KNOP_MILESTONES.indexOf("새이름"); // 노란색으로 표시할 단계
const APPROVED_MILESTONE = KNOP_MILESTONES.indexOf("개명승인"); // 점 대신 마스코트로 표시할 단계
const GRID = { gridTemplateColumns: `160px repeat(${MILESTONES.length}, 1fr)` } as const;
function codeMonth(code: string | null): string {
  const m = (code || "").match(/K(\d{2})-(\d{2})/);
  return m ? `${m[1]}.${m[2]}` : "";
}
function cleanName(n: string): string {
  return (n || "").replace(/[.\s]+$/, "");
}

// 개명 배지 옆 진행상황 칩: 현재 단계 + (진행중이면) 미용감사/정화하기 n/총
function ProgressChips({ milestone, seq }: { milestone: number; seq?: { setKey: string; sent: number; total: number } }) {
  const done = milestone >= MILESTONES.length;
  const isCourt = milestone === AMBER_MILESTONE;
  return (
    <>
      <span
        className="shrink-0 text-[11px] px-1.5 py-0.5 rounded-full font-medium"
        style={{
          background: done ? "#F3F4F6" : isCourt ? "#FEF3C7" : "#E1F5EE",
          color: done ? "#6B7280" : isCourt ? "#B45309" : "#1D9E75",
        }}
      >
        {done ? "완료" : MILESTONES[milestone]}
      </span>
      {seq && (
        <span className="shrink-0 text-[11px] px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700 font-medium">
          {/* 라벨은 서버가 준 setLabel 을 쓴다. 예전엔 "미용감사 아니면 정화하기"로 단정해서
              새 이름 상담 안내가 '정화하기'로 잘못 표시됐다. */}
          {seqLabel(seq)} {seq.sent}/{seq.total}
        </span>
      )}
    </>
  );
}

function CustomersView({ onOpenCustomer }: { onOpenCustomer: (id: string) => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"recent" | "name" | "old">("recent");
  const [month, setMonth] = useState("all");
  const [kind, setKind] = useState<"all" | "개명" | "상담">("개명"); // 처음엔 개명 목록부터
  const [newOpen, setNewOpen] = useState(false);

  const { data: board, isLoading } = useQuery({ queryKey: ["knop-board"], queryFn: () => knopApi.customerBoard() });
  // 진행중 관리문자(미용감사/정화하기) — 명단에서 개명 옆에 표시
  const { data: activeSeqs } = useQuery({
    queryKey: ["knop-notice-active"],
    queryFn: () => knopApi.listActiveSequences(),
    // 관리문자 진행도는 급히 바뀌지 않는다 — 화면 방치 시 DB를 계속 깨우지 않도록 간격을 늘림
    refetchInterval: 10 * 60 * 1000,
    refetchOnWindowFocus: true,
  });
  const seqByCust = new Map((activeSeqs || []).map((s) => [s.customerId, s]));
  // 행에 마우스를 올리는 순간 고객 상세를 미리 받아둔다(클릭 시 즉시 표시)
  const prefetchCustomer = (id: string) =>
    qc.prefetchQuery({ queryKey: ["knop-customer", id], queryFn: () => knopApi.getCustomer(id) });
  const advance = useMutation({
    // force=true 면 뒤 단계로도 되돌릴 수 있다(잘못 찍은 단계 수정용)
    mutationFn: ({ projectId, toStatus, force }: { projectId: string; toStatus: string; force?: boolean; toMilestone?: number }) =>
      knopApi.advanceStatus(projectId, toStatus, !!force),
    // 낙관적 반영: 클릭 즉시 그 행의 단계를 바꿔 화면에 표시(체감 즉시). 저장은 뒤에서.
    onMutate: async ({ projectId, toStatus, toMilestone }) => {
      await qc.cancelQueries({ queryKey: ["knop-board"] });
      const prev = qc.getQueryData<any[]>(["knop-board"]);
      if (prev && typeof toMilestone === "number") {
        qc.setQueryData<any[]>(["knop-board"], prev.map((c) => (c.projectId === projectId ? { ...c, milestone: toMilestone, status: toStatus } : c)));
      }
      return { prev };
    },
    onError: (e: Error, _v, ctx: any) => {
      if (ctx?.prev) qc.setQueryData(["knop-board"], ctx.prev); // 실패 시 원복
      toast({ title: "진행 불가", description: e.message, variant: "destructive" });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["knop-board"] }), // 백그라운드 재확인
  });
  const togglePhone = useMutation({
    mutationFn: ({ id, on }: { id: string; on: boolean }) => knopApi.updateCustomer(id, { phoneNaming: on }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["knop-board"] }),
  });
  const [showTrash, setShowTrash] = useState(false);
  const { data: trash } = useQuery({ queryKey: ["knop-trash"], queryFn: () => knopApi.listTrash(), enabled: showTrash });
  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["knop-board"] });
    qc.invalidateQueries({ queryKey: ["knop-trash"] });
  };
  const trashMut = useMutation({
    mutationFn: (id: string) => knopApi.deleteCustomer(id),
    onSuccess: () => { refreshAll(); toast({ title: "휴지통으로 이동" }); },
  });
  const restoreMut = useMutation({
    mutationFn: (id: string) => knopApi.restoreCustomer(id),
    onSuccess: () => { refreshAll(); toast({ title: "복원됨" }); },
  });
  const purgeMut = useMutation({
    mutationFn: (id: string) => knopApi.permanentDeleteCustomer(id),
    onSuccess: () => { refreshAll(); toast({ title: "완전 삭제됨" }); },
  });

  const months = Array.from(new Set((board || []).map((c) => codeMonth(c.customerCode)).filter(Boolean))).sort().reverse();
  let rows = (board || []).filter((c) => {
    if (q && !(cleanName(c.name).includes(q) || (c.customerCode || "").toLowerCase().includes(q.toLowerCase()))) return false;
    if (month !== "all" && codeMonth(c.customerCode) !== month) return false;
    if (kind === "개명" && c.kind !== "개명") return false;
    if (kind === "상담" && c.kind === "개명") return false;
    return true;
  });
  if (sort === "name") rows = [...rows].sort((a, b) => cleanName(a.name).localeCompare(cleanName(b.name), "ko"));
  else if (sort === "old") rows = [...rows].reverse();

  const selCls = "px-3 py-1 text-sm rounded-full transition";
  return (
    <div className="space-y-3">
      {/* 툴바 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름 · 고객번호" className="pl-9" />
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value as any)} className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm">
          <option value="recent">최신순</option>
          <option value="name">이름순(가나다)</option>
          <option value="old">오래된순</option>
        </select>
        <select value={month} onChange={(e) => setMonth(e.target.value)} className="h-9 rounded-md border border-gray-200 bg-white px-2 text-sm">
          <option value="all">전체 기간</option>
          {months.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
        <Button onClick={() => setNewOpen(true)} className="bg-[#56D5DB] hover:bg-[#3fc4ca] text-white">
          <Plus className="w-4 h-4 mr-1" /> 새 고객
        </Button>
      </div>

      {/* 개명/상담 탭 */}
      <div className="flex items-center gap-1">
        {(["개명", "상담", "all"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`${selCls} ${kind === k ? "bg-[#56D5DB]/15 text-[#2ba0a6] font-medium" : "text-gray-400 hover:text-gray-600"}`}
          >
            {k === "all" ? "전체" : k}
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-400">총 {rows.length}명</span>
        <button
          onClick={() => setShowTrash((v) => !v)}
          className={`${selCls} ml-1 flex items-center gap-1 ${showTrash ? "bg-gray-200 text-gray-700" : "text-gray-400 hover:text-gray-600"}`}
        >
          <Trash2 className="w-3.5 h-3.5" /> 휴지통
        </button>
      </div>

      {/* 휴지통 뷰 */}
      {showTrash ? (
        <div className="space-y-1.5 pt-1">
          {(!trash || trash.length === 0) && <p className="text-sm text-gray-400 py-8 text-center">휴지통이 비어 있습니다.</p>}
          {trash?.map((c) => (
            <div key={c.id} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-100 bg-gray-50/50">
              <span className="text-[11px] text-gray-400 w-20 shrink-0">{c.customerCode}</span>
              <span className="text-sm text-gray-700 flex-1 truncate">{cleanName(c.name)}</span>
              <Button size="sm" variant="outline" onClick={() => restoreMut.mutate(c.id)} disabled={restoreMut.isPending}>
                복원
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-red-500 border-red-200 hover:bg-red-50"
                onClick={() => { if (confirm(`${cleanName(c.name)} 완전 삭제? (복구 불가)`)) purgeMut.mutate(c.id); }}
                disabled={purgeMut.isPending}
              >
                완전삭제
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <>
      {/* 마일스톤 헤더 (데스크톱) — 모바일은 아래 카드 목록 사용 */}
      <div className="hidden sm:grid items-center px-2 pb-2 border-b border-gray-200 text-[11px] text-gray-400" style={GRID}>
        <span>고객</span>
        {MILESTONES.map((m, i) => (
          <span key={m} className="text-center leading-tight">
            {m}
            {i === PHONE_MILESTONE && <span className="block text-[10px] text-gray-300">☎전번</span>}
          </span>
        ))}
      </div>

      {isLoading && <p className="text-sm text-gray-400 py-6 text-center">불러오는 중…</p>}
      {board && rows.length === 0 && <p className="text-sm text-gray-400 py-8 text-center">해당하는 고객이 없습니다.</p>}

      {/* 행 */}
      {rows.map((c) => (
        <div
          key={c.id}
          // 마우스만 올려도 미리 받아둔다 → 클릭하는 순간 이미 도착해 즉시 열림
          onMouseEnter={() => prefetchCustomer(c.id)}
          className="relative group hidden sm:grid items-center px-2 pt-2.5 pb-6 border-b border-gray-100 hover:bg-gray-50/70 transition"
          style={GRID}
        >
          <button
            title="휴지통으로"
            onClick={(e) => { e.stopPropagation(); trashMut.mutate(c.id); }}
            className="absolute right-1 top-1 opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition p-1 z-10"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button className="text-left min-w-0" onClick={() => onOpenCustomer(c.id)}>
            <div className="text-[11px] text-gray-400">{c.customerCode}</div>
            <div className="text-sm font-medium text-gray-900 flex items-center flex-wrap gap-1">
              <span className="truncate">{cleanName(c.name)}</span>
              <span className={`shrink-0 text-[11px] px-1.5 py-0.5 rounded-full ${c.kind === "개명" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                {c.kind || "상담"}
              </span>
              <ProgressChips milestone={c.milestone} seq={seqByCust.get(c.id)} />
            </div>
          </button>
          {MILESTONES.map((_, i) => {
            const last = MILESTONES.length - 1;
            const done = i < c.milestone;
            const cur = i === c.milestone;
            const leftLine = i === 0 ? "transparent" : i <= c.milestone ? TEAL : "#e5e7eb";
            const rightLine = i === last ? "transparent" : i < c.milestone ? TEAL : "#e5e7eb";
            // 모든 단계를 클릭해 체크(진행)하거나 되돌리기(수정)할 수 있다
            const hasProject = !!c.projectId;
            const forward = i > c.milestone;
            const backward = i < c.milestone;
            const clickable = hasProject && (forward || backward);
            const onDot = () => {
              if (!hasProject) return onOpenCustomer(c.id);
              if (forward) return advance.mutate({ projectId: c.projectId!, toStatus: MILESTONE_ENTRY[i], toMilestone: i });
              if (backward) {
                if (window.confirm(`${cleanName(c.name)} 님을 '${MILESTONES[i]}' 단계로 되돌릴까요?`)) {
                  advance.mutate({ projectId: c.projectId!, toStatus: MILESTONE_ENTRY[i], force: true, toMilestone: i });
                }
                return;
              }
              onOpenCustomer(c.id); // 현재 단계를 누르면 고객 상세로
            };
            return (
              <div
                key={i}
                role="button"
                title={
                  forward
                    ? `${MILESTONES[i]} 단계로 진행`
                    : backward
                      ? `${MILESTONES[i]} 단계로 되돌리기(수정)`
                      : "현재 단계 · 클릭하면 고객 상세"
                }
                onClick={onDot}
                className="relative h-7 flex items-center justify-center group"
                style={{ cursor: clickable ? "pointer" : "default" }}
              >
                <div className="absolute left-0" style={{ width: "50%", height: 2, background: leftLine }} />
                <div className="absolute right-0" style={{ width: "50%", height: 2, background: rightLine }} />
                {i === APPROVED_MILESTONE ? (
                  // 개명승인 = 점 대신 마스코트. 도달 전엔 흐리게(회색), 도달하면 컬러.
                  <img
                    src="/mascot.png"
                    alt="개명승인"
                    className="relative"
                    style={{
                      width: 26,
                      height: 26,
                      objectFit: "contain",
                      filter: done || cur ? "none" : "grayscale(1)",
                      opacity: done || cur ? 1 : 0.3,
                    }}
                  />
                ) : (
                  <div
                    className="relative rounded-full"
                    style={{
                      width: 13,
                      height: 13,
                      // 채워짐 = 그 단계까지 완료(현재 단계 포함), 링 = 지금 위치.
                      // 법원접수 단계는 노란색 랜드마크(어디쯤인지 스크롤 중 빨리 파악)
                      background: done || cur ? (i === AMBER_MILESTONE ? AMBER : TEAL) : "#fff",
                      border: done || cur ? `2px solid ${i === AMBER_MILESTONE ? AMBER : TEAL}` : "1.5px solid #cbd5d5",
                      boxShadow: cur ? (i === AMBER_MILESTONE ? "0 0 0 4px #FEF3C7" : "0 0 0 4px #E1F5EE") : "none",
                    }}
                  />
                )}
                {clickable && (
                  <span
                    className={`absolute -bottom-1 opacity-0 group-hover:opacity-100 text-[9px] ${
                      forward ? "text-[#2ba0a6]" : "text-gray-400"
                    }`}
                  >
                    {forward ? "＋" : "↺"}
                  </span>
                )}
                {/* 새이름 점 아래에 전번 체크박스: 절대위치라 점은 다른 것과 같은 선 유지 */}
                {i === PHONE_MILESTONE && (
                  <button
                    title={c.phoneNaming ? "전화번호 작명함 (클릭 해제)" : "전화번호 작명 체크"}
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePhone.mutate({ id: c.id, on: !c.phoneNaming });
                    }}
                    className={`absolute left-1/2 -translate-x-1/2 top-full mt-1 whitespace-nowrap flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full transition ${
                      c.phoneNaming ? "bg-[#56D5DB]/20 text-[#2ba0a6]" : "text-gray-300 hover:text-gray-500 hover:bg-gray-100"
                    }`}
                  >
                    ☎전번
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {/* 모바일 전용 카드 목록: 6열 고정 보드는 폰에서 뭉개지므로 세로 카드로 */}
      <div className="sm:hidden divide-y divide-gray-100">
        {rows.map((c) => {
          return (
            <div key={c.id} className="py-3" onTouchStart={() => prefetchCustomer(c.id)}>
              <div className="flex items-center gap-3">
                <button className="flex-1 min-w-0 text-left" onClick={() => onOpenCustomer(c.id)}>
                  <div className="flex items-center flex-wrap gap-1">
                    <span className="text-sm font-medium text-gray-900 truncate">{cleanName(c.name)}</span>
                    <span
                      className={`shrink-0 text-[11px] px-1.5 py-0.5 rounded-full ${
                        c.kind === "개명" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {c.kind || "상담"}
                    </span>
                    <ProgressChips milestone={c.milestone} seq={seqByCust.get(c.id)} />
                  </div>
                  <div className="mt-0.5">
                    <span className="text-[11px] text-gray-400 tabular-nums">{c.customerCode}</span>
                  </div>
                </button>
                <button
                  title="휴지통으로"
                  onClick={(e) => {
                    e.stopPropagation();
                    trashMut.mutate(c.id);
                  }}
                  className="shrink-0 text-gray-300 hover:text-red-500 p-2"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              {/* 단계: 칸마다 이름 표시 + 눌러서 진행/되돌리기 */}
              <div className="mt-2 grid grid-cols-6 gap-1">
                {MILESTONES.map((m, i) => {
                  const done = i < c.milestone;
                  const cur = i === c.milestone;
                  const hasProject = !!c.projectId;
                  const onTap = () => {
                    if (!hasProject) return onOpenCustomer(c.id);
                    if (i > c.milestone) return advance.mutate({ projectId: c.projectId!, toStatus: MILESTONE_ENTRY[i], toMilestone: i });
                    if (i < c.milestone) {
                      if (window.confirm(`${cleanName(c.name)} 님을 '${m}' 단계로 되돌릴까요?`)) {
                        advance.mutate({ projectId: c.projectId!, toStatus: MILESTONE_ENTRY[i], force: true, toMilestone: i });
                      }
                      return;
                    }
                    onOpenCustomer(c.id);
                  };
                  return (
                    <button key={i} type="button" onClick={onTap} className="flex flex-col items-center gap-1 py-0.5">
                      <span
                        className="w-full h-1.5 rounded-full"
                        style={{ background: done || cur ? (i === AMBER_MILESTONE ? AMBER : TEAL) : "#e5e7eb" }}
                      />
                      <span
                        className={`text-[9px] leading-tight text-center ${
                          i === AMBER_MILESTONE && (cur || done)
                            ? "text-[#B45309] font-semibold"
                            : cur
                              ? "text-[#1D9E75] font-semibold"
                              : done
                                ? "text-gray-500"
                                : "text-gray-300"
                        }`}
                      >
                        {m}
                      </span>
                      {i === PHONE_MILESTONE && (
                        <span
                          role="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            togglePhone.mutate({ id: c.id, on: !c.phoneNaming });
                          }}
                          className={`text-[9px] leading-none px-1 py-0.5 rounded-full ${
                            c.phoneNaming ? "bg-[#56D5DB]/20 text-[#2ba0a6]" : "text-gray-300"
                          }`}
                        >
                          ☎전번
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
        </>
      )}

      <NewCustomerDialog open={newOpen} onOpenChange={setNewOpen} onCreated={(c) => onOpenCustomer(c.id)} />
    </div>
  );
}

// ── 달력: 실제 운영 "바른이름 달력"을 관리자 페이지가 직접 그린다 ──
// 이전에는 달력 앱을 iframe 으로 끼웠는데, 크롬의 3rd-party 저장소 분리 때문에 iframe 안에서는
// 구글 로그인이 유지되지 않아 로그인 배너만 반복되고 일정 수정이 아예 불가능했다.
// → 서버(서비스계정)로 같은 Firestore events 배열을 직접 읽고 쓴다. 휴대폰 달력과 즉시 공유된다.
function CalendarView({ onOpenCustomer }: { onOpenCustomer: (id: string) => void }) {
  // 설명문·"달력 앱 열기" 버튼은 뺐다 — 달력이 화면을 다 쓰는 게 낫다.
  return <FbCalendarView onOpenCustomer={onOpenCustomer} />;
}
