import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useState, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Heart, Baby, Shuffle, X, FileText, BookOpenText } from "lucide-react";

interface PersonData {
  name: string;
  gender: string;
  birthYear: string;
  occupation: string;
}

interface NameChangeData {
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
    { previousName: "", koreanName: "", chineseName: "", changeYear: "" }
  ]);
  const [evaluationKoreanName, setEvaluationKoreanName] = useState("");
  const [evaluationChineseName, setEvaluationChineseName] = useState("");
  const [reason, setReason] = useState("");
  const [depositorName, setDepositorName] = useState("");
  const [consultationTime, setConsultationTime] = useState("");
  const [familyPolicyDialogOpen, setFamilyPolicyDialogOpen] = useState(false);
  const isClosingFromBackButton = useRef(false);
  const familyPolicyDialogOpenRef = useRef(false);

  // ref를 state와 동기화
  useEffect(() => {
    familyPolicyDialogOpenRef.current = familyPolicyDialogOpen;
  }, [familyPolicyDialogOpen]);

  // 뒤로 가기 버튼으로 가족 상담 원칙 다이얼로그 닫기
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const modalState = event.state?.modal;
      
      // familyPolicy가 열려있고, state가 familyPolicy가 아니면 (consultation 또는 null) 닫음
      if (familyPolicyDialogOpenRef.current && modalState !== "familyPolicy") {
        isClosingFromBackButton.current = true;
        setFamilyPolicyDialogOpen(false);
      }
    };

    window.addEventListener("popstate", handlePopState);
    
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []); // 의존성 배열 비움 - 항상 최신 ref 값을 참조

  const openFamilyPolicyDialog = () => {
    setFamilyPolicyDialogOpen(true);
    // 고유 ID를 저장하여 뒤로 가기 버튼으로 닫을 수 있게 함
    window.history.pushState({ modal: "familyPolicy" }, "");
  };

  const closeFamilyPolicyDialog = () => {
    setFamilyPolicyDialogOpen(false);
    // X 버튼이나 외부 클릭으로 닫을 때만 히스토리를 조용히 정리 (consultation state로 복원)
    if (!isClosingFromBackButton.current && window.history.state?.modal === "familyPolicy") {
      window.history.replaceState({ modal: "consultation" }, "", window.location.pathname);
    }
    isClosingFromBackButton.current = false;
  };

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
      nameChangeData[i] || { previousName: "", koreanName: "", chineseName: "", changeYear: "" }
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
        {type === "naming" && (
          <div className="space-y-1">
            <p className="text-orange-600 dark:text-orange-400 font-bold">
              이름감명시 현재 이름에 대한 이름분석 필수
            </p>
            <p className="text-base text-muted-foreground">
              (새이름이 현재 이름운보다 작거나 너무 커도 안좋습니다)
            </p>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 등본상 가족 인원 - 이름분석에서만 표시 */}
        {type === "analysis" && (
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
            <p className="text-base text-orange-600 dark:text-orange-400 mt-2">
              저희 협회는 <span className="font-bold">등본상 가족 상담 원칙</span>으로 상담진행해 드리고 있습니다{" "}
              <button
                type="button"
                onClick={openFamilyPolicyDialog}
                className="font-semibold text-[#0f766e] dark:text-[#58C4C4] hover:underline"
                data-testid="button-family-policy-form"
              >
                자세히 보기 →
              </button>
            </p>
          </div>
        )}

        {/* 각 인원별 정보 입력 */}
        {peopleData.map((person, index) => (
          <Card key={index} className="p-4 space-y-4">
            {type === "analysis" && <h4 className="text-lg font-semibold text-foreground">{index + 1}번째 분석 대상</h4>}
            
            <div className="space-y-2">
              <Label htmlFor={`name-${index}`} className="text-lg">
                {type === "naming" ? "현재 이름" : "이름"}
              </Label>
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
                      (한자 자체로 꼭 보내주세요. 같은 뜻을 가진 한자가 많이 있는 경우가 있어서 그렇습니다.)
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
                (한자 자체로 꼭 보내주세요. 같은 뜻을 가진 한자가 많이 있는 경우가 있어서 그렇습니다.)
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
              {type === "naming" ? (
                <p className="text-muted-foreground">상담비: 이름분석 6만원 + 이름감명 2만원(개당)</p>
              ) : (
                <p className="text-muted-foreground">상담비: 명당 6만원 | 등본상 가족 전체 명수로 입금</p>
              )}
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
              {type === "naming" ? (
                <p>1시간 10분(감명 개수에 따라 변동)</p>
              ) : (
                <>
                  <p>1인 - 1시간, 2인 - 1시간 30분,</p>
                  <p>3인 - 2시간, 4인이상 - 2시간 30분</p>
                </>
              )}
            </div>
          </Card>
        </div>

        <Button type="submit" className="w-full text-lg" size="lg" data-testid="button-submit">
          상담 신청하기
        </Button>
      </form>

      {/* 등본상 가족 상담 원칙 다이얼로그 */}
      <Dialog open={familyPolicyDialogOpen} onOpenChange={(open) => { if (!open) closeFamilyPolicyDialog(); }}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto bg-neutral-950 border-[#81D8D0]/30">
          <DialogHeader>
            <DialogTitle className="text-2xl md:text-3xl font-semibold text-center text-[#81D8D0]">
              등본상 가족 상담 원칙
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-8 px-2">
            <p className="text-lg md:text-lg text-center text-white/70 leading-relaxed">
              가족은 운명 공동체로, 서로의 이름운의 영향을 강하게 주고 받습니다.
            </p>

            {/* 3개 카드 */}
            <div className="grid gap-4 md:grid-cols-3">
              {/* 결혼 카드 */}
              <div className="glass rounded-2xl p-5 border border-[#81D8D0]/40">
                <div className="flex items-center gap-3 mb-3">
                  <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#81D8D0]/10">
                    <Heart className="h-5 w-5 text-[#81D8D0]" />
                  </div>
                  <h3 className="text-[21px] md:text-[22px] font-semibold text-white">
                    <span className="font-bold">결혼</span>, 혼의 연결
                  </h3>
                </div>
                <ul className="space-y-1.5 text-lg md:text-lg text-white leading-relaxed list-disc pl-5">
                  <li>'결혼'은 본래 '혼(魂)을 연결한다'는 뜻에서 유래</li>
                  <li>일심동체처럼 몸과 마음이 강력히 연결</li>
                </ul>
              </div>

              {/* 자녀 카드 */}
              <div className="glass rounded-2xl p-5 border border-[#81D8D0]/40">
                <div className="flex items-center gap-3 mb-3">
                  <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#81D8D0]/10">
                    <Baby className="h-5 w-5 text-[#81D8D0]" />
                  </div>
                  <h3 className="text-[21px] md:text-[22px] font-semibold text-white">
                    <span className="font-bold">자녀</span>, 혈육
                  </h3>
                </div>
                <ul className="space-y-1.5 text-lg md:text-lg text-white leading-relaxed list-disc pl-5">
                  <li>혈육: 피로 연결되고 살로 이어진 관계</li>
                  <li>분리된 듯 보이나 결코 분리될 수 없는 특별한 연대</li>
                </ul>
              </div>

              {/* 이름운 카드 */}
              <div className="glass rounded-2xl p-5 border border-[#81D8D0]/40">
                <div className="flex items-center gap-3 mb-3">
                  <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[#81D8D0]/10">
                    <Shuffle className="h-5 w-5 text-[#81D8D0]" />
                  </div>
                  <h3 className="text-[21px] md:text-[22px] font-semibold text-white">
                    <span className="font-bold">이름운</span>, 서로에게 영향
                  </h3>
                </div>
                <ul className="space-y-1.5 text-lg md:text-lg text-white leading-relaxed list-disc pl-5">
                  <li>부부의 이름운은 결혼과 함께 상호작용</li>
                  <li>자녀의 초년·총·흉운 → 부모의 중년운에 영향</li>
                  <li>부모의 중년·총·흉운 → 자녀의 초년운에 영향</li>
                </ul>
              </div>
            </div>

            {/* 특징 블록 */}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="glass rounded-2xl p-6 border border-[#81D8D0]/40">
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-1.5 w-16 rounded-full bg-[#81D8D0]" />
                  <h3 className="text-[21px] md:text-[22px] font-semibold text-[#81D8D0]">
                    이름은 '소리'보다 '글자'가 강합니다
                  </h3>
                </div>
                <ul className="space-y-1.5 text-lg md:text-lg text-white leading-relaxed list-disc pl-5">
                  <li>이름에는 소리 에너지도 있지만, 그보다 훨씬 강력한 것이 바로 글자 에너지입니다.</li>
                  <li>소리에너지는 뱉어내는 순간 사라지지만, 글자에너지는 폐기하기 전까지 계속 존재합니다.</li>
                </ul>
              </div>

              <div className="glass rounded-2xl p-6 border border-[#81D8D0]/40">
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-1.5 w-16 rounded-full bg-[#81D8D0]" />
                  <h3 className="text-[21px] md:text-[22px] font-semibold text-[#81D8D0]">
                    등본상 가족은 더 깊게 연결됩니다
                  </h3>
                </div>
                <ul className="space-y-1.5 text-lg md:text-lg text-white leading-relaxed list-disc pl-5">
                  <li>법적 에너지권 안에서 글자 에너지로 깊게 연결된 등본상 가족은 더욱 긴밀하며 상당한 영향을 미칩니다.</li>
                </ul>
              </div>
            </div>

            {/* 하이라이트 안내 */}
            <div className="rounded-2xl p-6 text-center bg-[#81D8D0]/8 shadow-[0_0_25px_rgba(129,216,208,0.2)]">
              <p className="text-lg md:text-xl font-semibold tracking-wide leading-relaxed text-[#81D8D0]">
                💠 정확한 이름분석 상담을 받으시려면,<br />등본상 가족 전체의 이름 분석이 반드시 필요합니다.
              </p>
            </div>

            {/* 추천 글 */}
            <div>
              <h2 className="text-[21px] md:text-[22px] font-semibold text-center flex items-center justify-center gap-2 text-[#81D8D0] mb-4">
                <BookOpenText className="h-6 w-6" /> 같이 보시면 좋은 글
              </h2>
              <div className="grid gap-4 md:grid-cols-2">
                <a 
                  href="https://blog.naver.com/whats_ur_name_777/223450662435" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="glass rounded-2xl p-5 border border-[#81D8D0]/40 hover-elevate active-elevate-2 cursor-pointer block"
                  data-testid="link-blog-1"
                >
                  <h3 className="text-[21px] md:text-[22px] font-semibold leading-snug mb-2 text-white">
                    "아빠가 바람이 났습니다" 엄마 이름 때문에
                  </h3>
                  <p className="text-lg md:text-lg text-white leading-relaxed">
                    🤦‍♀️ 아빠가 바람이 났습니다. 네이버에 치면 나오는 유명인입니다. 아빠의 바람으로 집안이 엉망진창되었습...
                  </p>
                </a>

                <a 
                  href="https://blog.naver.com/whats_ur_name_777/223924993144" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="glass rounded-2xl p-5 border border-[#81D8D0]/40 hover-elevate active-elevate-2 cursor-pointer block"
                  data-testid="link-blog-2"
                >
                  <h3 className="text-[21px] md:text-[22px] font-semibold leading-snug mb-2 text-white">
                    개명한 이름 때문에 아빠가 돌아가시고, 소송도 걸리고
                  </h3>
                  <p className="text-lg md:text-lg text-white leading-relaxed">
                    어느날 인스타로 디엠이 왔습니다. 너무 살기 힘들다며 죽고 싶다고까지 했습니다. 젊으신 분이 그러시면 ...
                  </p>
                </a>
              </div>
            </div>

          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
