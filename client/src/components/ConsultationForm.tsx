import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

interface ConsultationFormProps {
  type: "analysis" | "naming";
}

export function ConsultationForm({ type }: ConsultationFormProps) {
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    name: "",
    birthDate: "",
    phone: "",
    email: "",
    message: "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log('Form submitted:', formData);
    toast({
      title: "신청이 접수되었습니다",
      description: "곧 담당자가 연락드리겠습니다.",
    });
    setFormData({ name: "", birthDate: "", phone: "", email: "", message: "" });
  };

  const title = type === "analysis" ? "이름 분석 상담 신청" : "작명 상담 신청";

  return (
    <Card className="p-6 md:p-8 space-y-6">
      <div className="space-y-2">
        <h3 className="text-2xl font-bold text-foreground">{title}</h3>
        <p className="text-muted-foreground tracking-wide">
          {type === "analysis" 
            ? "현재 이름에 대한 전문적인 분석을 받아보세요."
            : "새로운 이름을 위한 상담을 시작하세요."}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name" data-testid="label-name">
            {type === "analysis" ? "분석할 이름" : "성함"}
          </Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="홍길동"
            required
            data-testid="input-name"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="birthDate" data-testid="label-birthdate">생년월일</Label>
          <Input
            id="birthDate"
            type="date"
            value={formData.birthDate}
            onChange={(e) => setFormData({ ...formData, birthDate: e.target.value })}
            required
            data-testid="input-birthdate"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone" data-testid="label-phone">연락처</Label>
          <Input
            id="phone"
            type="tel"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            placeholder="010-1234-5678"
            required
            data-testid="input-phone"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email" data-testid="label-email">이메일</Label>
          <Input
            id="email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            placeholder="example@email.com"
            required
            data-testid="input-email"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="message" data-testid="label-message">상담 내용</Label>
          <Textarea
            id="message"
            value={formData.message}
            onChange={(e) => setFormData({ ...formData, message: e.target.value })}
            placeholder="상담받고 싶은 내용을 자유롭게 작성해주세요."
            rows={4}
            data-testid="input-message"
          />
        </div>

        <Button type="submit" className="w-full" data-testid="button-submit">
          상담 신청하기
        </Button>
      </form>
    </Card>
  );
}
