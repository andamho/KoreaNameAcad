// 공유 학습 교정사전 관리 (KNOP ↔ 영상편집 봇 공용)
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Trash2, Plus, ArrowRight, BarChart3, List, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { knopApi, type CorrectionRule, type CorrectionAnalysis } from "@/lib/knopApi";

export function CorrectionsView() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [wrong, setWrong] = useState("");
  const [right, setRight] = useState("");
  const [tab, setTab] = useState<"analysis" | "list">("analysis");

  const { data: rules, isLoading } = useQuery<CorrectionRule[]>({
    queryKey: ["knop-corrections"],
    queryFn: () => knopApi.listCorrections(),
  });
  const { data: analysis } = useQuery<CorrectionAnalysis>({
    queryKey: ["knop-corrections-analysis"],
    queryFn: () => knopApi.analyzeCorrections(),
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["knop-corrections"] });
    qc.invalidateQueries({ queryKey: ["knop-corrections-analysis"] });
  };

  const addMut = useMutation({
    mutationFn: () => knopApi.addCorrection(wrong.trim(), right.trim()),
    onSuccess: () => {
      setWrong("");
      setRight("");
      refresh();
      toast({ title: "교정 규칙 추가됨" });
    },
    onError: () => toast({ title: "추가 실패", variant: "destructive" }),
  });
  const toggleMut = useMutation({
    mutationFn: ({ w, e }: { w: string; e: boolean }) => knopApi.toggleCorrection(w, e),
    onSuccess: (_d, v) => {
      refresh();
      toast({ title: v.e ? "직접 승인 → 적용중" : "차단됨", description: v.e ? "재검증을 해도 유지됩니다." : undefined });
    },
    // 보호어·발음불일치 같은 안전규칙 위반은 서버가 거부한다
    onError: (e: any) => {
      refresh(); // 스위치를 원래 상태로 되돌림
      toast({ title: "켤 수 없는 규칙입니다", description: e?.message, variant: "destructive" });
    },
  });
  const delMut = useMutation({
    mutationFn: (id: string) => knopApi.deleteCorrection(id),
    onSuccess: () => {
      refresh();
      toast({ title: "삭제됨" });
    },
  });
  const revalidateMut = useMutation({
    mutationFn: () => knopApi.revalidateCorrections(),
    onSuccess: (r) => {
      refresh();
      toast({
        title: `재검증 완료 · 적용중 ${r.active}개`,
        description: r.demoted.length ? `${r.demoted.length}개를 후보로 내렸습니다(삭제 아님)` : "변경 없음",
      });
    },
    onError: (e: any) => toast({ title: "재검증 실패", description: e?.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-gray-900">교정 사전</h2>
        <p className="text-sm text-gray-400">
          전사문을 수정하면 오타가 자동 학습됩니다. 이 사전은 <b>영상편집 봇과 공유</b>되어 양쪽 전사에 함께 적용됩니다.
        </p>
      </div>

      {/* 탭 */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        {([
          { k: "analysis", label: "분석", icon: BarChart3 },
          { k: "list", label: "규칙 목록", icon: List },
        ] as const).map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
                tab === t.k ? "border-[#56D5DB] text-gray-900" : "border-transparent text-gray-400 hover:text-gray-600"
              }`}
            >
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {/* ── 분석 ── */}
      {tab === "analysis" && analysis && (
        <div className="space-y-5">
          <div className="flex gap-3">
            <Card className="p-4 flex-1 text-center">
              <div className="text-2xl font-bold text-gray-900">{analysis.totalRules}</div>
              <div className="text-xs text-gray-400">학습된 교정 규칙</div>
            </Card>
            <Card className="p-4 flex-1 text-center">
              <div className="text-2xl font-bold text-gray-900">{analysis.totalHits}</div>
              <div className="text-xs text-gray-400">총 교정 발생</div>
            </Card>
            <Card className="p-4 flex-1 text-center">
              <div className="text-2xl font-bold text-[#3fc4ca]">
                {analysis.targets.filter((t) => t.variants.length >= 2).length}
              </div>
              <div className="text-xs text-gray-400">여러 방식 오인식 용어</div>
            </Card>
          </div>

          {/* 우선순위 용어 */}
          <Card className="p-5">
            <div className="font-semibold text-gray-800 mb-1 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-500" /> 우선순위 용어 (자주·여러 방식으로 틀리는 정답)
            </div>
            <p className="text-xs text-gray-400 mb-3">같은 정답으로 수렴하는 오타가 많을수록 문제 용어입니다.</p>
            <div className="space-y-2">
              {analysis.targets.length === 0 && <p className="text-sm text-gray-400">데이터가 쌓이면 표시됩니다.</p>}
              {analysis.targets.slice(0, 12).map((t) => (
                <div key={t.right} className="flex items-center gap-3">
                  <span className="font-bold text-gray-900 w-24 shrink-0 truncate">{t.right}</span>
                  <Badge
                    variant="outline"
                    className={
                      t.variants.length >= 2
                        ? "bg-amber-50 text-amber-700 border-amber-200 shrink-0"
                        : "text-gray-400 shrink-0"
                    }
                  >
                    {t.variants.length}가지 · {t.total}회
                  </Badge>
                  <span className="text-sm text-gray-500 truncate">
                    ← {t.variants.map((v) => v.wrong).join(", ")}
                  </span>
                </div>
              ))}
            </div>
          </Card>

          {/* 글자 혼동 패턴 */}
          <Card className="p-5">
            <div className="font-semibold text-gray-800 mb-3">글자 혼동 패턴 (Whisper가 자주 헷갈리는 글자)</div>
            <div className="flex flex-wrap gap-2">
              {analysis.patterns.length === 0 && <p className="text-sm text-gray-400">데이터가 쌓이면 표시됩니다.</p>}
              {analysis.patterns.slice(0, 20).map((p) => (
                <span
                  key={p.from + p.to}
                  className={`px-2.5 py-1 rounded-md text-sm border ${
                    p.single ? "border-[#56D5DB]/50 bg-[#56D5DB]/10 text-gray-800" : "border-gray-200 text-gray-500"
                  }`}
                >
                  {p.from} → {p.to}
                  {p.count > 1 && <b className="ml-1 text-[#3fc4ca]">×{p.count}</b>}
                </span>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* 수동 추가 + 목록 */}
      {tab === "list" && (
      <>
      <Card className="p-4">
        <div className="text-sm font-medium text-gray-600 mb-2">직접 추가</div>
        <div className="flex items-center gap-2 flex-wrap">
          <Input value={wrong} onChange={(e) => setWrong(e.target.value)} placeholder="틀린말 (예: 장면)" className="w-40" />
          <ArrowRight className="w-4 h-4 text-gray-300" />
          <Input value={right} onChange={(e) => setRight(e.target.value)} placeholder="맞는말 (예: 작명)" className="w-40" />
          <Button
            onClick={() => addMut.mutate()}
            disabled={!wrong.trim() || !right.trim() || addMut.isPending}
            className="bg-[#56D5DB] hover:bg-[#3fc4ca] text-white"
          >
            <Plus className="w-4 h-4 mr-1" /> 추가
          </Button>
        </div>
      </Card>

      {/* 규칙 목록 */}
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <span>
          <b className="text-emerald-700">적용중</b> = 전사에 실제 적용 · <b className="text-amber-700">후보</b> = 안전검증을
          통과했지만 <b>서로 다른 통화 2건</b>의 증거가 아직 없음 · <b className="text-gray-600">차단</b> = 전역 치환하면
          위험(보호어·발음 불일치 등) → 스위치로도 켤 수 없음
        </span>
        <button
          onClick={() => revalidateMut.mutate()}
          disabled={revalidateMut.isPending}
          className="ml-auto shrink-0 text-xs px-2 py-1 rounded border border-gray-200 hover:border-[#56D5DB] disabled:opacity-50"
          title="모든 규칙을 안전성 검증기로 다시 검사합니다(삭제하지 않고 후보로 내림)"
        >
          {revalidateMut.isPending ? "검사 중…" : "전체 재검증"}
        </button>
      </div>
      {isLoading && <p className="text-sm text-gray-400">불러오는 중…</p>}
      {rules && rules.length === 0 && (
        <p className="text-sm text-gray-400 py-6 text-center">
          아직 학습된 교정이 없습니다. 통화 전사문을 수정하면 자동으로 쌓입니다.
        </p>
      )}
      <div className="space-y-1.5">
        {rules?.map((r) => {
          const st = r.status || (r.enabled ? "active" : "disabled");
          const badge =
            st === "active"
              ? { t: "적용중", c: "bg-emerald-50 text-emerald-700 border-emerald-200" }
              : st === "pending"
                ? { t: "후보", c: "bg-amber-50 text-amber-700 border-amber-200" }
                : { t: "차단", c: "bg-gray-100 text-gray-500 border-gray-200" };
          return (
            <Card key={r.wrong} className="px-4 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                  <Badge variant="outline" className={`shrink-0 ${badge.c}`}>
                    {badge.t}
                  </Badge>
                  <span className={`font-medium ${st === "active" ? "text-gray-400 line-through" : "text-gray-300"}`}>
                    {r.wrong}
                  </span>
                  <ArrowRight className="w-4 h-4 text-gray-300 shrink-0" />
                  <span className={`font-semibold ${st === "active" ? "text-gray-900" : "text-gray-400"}`}>
                    {r.right}
                  </span>
                  <Badge variant="outline" className="ml-1 text-gray-400 shrink-0">
                    {r.source === "manual" ? "수동" : `학습·${r.count}회`}
                  </Badge>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Switch
                    checked={st === "active"}
                    onCheckedChange={(v) => toggleMut.mutate({ w: r.wrong, e: v })}
                    title="켜면 전사에 적용(사람 판단 우선), 끄면 차단"
                  />
                  <button className="text-gray-300 hover:text-red-500" onClick={() => delMut.mutate(r.id)}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {st !== "active" && r.blockReason && (
                <div className="mt-1 text-xs text-amber-700">미적용 사유: {r.blockReason}</div>
              )}
              {r.sample && <div className="mt-0.5 text-xs text-gray-400 truncate">예문: …{r.sample}…</div>}
            </Card>
          );
        })}
      </div>
      </>
      )}
    </div>
  );
}
