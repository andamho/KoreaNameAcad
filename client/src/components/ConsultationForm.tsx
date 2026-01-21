import { useState, useEffect, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetClose } from "@/components/ui/sheet";
import { X, FileText, Copy, Check, ChevronDown } from "lucide-react";

const formLogoImage = "/form-logo.png";
const formBgImage = "/attached_assets/bg.png_1768976268783.png";

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
  const [currentStep, setCurrentStep] = useState(1);
  const [numPeople, setNumPeople] = useState<number>(1);
  const [peopleData, setPeopleData] = useState<PersonData[]>([
    { name: "", gender: "여성", birthYear: "", occupation: "" }
  ]);
  const [registrationDocument, setRegistrationDocument] = useState<File | null>(null);
  const [phone, setPhone] = useState("");
  const [hasNameChange, setHasNameChange] = useState<string>("아니오");
  const [numNameChanges, setNumNameChanges] = useState<number>(1);
  const [nameChangeData, setNameChangeData] = useState<NameChangeData[]>([
    { previousName: "", koreanName: "", chineseName: "", changeYear: "" }
  ]);
  const [evaluationKoreanName, setEvaluationKoreanName] = useState("");
  const [evaluationChineseName, setEvaluationChineseName] = useState("");
  const [reason, setReason] = useState("");
  const [referralSource, setReferralSource] = useState("");
  const [depositorName, setDepositorName] = useState("");
  const [consultationTime, setConsultationTime] = useState("");
  const [familyPolicyDialogOpen, setFamilyPolicyDialogOpen] = useState(false);
  const [accountCopied, setAccountCopied] = useState(false);
  const [showDuration, setShowDuration] = useState(false);

  const PRICE_PER_PERSON = 60000;
  const totalPrice = numPeople * PRICE_PER_PERSON;

  const handleCopyAccount = async () => {
    try {
      await navigator.clipboard.writeText("농협 351 8205 8124 53");
      setAccountCopied(true);
      toast({
        title: "복사 완료",
        description: "계좌번호가 복사되었습니다.",
      });
      setTimeout(() => setAccountCopied(false), 2000);
    } catch (err) {
      toast({
        title: "복사 실패",
        description: "계좌번호를 복사할 수 없습니다.",
        variant: "destructive",
      });
    }
  };

  const handleNumPeopleChange = (num: number) => {
    setNumPeople(num);
    const newPeopleData = Array.from({ length: num }, (_, i) => 
      peopleData[i] || { name: "", gender: "여성", birthYear: "", occupation: "" }
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

  const handleSubmit = async () => {
    let fileData: { fileName?: string; fileData?: string; fileType?: string } = {};
    
    if (registrationDocument) {
      const maxSize = 5 * 1024 * 1024;
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
      hasNameChange: hasNameChange === "예" ? "yes" : "no",
      numNameChanges: hasNameChange === "예" ? numNameChanges : undefined,
      nameChangeData: hasNameChange === "예" ? nameChangeData : undefined,
      evaluationKoreanName: type === "naming" ? evaluationKoreanName : undefined,
      evaluationChineseName: type === "naming" ? evaluationChineseName : undefined,
      reason,
      referralSource: referralSource || undefined,
      depositorName,
      consultationTime,
      ...fileData,
    };

    submitMutation.mutate(consultationData);
  };

  const goToStep = (step: number) => {
    setCurrentStep(step);
  };

  const referralOptions = [
    "지인소개", "블로그", "인스타", "틱톡", 
    "유튜브", "페이스북", "쓰레드", "크몽"
  ];

  const formTitle = type === "naming" ? "이름감명" : "이름분석 운명상담";

  return (
    <div className="kna-consultation-form space-y-0 pb-28">
      {/* 상단 헤더 + 진행바 */}
      <div className="sticky top-0 z-40 bg-white border-b border-slate-100 shadow-sm -mx-6 -mt-6 px-6 pt-6 pb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-xs text-slate-500 font-bold tracking-widest uppercase mb-1">
              {type === "naming" ? "Name Evaluation" : "Name Analysis"}
            </div>
            <div className="text-2xl form-title-font font-bold tracking-tight text-slate-900">{formTitle}</div>
          </div>
        </div>

        <div className="flex items-center justify-between text-sm text-slate-500 mb-2 font-medium">
          <span className={currentStep === 1 ? "font-bold text-slate-900" : ""}>1. 기본정보</span>
          <span className={currentStep === 2 ? "font-bold text-slate-900" : ""}>2. 상담내용</span>
          <span className={currentStep === 3 ? "font-bold text-slate-900" : ""}>3. 결제/일정</span>
        </div>
        <div className="h-1.5 rounded-full bg-slate-200/60 overflow-hidden backdrop-blur-sm">
          <div 
            className="h-full rounded-full bg-tiffany transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
            style={{ width: currentStep === 1 ? '33.333%' : currentStep === 2 ? '66.666%' : '100%' }}
          />
        </div>
      </div>

      {/* Step 1: 기본정보 */}
      {currentStep === 1 && (
        <div className="space-y-8 pt-8 form-animate-fade-in">
          {/* 가족 상담 원칙 안내 */}
          {type === "analysis" && (
            <div className="rounded-3xl bg-white/60 border border-tiffany-light p-6 shadow-lg backdrop-blur-md">
              <div className="flex flex-col gap-4">
                <div className="flex items-start gap-4">
                  <div className="mt-1 w-6 h-6 rounded-full bg-tiffany text-white flex items-center justify-center text-sm font-bold shrink-0 shadow-sm">!</div>
                  <div className="text-lg text-slate-800 font-medium leading-relaxed form-title-font">
                    저희 협회는 <span className="font-bold text-tiffany-dark underline underline-offset-4 decoration-tiffany/50">등본상 가족 상담 원칙</span>으로<br/>
                    진행해 드리고 있습니다.
                  </div>
                </div>
                <button 
                  type="button"
                  onClick={() => setFamilyPolicyDialogOpen(true)}
                  className="self-start ml-10 text-xs font-bold text-tiffany-dark bg-tiffany-light/80 border border-tiffany/20 px-4 py-2 rounded-full hover:bg-tiffany-light transition flex items-center gap-1"
                  data-testid="button-family-policy-form"
                >
                  원칙 자세히 보기 <span className="text-[10px]">›</span>
                </button>
              </div>
            </div>
          )}

          {/* 등본상 가족 인원 */}
          <div className="glass-card rounded-3xl p-8">
            {type === "analysis" && (
              <div className="mt-2">
                <div className="text-xl form-title-font font-bold text-slate-900 mb-4">등본상 가족 인원</div>
                <div className="grid grid-cols-6 gap-2">
                  {[1, 2, 3, 4, 5, 6].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => handleNumPeopleChange(num)}
                      data-testid={`button-people-${num}`}
                      className={`rounded-xl border px-0 py-3 text-lg font-bold transition ${
                        numPeople === num 
                          ? "bg-tiffany text-white border-tiffany shadow-md scale-105" 
                          : "bg-white/60 text-slate-500 border-slate-200 hover:bg-white"
                      }`}
                    >
                      {num}
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-sm text-slate-500 font-medium">해당 인원을 체크하세요. (최대 6명)</p>
              </div>
            )}

            {/* 각 인원별 정보 입력 */}
            {peopleData.map((person, index) => (
              <div key={index} className={`${index === 0 ? 'mt-6' : 'mt-10 border-t border-slate-200/50 pt-10'} form-animate-fade-in`}>
                <div className="flex items-center justify-between mb-6">
                  <div className="text-lg form-title-font font-bold text-slate-800">
                    {type === "analysis" ? `${index + 1}번째 분석 대상` : "현재 정보"}
                  </div>
                </div>
                <div className="space-y-6">
                  <div>
                    <label className="text-base font-bold text-slate-600 block mb-2">
                      {type === "naming" ? "현재 이름" : "이름"}
                    </label>
                    <input 
                      className="w-full rounded-2xl border border-slate-200 bg-white/50 px-5 py-4 text-lg form-focus-ring backdrop-blur-sm" 
                      placeholder="예: 홍길동"
                      value={person.name}
                      onChange={(e) => updatePersonData(index, "name", e.target.value)}
                      data-testid={`input-name-${index}`}
                    />
                  </div>
                  <div>
                    <label className="text-base font-bold text-slate-600 block mb-2">성별</label>
                    <div className="grid grid-cols-2 gap-3">
                      {["여성", "남성"].map((gender) => (
                        <button
                          key={gender}
                          type="button"
                          onClick={() => updatePersonData(index, "gender", gender)}
                          className={`rounded-2xl border px-5 py-3.5 text-lg font-bold transition ${
                            person.gender === gender
                              ? "bg-tiffany text-white border-tiffany shadow-lg shadow-tiffany/20 scale-[1.01]"
                              : "bg-white/60 text-slate-500 border-slate-200 hover:bg-white"
                          }`}
                          data-testid={`radio-${gender}-${index}`}
                        >
                          {gender}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-base font-bold text-slate-600 block mb-2">생년</label>
                      <input 
                        className="w-full rounded-2xl border border-slate-200 bg-white/50 px-5 py-4 text-lg form-focus-ring backdrop-blur-sm" 
                        placeholder="1990" 
                        inputMode="numeric"
                        value={person.birthYear}
                        onChange={(e) => updatePersonData(index, "birthYear", e.target.value)}
                        data-testid={`input-birthyear-${index}`}
                      />
                    </div>
                    <div>
                      <label className="text-base font-bold text-slate-600 block mb-2">직업</label>
                      <input 
                        className="w-full rounded-2xl border border-slate-200 bg-white/50 px-5 py-4 text-lg form-focus-ring backdrop-blur-sm" 
                        placeholder="입력"
                        value={person.occupation}
                        onChange={(e) => updatePersonData(index, "occupation", e.target.value)}
                        data-testid={`input-occupation-${index}`}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* 개명 이력 */}
            <div className="pt-10 mt-10 border-t border-slate-200/60">
              <label className="text-xl form-title-font font-bold text-slate-900 block mb-5">개명 이력이 있나요?</label>
              <div className="grid grid-cols-2 gap-3">
                {["아니오", "예"].map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setHasNameChange(option)}
                    className={`rounded-2xl border px-6 py-3.5 text-lg font-bold transition ${
                      hasNameChange === option
                        ? "bg-tiffany text-white border-tiffany shadow-lg shadow-tiffany/30 scale-[1.01]"
                        : "bg-white/80 text-slate-500 border-slate-200 hover:bg-white"
                    }`}
                    data-testid={`radio-namechange-${option}`}
                  >
                    {option}
                  </button>
                ))}
              </div>

              {/* 개명 인원 선택 */}
              {hasNameChange === "예" && (
                <div className="mt-10 pt-10 border-t border-slate-200/60 form-animate-fade-in">
                  <h3 className="text-lg font-bold text-slate-800 mb-4">개명 인원 선택</h3>
                  <div className="grid grid-cols-4 gap-2 mb-8">
                    {[1, 2, 3, 4].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => handleNumNameChangesChange(num)}
                        data-testid={`button-namechange-${num}`}
                        className={`rounded-xl border px-0 py-3 text-lg font-bold transition ${
                          numNameChanges === num 
                            ? "bg-tiffany text-white border-tiffany shadow-md scale-105" 
                            : "bg-white/60 text-slate-500 border-slate-200 hover:bg-white"
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>

                  {/* 개명 정보 입력 */}
                  {nameChangeData.map((data, index) => (
                    <div key={index} className={`${index > 0 ? 'mt-10 border-t border-slate-200/50 pt-10' : ''} form-animate-fade-in`}>
                      <h4 className="text-lg form-title-font font-bold text-slate-800 mb-6">{index + 1}번째 개명 정보</h4>
                      <div className="space-y-6">
                        <div>
                          <label className="text-base font-bold text-slate-600 block mb-2">현재 이름</label>
                          <input 
                            className="w-full rounded-2xl border border-slate-200 bg-white/50 px-5 py-4 text-lg form-focus-ring" 
                            placeholder="현재 이름"
                            value={data.previousName}
                            onChange={(e) => updateNameChangeData(index, "previousName", e.target.value)}
                            data-testid={`input-previous-name-${index}`}
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-base font-bold text-slate-600 block mb-2">개명 전 한글</label>
                            <input 
                              className="w-full rounded-2xl border border-slate-200 bg-white/50 px-5 py-4 text-lg form-focus-ring" 
                              placeholder="홍길동"
                              value={data.koreanName}
                              onChange={(e) => updateNameChangeData(index, "koreanName", e.target.value)}
                              data-testid={`input-korean-name-${index}`}
                            />
                          </div>
                          <div>
                            <label className="text-base font-bold text-slate-600 block mb-2">개명 전 한자</label>
                            <input 
                              className="w-full rounded-2xl border border-slate-200 bg-white/50 px-5 py-4 text-lg form-focus-ring" 
                              placeholder="洪吉洞"
                              value={data.chineseName}
                              onChange={(e) => updateNameChangeData(index, "chineseName", e.target.value)}
                              data-testid={`input-chinese-name-${index}`}
                            />
                          </div>
                        </div>
                        {index === 0 && (
                          <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-100">
                            <p className="text-sm text-slate-600 leading-relaxed mb-2">
                              한자는 꼭 직접 입력해주세요. 같은 의미의 한자가 많기 때문에, 네이버에서 검색 후 복사해서 붙여 넣으시면 됩니다.
                            </p>
                            <a
                              href="https://hanja.dict.naver.com/#/main"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-semibold text-sm bg-[#03C75A] text-white shadow-sm transition-all duration-200 hover:bg-[#02b351]"
                              data-testid="link-naver-search"
                            >
                              네이버 한자사전 <span className="text-base">›</span>
                            </a>
                          </div>
                        )}
                        <div>
                          <label className="text-base font-bold text-slate-600 block mb-2">개명년도</label>
                          <input 
                            className="w-full rounded-2xl border border-slate-200 bg-white/50 px-5 py-4 text-lg form-focus-ring" 
                            placeholder="2020"
                            value={data.changeYear}
                            onChange={(e) => updateNameChangeData(index, "changeYear", e.target.value)}
                            data-testid={`input-change-year-${index}`}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 등본 첨부 */}
          <div className="glass-card rounded-3xl p-8">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl form-title-font font-bold text-slate-900">등본 첨부</h3>
                <p className="text-sm text-slate-500 mt-2 font-medium leading-normal">
                  정확한 한자 확인을 위해 필수입니다.<br/>
                  <span className="text-xs text-slate-400">* 주민등록번호 뒷자리 및 주소는 가린 후 제출</span>
                </p>
                <div className="mt-4 p-4 bg-slate-50/80 rounded-2xl border border-slate-100">
                  <p className="text-sm text-slate-600 leading-relaxed font-medium">
                    · <strong>실거주지 불일치</strong> 혹은 <strong>등본 외 동거인</strong>이 있으신 경우 예약 상담 시 꼭 말씀해주세요.
                  </p>
                </div>
              </div>
            </div>
            <div className="mt-6">
              <label htmlFor="file" className="block cursor-pointer group">
                <div className="rounded-3xl border-2 border-dashed border-slate-300 bg-slate-50/30 p-8 group-hover:bg-slate-50/60 transition text-center sm:text-left">
                  <div className="flex flex-col sm:flex-row items-center gap-6">
                    <div className="w-16 h-16 rounded-2xl bg-white border border-slate-100 flex items-center justify-center shadow-sm">
                      <FileText className="w-7 h-7 text-tiffany" />
                    </div>
                    <div className="flex-1">
                      <div className="text-lg font-bold text-slate-900">파일 선택</div>
                      <div className="text-sm text-slate-400 mt-1 truncate max-w-[200px] mx-auto sm:mx-0">
                        {registrationDocument ? registrationDocument.name : "선택된 파일 없음"}
                      </div>
                    </div>
                    <div className="text-sm font-bold text-tiffany bg-tiffany-light px-5 py-2.5 rounded-full hover:bg-teal-100 transition">업로드</div>
                  </div>
                </div>
              </label>
              <input 
                id="file" 
                type="file" 
                className="hidden" 
                accept="image/*"
                onChange={(e) => setRegistrationDocument(e.target.files?.[0] || null)}
                data-testid="input-registration-document"
              />
            </div>
          </div>

          {/* 다음 버튼 */}
          <div className="flex gap-3 pt-4">
            <button 
              type="button"
              onClick={() => goToStep(2)}
              className="w-full rounded-2xl bg-tiffany text-white py-4 text-xl font-bold hover:bg-tiffany-dark transition shadow-lg shadow-tiffany/30 transform active:scale-[0.98]"
              data-testid="button-next-step2"
            >
              다음: 상담내용
            </button>
          </div>
        </div>
      )}

      {/* Step 2: 상담내용 */}
      {currentStep === 2 && (
        <div className="space-y-8 pt-8 form-animate-fade-in">
          <div className="glass-card rounded-3xl p-8">
            <div>
              <h2 className="text-2xl form-title-font font-bold tracking-tight text-slate-900">상담 내용</h2>
              <p className="text-base text-slate-500 mt-2 font-medium">가장 고민되시는 부분을 편안하게 적어주세요.</p>
            </div>
            <div className="mt-8">
              <label className="text-lg font-bold text-slate-700 block mb-3 form-title-font">상담 사유</label>
              <textarea 
                className="w-full min-h-[240px] rounded-2xl border border-slate-200 bg-white/50 px-6 py-5 text-lg form-focus-ring leading-relaxed resize-none backdrop-blur-sm"
                placeholder={`예)
· 가족 관계에서 반복되는 문제가 있습니다
· 아이 이름의 방향성을 잡고 싶습니다
· 개명 여부를 신중히 판단하고 싶습니다`}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                data-testid="input-reason"
              />
              <p className="mt-3 text-sm text-slate-400">내용은 상담 준비 외에는 절대 사용되지 않습니다.</p>
            </div>
          </div>

          <div className="glass-card rounded-3xl p-8">
            <h3 className="text-xl form-title-font font-bold text-slate-900 mb-5">한국이름학교를 어떻게 알게 되셨나요?</h3>
            <div className="grid grid-cols-2 gap-3">
              {referralOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setReferralSource(option)}
                  data-testid={`referral-${option}`}
                  className={`rounded-2xl border px-6 py-3.5 text-lg font-bold transition ${
                    referralSource === option
                      ? "bg-tiffany text-white border-tiffany shadow-lg shadow-tiffany/30 scale-[1.01]"
                      : "bg-white/80 text-slate-500 border-slate-200 hover:bg-white"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button 
              type="button"
              onClick={() => goToStep(1)}
              className="w-1/3 rounded-2xl border border-slate-200 bg-white/60 py-4 text-lg font-bold text-slate-600 hover:bg-white transition"
              data-testid="button-back-step1"
            >
              이전
            </button>
            <button 
              type="button"
              onClick={() => goToStep(3)}
              className="w-2/3 rounded-2xl bg-tiffany text-white py-4 text-xl font-bold hover:bg-tiffany-dark transition shadow-lg shadow-tiffany/30 transform active:scale-[0.98]"
              data-testid="button-next-step3"
            >
              다음: 결제/일정
            </button>
          </div>
        </div>
      )}

      {/* Step 3: 결제/일정 */}
      {currentStep === 3 && (
        <div className="space-y-8 pt-8 form-animate-fade-in">
          <div className="glass-card rounded-3xl p-8">
            <h2 className="text-2xl form-title-font font-bold tracking-tight text-slate-900">연락 및 결제</h2>
            <p className="text-base text-slate-500 mt-2 font-medium">입금 확인 후 24시간 내에 확정 문자를 드립니다.</p>
            <div className="mt-8">
              <label className="text-lg font-bold text-slate-700 block mb-3 form-title-font">휴대폰 번호</label>
              <input 
                className="w-full rounded-2xl border border-slate-200 bg-white/50 px-6 py-5 text-xl form-focus-ring"
                placeholder="010-0000-0000" 
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                data-testid="input-phone"
              />
            </div>
          </div>

          <div className="glass-card rounded-3xl p-8">
            <h3 className="text-xl form-title-font font-bold text-slate-900 mb-6">결제 정보</h3>
            
            {/* 은행 카드 - 실제 신용카드 비율 (85.6mm x 53.98mm ≈ 1.586:1) */}
            <div 
              className="relative mx-auto max-w-[400px] aspect-[1.586/1] rounded-2xl p-5 sm:p-6 text-white shadow-2xl overflow-hidden ring-1 ring-black/10"
              style={{ 
                backgroundImage: 'url(/bank-card-bg.png)',
                backgroundSize: 'cover',
                backgroundPosition: 'center'
              }}
            >
              <div className="relative z-10 flex flex-col h-full justify-between">
                <div className="flex flex-col items-center pt-2">
                  <span className="text-sm sm:text-base font-bold tracking-wide text-teal-700">Nonghyup Bank</span>
                </div>

                <div className="flex flex-col items-center space-y-2 sm:space-y-3">
                  <div className="text-xl sm:text-2xl md:text-3xl font-mono font-bold tracking-wider text-emerald-800 whitespace-nowrap text-center">
                    351 8205 8124 53
                  </div>

                  <button 
                    type="button"
                    onClick={handleCopyAccount}
                    className="group flex items-center gap-1.5 rounded-full bg-transparent px-4 sm:px-5 py-2 sm:py-2.5 hover:bg-slate-100/50 transition active:scale-95 whitespace-nowrap border border-slate-400/50"
                    data-testid="button-copy-account"
                  >
                    <span className="text-sm sm:text-base font-bold text-slate-600">
                      {accountCopied ? "복사됨!" : "계좌번호 복사"}
                    </span>
                    {accountCopied ? (
                      <Check className="w-4 h-4 text-slate-600" />
                    ) : (
                      <Copy className="w-4 h-4 text-slate-600" />
                    )}
                  </button>
                </div>

                <div className="text-center pb-2">
                  <span className="text-xs sm:text-sm font-medium text-slate-600 tracking-tight">
                    예금주: 와츠유어네임 이름연구협회
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-8">
              <label className="text-lg font-bold text-slate-700 block mb-3 form-title-font">입금자명</label>
              <input 
                className="w-full rounded-2xl border border-slate-200 bg-white/50 px-6 py-5 text-xl form-focus-ring"
                placeholder="입금하신 분의 성함"
                value={depositorName}
                onChange={(e) => setDepositorName(e.target.value)}
                data-testid="input-depositor-name"
              />
            </div>
          </div>

          <div className="glass-card rounded-3xl p-8">
            <h3 className="text-xl form-title-font font-bold text-slate-900">희망 상담 시간</h3>
            <div className="mt-6 grid grid-cols-2 gap-3">
              {["주중 오후 2시", "주말 오후 2시"].map((time) => (
                <button
                  key={time}
                  type="button"
                  onClick={() => setConsultationTime(time)}
                  className={`rounded-2xl border px-6 py-4 text-lg font-bold transition ${
                    consultationTime === time
                      ? "bg-tiffany text-white border-tiffany shadow-lg shadow-tiffany/30 scale-[1.01]"
                      : "border-slate-200 bg-white/60 text-slate-700 hover:bg-white"
                  }`}
                  data-testid={`time-${time}`}
                >
                  {time}
                </button>
              ))}
            </div>

            <button 
              type="button"
              onClick={() => setShowDuration(!showDuration)}
              className="mt-6 w-full text-left rounded-2xl border border-slate-200 bg-white/60 px-6 py-5 text-lg font-bold text-slate-800 hover:bg-white transition flex justify-between items-center group"
              data-testid="toggle-duration"
            >
              <span className="form-title-font">평균 상담 소요시간 보기</span>
              <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform duration-300 group-hover:text-tiffany ${showDuration ? 'rotate-180' : ''}`} />
            </button>
            {showDuration && (
              <div className="mt-2 rounded-2xl bg-slate-50/50 p-6 text-lg text-slate-600 border border-slate-100/50 backdrop-blur-sm form-animate-fade-in">
                <ul className="space-y-3">
                  <li className="flex justify-between border-b border-slate-200/60 pb-2"><span>1인</span> <span className="font-bold text-slate-800">1시간</span></li>
                  <li className="flex justify-between border-b border-slate-200/60 pb-2"><span>2인</span> <span className="font-bold text-slate-800">1시간 30분</span></li>
                  <li className="flex justify-between border-b border-slate-200/60 pb-2"><span>3인</span> <span className="font-bold text-slate-800">2시간</span></li>
                  <li className="flex justify-between"><span>4인 이상</span> <span className="font-bold text-slate-800">2시간 30분</span></li>
                </ul>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <button 
              type="button"
              onClick={() => goToStep(2)}
              className="w-1/3 rounded-2xl border border-slate-200 bg-white/60 py-4 text-lg font-bold text-slate-600 hover:bg-white transition"
              data-testid="button-back-step2"
            >
              이전
            </button>
            <button 
              type="button"
              onClick={handleSubmit}
              disabled={submitMutation.isPending}
              className="w-2/3 rounded-2xl bg-tiffany text-white py-4 text-xl font-bold hover:bg-tiffany-dark transition shadow-lg shadow-tiffany/30 transform active:scale-[0.98] disabled:opacity-50"
              data-testid="button-submit"
            >
              {submitMutation.isPending ? "신청 중..." : "상담 신청하기"}
            </button>
          </div>
        </div>
      )}

      {/* 하단 고정 바 - sticky로 Dialog 안에서도 하단 고정 */}
      <div className="sticky bottom-0 left-0 right-0 z-50 -mx-6 mt-8 border-t border-white/60 bg-white/95 backdrop-blur-xl shadow-[0_-10px_40px_rgba(0,0,0,0.08)]">
        <div className="px-6 py-5 flex items-center gap-6">
          <div className="flex-1">
            <div className="text-xs text-slate-500 font-bold mb-1">총 상담비</div>
            <div className="text-2xl form-title-font font-bold text-slate-900 tracking-tight">
              {totalPrice.toLocaleString()}원
            </div>
          </div>
          <button 
            type="button"
            onClick={() => {
              if (currentStep === 1) goToStep(2);
              else if (currentStep === 2) goToStep(3);
              else handleSubmit();
            }}
            disabled={currentStep === 3 && submitMutation.isPending}
            className="rounded-2xl bg-tiffany text-white px-8 py-4 text-lg font-bold hover:bg-tiffany-dark transition shadow-lg shadow-tiffany/30 transform active:scale-[0.98] disabled:opacity-50"
            data-testid="button-sticky-cta"
          >
            {currentStep === 3 ? (submitMutation.isPending ? "신청 중..." : "상담 신청하기") : "계속하기"}
          </button>
        </div>
      </div>

      {/* 가족 상담 원칙 다이얼로그 */}
      <Sheet open={familyPolicyDialogOpen} onOpenChange={setFamilyPolicyDialogOpen}>
        <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl">
          <SheetHeader className="pb-4">
            <SheetTitle className="text-xl form-title-font">등본상 가족 상담 원칙</SheetTitle>
          </SheetHeader>
          <div className="overflow-y-auto h-full pb-20 space-y-6 text-slate-700">
            <p className="text-lg leading-relaxed">
              저희 협회는 정확한 이름분석과 상담을 위해 <strong className="text-tiffany-dark">등본상 가족 전체 상담</strong>을 원칙으로 하고 있습니다.
            </p>
            <div className="bg-tiffany-light/50 rounded-2xl p-6 space-y-4">
              <h4 className="font-bold text-slate-900">왜 가족 전체 상담인가요?</h4>
              <ul className="space-y-2 text-base">
                <li>· 이름의 기운은 가족 구성원 간에 상호작용합니다</li>
                <li>· 한 사람의 이름 변경이 다른 가족에게 영향을 줄 수 있습니다</li>
                <li>· 전체적인 맥락을 파악해야 정확한 분석이 가능합니다</li>
              </ul>
            </div>
            <p className="text-sm text-slate-500">
              특별한 사정이 있으신 경우 예약 상담 시 말씀해 주시면 상황에 맞게 안내해 드리겠습니다.
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
