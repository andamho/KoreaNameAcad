// 문자수신 탭: 안드로이드 자동전달로 들어온 문자 스레드 → 신원매칭 → 상담 자동등록
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  MessageSquare,
  Phone,
  CheckCircle2,
  AlertTriangle,
  CalendarPlus,
  Loader2,
  RefreshCw,
  ExternalLink,
  UserCheck,
} from "lucide-react";
import { knopApi, type ThreadProcessResult } from "@/lib/knopApi";
import type { Customer } from "@shared/schema";

const MATCH_LABEL: Record<string, { text: string; cls: string }> = {
  code: { text: "고객번호 확정", cls: "bg-emerald-100 text-emerald-700" },
  exact: { text: "번호 확정", cls: "bg-emerald-100 text-emerald-700" },
  alias: { text: "옛 번호(번호변경)", cls: "bg-sky-100 text-sky-700" },
  name: { text: "이름 확정", cls: "bg-teal-100 text-teal-700" },
  confirmed: { text: "확정됨", cls: "bg-emerald-100 text-emerald-700" },
  none: { text: "신규 고객", cls: "bg-violet-100 text-violet-700" },
  ambiguous: { text: "동명이인 확인필요", cls: "bg-amber-100 text-amber-700" },
  merge_candidate: { text: "번호변경 확인필요", cls: "bg-amber-100 text-amber-700" },
};

