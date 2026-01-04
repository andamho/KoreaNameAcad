import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { GraduationCap } from "lucide-react";

export default function ExpertCourse() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="pt-[100px] pb-16">
        <div className="max-w-4xl mx-auto px-6">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground mb-8">
            한국이름학교 전문가 과정
          </h1>
          
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <GraduationCap className="w-16 h-16 text-muted-foreground/40 mb-6" />
            <p className="text-lg text-muted-foreground">
              전문가 과정 안내 페이지 준비 중입니다.
            </p>
            <p className="text-sm text-muted-foreground/70 mt-2">
              곧 상세한 커리큘럼과 수강 안내를 드리겠습니다.
            </p>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
}
