import { useQuery } from "@tanstack/react-query";
import { Navbar } from "@/components/Navbar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Consultation } from "@shared/schema";

export default function Admin() {
  const { data: consultations, isLoading } = useQuery<Consultation[]>({
    queryKey: ["/api/consultations"],
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
          <div className="text-center">로딩 중...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
        <div className="space-y-8">
          <div>
            <h1 className="text-3xl font-bold text-foreground">신청서 관리</h1>
            <p className="text-muted-foreground mt-2">
              총 {consultations?.length || 0}개의 신청서
            </p>
          </div>

          <div className="space-y-4">
            {consultations && consultations.length === 0 && (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground">아직 신청서가 없습니다.</p>
              </Card>
            )}

            {consultations?.map((consultation) => (
              <Card key={consultation.id} className="p-6 space-y-4" data-testid={`consultation-${consultation.id}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={consultation.type === "analysis" ? "default" : "secondary"}>
                        {consultation.type === "analysis" ? "이름분석" : "이름감명"}
                      </Badge>
                      <span className="text-sm text-muted-foreground">
                        {new Date(consultation.createdAt).toLocaleString("ko-KR")}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <h3 className="font-semibold text-foreground mb-2">신청자 정보</h3>
                        <div className="space-y-1 text-sm">
                          <p><span className="text-muted-foreground">전화번호:</span> {consultation.phone}</p>
                          <p><span className="text-muted-foreground">입금자명:</span> {consultation.depositorName}</p>
                          <p><span className="text-muted-foreground">상담시간:</span> {consultation.consultationTime}</p>
                          <p><span className="text-muted-foreground">가족 인원:</span> {consultation.numPeople}명</p>
                        </div>
                      </div>

                      <div>
                        <h3 className="font-semibold text-foreground mb-2">분석 대상</h3>
                        <div className="space-y-2">
                          {consultation.peopleData.map((person, idx) => (
                            <div key={idx} className="text-sm bg-muted/30 p-2 rounded">
                              <p className="font-medium">{person.name}</p>
                              <p className="text-muted-foreground">
                                {person.gender === "male" ? "남성" : "여성"} / {person.birthYear}년 / {person.occupation}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {consultation.hasNameChange === "yes" && consultation.nameChangeData && (
                      <div>
                        <h3 className="font-semibold text-foreground mb-2">개명 정보</h3>
                        <div className="space-y-2">
                          {consultation.nameChangeData.map((change, idx) => (
                            <div key={idx} className="text-sm bg-muted/30 p-2 rounded">
                              <p><span className="text-muted-foreground">현재 이름:</span> {change.currentName}</p>
                              <p><span className="text-muted-foreground">이전 이름:</span> {change.previousName}</p>
                              <p><span className="text-muted-foreground">한글:</span> {change.koreanName} / <span className="text-muted-foreground">한자:</span> {change.chineseName}</p>
                              <p><span className="text-muted-foreground">개명 연도:</span> {change.changeYear}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {consultation.type === "naming" && (
                      <div>
                        <h3 className="font-semibold text-foreground mb-2">감명받을 이름</h3>
                        <div className="text-sm bg-muted/30 p-2 rounded">
                          <p><span className="text-muted-foreground">한글:</span> {consultation.evaluationKoreanName}</p>
                          <p><span className="text-muted-foreground">한자:</span> {consultation.evaluationChineseName}</p>
                        </div>
                      </div>
                    )}

                    {consultation.reason && (
                      <div>
                        <h3 className="font-semibold text-foreground mb-2">신청 이유</h3>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                          {consultation.reason}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
