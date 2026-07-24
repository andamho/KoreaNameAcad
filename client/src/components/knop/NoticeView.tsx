// 개명 자동관리: 확인 대기(최종점검) + 2세트(미용감사/정화하기) 문구·이미지·영상 편집 + 미리보기 + 테스트발송
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Trash2, Image as ImageIcon, Video, Eye, Send, CheckCircle2, XCircle, Clock, CalendarDays } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useUpload } from "@/hooks/use-upload";
import {
  knopApi,
  type NoticeConfig,
  type NoticeStep,
  type NoticePreview,
  type NoticePending,
  type ActiveSequence,
} from "@/lib/knopApi";

const SETS = [
  { key: "gaemyeong_request", label: "개명의뢰 · 미용감사", hint: "개명비 입금 다음날부터 · 이미지2+영상1" },
  { key: "gaemyeong_approved", label: "개명허가 · 정화하기", hint: "개명허가 확인 다음날부터 · 문구만" },
];

export function NoticeView({ onOpenCustomer }: { onOpenCustomer?: (id: string) => void }) {
  const [setKey, setSetKey] = useState("gaemyeong_request");
  return (
    <div className="space-y-6">
      <ActivePanel onOpenCustomer={onOpenCustomer} />
      <PendingPanel />
      <div className="flex gap-2">
        {SETS.map((s) => (
          <button
            key={s.key}
            onClick={() => setSetKey(s.key)}
            className={`flex-1 rounded-lg border px-4 py-3 text-left transition ${
              setKey === s.key ? "border-[#56D5DB] bg-[#56D5DB]/5" : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <div className="font-semibold text-sm text-gray-900">{s.label}</div>
            <div className="text-xs text-gray-400 mt-0.5">{s.hint}</div>
          </button>
        ))}
      </div>
      <SetEditor setKey={setKey} />
    </div>
  );
}

// ── 진행중 현황: 지금 관리문자(미용감사/정화하기)가 돌고 있는 고객 ──
function fmtNextKST(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  const s = d.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return s;
}

function ActivePanel({ onOpenCustomer }: { onOpenCustomer?: (id: string) => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: rows } = useQuery<ActiveSequence[]>({
    queryKey: ["knop-notice-active"],
    queryFn: () => knopApi.listActiveSequences(),
    refetchInterval: 30000,
  });
  const cancelMut = useMutation({
    mutationFn: ({ customerId, setKey }: { customerId: string; setKey: string }) =>
      knopApi.cancelSequence(customerId, setKey),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["knop-notice-active"] });
      toast({ title: "관리문자 취소됨", description: `남은 예약 ${r.canceled}건 취소` });
    },
    onError: (e: any) => toast({ title: "실패", description: e?.message, variant: "destructive" }),
  });

  const list = rows || [];
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-[#2ba0a6]" />
          <h3 className="font-semibold text-gray-900">진행중 현황</h3>
          <Badge variant="outline" className="text-gray-500">{list.length}</Badge>
        </div>
        <span className="text-xs text-gray-400">관리문자 발송이 남은 고객</span>
      </div>

      {list.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">현재 진행중인 관리문자가 없습니다.</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {list.map((s) => (
            <div key={`${s.customerId}-${s.setKey}`} className="flex items-center gap-3 py-2.5">
              <button
                className="min-w-0 flex-1 text-left flex items-center gap-2 group"
                onClick={() => onOpenCustomer?.(s.customerId)}
                title="고객 상세 열기"
              >
                <span className="text-sm font-medium text-gray-900 truncate group-hover:text-[#2ba0a6]">
                  {s.customerName}
                </span>
                <span
                  className={`shrink-0 text-[11px] px-1.5 py-0.5 rounded-full ${
                    s.setKey === "gaemyeong_request" ? "bg-emerald-100 text-emerald-700" : "bg-violet-100 text-violet-700"
                  }`}
                >
                  {s.setKey === "gaemyeong_request" ? "미용감사" : "정화하기"}
                </span>
              </button>

              {/* 진행 도트 ●○○○ */}
              <div className="hidden sm:flex items-center gap-1 shrink-0">
                {Array.from({ length: s.total }).map((_, i) => (
                  <span
                    key={i}
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ background: i < s.sent ? "#1D9E75" : "#e5e7eb" }}
                  />
                ))}
                <span className="ml-1 text-xs text-gray-500">
                  {s.sent}/{s.total}
                </span>
              </div>

              <div className="shrink-0 text-xs text-gray-500 w-32 text-right hidden sm:block">
                다음 {fmtNextKST(s.nextAt)}
              </div>

              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 text-gray-400 hover:text-red-500"
                onClick={() => {
                  if (window.confirm(`${s.customerName} 님의 ${s.setKey === "gaemyeong_request" ? "미용감사" : "정화하기"} 남은 문자를 모두 취소할까요?`)) {
                    cancelMut.mutate({ customerId: s.customerId, setKey: s.setKey });
                  }
                }}
              >
                취소
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ── 확인 대기(최종점검): 개명비 자동감지분 ──
function PendingPanel() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: pending } = useQuery<NoticePending[]>({
    queryKey: ["knop-notice-pending"],
    queryFn: () => knopApi.listNoticePending(),
    refetchInterval: 30000,
  });
  const [dates, setDates] = useState<Record<string, string>>({});
  const refresh = () => qc.invalidateQueries({ queryKey: ["knop-notice-pending"] });

  const confirmMut = useMutation({
    mutationFn: ({ id, nameDate }: { id: string; nameDate?: string }) => knopApi.confirmNoticePending(id, nameDate),
    onSuccess: (r) => {
      refresh();
      toast({
        title: "확인 완료 · 관리 시작",
        description: `문자 ${r.scheduled}건 예약${r.calendar ? ` · 달력 "${r.calendar.title}" ${r.calendar.date}` : ""}`,
      });
    },
    onError: (e: any) => toast({ title: "실패", description: e?.message, variant: "destructive" }),
  });
  const cancelMut = useMutation({
    mutationFn: (id: string) => knopApi.cancelNoticePending(id),
    onSuccess: () => {
      refresh();
      toast({ title: "취소됨 (개명의뢰 아님)" });
    },
  });

  if (!pending || pending.length === 0) return null;

  return (
    <Card className="p-4 border-amber-300 bg-amber-50/50">
      <div className="flex items-center gap-2 mb-3">
        <Clock className="w-4 h-4 text-amber-600" />
        <span className="font-semibold text-sm text-amber-900">개명의뢰 확인 대기 ({pending.length})</span>
        <span className="text-xs text-amber-700">개명비 입금이 감지됐어요. 맞으면 확인 → 다음날부터 자동 발송 + 새이름 일정이 달력에 등록됩니다.</span>
      </div>
      <div className="space-y-2">
        {pending.map((p) => (
          <div key={p.id} className="flex items-center gap-3 bg-white rounded-lg border border-amber-200 px-3 py-2">
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm text-gray-900">
                {p.customerName} <span className="text-gray-400 font-normal">· {p.setLabel}</span>
              </div>
              <div className="text-xs text-gray-500">{p.reason} · {p.phone}</div>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-600">
              <CalendarDays className="w-3.5 h-3.5 text-gray-400" />
              <span>새이름</span>
              <Input
                type="date"
                value={dates[p.id] ?? p.nameDate ?? ""}
                onChange={(e) => setDates((d) => ({ ...d, [p.id]: e.target.value }))}
                className="h-8 w-36 text-xs"
              />
            </div>
            <Button
              size="sm"
              className="h-8 bg-[#56D5DB] hover:bg-[#3fc4ca]"
              disabled={confirmMut.isPending}
              onClick={() => confirmMut.mutate({ id: p.id, nameDate: dates[p.id] ?? p.nameDate ?? undefined })}
            >
              <CheckCircle2 className="w-4 h-4 mr-1" /> 확인
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-gray-400 hover:text-red-500"
              disabled={cancelMut.isPending}
              onClick={() => cancelMut.mutate(p.id)}
            >
              <XCircle className="w-4 h-4 mr-1" /> 아님
            </Button>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ── 세트 편집(문구/이미지/영상) + 미리보기 + 테스트 ──
function SetEditor({ setKey }: { setKey: string }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: cfg, isLoading } = useQuery<NoticeConfig>({
    queryKey: ["knop-notice", setKey],
    queryFn: () => knopApi.getNotice(setKey),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["knop-notice", setKey] });

  const [preview, setPreview] = useState<NoticePreview[] | null>(null);
  const [testPhone, setTestPhone] = useState("");

  const previewMut = useMutation({
    mutationFn: () => knopApi.previewNotice(setKey, "홍길동"),
    onSuccess: (r) => setPreview(r),
  });
  const testMut = useMutation({
    mutationFn: () => knopApi.testNotice(setKey, { phone: testPhone.trim(), step: 0, name: "홍길동" }),
    onSuccess: () => toast({ title: "테스트 발송됨", description: `${testPhone} 로 안내 문자를 보냈습니다.` }),
    onError: (e: any) => toast({ title: "발송 실패", description: e?.message, variant: "destructive" }),
  });

  if (isLoading || !cfg) return <div className="text-sm text-gray-400">불러오는 중…</div>;

  return (
    <div className="space-y-4">
      {/* 첨부(개명의뢰만) */}
      {cfg.hasAssets && <AssetEditor cfg={cfg} onChange={refresh} />}

      {/* 4단계 문구 */}
      <div className="space-y-3">
        {cfg.steps.map((s) => (
          <StepEditor key={s.id} step={s} onSaved={refresh} />
        ))}
      </div>

      {/* 미리보기 + 테스트 */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => previewMut.mutate()}>
            <Eye className="w-4 h-4 mr-1" /> 미리보기
          </Button>
          <div className="flex items-center gap-1.5 ml-auto">
            <Input
              placeholder="내 번호 (테스트)"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              className="h-9 w-40 text-sm"
            />
            <Button
              size="sm"
              className="h-9 bg-[#56D5DB] hover:bg-[#3fc4ca]"
              disabled={!testPhone.trim() || testMut.isPending}
              onClick={() => testMut.mutate()}
            >
              <Send className="w-4 h-4 mr-1" /> 안내 테스트발송
            </Button>
          </div>
        </div>
        {preview && (
          <div className="space-y-2">
            {preview.map((p) => (
              <div key={p.step} className="rounded-lg border border-gray-200 p-3">
                <div className="text-xs font-semibold text-gray-500 mb-1">
                  {p.name} · 발송 D+{p.offsetDays} (오전 9~10시)
                </div>
                <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans">{p.content}</pre>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function StepEditor({ step, onSaved }: { step: NoticeStep; onSaved: () => void }) {
  const { toast } = useToast();
  const [body, setBody] = useState(step.body);
  const [days, setDays] = useState(step.offsetDays);
  const dirty = body !== step.body || days !== step.offsetDays;

  const saveMut = useMutation({
    mutationFn: () => knopApi.updateNoticeStep(step.id, { body, offsetDays: days }),
    onSuccess: () => {
      onSaved();
      toast({ title: "저장됨", description: step.name });
    },
    onError: (e: any) => toast({ title: "저장 실패", description: e?.message, variant: "destructive" }),
  });

  return (
    <Card className="p-3">
      <div className="flex items-center gap-2 mb-2">
        <Badge variant="secondary" className="text-xs">{step.step === 0 ? "안내" : `${step.step}주 점검`}</Badge>
        <span className="text-sm font-medium text-gray-800">{step.name}</span>
        <div className="flex items-center gap-1 ml-auto text-xs text-gray-500">
          발송 D+
          <Input
            type="number"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="h-7 w-16 text-xs"
          />
        </div>
        <Button size="sm" className="h-7" disabled={!dirty || saveMut.isPending} onClick={() => saveMut.mutate()}>
          저장
        </Button>
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={Math.max(3, body.split("\n").length)}
        className="w-full text-sm rounded border border-gray-200 px-2 py-1.5 focus:outline-none focus:border-[#56D5DB] resize-y"
        placeholder="문구를 입력하세요. {이름} 은 고객 이름으로 치환됩니다."
      />
    </Card>
  );
}

function AssetEditor({ cfg, onChange }: { cfg: NoticeConfig; onChange: () => void }) {
  const { toast } = useToast();
  const { uploadFile } = useUpload({ onError: () => toast({ title: "업로드 실패", variant: "destructive" }) });
  const [videoBusy, setVideoBusy] = useState(false);

  const addImage = useMutation({
    mutationFn: async (file: File) => {
      const base64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result));
        r.onerror = reject;
        r.readAsDataURL(file);
      });
      return knopApi.addNoticeImage(cfg.setKey, {
        title: file.name.replace(/\.[^.]+$/, ""),
        base64,
        contentType: file.type || "image/png",
      });
    },
    onSuccess: () => {
      onChange();
      toast({ title: "이미지 추가됨" });
    },
    onError: (e: any) => toast({ title: "업로드 실패", description: e?.message, variant: "destructive" }),
  });
  // 영상 원본 업로드 → R2 → 첨부 등록
  const uploadVideo = async (file: File) => {
    setVideoBusy(true);
    try {
      const up = await uploadFile(file);
      if (!up?.objectPath) throw new Error("업로드 실패");
      await knopApi.addNoticeAssetFile(cfg.setKey, {
        title: file.name.replace(/\.[^.]+$/, ""),
        objectPath: up.objectPath,
        kind: "video",
      });
      onChange();
      toast({ title: "영상 추가됨", description: file.name });
    } catch (e: any) {
      toast({ title: "영상 추가 실패", description: e?.message, variant: "destructive" });
    } finally {
      setVideoBusy(false);
    }
  };
  const delMut = useMutation({
    mutationFn: (id: string) => knopApi.deleteNoticeAsset(id),
    onSuccess: onChange,
  });

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="text-sm font-semibold text-gray-800">안내 문자 첨부 (이미지·영상 → 한 링크로 모아보기)</div>
        <a
          href={`/view/${cfg.setKey}`}
          target="_blank"
          rel="noreferrer"
          className="ml-auto inline-flex items-center gap-1 text-xs text-[#3fc4ca] hover:underline"
        >
          <Eye className="w-3.5 h-3.5" /> 모아보기 페이지 열기
        </a>
      </div>
      <p className="text-xs text-gray-400 -mt-1">
        올린 이미지·영상은 <b>링크 하나</b>로 묶여 한 화면에서 보여집니다. 문자엔 이 링크만 들어갑니다.
      </p>
      <div className="flex flex-wrap gap-2">
        {cfg.assets.map((a) => (
          <div key={a.id} className="flex items-center gap-2 rounded-lg border border-gray-200 px-2.5 py-1.5">
            {a.kind === "image" ? (
              <img src={a.target} className="w-9 h-11 object-cover rounded" alt={a.title} />
            ) : (
              <Video className="w-5 h-5 text-purple-500" />
            )}
            <div className="text-xs">
              <div className="font-medium text-gray-800">{a.title}</div>
              <a href={a.url} target="_blank" rel="noreferrer" className="text-[#3fc4ca] hover:underline">
                {a.url.replace(/^https?:\/\//, "")}
              </a>
            </div>
            <button onClick={() => delMut.mutate(a.id)} className="text-gray-300 hover:text-red-500">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        {cfg.assets.length === 0 && <div className="text-xs text-gray-400">아직 첨부가 없습니다. 아래에서 추가하세요.</div>}
      </div>
      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-gray-100">
        <label className="inline-flex items-center gap-1.5 text-sm rounded-md border border-gray-200 px-3 py-1.5 cursor-pointer hover:border-[#56D5DB]">
          <ImageIcon className="w-4 h-4" /> 이미지 업로드
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) addImage.mutate(f);
              e.target.value = "";
            }}
          />
        </label>
        <label
          className={`inline-flex items-center gap-1.5 text-sm rounded-md border border-gray-200 px-3 py-1.5 hover:border-[#56D5DB] ${
            videoBusy ? "opacity-50 pointer-events-none" : "cursor-pointer"
          }`}
        >
          <Video className="w-4 h-4" /> {videoBusy ? "영상 올리는 중…" : "영상 업로드"}
          <input
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadVideo(f);
              e.target.value = "";
            }}
          />
        </label>
        <span className="text-xs text-gray-400">영상 원본을 올리면 자동으로 짧은 링크로 만들어 문자에 넣습니다.</span>
      </div>
    </Card>
  );
}
