// 이름분석표 확인 대기 — 동명이인 확인 / 내용 갱신 대체·무시·수동지정
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { knopApi, type PendingReport } from "@/lib/knopApi";
import type { Customer } from "@shared/schema";
import { RefreshCw, FileText, Users, ArrowLeftRight } from "lucide-react";

function Preview({ url, label }: { url: string | null; label: string }) {
  if (!url) return <div className="text-xs text-gray-400 border border-dashed rounded-lg p-4 text-center">{label}: 미리보기 없음</div>;
  return (
    <div className="space-y-1">
      <p className="text-[11px] text-gray-400">{label}</p>
      <a href={url} target="_blank" rel="noopener noreferrer">
        <img src={url} alt={label} className="w-full max-h-64 object-contain border border-gray-200 rounded-lg bg-white hover:border-[#56D5DB]" />
      </a>
    </div>
  );
}

function CustomerAssign({ onAssign }: { onAssign: (customerId: string) => void }) {
  const [q, setQ] = useState("");
  const { data } = useQuery<Customer[]>({
    queryKey: ["kop-cust-search", q],
    queryFn: () => knopApi.listCustomers(q),
    enabled: q.trim().length >= 1,
  });
  return (
    <div className="space-y-1.5">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="다른 고객 검색(이름·번호)" className="h-8 text-sm" />
      {q && (data?.length ?? 0) > 0 && (
        <div className="max-h-32 overflow-y-auto border border-gray-100 rounded-lg divide-y">
          {data!.slice(0, 6).map((c) => (
            <button key={c.id} onClick={() => onAssign(c.id)}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-[#56D5DB]/10 flex justify-between">
              <span>{c.name}</span><span className="text-xs text-gray-400">{c.phone}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function ReportReviewView() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: items, isLoading } = useQuery<PendingReport[]>({
    queryKey: ["kop-reports-pending"],
    queryFn: () => knopApi.listPendingReports(),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["kop-reports-pending"] });
  const run = (p: Promise<any>, ok: string) =>
    p.then(() => { refresh(); toast({ title: ok }); }).catch((e: any) => toast({ title: "실패", description: e?.message, variant: "destructive" }));

  const assign = useMutation({ mutationFn: (v: { id: string; customerId: string }) => knopApi.assignReport(v.id, v.customerId) });
  const replace = useMutation({ mutationFn: (id: string) => knopApi.replaceReport(id) });
  const ignore = useMutation({ mutationFn: (id: string) => knopApi.ignoreReport(id) });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">이름분석표 확인 대기</h2>
          <p className="text-sm text-gray-400">동명이인이라 자동 연결하지 못했거나, 같은 이름의 새 분석표가 올라온 건입니다.</p>
        </div>
        <button onClick={refresh} className="text-xs px-2 py-1 rounded border border-gray-200 hover:border-[#56D5DB] flex items-center gap-1">
          <RefreshCw className="w-3.5 h-3.5" /> 새로고침
        </button>
      </div>

      {isLoading && <p className="text-sm text-gray-400">불러오는 중…</p>}
      {items && items.length === 0 && (
        <Card className="p-10 text-center text-gray-400">
          <FileText className="w-9 h-9 mx-auto mb-2 opacity-40" /> 확인할 이름분석표가 없습니다.
        </Card>
      )}

      {items?.map((it) => (
        <Card key={it.id} className="p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={it.kind === "update" ? "bg-amber-100 text-amber-700 border-amber-200" : "bg-sky-100 text-sky-700 border-sky-200"}>
              {it.kind === "update" ? "내용 갱신" : "동명이인 확인"}
            </Badge>
            <span className="font-semibold text-gray-800">{it.fileName}</span>
            {it.status !== "needs_review" && <Badge variant="outline" className="text-red-500 border-red-200">{it.status}</Badge>}
          </div>
          {it.matchReason && <p className="text-xs text-gray-500">{it.matchReason}</p>}

          {/* 미리보기 */}
          <div className={`grid gap-3 ${it.kind === "update" ? "grid-cols-2" : "grid-cols-1 max-w-sm"}`}>
            {it.kind === "update" && <Preview url={it.previous?.renderedUrl ?? null} label={`기존${it.previous?.customerName ? ` · ${it.previous.customerName}` : ""}`} />}
            <Preview url={it.renderedUrl} label={it.kind === "update" ? "새 분석표" : "분석표"} />
          </div>

          {/* 액션 */}
          {it.kind === "update" ? (
            <div className="flex items-center gap-2">
              <Button size="sm" className="bg-[#56D5DB] hover:bg-[#3fc4ca] text-white"
                onClick={() => run(replace.mutateAsync(it.id), "새 분석표로 대체했습니다")}>
                <ArrowLeftRight className="w-3.5 h-3.5 mr-1" /> 새것으로 대체
              </Button>
              <Button size="sm" variant="outline" onClick={() => run(ignore.mutateAsync(it.id), "기존 유지(무시)")}>기존 유지(무시)</Button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-gray-500 flex items-center gap-1"><Users className="w-3.5 h-3.5" /> 어느 고객의 분석표인가요?</p>
              <div className="space-y-1.5">
                {it.candidates.length === 0 && <p className="text-xs text-gray-400">일치하는 고객이 없습니다. 아래에서 고객을 검색해 지정하거나 무시하세요.</p>}
                {it.candidates.map((c) => (
                  <div key={c.customerId} className="flex items-center justify-between gap-2 border border-gray-100 rounded-lg px-3 py-1.5">
                    <div className="min-w-0">
                      <span className="font-medium text-sm">{c.customerName}</span>
                      <span className="ml-2 text-xs text-gray-400">{c.score}점 {c.passedGate ? "" : "· 기간밖"} {c.autoEligible ? "" : "· 신청일 미확인"}</span>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => run(assign.mutateAsync({ id: it.id, customerId: c.customerId }), `${c.customerName}에게 연결했습니다`)}>이 고객에게 연결</Button>
                  </div>
                ))}
              </div>
              <CustomerAssign onAssign={(cid) => run(assign.mutateAsync({ id: it.id, customerId: cid }), "지정한 고객에게 연결했습니다")} />
              <Button size="sm" variant="ghost" className="text-gray-400" onClick={() => run(ignore.mutateAsync(it.id), "무시했습니다")}>무시</Button>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}
