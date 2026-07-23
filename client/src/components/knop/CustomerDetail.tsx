// KNOP 고객 상세: 헤더 + 프로젝트 + 통합 타임라인 + 파일 + 메모
import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Paperclip,
  Phone,
  Mail,
  FileText,
  Download,
  ExternalLink,
  Link2,
  MessageSquarePlus,
  MessageSquare,
  CalendarPlus,
  Mic,
  Loader2,
  ChevronDown,
  Send,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useUpload } from "@/hooks/use-upload";
import { knopApi, type CustomerDetail as CustomerDetailData } from "@/lib/knopApi";
import { KNOP_MILESTONES, KNOP_MILESTONE_ENTRY, knopStatusToMilestone } from "@shared/schema";

const MS_TEAL = "#1D9E75"; // 진행바 색(고객목록 보드와 동일)
import { CallTranscriptView } from "./CallTranscriptView";
import { NewProjectDialog, NewEventDialog, SendSmsDialog } from "./dialogs";
import {
  StatusBadge,
  PaymentBadge,
  fmtDateTime,
  fmtDate,
  timelineMeta,
  STATUSES,
  PAYMENT_STATUSES,
} from "./lib";

export function CustomerDetailView({ customerId, onBack }: { customerId: string; onBack: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const queryKey = ["knop-customer", customerId];
  const { data, isLoading } = useQuery<CustomerDetailData>({
    queryKey,
    queryFn: () => knopApi.getCustomer(customerId),
    // 전사 처리 중인 통화가 있으면 4초마다 자동 갱신
    refetchInterval: (query) =>
      (query.state.data as CustomerDetailData | undefined)?.calls?.some((c) => c.status === "processing")
        ? 4000
        : false,
  });
  const { data: journey } = useQuery({ queryKey: ["knop-journey"], queryFn: () => knopApi.listJourney() });
  const { data: hongikIds } = useQuery({ queryKey: ["knop-hongik"], queryFn: () => knopApi.hongikCustomerIds() });
  const isHongik = (hongikIds || []).includes(customerId);
  const { data: reportsData } = useQuery({
    queryKey: ["knop-reports", data?.customer.name],
    queryFn: () => knopApi.reportsForName(data!.customer.name),
    enabled: !!data?.customer.name,
  });
  const { data: recData } = useQuery({
    queryKey: ["knop-recordings", data?.customer.id],
    queryFn: () => knopApi.listRecordings(data!.customer.id),
    enabled: !!data?.customer.id,
  });
  const attachRecMut = useMutation({
    mutationFn: () => knopApi.attachRecordings(data!.customer.id),
    onSuccess: (r) => {
      refresh();
      qc.invalidateQueries({ queryKey: ["knop-recordings", data?.customer.id] });
      toast({ title: `녹음 ${r.attached}건 가져옴`, description: "전사가 백그라운드로 진행됩니다." });
    },
    onError: (e: Error) => toast({ title: "가져오기 실패", description: e.message, variant: "destructive" }),
  });
  const nextStatusOf = (status: string): string | null => {
    if (!journey) return null;
    const i = journey.findIndex((s) => s.status === status);
    return i >= 0 && i + 1 < journey.length ? journey[i + 1].status : null;
  };

  const [projectDialog, setProjectDialog] = useState(false);
  const [eventDialog, setEventDialog] = useState(false);
  const [smsDialog, setSmsDialog] = useState(false);
  const [note, setNote] = useState("");
  const [memoDraft, setMemoDraft] = useState<string | null>(null);
  const [phoneDraft, setPhoneDraft] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const [transcribing, setTranscribing] = useState(false);
  const [openCall, setOpenCall] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey });

  const { uploadFile, isUploading } = useUpload({
    onError: () => toast({ title: "업로드 실패", variant: "destructive" }),
  });

  const addNoteMut = useMutation({
    mutationFn: () => knopApi.addNote({ customerId, title: "메모", content: note.trim() }),
    onSuccess: () => {
      setNote("");
      refresh();
      toast({ title: "메모가 추가되었습니다." });
    },
  });

  // 개명하면 이름이 바뀐다 → 서버가 옛 이름을 nameHistory 에 보관하고 옛 이름으로도 계속 매칭됨
  const saveNameMut = useMutation({
    mutationFn: (name: string) => knopApi.updateCustomer(customerId, { name }),
    onSuccess: () => {
      setNameDraft(null);
      refresh();
      toast({ title: "이름 변경됨", description: "옛 이름은 이력에 보관되어 계속 매칭됩니다." });
    },
    onError: (e: any) => toast({ title: "이름 변경 실패", description: e?.message, variant: "destructive" }),
  });

  // 문자 발송용 이미지 링크: 원본 화질 그대로 열리는 짧은링크를 만들어 클립보드에 복사
  const copyLinkMut = useMutation({
    mutationFn: (fileUrl: string) => knopApi.createShortLink(fileUrl, `${data?.customer?.name ?? ""} 이름분석표`),
    onSuccess: async ({ url }) => {
      try {
        await navigator.clipboard.writeText(url);
        toast({ title: "문자용 링크 복사됨", description: `${url}\n문자에 붙여넣어 보내세요. 원본 화질로 열립니다.` });
      } catch {
        toast({ title: "문자용 링크", description: url });
      }
    },
    onError: (e: any) => toast({ title: "링크 생성 실패", description: e?.message, variant: "destructive" }),
  });

  const savePhoneMut = useMutation({
    mutationFn: (phone: string) => knopApi.updateCustomer(customerId, { phone }),
    onSuccess: () => {
      setPhoneDraft(null);
      refresh();
      toast({ title: "전화번호 저장됨" });
    },
    onError: (e: any) => toast({ title: "저장 실패", description: e?.message, variant: "destructive" }),
  });

  const saveMemoMut = useMutation({
    mutationFn: (memo: string) => knopApi.updateCustomer(customerId, { memo }),
    onSuccess: () => {
      setMemoDraft(null);
      refresh();
      toast({ title: "메모 저장됨" });
    },
  });

  // 프로젝트 상태를 캐시에서 즉시 바꿔 화면에 반영(체감 즉시). prev 반환으로 실패 시 원복.
  const patchProjectCache = (id: string, patch: Record<string, unknown>) => {
    const prev = qc.getQueryData<CustomerDetailData>(queryKey);
    if (prev?.projects) {
      qc.setQueryData<CustomerDetailData>(queryKey, {
        ...prev,
        projects: prev.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      });
    }
    return prev;
  };

  const updateProjectMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      knopApi.updateProject(id, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey });
      return { prev: patchProjectCache(id, patch) };
    },
    onError: (_e, _v, ctx: any) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
    },
    onSettled: () => refresh(),
  });

  const advanceMut = useMutation({
    // force=true 면 뒤 단계로도 되돌릴 수 있다(잘못 찍은 단계 수정용)
    mutationFn: ({ id, toStatus, force }: { id: string; toStatus: string; force?: boolean }) =>
      knopApi.advanceStatus(id, toStatus, !!force),
    onMutate: async ({ id, toStatus }) => {
      await qc.cancelQueries({ queryKey });
      return { prev: patchProjectCache(id, { status: toStatus }) };
    },
    onSuccess: (r) => {
      toast({
        title: `다음 단계: ${r.project.status}`,
        description: r.nextFollowup
          ? `후속: ${r.nextFollowup.template} (${r.nextFollowup.days}일 후)`
          : undefined,
      });
    },
    onError: (e: Error, _v, ctx: any) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
      toast({ title: "진행 불가", description: e.message, variant: "destructive" });
    },
    onSettled: () => refresh(),
  });

  const deleteProjectMut = useMutation({
    mutationFn: (id: string) => knopApi.deleteProject(id),
    onSuccess: () => {
      refresh();
      toast({ title: "프로젝트 삭제됨" });
    },
  });

  const deleteTimelineMut = useMutation({
    mutationFn: (id: string) => knopApi.deleteTimeline(id),
    onSuccess: () => refresh(),
  });

  const deleteFileMut = useMutation({
    mutationFn: (id: string) => knopApi.deleteFile(id),
    onSuccess: () => {
      refresh();
      toast({ title: "파일 삭제됨" });
    },
  });

  const deleteCallMut = useMutation({
    mutationFn: (id: string) => knopApi.deleteCall(id),
    onSuccess: () => {
      refresh();
      toast({ title: "통화 기록 삭제됨" });
    },
  });

  const handleAudio = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    setTranscribing(true);
    try {
      const up = await uploadFile(file);
      if (up?.objectPath) {
        await knopApi.createCall({ customerId, audioFileUrl: up.objectPath });
        refresh();
        toast({ title: "업로드 완료 · 전사 중입니다", description: "길이에 따라 몇 분 걸릴 수 있어요. 자동으로 갱신됩니다." });
      }
    } catch (e: any) {
      toast({ title: "통화 처리 실패", description: e?.message, variant: "destructive" });
    } finally {
      setTranscribing(false);
      if (audioInputRef.current) audioInputRef.current.value = "";
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      const res = await uploadFile(file);
      if (res?.objectPath) {
        await knopApi.addFile({
          customerId,
          fileName: file.name,
          fileType: file.type || null,
          fileUrl: res.objectPath,
        });
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
    refresh();
    toast({ title: "파일이 첨부되었습니다." });
  };

  if (isLoading || !data) {
    return (
      <div className="py-16 text-center text-gray-400">
        <Button variant="ghost" onClick={onBack} className="mb-4">
          <ArrowLeft className="w-4 h-4 mr-1" /> 목록
        </Button>
        <p>불러오는 중…</p>
      </div>
    );
  }

  const { customer, projects, timeline, files, calls } = data;

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={onBack} className="-ml-2">
        <ArrowLeft className="w-4 h-4 mr-1" /> 고객 목록
      </Button>

      {/* 헤더 */}
      <Card className="p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2 flex-wrap">
              {nameDraft === null ? (
                <button
                  type="button"
                  onClick={() => setNameDraft(customer.name)}
                  title="클릭하면 이름을 바꿉니다 (개명 시 사용 · 옛 이름은 이력에 남아 계속 매칭됩니다)"
                  className="text-left hover:text-[#3fc4ca] transition"
                >
                  {customer.name}
                </button>
              ) : (
                <span className="flex items-center gap-1.5">
                  <input
                    autoFocus
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && nameDraft.trim()) saveNameMut.mutate(nameDraft.trim());
                      else if (e.key === "Escape") setNameDraft(null);
                    }}
                    className="text-2xl font-bold border-b-2 border-[#56D5DB] outline-none w-40 bg-transparent"
                  />
                  <Button
                    size="sm"
                    className="h-8"
                    disabled={saveNameMut.isPending || !nameDraft.trim()}
                    onClick={() => saveNameMut.mutate(nameDraft.trim())}
                  >
                    저장
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8" onClick={() => setNameDraft(null)}>
                    취소
                  </Button>
                </span>
              )}
              {isHongik && (
                <span
                  className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-red-600 text-white text-sm font-bold shrink-0"
                  title="홍익 (달력 홍익 체크)"
                >
                  홍
                </span>
              )}
            </h2>
            <div className="mt-2 flex flex-col gap-1 text-sm text-gray-600">
              {phoneDraft === null ? (
                <button
                  className="flex items-center gap-2 text-left hover:text-[#3fc4ca] group"
                  onClick={() => setPhoneDraft(customer.phone || "")}
                  title="클릭하여 전화번호 수정"
                >
                  <Phone className="w-4 h-4 text-gray-400" /> {customer.phone || "번호 없음"}
                  <span className="text-xs text-gray-300 group-hover:text-[#56D5DB]">✎</span>
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <Phone className="w-4 h-4 text-gray-400 shrink-0" />
                  <Input
                    autoFocus
                    value={phoneDraft}
                    onChange={(e) => setPhoneDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") savePhoneMut.mutate(phoneDraft.trim());
                      if (e.key === "Escape") setPhoneDraft(null);
                    }}
                    className="h-8 w-40 text-sm"
                    placeholder="010-0000-0000"
                  />
                  <Button size="sm" className="h-8" disabled={savePhoneMut.isPending} onClick={() => savePhoneMut.mutate(phoneDraft.trim())}>
                    저장
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8" onClick={() => setPhoneDraft(null)}>
                    취소
                  </Button>
                </div>
              )}
              {customer.email && (
                <span className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-gray-400" /> {customer.email}
                </span>
              )}
              <span className="text-xs text-gray-400">등록 {fmtDate(customer.createdAt)}</span>
              {data.referral?.referralSource && (
                <span className="mt-1 inline-flex items-center gap-1.5 text-xs">
                  <span className="text-gray-400">문의경로</span>
                  <span className="px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 font-medium">
                    {data.referral.referralSource}
                    {data.referral.referrerName ? ` · ${data.referral.referrerName}` : ""}
                  </span>
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setSmsDialog(true)}>
              <Send className="w-4 h-4 mr-1" /> 문자
            </Button>
            <Button variant="outline" size="sm" onClick={() => setEventDialog(true)}>
              <CalendarPlus className="w-4 h-4 mr-1" /> 일정
            </Button>
            <Button
              size="sm"
              onClick={() => setProjectDialog(true)}
              className="bg-[#56D5DB] hover:bg-[#3fc4ca] text-white"
            >
              <Plus className="w-4 h-4 mr-1" /> 프로젝트
            </Button>
          </div>
        </div>

        {/* 고객 메모 */}
        <div className="mt-4">
          {memoDraft === null ? (
            <button
              className="text-sm text-gray-600 hover:bg-gray-50 text-left w-full rounded-lg border border-gray-100 p-3 group transition"
              onClick={() => setMemoDraft(customer.memo || "")}
              title="클릭하여 메모 수정"
            >
              <span className="flex items-center gap-1 text-xs font-medium text-gray-400 mb-1">
                메모 <span className="text-gray-300 group-hover:text-[#56D5DB]">✎ 수정</span>
              </span>
              <span className="whitespace-pre-wrap leading-relaxed">{customer.memo || "클릭하여 메모 추가"}</span>
            </button>
          ) : (
            <div className="space-y-2">
              <div className="text-xs font-medium text-gray-400">메모 수정</div>
              <Textarea
                autoFocus
                value={memoDraft}
                onChange={(e) => setMemoDraft(e.target.value)}
                rows={Math.min(14, Math.max(4, memoDraft.split("\n").length + 1))}
                className="text-sm leading-relaxed"
              />
              <div className="flex gap-2">
                <Button size="sm" disabled={saveMemoMut.isPending} onClick={() => saveMemoMut.mutate(memoDraft)}>
                  저장
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setMemoDraft(null)}>
                  취소
                </Button>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* 프로젝트: 전체 폭 + 6단계 진행바(클릭해서 바로 체크/되돌리기) */}
      <Card className="p-5">
        <h3 className="font-semibold text-gray-800 mb-3">프로젝트 ({projects.length})</h3>
        <div className="space-y-4">
          {projects.length === 0 && <p className="text-sm text-gray-400">프로젝트가 없습니다.</p>}
          {projects.map((p) => {
            const cur = knopStatusToMilestone(p.status);
            return (
              <div key={p.id} className="rounded-lg border border-gray-100 p-4">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <div className="text-xs text-gray-400">{p.type}</div>
                    <div className="font-medium text-gray-900">{p.title}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select
                      value={p.paymentStatus}
                      onValueChange={(v) => updateProjectMut.mutate({ id: p.id, patch: { paymentStatus: v } })}
                    >
                      <SelectTrigger className="h-7 w-auto border-none bg-transparent p-0 shadow-none focus:ring-0">
                        <PaymentBadge status={p.paymentStatus} />
                      </SelectTrigger>
                      <SelectContent>
                        {PAYMENT_STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-gray-300 hover:text-red-500"
                      onClick={() => {
                        if (confirm("이 프로젝트를 삭제할까요?")) deleteProjectMut.mutate(p.id);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* 진행 단계: 점을 눌러 진행(앞) / 되돌리기(뒤, 확인창) */}
                <div className="mt-3 grid grid-cols-6 gap-1">
                  {KNOP_MILESTONES.map((m, i) => {
                    const done = i < cur;
                    const isCur = i === cur;
                    const onTap = () => {
                      if (i > cur) return advanceMut.mutate({ id: p.id, toStatus: KNOP_MILESTONE_ENTRY[i] });
                      if (i < cur && confirm(`'${m}' 단계로 되돌릴까요?`)) {
                        advanceMut.mutate({ id: p.id, toStatus: KNOP_MILESTONE_ENTRY[i], force: true });
                      }
                    };
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={onTap}
                        title={i > cur ? `${m} 단계로 진행` : i < cur ? `${m} 단계로 되돌리기` : "현재 단계"}
                        className="flex flex-col items-center gap-1 py-0.5 group"
                      >
                        <span
                          className="w-full h-1.5 rounded-full transition"
                          style={{ background: done || isCur ? MS_TEAL : "#e5e7eb" }}
                        />
                        <span
                          className={`text-[11px] leading-tight text-center ${
                            isCur ? "text-[#1D9E75] font-semibold" : done ? "text-gray-500" : "text-gray-300 group-hover:text-gray-500"
                          }`}
                        >
                          {m}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-1 text-[11px] text-gray-400">
                  현재: {p.status}
                  {p.memo ? ` · ${p.memo}` : ""}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="space-y-6">
      {/* 좌: 이름분석표(넓게) · 우: 상담 통화 — 통화가 이름분석표에 대한 내용이라 나란히 */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-6">
          {/* 이름분석표 (로컬 PDF 연계) */}
          {reportsData?.reports && reportsData.reports.length > 0 && (
            <Card className="p-5">
              <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#56D5DB]" /> 이름분석표 ({reportsData.reports.length})
              </h3>
              <div className="space-y-2">
                {reportsData.reports.map((r) => (
                  <a
                    key={r.file}
                    href={knopApi.reportFileUrl(r.file)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 rounded-lg border border-gray-100 px-3 py-2 text-sm hover:border-[#56D5DB]/50 hover:bg-[#56D5DB]/5 transition"
                  >
                    <FileText className="w-4 h-4 shrink-0 text-red-400" />
                    <span className="text-gray-700 truncate">{r.label}</span>
                    <ExternalLink className="w-3.5 h-3.5 ml-auto shrink-0 text-gray-300" />
                  </a>
                ))}
              </div>
            </Card>
          )}

          {/* 이름분석표 (업로드 파일) */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-800">이름분석표 ({files.length})</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
              >
                <Paperclip className="w-4 h-4 mr-1" /> {isUploading ? "업로드중…" : "첨부"}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => handleFiles(e.target.files)}
              />
            </div>
            <div className="space-y-2">
              {files.length === 0 && <p className="text-sm text-gray-400">첨부된 파일이 없습니다.</p>}
              {files.map((f) => {
                const isImg = (f.fileType || "").startsWith("image/");
                return (
                <div key={f.id} className="rounded-lg border border-gray-100 overflow-hidden">
                  {/* 이미지는 처음부터 크게 — 클릭하면 원본 화질로 열림 */}
                  {/* 가로는 칸을 꽉 채우고(크게 보임), 세로로 긴 건 이 안에서 스크롤 */}
                  {isImg && (
                    <div className="max-h-[78vh] overflow-auto bg-white border-b border-gray-100">
                      <a href={f.fileUrl} target="_blank" rel="noreferrer" title="클릭하면 원본 화질로 열립니다">
                        <img src={f.fileUrl} alt={f.fileName} loading="lazy" className="block w-full h-auto" />
                      </a>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2 px-3 py-2">
                  <a
                    href={f.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 min-w-0 text-sm text-gray-700 hover:text-[#3fc4ca]"
                  >
                    {!isImg && <FileText className="w-4 h-4 shrink-0 text-gray-400" />}
                    <span className="truncate">{f.fileName}</span>
                  </a>
                  <div className="flex items-center gap-1 shrink-0">
                    {isImg && (
                      <button
                        title="문자 발송용 링크 복사 (누르면 원본 화질로 열립니다)"
                        disabled={copyLinkMut.isPending}
                        onClick={() => copyLinkMut.mutate(f.fileUrl)}
                        className="text-gray-300 hover:text-[#3fc4ca] disabled:opacity-40"
                      >
                        <Link2 className="w-4 h-4" />
                      </button>
                    )}
                    <a href={f.fileUrl} target="_blank" rel="noreferrer" className="text-gray-300 hover:text-gray-600">
                      <Download className="w-4 h-4" />
                    </a>
                    <button
                      className="text-gray-300 hover:text-red-500"
                      onClick={() => {
                        if (confirm("파일을 삭제할까요?")) deleteFileMut.mutate(f.id);
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  </div>
                </div>
                );
              })}
            </div>
          </Card>

        </div>
        <div className="lg:col-span-2 space-y-6">
          {/* 폴더 녹음 자동 연결 (로컬 상담녹음) */}
          {recData?.recordings && recData.recordings.length > 0 && (
            <Card className="p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                  <Mic className="w-4 h-4 text-[#56D5DB]" /> 폴더 녹음 ({recData.recordings.length})
                </h3>
                {recData.recordings.some((r) => !r.attached) && (
                  <Button size="sm" variant="outline" onClick={() => attachRecMut.mutate()} disabled={attachRecMut.isPending}>
                    {attachRecMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
                    가져오기 + 전사
                  </Button>
                )}
              </div>
              <div className="space-y-1.5">
                {recData.recordings.map((r) => (
                  <div key={r.file} className="flex items-center gap-2 text-sm">
                    <Mic className="w-3.5 h-3.5 shrink-0 text-gray-300" />
                    <span className="truncate text-gray-600">{r.label}</span>
                    {r.attached ? (
                      <span className="ml-auto shrink-0 text-xs text-emerald-600">연결됨</span>
                    ) : (
                      <span className="ml-auto shrink-0 text-xs text-gray-400">대기</span>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-gray-400">
                가져오면 아래 통화 목록에 추가되고 자동 전사됩니다.
              </p>
            </Card>
          )}

          {/* 통화 녹음 */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-800">상담 통화 ({calls.length})</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => audioInputRef.current?.click()}
                disabled={transcribing}
              >
                {transcribing ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" /> 전사 중…
                  </>
                ) : (
                  <>
                    <Mic className="w-4 h-4 mr-1" /> 녹음 업로드
                  </>
                )}
              </Button>
              <input
                ref={audioInputRef}
                type="file"
                accept="audio/*,.m4a,.amr,.mp3,.wav,.aac,.ogg"
                className="hidden"
                onChange={(e) => handleAudio(e.target.files)}
              />
            </div>
            <div className="space-y-2">
              {calls.length === 0 && (
                <p className="text-sm text-gray-400">
                  통화 녹음이 없습니다. 녹음 파일을 올리면 AI가 전사·요약합니다.
                </p>
              )}
              {calls.map((c) => {
                let items: string[] = [];
                try {
                  items = JSON.parse(c.actionItems || "[]");
                } catch {
                  /* noop */
                }
                const open = openCall === c.id;
                return (
                  <div key={c.id} className="rounded-lg border border-gray-100">
                    <button
                      className="w-full flex items-start justify-between gap-2 px-3 py-2 text-left"
                      onClick={() => setOpenCall(open ? null : c.id)}
                    >
                      <div className="min-w-0">
                        <div className="text-xs text-gray-400">
                          {c.direction} · {fmtDateTime(c.callDate || c.createdAt)}
                          {c.status === "failed" && " · 전사실패"}
                        </div>
                        {c.status === "processing" ? (
                          <div className="text-sm text-[#3fc4ca] flex items-center gap-1.5">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" /> 전사 중… (몇 분 소요)
                          </div>
                        ) : (
                          <div className="text-sm text-gray-700 line-clamp-2">
                            {c.summaryText || "(요약 없음)"}
                          </div>
                        )}
                      </div>
                      <ChevronDown
                        className={`w-4 h-4 shrink-0 text-gray-300 transition ${open ? "rotate-180" : ""}`}
                      />
                    </button>
                    {open && (
                      <div className="border-t border-gray-100 px-3 py-2 space-y-2">
                        {items.length > 0 && (
                          <div>
                            <div className="text-xs font-medium text-gray-500 mb-0.5">다음 할 일</div>
                            <ul className="list-disc list-inside text-sm text-gray-600">
                              {items.map((it, i) => (
                                <li key={i}>{it}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <CallTranscriptView call={c} onSaved={refresh} />
                        <div className="flex justify-end">
                          <button
                            className="text-gray-300 hover:text-red-500"
                            onClick={() => deleteCallMut.mutate(c.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

        </div>
      </div>

      {/* 하단 전체 폭: 문자 대화 */}
          {/* 문자 대화 (주고받은 문자 시간순) */}
          <MessagesCard customerId={customerId} />

      </div>

      <NewProjectDialog
        open={projectDialog}
        onOpenChange={setProjectDialog}
        customerId={customerId}
        onCreated={refresh}
      />
      <NewEventDialog
        open={eventDialog}
        onOpenChange={setEventDialog}
        customerId={customerId}
        onCreated={refresh}
      />
      <SendSmsDialog
        open={smsDialog}
        onOpenChange={setSmsDialog}
        defaultPhone={customer.phone}
        customerId={customerId}
        customerName={customer.name}
        onSent={refresh}
      />
    </div>
  );
}


// 주고받은 문자 대화 (받음=왼쪽 회색, 보냄=오른쪽 민트, 시간순)
function MessagesCard({ customerId }: { customerId: string }) {
  const { data: msgs, isLoading } = useQuery({
    queryKey: ["knop-customer-messages", customerId],
    queryFn: () => knopApi.customerMessages(customerId),
    refetchInterval: 60000,
  });

  const fmt = (at: string | null) => {
    if (!at) return "";
    try {
      return new Date(at).toLocaleString("ko-KR", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  return (
    <Card className="p-5">
      <h3 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-[#56D5DB]" /> 문자 대화 {msgs?.length ? `(${msgs.length})` : ""}
      </h3>
      {isLoading ? (
        <p className="text-sm text-gray-400">불러오는 중…</p>
      ) : !msgs || msgs.length === 0 ? (
        <p className="text-sm text-gray-400">
          주고받은 문자가 없습니다. (받은 문자는 폰 연동 이후분, 보낸 문자는 KNOP 발송분이 표시됩니다)
        </p>
      ) : (
        <div className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">
          {msgs.map((m) => {
            const mine = m.direction === "보냄";
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[80%] ${mine ? "items-end" : "items-start"} flex flex-col`}>
                  <div
                    className={`rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
                      mine
                        ? "bg-[#56D5DB]/20 text-gray-800 rounded-br-sm"
                        : "bg-gray-100 text-gray-800 rounded-bl-sm"
                    }`}
                  >
                    {m.body}
                  </div>
                  <span className="text-[11px] text-gray-400 mt-0.5 px-1">
                    {mine ? "보냄" : "받음"} · {fmt(m.at)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
