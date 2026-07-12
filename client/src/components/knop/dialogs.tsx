// KNOP 입력 다이얼로그: 새 고객 / 새 프로젝트 / 새 일정
import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { knopApi, DuplicatePhoneError, type SmsTemplate } from "@/lib/knopApi";
import type { Customer } from "@shared/schema";
import {
  PROJECT_TYPES,
  STATUSES,
  PAYMENT_STATUSES,
  EVENT_TYPES,
  fromLocalInput,
} from "./lib";

// ── 새 고객 등록 ──
export function NewCustomerDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (c: Customer) => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [memo, setMemo] = useState("");

  const reset = () => {
    setName("");
    setPhone("");
    setEmail("");
    setMemo("");
  };

  const mut = useMutation({
    mutationFn: () => knopApi.createCustomer({ name, phone, email: email || null, memo: memo || null }),
    onSuccess: (c) => {
      toast({ title: "고객이 등록되었습니다." });
      reset();
      onOpenChange(false);
      onCreated(c);
    },
    onError: (e) => {
      if (e instanceof DuplicatePhoneError) {
        toast({
          title: "이미 등록된 전화번호입니다.",
          description: `${e.customer.name} 고객으로 이동합니다.`,
        });
        reset();
        onOpenChange(false);
        onCreated(e.customer);
        return;
      }
      toast({ title: "등록 실패", variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>새 고객 등록</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>이름 *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="홍길동" />
          </div>
          <div className="space-y-1.5">
            <Label>전화번호 *</Label>
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="010-1234-5678"
              inputMode="tel"
            />
          </div>
          <div className="space-y-1.5">
            <Label>이메일</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="선택" />
          </div>
          <div className="space-y-1.5">
            <Label>메모</Label>
            <Textarea value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="선택" rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={!name.trim() || !phone.trim() || mut.isPending}
            className="bg-[#56D5DB] hover:bg-[#3fc4ca] text-white"
          >
            등록
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── 새 프로젝트 ──
export function NewProjectDialog({
  open,
  onOpenChange,
  customerId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customerId: string;
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [type, setType] = useState<string>(PROJECT_TYPES[0]);
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<string>(STATUSES[0]);
  const [paymentStatus, setPaymentStatus] = useState<string>(PAYMENT_STATUSES[0]);
  const [memo, setMemo] = useState("");

  const mut = useMutation({
    mutationFn: () =>
      knopApi.createProject({
        customerId,
        type,
        title: title.trim() || type,
        status,
        paymentStatus,
        memo: memo || null,
      }),
    onSuccess: () => {
      toast({ title: "프로젝트가 생성되었습니다." });
      setTitle("");
      setMemo("");
      onOpenChange(false);
      onCreated();
    },
    onError: () => toast({ title: "생성 실패", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>새 프로젝트</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>유형</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROJECT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>제목</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="비우면 유형명으로 저장"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>상태</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>결제</Label>
              <Select value={paymentStatus} onValueChange={setPaymentStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>메모</Label>
            <Textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={mut.isPending}
            className="bg-[#56D5DB] hover:bg-[#3fc4ca] text-white"
          >
            생성
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── 새 일정 ──
export function NewEventDialog({
  open,
  onOpenChange,
  customerId,
  projectId,
  defaultStart,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customerId?: string | null;
  projectId?: string | null;
  defaultStart?: string; // datetime-local value
  onCreated: () => void;
}) {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [type, setType] = useState<string>(EVENT_TYPES[0]);
  const [startLocal, setStartLocal] = useState(defaultStart || "");
  const [memo, setMemo] = useState("");

  const mut = useMutation({
    mutationFn: () =>
      knopApi.createEvent({
        customerId: customerId ?? null,
        projectId: projectId ?? null,
        title: title.trim() || type,
        type,
        startAt: fromLocalInput(startLocal),
        memo: memo || null,
      }),
    onSuccess: () => {
      toast({ title: "일정이 등록되었습니다." });
      setTitle("");
      setMemo("");
      onOpenChange(false);
      onCreated();
    },
    onError: () => toast({ title: "등록 실패", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>새 일정</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>유형</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {EVENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>제목</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="비우면 유형명" />
          </div>
          <div className="space-y-1.5">
            <Label>일시 *</Label>
            <Input type="datetime-local" value={startLocal} onChange={(e) => setStartLocal(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>메모</Label>
            <Textarea value={memo} onChange={(e) => setMemo(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={!startLocal || mut.isPending}
            className="bg-[#56D5DB] hover:bg-[#3fc4ca] text-white"
          >
            등록
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// 인원별 새 이름 상담 소요시간 (설계/원장님 규칙): 1→10 2→20 3→30 4→40 5→40 6+→50
const NEWNAME_DURATION: Record<number, number> = { 1: 10, 2: 20, 3: 30, 4: 40, 5: 40, 6: 50 };
function durationForPeople(n: number): number {
  if (n <= 1) return 10;
  return NEWNAME_DURATION[n] ?? 50;
}
// 템플릿 변수 치환: {이름} {가족}(2명+ "가족분들의 ") {시간}(인원별 분)
export function renderSmsTemplate(content: string, opts: { name?: string; people: number }): string {
  const fam = opts.people >= 2 ? "가족분들의 " : "";
  return content
    .replace(/\{이름\}/g, opts.name || "")
    .replace(/\{가족\}/g, fam)
    .replace(/\{시간\}/g, String(durationForPeople(opts.people)));
}

// ── 문자 보내기 (즉시/예약) ──
export function SendSmsDialog({
  open,
  onOpenChange,
  defaultPhone,
  customerId,
  projectId,
  customerName,
  onSent,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultPhone?: string;
  customerId?: string | null;
  projectId?: string | null;
  customerName?: string;
  onSent?: () => void;
}) {
  const { toast } = useToast();
  const [phone, setPhone] = useState(defaultPhone || "");
  const [content, setContent] = useState("");
  const [templateId, setTemplateId] = useState<string>("");
  const [mode, setMode] = useState<"now" | "schedule">("now");
  const [when, setWhen] = useState("");

  const { data: templates } = useQuery<SmsTemplate[]>({
    queryKey: ["knop-sms-templates"],
    queryFn: () => knopApi.listSmsTemplates(),
  });

  useEffect(() => {
    if (open) {
      setPhone(defaultPhone || "");
      setContent("");
      setTemplateId("");
      setMode("now");
      setWhen("");
    }
  }, [open, defaultPhone]);

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const t = templates?.find((x) => x.id === id);
    if (t) {
      let c = t.content;
      if (customerName) c = c.replace(/\{이름\}/g, customerName);
      setContent(c);
    }
  };

  const mut = useMutation({
    mutationFn: () =>
      knopApi.createSmsMessage({
        customerId: customerId ?? null,
        projectId: projectId ?? null,
        phone: phone.trim(),
        content: content.trim(),
        templateId: templateId || null,
        scheduledAt: mode === "schedule" && when ? new Date(when).toISOString() : null,
      }),
    onSuccess: (m) => {
      toast({ title: m.status === "sent" ? "문자 발송됨" : "예약되었습니다" });
      onOpenChange(false);
      onSent?.();
    },
    onError: (e: any) => toast({ title: "실패", description: e?.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>문자 보내기</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>받는 번호 *</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="010-0000-0000" inputMode="tel" />
          </div>
          <div className="space-y-1.5">
            <Label>템플릿</Label>
            <Select value={templateId} onValueChange={applyTemplate}>
              <SelectTrigger>
                <SelectValue placeholder="템플릿 선택 (선택)" />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                {(templates || []).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>내용 *</Label>
            <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={5} placeholder="문자 내용" />
          </div>
          <div className="space-y-1.5">
            <Label>발송 방식</Label>
            <div className="flex items-center gap-2">
              {(["now", "schedule"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium border transition ${
                    mode === m ? "border-[#56D5DB] bg-[#56D5DB]/10 text-gray-800" : "border-gray-200 text-gray-500"
                  }`}
                >
                  {m === "now" ? "즉시 발송" : "예약 발송"}
                </button>
              ))}
              {mode === "schedule" && (
                <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="flex-1" />
              )}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            취소
          </Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={!phone.trim() || !content.trim() || (mode === "schedule" && !when) || mut.isPending}
            className="bg-[#56D5DB] hover:bg-[#3fc4ca] text-white"
          >
            {mode === "now" ? "발송" : "예약"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
