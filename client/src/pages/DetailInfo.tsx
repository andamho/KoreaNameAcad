import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Card } from "@/components/ui/card";

export default function DetailInfo() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="py-16 md:py-24">
        <div className="max-w-4xl mx-auto px-4 sm:px-6">
          <div className="space-y-8">
            <div className="text-center space-y-4">
              <h1 className="text-3xl md:text-4xl font-bold text-foreground">
                이름분석 및 감명 상세 안내
              </h1>
              <p className="text-lg text-muted-foreground">
                이름분석과 이름감명에 대한 자세한 정보를 확인하세요
              </p>
            </div>

            <Card className="p-6 md:p-8 space-y-6">
              <div className="space-y-4">
                <h2 className="text-2xl font-bold text-foreground">이름분석이란?</h2>
                <div className="text-muted-foreground space-y-3 leading-relaxed">
                  <p>
                    {/* 여기에 이름분석 설명 내용을 넣어주세요 */}
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <h2 className="text-2xl font-bold text-foreground">이름감명이란?</h2>
                <div className="text-muted-foreground space-y-3 leading-relaxed">
                  <p>
                    {/* 여기에 이름감명 설명 내용을 넣어주세요 */}
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <h2 className="text-2xl font-bold text-foreground">상담 절차</h2>
                <div className="text-muted-foreground space-y-3 leading-relaxed">
                  <p>
                    {/* 여기에 상담 절차 내용을 넣어주세요 */}
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
