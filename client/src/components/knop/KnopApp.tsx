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
  Sun,
  Search,
  Plus,
  Phone,
  ExternalLink,
  Wallet,
  SpellCheck,
  MessageSquare,
  Inbox,
  Trash2,
  Sparkles,
} from "lucide-react";
import { knopApi } from "@/lib/knopApi";
import { useToast } from "@/hooks/use-toast";
import { useAdmin } from "@/contexts/AdminContext";
import type { Customer } from "@shared/schema";
import { CustomerDetailView } from "./CustomerDetail";
import { InboxView } from "./InboxView";
import { CorrectionsView } from "./CorrectionsView";
import { NoticeView } from "./NoticeView";
import { VoiceAssistant } from "./VoiceAssistant";
import { SmsView } from "./SmsView";
import { SmsInboxView } from "./SmsInboxView";
import { NewCustomerDialog } from "./dialogs";
import { StatusBadge, fmtDate, fmtTime } from "./lib";

// 실제 운영 달력 "바른이름 달력" (Firebase 호스팅, 실시간 동기화)
const CALENDAR_URL = "https://calendar-zeus1000.web.app";

type View = "today" | "customers" | "inbox" | "sms-inbox" | "sms" | "notice" | "calendar" | "corrections";

export function KnopApp() {
  const { isAdmin, isVerifying } = useAdmin();
  const [view, setView] = useState<View>("today");
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);

  if (!isVerifying && !isAdmin) {
    return (
      <Card className="p-12 text-center text-gray-500">
        관리자 로그인이 필요합니다. 우측 상단 메뉴에서 로그인해 주세요.
      </Card>
    );
  }

  const tabs: { key: View; label: string; icon: typeof Sun }[] = [
    { key: "today", label: "오늘", icon: Sun },
    { key: "customers", label: "고객", icon: Users },
    { key: "inbox", label: "입금", icon: Wallet },
    { key: "sms-inbox", label: "문자수신", icon: Inbox },
    { key: "sms", label: "문자", icon: MessageSquare },
    { key: "notice", label: "개명안내", icon: Sparkles },
    { key: "calendar", label: "달력", icon: CalendarDays },
    { key: "corrections", label: "교정사전", icon: SpellCheck },
  ];

  return (
    <>
      <VoiceAssistant
        onOpenCustomer={setSelectedCustomer}
        onNavigate={(v) => {
          setSelectedCustomer(null);
          setView(v as View);
        }}
      />
      {selectedCustomer ? (
        <CustomerDetailView customerId={selectedCustomer} onBack={() => setSelectedCustomer(null)} />
      ) : (
        <div className="space-y-6">
          <div className="flex items-center gap-1 border-b border-gray-200">
            {tabs.map((t) => {
          const Icon = t.icon;
          const active = view === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setView(t.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition ${
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

      {view === "today" && <TodayView onOpenCustomer={setSelectedCustomer} />}
      {view === "customers" && <CustomersView onOpenCustomer={setSelectedCustomer} />}
      {view === "inbox" && <InboxView onOpenCustomer={setSelectedCustomer} />}
      {view === "sms-inbox" && <SmsInboxView />}
      {view === "sms" && <SmsView />}
      {view === "notice" && <NoticeView />}
          {view === "calendar" && <CalendarView onOpenCustomer={setSelectedCustomer} />}
          {view === "corrections" && <CorrectionsView />}
        </div>
      )}
    </>
  );
}

// ── 오늘 해야 할 일 ──
function TodayView({ onOpenCustomer }: { onOpenCustomer: (id: string) => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["knop-today"],
    queryFn: () => knopApi.today(),
  });

  const today = new Date();
  const dateLabel = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, "0")}.${String(
    today.getDate(),
  ).padStart(2, "0")}`;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900">오늘 · {dateLabel}</h2>
        <p className="text-sm text-gray-400">오늘 처리할 상담 · 일정 · 후속관리</p>
      </div>

      {isLoading && <p className="text-sm text-gray-400">불러오는 중…</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Card className="p-5">
          <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-[#56D5DB]" /> 오늘 일정 ({data?.events.length ?? 0})
          </h3>
          <div className="space-y-2">
            {data && data.events.length === 0 && <p className="text-sm text-gray-400">오늘 일정이 없습니다.</p>}
            {data?.events.map((ev) => (
              <button
                key={ev.id}
                onClick={() => ev.customerId && onOpenCustomer(ev.customerId)}
                className="w-full text-left flex items-center gap-3 rounded-lg border border-gray-100 px-3 py-2 hover:border-[#56D5DB]/50 hover:bg-[#56D5DB]/5 transition"
              >
                <span className="text-sm font-semibold text-gray-700 tabular-nums w-12">
                  {fmtTime(ev.startAt)}
                </span>
                <Badge variant="outline" className="shrink-0">
                  {ev.type}
                </Badge>
                <span className="text-sm text-gray-800 truncate">{ev.title}</span>
              </button>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <Phone className="w-4 h-4 text-amber-400" /> 오늘 후속관리 ({data?.actionProjects.length ?? 0})
          </h3>
          <div className="space-y-2">
            {data && data.actionProjects.length === 0 && (
              <p className="text-sm text-gray-400">예정된 후속관리가 없습니다.</p>
            )}
            {data?.actionProjects.map((p) => (
              <button
                key={p.id}
                onClick={() => onOpenCustomer(p.customerId)}
                className="w-full text-left flex items-center justify-between gap-2 rounded-lg border border-gray-100 px-3 py-2 hover:border-[#56D5DB]/50 hover:bg-[#56D5DB]/5 transition"
              >
                <div className="min-w-0">
                  <div className="text-xs text-gray-400">{p.type}</div>
                  <div className="text-sm text-gray-800 truncate">{p.title}</div>
                </div>
                <StatusBadge status={p.status} />
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ── 고객 파이프라인 보드 ──
const MILESTONES = ["상담", "새이름", "개명신청", "법적개명", "중간관리"];
const MILESTONE_ENTRY = ["이름분석 상담 완료", "새 이름 상담 완료", "개명 신청 완료", "법원 허가 완료", "장기관리"];
const TEAL = "#1D9E75";
const GRID = { gridTemplateColumns: "160px repeat(5, 1fr)" } as const;
function codeMonth(code: string | null): string {
  const m = (code || "").match(/K(\d{2})-(\d{2})/);
  return m ? `${m[1]}.${m[2]}` : "";
}
function cleanName(n: string): string {
  return (n || "").replace(/[.\s]+$/, "");
}

function CustomersView({ onOpenCustomer }: { onOpenCustomer: (id: string) => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"recent" | "name" | "old">("recent");
  const [month, setMonth] = useState("all");
  const [kind, setKind] = useState<"all" | "개명" | "상담">("all");
  const [newOpen, setNewOpen] = useState(false);

  const { data: board, isLoading } = useQuery({ queryKey: ["knop-board"], queryFn: () => knopApi.customerBoard() });
  const advance = useMutation({
    mutationFn: ({ projectId, toStatus }: { projectId: string; toStatus: string }) =>
      knopApi.advanceStatus(projectId, toStatus),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["knop-board"] }),
    onError: (e: Error) => toast({ title: "진행 불가", description: e.message, variant: "destructive" }),
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
        {(["all", "개명", "상담"] as const).map((k) => (
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
      {/* 마일스톤 헤더 */}
      <div className="grid items-center px-2 pb-2 border-b border-gray-200 text-[11px] text-gray-400" style={GRID}>
        <span>고객</span>
        {MILESTONES.map((m, i) => (
          <span key={m} className="text-center leading-tight">
            {m}
            {i === 1 && <span className="block text-[10px] text-gray-300">☎전번(선택)</span>}
          </span>
        ))}
      </div>

      {isLoading && <p className="text-sm text-gray-400 py-6 text-center">불러오는 중…</p>}
      {board && rows.length === 0 && <p className="text-sm text-gray-400 py-8 text-center">해당하는 고객이 없습니다.</p>}

      {/* 행 */}
      {rows.map((c) => (
        <div key={c.id} className="relative group grid items-center px-2 pt-2.5 pb-6 border-b border-gray-100 hover:bg-gray-50/70 transition" style={GRID}>
          <button
            title="휴지통으로"
            onClick={(e) => { e.stopPropagation(); trashMut.mutate(c.id); }}
            className="absolute right-1 top-1 opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition p-1 z-10"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button className="text-left min-w-0" onClick={() => onOpenCustomer(c.id)}>
            <div className="text-[11px] text-gray-400">{c.customerCode}</div>
            <div className="text-sm font-medium text-gray-900 truncate flex items-center gap-1.5">
              {cleanName(c.name)}
              <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${c.kind === "개명" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                {c.kind || "상담"}
              </span>
            </div>
          </button>
          {MILESTONES.map((_, i) => {
            const last = MILESTONES.length - 1;
            const done = i < c.milestone;
            const cur = i === c.milestone;
            const leftLine = i === 0 ? "transparent" : i <= c.milestone ? TEAL : "#e5e7eb";
            const rightLine = i === last ? "transparent" : i < c.milestone ? TEAL : "#e5e7eb";
            const clickable = !!c.projectId && i > c.milestone;
            return (
              <div
                key={i}
                role="button"
                title={clickable ? `${MILESTONES[i]} 단계로 진행` : ""}
                onClick={() => (clickable ? advance.mutate({ projectId: c.projectId!, toStatus: MILESTONE_ENTRY[i] }) : onOpenCustomer(c.id))}
                className="relative h-7 flex items-center justify-center group"
                style={{ cursor: clickable ? "pointer" : "default" }}
              >
                <div className="absolute left-0" style={{ width: "50%", height: 2, background: leftLine }} />
                <div className="absolute right-0" style={{ width: "50%", height: 2, background: rightLine }} />
                <div
                  className="relative rounded-full"
                  style={{
                    width: 13,
                    height: 13,
                    background: done ? TEAL : "#fff",
                    border: done ? `2px solid ${TEAL}` : cur ? `2px solid ${TEAL}` : "1.5px solid #cbd5d5",
                    boxShadow: cur ? "0 0 0 4px #E1F5EE" : "none",
                  }}
                />
                {clickable && <span className="absolute -bottom-1 opacity-0 group-hover:opacity-100 text-[9px] text-[#2ba0a6]">＋</span>}
                {/* 새이름 점 아래에 전번 체크박스: 절대위치라 점은 다른 것과 같은 선 유지 */}
                {i === 1 && (
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
                    ☎ {c.phoneNaming ? "완료" : "전번"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ))}
        </>
      )}

      <NewCustomerDialog open={newOpen} onOpenChange={setNewOpen} onCreated={(c) => onOpenCustomer(c.id)} />
    </div>
  );
}

// ── 달력: 실제 운영 "바른이름 달력" 임베드 (Firebase 실시간 동기화) ──
function CalendarView({ onOpenCustomer }: { onOpenCustomer: (id: string) => void }) {
  const { toast } = useToast();

  // 달력 앱(iframe)에서 일정 클릭 시 보내는 신호 수신 → 고객 매칭 → 이동
  useEffect(() => {
    const onMsg = async (ev: MessageEvent) => {
      const d = ev.data;
      if (!d || d.source !== "baruncal" || d.type !== "open-customer") return;
      try {
        const { customerId } = await knopApi.resolveCustomer(d.phone || "", d.name || d.title || "");
        if (customerId) onOpenCustomer(customerId);
        else toast({ title: "연결된 고객이 없습니다", description: d.name || d.title || d.phone || "" });
      } catch {
        toast({ title: "고객 이동 실패", variant: "destructive" });
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [onOpenCustomer, toast]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">바른이름 달력</h2>
          <p className="text-sm text-gray-400">일정을 열어 "고객 보기"를 누르면 해당 고객 자료로 이동합니다</p>
        </div>
        <a href={CALENDAR_URL} target="_blank" rel="noreferrer">
          <Button variant="outline" size="sm">
            <ExternalLink className="w-4 h-4 mr-1" /> 새 창에서 열기
          </Button>
        </a>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="mx-auto w-full max-w-[460px]">
          <iframe
            src={CALENDAR_URL}
            title="바른이름 달력"
            className="block w-full border-0"
            style={{ height: "calc(100vh - 210px)", minHeight: 560 }}
            allow="clipboard-read; clipboard-write"
          />
        </div>
      </Card>
    </div>
  );
}
