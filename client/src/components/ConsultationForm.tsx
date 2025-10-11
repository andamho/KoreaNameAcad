import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface PersonData {
  name: string;
  gender: string;
  birthYear: string;
  occupation: string;
}

interface NameChangeData {
  currentName: string;
  previousName: string;
  koreanName: string;
  chineseName: string;
  changeYear: string;
}

interface ConsultationFormProps {
  type: "analysis" | "naming";
  onSuccess?: () => void;
}

export function ConsultationForm({ type, onSuccess }: ConsultationFormProps) {
  const { toast } = useToast();
  const [numPeople, setNumPeople] = useState<number>(1);
  const [peopleData, setPeopleData] = useState<PersonData[]>([
    { name: "", gender: "", birthYear: "", occupation: "" }
  ]);
  const [registrationDocument, setRegistrationDocument] = useState<File | null>(null);
  const [phone, setPhone] = useState("");
  const [hasNameChange, setHasNameChange] = useState<string>("no");
  const [numNameChanges, setNumNameChanges] = useState<number>(1);
  const [nameChangeData, setNameChangeData] = useState<NameChangeData[]>([
    { currentName: "", previousName: "", koreanName: "", chineseName: "", changeYear: "" }
  ]);
  const [evaluationKoreanName, setEvaluationKoreanName] = useState("");
  const [evaluationChineseName, setEvaluationChineseName] = useState("");
  const [reason, setReason] = useState("");
  const [depositorName, setDepositorName] = useState("");
  const [consultationTime, setConsultationTime] = useState("");

  const handleNumPeopleChange = (num: number) => {
    setNumPeople(num);
    const newPeopleData = Array.from({ length: num }, (_, i) => 
      peopleData[i] || { name: "", gender: "", birthYear: "", occupation: "" }
    );
    setPeopleData(newPeopleData);
  };

  const handleNumNameChangesChange = (num: number) => {
    setNumNameChanges(num);
    const newNameChangeData = Array.from({ length: num }, (_, i) => 
      nameChangeData[i] || { currentName: "", previousName: "", koreanName: "", chineseName: "", changeYear: "" }
    );
    setNameChangeData(newNameChangeData);
  };

  const updatePersonData = (index: number, field: keyof PersonData, value: string) => {
    const newPeopleData = [...peopleData];
    newPeopleData[index] = { ...newPeopleData[index], [field]: value };
    setPeopleData(newPeopleData);
  };

  const updateNameChangeData = (index: number, field: keyof NameChangeData, value: string) => {
    const newNameChangeData = [...nameChangeData];
    newNameChangeData[index] = { ...newNameChangeData[index], [field]: value };
    setNameChangeData(newNameChangeData);
  };

  const submitMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await apiRequest("POST", "/api/consultations", data);
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "신청이 접수되었습니다",
        description: "곧 담당자가 연락드리겠습니다.",
      });
      if (onSuccess) {
        setTimeout(() => onSuccess(), 500);
      }
    },
    onError: (error: any) => {
      console.error("Submission error:", error);
      toast({
        title: "신청 실패",
        description: error?.message || "다시 시도해주세요.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    let fileData: { fileName?: string; fileData?: string; fileType?: string } = {};
    
    if (registrationDocument) {
      const maxSize = 5 * 1024 * 1024; // 5MB
      if (registrationDocument.size > maxSize) {
        toast({
          title: "파일 크기 초과",
          description: "파일 크기는 5MB 이하여야 합니다.",
          variant: "destructive",
        });
        return;
      }

      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(registrationDocument);
        });
        
        // Extract pure base64 (remove data:image/png;base64, prefix)
        const base64Data = dataUrl.split(',')[1];
        
        fileData = {
          fileName: registrationDocument.name,
          fileData: base64Data,
          fileType: registrationDocument.type,
        };
      } catch (error) {
        console.error("File reading error:", error);
        toast({
          title: "파일 업로드 실패",
          description: "파일을 읽을 수 없습니다. 다시 시도해주세요.",
          variant: "destructive",
        });
        return;
      }
    }
    
    const consultationData = {
      type,
      numPeople,
      peopleData,
      phone,
      hasNameChange,
      numNameChanges: hasNameChange === "yes" ? numNameChanges : undefined,
      nameChangeData: hasNameChange === "yes" ? nameChangeData : undefined,
      evaluationKoreanName: type === "naming" ? evaluationKoreanName : undefined,
      evaluationChineseName: type === "naming" ? evaluationChineseName : undefined,
      reason,
      depositorName,
      consultationTime,
      ...fileData,
    };

    submitMutation.mutate(consultationData);
  };

  const formTitle = type === "naming" ? "이름감명" : "이름분석 운명상담 신청";

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className="text-2xl font-bold text-foreground">{formTitle}</h3>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 등본상 가족 인원 */}
        <div className="space-y-3">
          <Label className="text-lg font-semibold">등본상 가족 인원 <span className="text-base font-normal text-muted-foreground">(해당 인원을 체크하세요)</span></Label>
          <div className="flex gap-2 flex-wrap">
            {[1, 2, 3, 4, 5, 6].map((num) => (
              <Button
                key={num}
                type="button"
                variant={numPeople === num ? "default" : "outline"}
                size="sm"
                onClick={() => handleNumPeopleChange(num)}
                data-testid={`button-people-${num}`}
                className="w-12 h-12 text-lg"
              >
                {num}
              </Button>
            ))}
          </div>
          <p className="text-base text-muted-foreground mt-2">
            저희 협회는 <span className="font-bold text-foreground">등본상 가족 상담 원칙</span>으로 상담진행해 드리고 있습니다{" "}
            <a 
              href="/family-policy" 
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-[#0f766e] dark:text-[#58C4C4] hover:underline"
              data-testid="link-family-policy-form"
            >
              자세히 보기 →
            </a>
          </p>
        </div>

        {/* 각 인원별 정보 입력 */}
        {peopleData.map((person, index) => (
          <Card key={index} className="p-4 space-y-4">
            <h4 className="text-lg font-semibold text-foreground">{index + 1}번째 분석 대상</h4>
            
            <div className="space-y-2">
              <Label htmlFor={`name-${index}`} className="text-lg">분석할 이름</Label>
              <Input
                id={`name-${index}`}
                value={person.name}
                onChange={(e) => updatePersonData(index, "name", e.target.value)}
                placeholder="홍길동"
                required
                data-testid={`input-name-${index}`}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`gender-${index}`} className="text-lg">성별</Label>
              <RadioGroup
                value={person.gender}
                onValueChange={(value) => updatePersonData(index, "gender", value)}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="male" id={`male-${index}`} data-testid={`radio-male-${index}`} />
                  <Label htmlFor={`male-${index}`} className="text-lg font-normal cursor-pointer">남성</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="female" id={`female-${index}`} data-testid={`radio-female-${index}`} />
                  <Label htmlFor={`female-${index}`} className="text-lg font-normal cursor-pointer">여성</Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`birthYear-${index}`} className="text-lg">태어난 연도</Label>
              <Input
                id={`birthYear-${index}`}
                value={person.birthYear}
                onChange={(e) => updatePersonData(index, "birthYear", e.target.value)}
                placeholder="1990"
                required
                data-testid={`input-birthyear-${index}`}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`occupation-${index}`} className="text-lg">하는 일</Label>
              <Input
                id={`occupation-${index}`}
                value={person.occupation}
                onChange={(e) => updatePersonData(index, "occupation", e.target.value)}
                placeholder="직업을 입력하세요"
                required
                data-testid={`input-occupation-${index}`}
              />
            </div>
          </Card>
        ))}

        {/* 주민등본 사진 첨부 */}
        <div className="space-y-2">
          <Label htmlFor="registration-document" className="text-lg">주민등본 사진 <span className="text-base font-normal text-muted-foreground">(정확한 한자 확인을 위해 반드시 첨부)</span></Label>
          <Input
            id="registration-document"
            type="file"
            accept="image/*"
            onChange={(e) => setRegistrationDocument(e.target.files?.[0] || null)}
            data-testid="input-registration-document"
            className="cursor-pointer"
          />
          {registrationDocument && (
            <p className="text-base text-muted-foreground">
              선택된 파일: {registrationDocument.name}
            </p>
          )}
        </div>

        {/* 연락처 */}
        <div className="space-y-2">
          <Label htmlFor="phone" className="text-lg">연락처</Label>
          <Input
            id="phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="010-1234-5678"
            required
            data-testid="input-phone"
          />
        </div>

        {/* 개명여부 */}
        <div className="space-y-3">
          <Label className="text-lg font-semibold">개명여부</Label>
          <RadioGroup
            value={hasNameChange}
            onValueChange={setHasNameChange}
            className="flex gap-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="yes" id="namechange-yes" data-testid="radio-namechange-yes" />
              <Label htmlFor="namechange-yes" className="text-lg font-normal cursor-pointer">예</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="no" id="namechange-no" data-testid="radio-namechange-no" />
              <Label htmlFor="namechange-no" className="text-lg font-normal cursor-pointer">아니오</Label>
            </div>
          </RadioGroup>
        </div>

        {/* 개명인원 선택 (예일 경우) */}
        {hasNameChange === "yes" && (
          <div className="space-y-6">
            <div className="space-y-3">
              <Label className="text-lg font-semibold">개명인원</Label>
              <div className="flex gap-2 flex-wrap">
                {[1, 2, 3, 4].map((num) => (
                  <Button
                    key={num}
                    type="button"
                    variant={numNameChanges === num ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleNumNameChangesChange(num)}
                    data-testid={`button-namechange-${num}`}
                    className="w-12 h-12 text-lg"
                  >
                    {num}
                  </Button>
                ))}
              </div>
            </div>

            {/* 각 개명인원별 정보 입력 */}
            {nameChangeData.map((data, index) => (
              <Card key={index} className="p-4 space-y-4">
                <h4 className="text-lg font-semibold text-foreground">{index + 1}번째 개명 정보</h4>

                <div className="space-y-2">
                  <Label htmlFor={`currentName-${index}`} className="text-lg">현재이름</Label>
                  <Input
                    id={`currentName-${index}`}
                    value={data.currentName}
                    onChange={(e) => updateNameChangeData(index, "currentName", e.target.value)}
                    placeholder="현재 사용하는 이름"
                    data-testid={`input-current-name-${index}`}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`previousName-${index}`} className="text-lg">개명전 이름</Label>
                  <Input
                    id={`previousName-${index}`}
                    value={data.previousName}
                    onChange={(e) => updateNameChangeData(index, "previousName", e.target.value)}
                    placeholder="개명 전 이름"
                    data-testid={`input-previous-name-${index}`}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor={`koreanName-${index}`} className="text-lg">한글이름</Label>
                    <Input
                      id={`koreanName-${index}`}
                      value={data.koreanName}
                      onChange={(e) => updateNameChangeData(index, "koreanName", e.target.value)}
                      placeholder="홍길동"
                      data-testid={`input-korean-name-${index}`}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`chineseName-${index}`} className="text-lg">한자이름</Label>
                    <Input
                      id={`chineseName-${index}`}
                      value={data.chineseName}
                      onChange={(e) => updateNameChangeData(index, "chineseName", e.target.value)}
                      placeholder="洪吉洞"
                      data-testid={`input-chinese-name-${index}`}
                    />
                  </div>
                </div>

                {index === 0 && (
                  <div className="bg-muted p-3 rounded-md">
                    <p className="text-base text-muted-foreground">
                      넓을 홍 길할 길 동녘 동 ❌<br />
                      洪吉東 ⭕<br />
                      (한자 자체로 꼭 보내주세요.<br />
                      같은 뜻을 가진 한자가 많이 있는<br />
                      경우가 있어서 그렇습니다.)
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor={`changeYear-${index}`} className="text-lg">개명년도</Label>
                  <Input
                    id={`changeYear-${index}`}
                    value={data.changeYear}
                    onChange={(e) => updateNameChangeData(index, "changeYear", e.target.value)}
                    placeholder="2020"
                    data-testid={`input-change-year-${index}`}
                  />
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* 감명받을 이름 (이름감명일 경우) */}
        {type === "naming" && (
          <Card className="p-4 space-y-4">
            <h4 className="font-semibold text-foreground">감명받을 이름</h4>
            
            <div className="space-y-2">
              <Label htmlFor="evaluation-korean-name" className="text-lg">한글이름</Label>
              <Input
                id="evaluation-korean-name"
                value={evaluationKoreanName}
                onChange={(e) => setEvaluationKoreanName(e.target.value)}
                placeholder="홍길동"
                data-testid="input-evaluation-korean-name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="evaluation-chinese-name" className="text-lg">한자이름</Label>
              <Input
                id="evaluation-chinese-name"
                value={evaluationChineseName}
                onChange={(e) => setEvaluationChineseName(e.target.value)}
                placeholder="洪吉洞"
                data-testid="input-evaluation-chinese-name"
              />
            </div>

            <div className="bg-muted p-3 rounded-md">
              <p className="text-base text-muted-foreground">
                넓을 홍 길할 길 동녘 동 ❌<br />
                洪吉東 ⭕<br />
                (한자 자체로 꼭 보내주세요.<br />
                같은 뜻을 가진 한자가 많이 있는<br />
                경우가 있어서 그렇습니다.)
              </p>
            </div>
          </Card>
        )}

        {/* 상담받고자 하는 이유 */}
        <div className="space-y-2">
          <Label htmlFor="reason" className="text-lg">상담받고자 하는 이유</Label>
          <Textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="상담을 받고자 하는 이유를 적어주세요"
            className="min-h-[100px]"
            data-testid="input-reason"
          />
        </div>

        {/* 입금자명 */}
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="depositor-name" className="text-lg">입금자명</Label>
            <Input
              id="depositor-name"
              value={depositorName}
              onChange={(e) => setDepositorName(e.target.value)}
              placeholder="입금하신 분의 성함을 입력하세요"
              required
              data-testid="input-depositor-name"
            />
          </div>
          <Card className="p-4 bg-muted">
            <div className="space-y-2 text-base">
              <p className="font-semibold text-foreground">와츠유어네임 이름연구협회 전용 입금계좌</p>
              <p className="text-foreground">농협 351 8205 8124 53</p>
              <p className="text-muted-foreground">상담비: 명당 6만원 | 등본상 가족 전체 명수로 입금</p>
            </div>
          </Card>
        </div>

        {/* 상담시간 */}
        <div className="space-y-3">
          <Label className="text-lg font-semibold">상담시간</Label>
          <RadioGroup
            value={consultationTime}
            onValueChange={setConsultationTime}
            className="flex gap-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="weekday" id="time-weekday" data-testid="radio-time-weekday" />
              <Label htmlFor="time-weekday" className="text-lg font-normal cursor-pointer">주중 2시</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="weekend" id="time-weekend" data-testid="radio-time-weekend" />
              <Label htmlFor="time-weekend" className="text-lg font-normal cursor-pointer">주말 2시</Label>
            </div>
          </RadioGroup>
          <Card className="p-4 bg-muted">
            <div className="text-base text-muted-foreground space-y-1">
              <p className="font-semibold text-foreground">※ 평균 상담 소요시간</p>
              <p>1인 - 1시간, 2인 - 1시간 30분,</p>
              <p>3인 - 2시간, 4인이상 - 2시간 30분</p>
            </div>
          </Card>
        </div>

        <Button type="submit" className="w-full text-lg" size="lg" data-testid="button-submit">
          상담 신청하기
        </Button>
      </form>
    </div>
  );
}
