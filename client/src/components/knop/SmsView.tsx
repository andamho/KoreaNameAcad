// KNOP 안내문자: 자주 쓰는 안내 문구(템플릿) 관리 + 필요할 때 즉시 발송
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { knopApi, type SmsTemplate } from "@/lib/knopApi";
import { SendSmsDialog } from "./dialogs";

export function SmsView() {
  const qc = useQueryClient();
  const [sendOpen, setSendOpen] = useState(false);

  const { data: templates } = useQuery<SmsTemplate[]>({
    queryKey: ["knop-sms-templates"],
    queryFn: () => knopApi.listSmsTemplates(),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["knop-sms-templates"] });

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">안내문자</h2>
          <p className="text-sm text-gray-400">자주 쓰는 안내 문구(템플릿) 관리 · 필요할 때 바로 발송</p>
        </div>
        <Button onClick={() => setSendOpen(true)} className="bg-[#56D5DB] hover:bg-[#3fc4ca] text-white shrink-0">
          <Send className="w-4 h-4 mr-1" /> 새 문자
        </Button>
      </div>

      <div className="space-y-2">
        {templates && templates.length === 0 && (
          <p className="text-sm text-gray-400 py-6 text-center">템플릿이 없습니다.</p>
        )}
        {templates?.map((t) => (
          <TemplateRow key={t.id} template={t} onChanged={refresh} />
        ))}
      </div>

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
