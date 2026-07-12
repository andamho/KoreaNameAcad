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
  MessageSquarePlus,
  CalendarPlus,
  Mic,
  Loader2,
  ChevronDown,
  Send,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useUpload } from "@/hooks/use-upload";
import { knopApi, type CustomerDetail as CustomerDetailData } from "@/lib/knopApi";
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

  const saveMemoMut = useMutation({
    mutationFn: (memo: string) => knopApi.updateCustomer(customerId, { memo }),
    onSuccess: () => {
      setMemoDraft(null);
      refresh();
      toast({ title: "메모 저장됨" });
    },
  });

  const updateProjectMut = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Record<string, unknown> }) =>
      knopApi.updateProject(id, patch),
    onSuccess: () => refresh(),
  });

  const advanceMut = useMutation({
    mutationFn: ({ id, toStatus }: { id: string; toStatus: string }) =>
      knopApi.advanceStatus(id, toStatus),
    onSuccess: (r) => {
      refresh();
      toast({
        title: `다음 단계: ${r.project.status}`,
        description: r.nextFollowup
          ? `후속: ${r.nextFollowup.template} (${r.nextFollowup.days}일 후)`
          : undefined,
      });
    },
    onError: (e: Error) => toast({ title: "진행 불가", description: e.message, variant: "destructive" }),
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
            <h2 className="text-2xl font-bold text-gray-900">{customer.name}</h2>
            <div className="mt-2 flex flex-col gap-1 text-sm text-gray-600">
              <span className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-gray-400" /> {customer.phone}
              </span>
              {customer.email && (
                <span className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-gray-400" /> {customer.email}
                </span>
              )}
              <span className="text-xs text-gray-400">등록 {fmtDate(customer.createdAt)}</span>
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
              className="text-sm text-gray-500 hover:text-gray-800 text-left w-full"
              onClick={() => setMemoDraft(customer.memo || "")}
            >
              <span className="text-gray-400">메모: </span>
              {customer.memo || "클릭하여 메모 추가"}
            </button>
          ) : (
            <div className="space-y-2">
              <Textarea value={memoDraft} onChange={(e) => setMemoDraft(e.target.value)} rows={2} />
              <div className="flex gap-2">
                <Button size="sm" onClick={() => saveMemoMut.mutate(memoDraft)}>
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

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* 왼쪽: 프로젝트 + 파일 */}
        <div className="lg:col-span-2 space-y-6">
          {/* 프로젝트 */}
          <Card className="p-5">
            <h3 className="font-semibold text-gray-800 mb-3">프로젝트 ({projects.length})</h3>
            <div className="space-y-3">
              {projects.length === 0 && <p className="text-sm text-gray-400">프로젝트가 없습니다.</p>}
              {projects.map((p) => (
                <div key={p.id} className="rounded-lg border border-gray-100 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs text-gray-400">{p.type}</div>
                      <div className="font-medium text-gray-900">{p.title}</div>
                    </div>
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
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Select
                      value={p.status}
                      onValueChange={(v) => updateProjectMut.mutate({ id: p.id, patch: { status: v } })}
                    >
                      <SelectTrigger className="h-7 w-auto border-none bg-transparent p-0 shadow-none focus:ring-0">
                        <StatusBadge status={p.status} />
                      </SelectTrigger>
                      <SelectContent className="max-h-64">
                        {STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={p.paymentStatus}
                      onValueChange={(v) =>
                        updateProjectMut.mutate({ id: p.id, patch: { paymentStatus: v } })
                      }
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
                    {nextStatusOf(p.status) && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[#2ba0a6] border-[#56D5DB]/50"
                        disabled={advanceMut.isPending}
                        onClick={() => advanceMut.mutate({ id: p.id, toStatus: nextStatusOf(p.status)! })}
                      >
                        다음 단계 → {nextStatusOf(p.status)}
                      </Button>
                    )}
                  </div>
                  {p.memo && <p className="mt-2 text-sm text-gray-500">{p.memo}</p>}
                </div>
              ))}
            </div>
          </Card>

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

          {/* 파일 */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-800">파일 ({files.length})</h3>
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
              {files.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 px-3 py-2"
                >
                  <a
                    href={f.fileUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 min-w-0 text-sm text-gray-700 hover:text-[#3fc4ca]"
                  >
                    <FileText className="w-4 h-4 shrink-0 text-gray-400" />
                    <span className="truncate">{f.fileName}</span>
                  </a>
                  <div className="flex items-center gap-1 shrink-0">
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
              ))}
            </div>
          </Card>

          {/* 통화 녹음 */}
          <Card className="p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-800">통화 녹음 ({calls.length})</h3>
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

        {/* 오른쪽: 통합 타임라인 */}
        <div className="lg:col-span-3">
          <Card className="p-5">
            <h3 className="font-semibold text-gray-800 mb-3">통합 타임라인</h3>

            {/* 빠른 메모 입력 */}
            <div className="flex gap-2 mb-4">
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="상담 메모 · 통화 내용 기록…"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && note.trim()) addNoteMut.mutate();
                }}
              />
              <Button
                onClick={() => addNoteMut.mutate()}
                disabled={!note.trim() || addNoteMut.isPending}
                className="bg-[#56D5DB] hover:bg-[#3fc4ca] text-white shrink-0"
              >
                <MessageSquarePlus className="w-4 h-4 mr-1" /> 기록
              </Button>
            </div>

            <Separator className="mb-4" />

            <div className="space-y-4">
              {timeline.length === 0 && <p className="text-sm text-gray-400">기록이 없습니다.</p>}
              {timeline.map((ev) => {
                const meta = timelineMeta(ev.type);
                return (
                  <div key={ev.id} className="group flex gap-3">
                    <div className="flex flex-col items-center pt-1.5">
                      <span className={`w-2.5 h-2.5 rounded-full ${meta.dot}`} />
                      <span className="w-px flex-1 bg-gray-100 mt-1" />
                    </div>
                    <div className="flex-1 pb-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-medium text-gray-400">{meta.label}</span>
                          <span className="text-sm font-medium text-gray-800">{ev.title}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">{fmtDateTime(ev.createdAt)}</span>
                          <button
                            className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition"
                            onClick={() => deleteTimelineMut.mutate(ev.id)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      {ev.content && <p className="mt-0.5 text-sm text-gray-600 whitespace-pre-wrap">{ev.content}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
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
