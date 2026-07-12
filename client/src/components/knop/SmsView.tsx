// KNOP 문자 자동화: 예약/발송 목록 + 템플릿 관리
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Send, X, Clock, Check, Pencil, MessageSquare } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { knopApi, type ScheduledMessage, type SmsTemplate } from "@/lib/knopApi";
import { SendSmsDialog } from "./dialogs";
import { fmtDateTime } from "./lib";

function statusBadge(s: string) {
  if (s === "sent") return { label: "발송완료", cls: "bg-green-100 text-green-700 border-green-200", Icon: Check };
  if (s === "scheduled") return { label: "예약", cls: "bg-sky-100 text-sky-700 border-sky-200", Icon: Clock };
  if (s === "failed") return { label: "실패", cls: "bg-red-100 text-red-700 border-red-200", Icon: X };
  return { label: "취소", cls: "bg-gray-100 text-gray-500 border-gray-200", Icon: X };
}

export function SmsView() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [sendOpen, setSendOpen] = useState(false);
  const [tab, setTab] = useState<"messages" | "templates">("messages");

  const { data: messages } = useQuery<ScheduledMessage[]>({
    queryKey: ["knop-sms-messages"],
    queryFn: () => knopApi.listSmsMessages(),
  });
  const { data: templates } = useQuery<SmsTemplate[]>({
    queryKey: ["knop-sms-templates"],
    queryFn: () => knopApi.listSmsTemplates(),
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["knop-sms-messages"] });
    qc.invalidateQueries({ queryKey: ["knop-sms-templates"] });
  };

  const cancelMut = useMutation({
    mutationFn: (id: string) => knopApi.cancelSmsMessage(id),
    onSuccess: () => {
      refresh();
      toast({ title: "예약 취소됨" });
    },
  });

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">문자</h2>
          <p className="text-sm text-gray-400">템플릿으로 즉시/예약 발송 · 예약은 시각이 되면 자동 발송</p>
        </div>
        <Button onClick={() => setSendOpen(true)} className="bg-[#56D5DB] hover:bg-[#3fc4ca] text-white shrink-0">
          <Send className="w-4 h-4 mr-1" /> 새 문자
        </Button>
      </div>

      <div className="flex items-center gap-1 border-b border-gray-200">
        {([
          { k: "messages", label: "예약 · 발송", icon: MessageSquare },
          { k: "templates", label: "템플릿", icon: Pencil },
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

      {tab === "messages" && (
        <div className="space-y-2">
          {messages && messages.length === 0 && (
            <p className="text-sm text-gray-400 py-6 text-center">보낸/예약된 문자가 없습니다.</p>
          )}
          {messages?.map((m) => {
            const sb = statusBadge(m.status);
            return (
              <Card key={m.id} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className={sb.cls}>
                        {sb.label}
                      </Badge>
                      <span className="text-sm text-gray-700">{m.phone}</span>
                      <span className="text-xs text-gray-400">
                        {m.status === "sent"
                          ? `발송 ${fmtDateTime(m.sentAt || m.scheduledAt)}`
                          : `예약 ${fmtDateTime(m.scheduledAt)}`}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 whitespace-pre-wrap line-clamp-3">{m.content}</p>
                    {m.error && <p className="text-xs text-red-500 mt-1">{m.error}</p>}
                  </div>
                  {m.status === "scheduled" && (
                    <Button variant="outline" size="sm" onClick={() => cancelMut.mutate(m.id)} className="shrink-0">
                      취소
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {tab === "templates" && (
        <div className="space-y-2">
          {templates?.map((t) => (
            <TemplateRow key={t.id} template={t} onChanged={refresh} />
          ))}
        </div>
      )}

      <SendSmsDialog open={sendOpen} onOpenChange={setSendOpen} onSent={refresh} />
    </div>
  );
}

function TemplateRow({ template, onChanged }: { template: SmsTemplate; onChanged: () => void }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(template.content);

  const saveMut = useMutation({
    mutationFn: () => knopApi.updateSmsTemplate(template.id, { content }),
    onSuccess: () => {
      setEditing(false);
      onChanged();
      toast({ title: "템플릿 저장됨" });
    },
  });

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-800">{template.name}</span>
          <Badge variant="outline" className="text-gray-400">
            {template.category}
          </Badge>
        </div>
        {!editing && (
          <button className="text-xs text-[#3fc4ca] hover:underline" onClick={() => setEditing(true)}>
            수정
          </button>
        )}
      </div>
      {editing ? (
        <div className="space-y-2">
          <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={5} className="text-sm" />
          <div className="flex justify-end gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setContent(template.content);
                setEditing(false);
              }}
            >
              취소
            </Button>
            <Button size="sm" onClick={() => saveMut.mutate()} className="bg-[#56D5DB] hover:bg-[#3fc4ca] text-white">
              저장
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-500 whitespace-pre-wrap">{template.content}</p>
      )}
    </Card>
  );
}
