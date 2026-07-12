// KNOP 입금관리 — 결제 문자 AI 분석·매칭·승인 (설계서 §4·16)
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Check, X, MessageSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { knopApi, type AiInbox, type ParsedPayment, type InboxSuggestion } from "@/lib/knopApi";
import { fmtDateTime } from "./lib";

function parseJson<T>(s: string | null, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

function confidenceBadge(c: number) {
  if (c >= 85) return { label: `확신 ${c}%`, cls: "bg-green-100 text-green-700 border-green-200" };
  if (c >= 50) return { label: `가능 ${c}%`, cls: "bg-amber-100 text-amber-700 border-amber-200" };
  return { label: `불확실 ${c}%`, cls: "bg-gray-100 text-gray-500 border-gray-200" };
}

export function InboxView({ onOpenCustomer }: { onOpenCustomer: (id: string) => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [raw, setRaw] = useState("");

  const { data: items, isLoading } = useQuery<AiInbox[]>({
    queryKey: ["knop-inbox"],
    queryFn: () => knopApi.listInbox("pending"),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["knop-inbox"] });
    qc.invalidateQueries({ queryKey: ["knop-today"] });
  };

  const submitMut = useMutation({
    mutationFn: () => knopApi.submitInbox(raw.trim()),
    onSuccess: () => {
      setRaw("");
      refresh();
      toast({ title: "AI가 분석했습니다.", description: "아래 추천을 확인하고 승인하세요." });
    },
    onError: (e: any) => toast({ title: "분석 실패", description: e?.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900">입금 관리</h2>
        <p className="text-sm text-gray-400">
          결제 문자를 AI가 분석 → 고객·프로젝트 매칭 → 관리자 승인 시 결제완료 처리
        </p>
      </div>

      {/* 테스트/수동 등록 (폰 연동 전까지) */}
      <Card className="p-4">
        <div className="mb-2 text-sm font-medium text-gray-600 flex items-center gap-1.5">
          <MessageSquare className="w-4 h-4 text-gray-400" /> 결제 문자 붙여넣기 (폰 자동연동 전 테스트용)
        </div>
        <Textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={3}
          placeholder={"예) [Web발신] KB국민 07/10 15:30 입금 180,000원 홍길동 잔액 1,230,000원"}
        />
        <div className="mt-2 flex justify-end">
          <Button
            onClick={() => submitMut.mutate()}
            disabled={!raw.trim() || submitMut.isPending}
            className="bg-[#56D5DB] hover:bg-[#3fc4ca] text-white"
          >
            <Sparkles className="w-4 h-4 mr-1" /> {submitMut.isPending ? "분석 중…" : "AI 분석"}
          </Button>
        </div>
      </Card>

      {/* 대기 목록 */}
      {isLoading && <p className="text-sm text-gray-400">불러오는 중…</p>}
      {items && items.length === 0 && (
        <p className="text-sm text-gray-400 py-6 text-center">대기 중인 결제 문자가 없습니다.</p>
      )}
      <div className="space-y-3">
        {items?.map((item) => (
          <InboxCard key={item.id} item={item} onDone={refresh} onOpenCustomer={onOpenCustomer} />
        ))}
      </div>
    </div>
  );
}

function InboxCard({
  item,
  onDone,
  onOpenCustomer,
}: {
  item: AiInbox;
  onDone: () => void;
  onOpenCustomer: (id: string) => void;
}) {
  const { toast } = useToast();
  const parsed = parseJson<ParsedPayment | null>(item.parsed, null);
  const suggestions = parseJson<InboxSuggestion[]>(item.suggestions, []);
  const cb = confidenceBadge(item.confidence);

  // 기본 선택: 첫 추천(프로젝트 있는 것 우선)
  const firstWithProject = suggestions.find((s) => s.projectId) || suggestions[0] || null;
  const [selected, setSelected] = useState<InboxSuggestion | null>(firstWithProject);
  const [label, setLabel] = useState<string>("상담비");

  const approveMut = useMutation({
    mutationFn: () => {
      if (!selected?.projectId) throw new Error("프로젝트가 있는 후보를 선택하세요.");
      return knopApi.approveInbox(item.id, selected.customerId, selected.projectId, label);
    },
    onSuccess: () => {
      toast({ title: "결제완료 처리되었습니다." });
      onDone();
    },
    onError: (e: any) => toast({ title: "승인 실패", description: e?.message, variant: "destructive" }),
  });

  const dismissMut = useMutation({
    mutationFn: () => knopApi.dismissInbox(item.id),
    onSuccess: () => {
      toast({ title: "무시 처리됨" });
      onDone();
    },
  });

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {parsed && (
            <>
              <Badge variant="outline" className="bg-sky-50 text-sky-700 border-sky-200">
                {parsed.kind}
              </Badge>
              {parsed.amount > 0 && (
                <span className="font-bold text-gray-900">{parsed.amount.toLocaleString()}원</span>
              )}
              {parsed.depositorName && <span className="text-gray-700">· {parsed.depositorName}</span>}
              {parsed.institution && <span className="text-xs text-gray-400">· {parsed.institution}</span>}
            </>
          )}
        </div>
        <Badge variant="outline" className={cb.cls}>
          {cb.label}
        </Badge>
      </div>

      {/* 원문 */}
      <div className="mt-2 rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-500 whitespace-pre-wrap">
        {item.rawText}
        <span className="ml-2 text-gray-300">· {fmtDateTime(item.createdAt)}</span>
      </div>

      {/* 매칭 후보 */}
      <div className="mt-3">
        <div className="text-xs font-medium text-gray-500 mb-1.5">AI 매칭 후보</div>
        {suggestions.length === 0 ? (
          <p className="text-sm text-gray-400">
            일치하는 고객이 없습니다. (입금자명: {parsed?.depositorName || "미상"}) — 고객을 먼저 등록/전환하세요.
          </p>
        ) : (
          <div className="space-y-1.5">
            {suggestions.map((s, i) => {
              const isSel = selected === s || (selected?.customerId === s.customerId && selected?.projectId === s.projectId);
              return (
                <button
                  key={i}
                  onClick={() => setSelected(s)}
                  className={`w-full flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition ${
                    isSel ? "border-[#56D5DB] bg-[#56D5DB]/5" : "border-gray-100 hover:border-gray-200"
                  }`}
                >
                  <div className="min-w-0">
                    <span className="font-medium text-gray-900">{s.customerName}</span>
                    {s.projectTitle ? (
                      <span className="text-sm text-gray-500"> · {s.projectTitle}</span>
                    ) : (
                      <span className="text-sm text-orange-500"> · 프로젝트 없음</span>
                    )}
                  </div>
                  <Badge variant="outline" className="shrink-0 text-gray-400">
                    {s.score}
                  </Badge>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* 승인 액션 */}
      <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400">결제 종류</span>
          {["상담비", "개명비"].map((l) => (
            <button
              key={l}
              onClick={() => setLabel(l)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium border transition ${
                label === l ? "border-[#56D5DB] bg-[#56D5DB]/10 text-gray-800" : "border-gray-200 text-gray-500"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {selected?.customerId && (
            <Button variant="ghost" size="sm" onClick={() => onOpenCustomer(selected.customerId)}>
              고객 열기
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => dismissMut.mutate()} disabled={dismissMut.isPending}>
            <X className="w-4 h-4 mr-1" /> 무시
          </Button>
          <Button
            size="sm"
            onClick={() => approveMut.mutate()}
            disabled={!selected?.projectId || approveMut.isPending}
            className="bg-[#56D5DB] hover:bg-[#3fc4ca] text-white"
          >
            <Check className="w-4 h-4 mr-1" /> 승인 · 결제완료
          </Button>
        </div>
      </div>
    </Card>
  );
}