export function SmsInboxView() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<ThreadProcessResult | null>(null);
  const [setPhoneOnConfirm, setSetPhoneOnConfirm] = useState(true);

  const { data: threads, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["knop-sms-threads"],
    queryFn: () => knopApi.listSmsThreads(),
  });
  const { data: msgs } = useQuery({
    queryKey: ["knop-sms-thread", selected],
    queryFn: () => knopApi.getSmsThread(selected!),
    enabled: !!selected,
  });

  const process = useMutation({
    mutationFn: (live: boolean) => knopApi.processSmsThread(selected!, { dryRun: !live, sendEmail: live }),
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ["knop-sms-threads"] });
    },
  });
  const confirm = useMutation({
    mutationFn: (v: { customerId: string; live: boolean }) =>
      knopApi.confirmSmsThread(selected!, {
        customerId: v.customerId,
        setPhone: setPhoneOnConfirm,
        dryRun: !v.live,
        sendEmail: v.live,
      }),
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ["knop-sms-threads"] });
    },
  });

  const pick = (phone: string) => {
    setSelected(phone);
    setResult(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">문자 수신함</h2>
          <p className="text-sm text-gray-400">
            안드로이드 자동전달 → 신원매칭 → 상담일정 자동등록 · 애매하면 확인 후 확정
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
          <RefreshCw className={`w-4 h-4 mr-1 ${isRefetching ? "animate-spin" : ""}`} /> 새로고침
        </Button>
      </div>

      <div className="grid md:grid-cols-[320px_1fr] gap-4">
        {/* 스레드 목록 */}
        <div className="space-y-2">
          {isLoading && <p className="text-sm text-gray-400">불러오는 중…</p>}
          {threads && threads.length === 0 && (
            <Card className="p-5 text-sm text-gray-400 text-center">
              수신된 문자가 없습니다.
              <br />
              <span className="text-xs">안드로이드 자동전달이 연결되면 여기에 쌓입니다.</span>
            </Card>
          )}
          {threads?.map((t) => {
            const active = selected === t.phone;
            return (
              <button key={t.phone} onClick={() => pick(t.phone)} className="w-full text-left">
                <Card
                  className={`p-3 transition ${
                    active ? "border-[#56D5DB] ring-1 ring-[#56D5DB]/40" : "hover:border-[#56D5DB]/50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-gray-800 truncate">
                      {t.contactName || t.phone}
                    </span>
                    {t.processed ? (
                      <Badge className="bg-emerald-100 text-emerald-700 shrink-0">등록됨</Badge>
                    ) : (
                      <Badge variant="outline" className="shrink-0">
                        {t.messageCount}건
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-gray-400 flex items-center gap-1">
                    <Phone className="w-3 h-3" /> {t.phone}
                  </div>
                  <div className="mt-1 text-xs text-gray-500 truncate">{t.lastBody}</div>
                </Card>
              </button>
            );
          })}
        </div>

        {/* 선택 스레드 상세 */}
        <div className="space-y-4">
          {!selected && (
            <Card className="p-8 text-center text-sm text-gray-400">
              <MessageSquare className="w-7 h-7 mx-auto mb-2 text-gray-300" />
              왼쪽에서 문자 스레드를 선택하세요.
            </Card>
          )}

          {selected && (
            <>
              {/* 대화 */}
              <Card className="p-4">
                <h3 className="font-semibold text-gray-800 mb-3 text-sm">대화 내용</h3>
                <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                  {msgs?.map((m) => (
                    <div
                      key={m.id}
                      className={`flex ${m.direction === "발신" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                          m.direction === "발신"
                            ? "bg-[#56D5DB]/15 text-gray-800"
                            : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {m.body}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => process.mutate(false)}
                    disabled={process.isPending}
                  >
                    {process.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                    분석 미리보기
                  </Button>
                  <Button
                    size="sm"
                    className="bg-[#56D5DB] hover:bg-[#3fc4ca] text-white"
                    onClick={() => process.mutate(true)}
                    disabled={process.isPending}
                  >
                    <CalendarPlus className="w-4 h-4 mr-1" /> 달력 등록 + 이메일
                  </Button>
                </div>
              </Card>

              {/* 결과 */}
              {result && <ResultPanel result={result} setPhoneOnConfirm={setPhoneOnConfirm} onToggleSetPhone={setSetPhoneOnConfirm} onConfirm={(cid, live) => confirm.mutate({ customerId: cid, live })} confirming={confirm.isPending} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultPanel({
  result,
  setPhoneOnConfirm,
  onToggleSetPhone,
  onConfirm,
  confirming,
}: {
  result: ThreadProcessResult;
  setPhoneOnConfirm: boolean;
  onToggleSetPhone: (v: boolean) => void;
  onConfirm: (customerId: string, live: boolean) => void;
  confirming: boolean;
}) {
  const ml = result.resolution?.match ? MATCH_LABEL[result.resolution.match] : null;

  // 확인 필요 (동명이인 / 번호변경) → 후보 선택
  if (result.needsConfirmation && result.resolution?.candidates) {
    return (
      <Card className="p-4 border-amber-200 bg-amber-50/40">
        <div className="flex items-center gap-2 mb-2 text-amber-700 font-semibold text-sm">
          <AlertTriangle className="w-4 h-4" /> 확인 필요 — {result.note}
        </div>
        <p className="text-xs text-gray-500 mb-3">
          아래 후보 중 실제 고객을 선택하면 그 고객으로 확정합니다. (자동 추측하지 않습니다)
        </p>
        <label className="flex items-center gap-2 text-xs text-gray-600 mb-3">
          <input
            type="checkbox"
            checked={setPhoneOnConfirm}
            onChange={(e) => onToggleSetPhone(e.target.checked)}
          />
          이 문자 번호를 해당 고객의 <b>현재 번호로</b> 갱신 (번호변경 반영, 옛 번호는 이력 보관)
        </label>
        <div className="space-y-2">
          {result.resolution.candidates.map((c: Customer) => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-white px-3 py-2"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-gray-800">
                  {c.customerCode && <span className="text-[#3fc4ca] mr-1">{c.customerCode}</span>}
                  {c.name}
                </div>
                <div className="text-xs text-gray-400">{c.phone}</div>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="sm" variant="outline" onClick={() => onConfirm(c.id, false)} disabled={confirming}>
                  미리보기
                </Button>
                <Button
                  size="sm"
                  className="bg-[#56D5DB] hover:bg-[#3fc4ca] text-white"
                  onClick={() => onConfirm(c.id, true)}
                  disabled={confirming}
                >
                  <UserCheck className="w-4 h-4 mr-1" /> 이 고객으로 확정
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  // 등록 안 됨 (의뢰인 아님 / 날짜 미확정 등)
  if (!result.ok) {
    return (
      <Card className="p-4 text-sm text-gray-500 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-gray-400" /> {result.note || "처리하지 않았습니다."}
      </Card>
    );
  }

  // 성공
  const d = result.draft;
  return (
    <Card className="p-4 border-emerald-200 bg-emerald-50/40 space-y-3">
      <div className="flex items-center gap-2 text-emerald-700 font-semibold text-sm">
        <CheckCircle2 className="w-4 h-4" /> {result.written ? "달력에 등록됨" : "미리보기(등록 안 함)"}
        {ml && <span className={`ml-1 text-xs px-2 py-0.5 rounded-full ${ml.cls}`}>{ml.text}</span>}
        {result.customerCode && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-[#56D5DB]/15 text-[#2ba0a6]">
            {result.customerCode}
          </span>
        )}
      </div>
      {result.analysis && (
        <div className="text-xs text-gray-500">AI 판독: {result.analysis.summary} (확신 {result.analysis.confidence})</div>
      )}
      {d && (
        <div className="rounded-lg bg-white border border-emerald-100 p-3 text-sm">
          <div className="font-semibold text-gray-800">{d.title}</div>
          <div className="text-xs text-gray-500 mt-1">
            {d.date} · {d.clientPhone} {d.hongik ? "· 홍익✅" : ""}
          </div>
          <div className="text-[11px] text-gray-400 mt-1">개명여부·인원은 달력에서 확인해 주세요.</div>
        </div>
      )}
      <div className="flex items-center gap-3 text-xs">
        {result.calendarLink && (
          <a
            href={result.calendarLink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[#2ba0a6] hover:underline"
          >
            <ExternalLink className="w-3.5 h-3.5" /> 달력에서 보기
          </a>
        )}
        {result.emailed && <span className="text-emerald-600">✉ 확인 이메일 발송됨</span>}
      </div>
    </Card>
  );
}
