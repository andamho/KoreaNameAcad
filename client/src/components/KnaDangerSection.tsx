import { Zap, OctagonX } from "lucide-react";

export default function KnaDangerSection() {
  return (
    <section className="kna-danger-section relative overflow-hidden bg-gray-100 dark:bg-background">
      <div className="relative mx-auto max-w-[1120px] px-5 py-10 md:py-16">
        
        <header className="flex items-center justify-center mb-6 md:mb-8">
          <h2 className="text-[#18a999] text-[22px] md:text-[28px] font-extrabold tracking-tight">
            이름, 모르면 위험합니다
          </h2>
        </header>

        {/* Frame 1: 이름은 힘이 셉니다 */}
        <div className="frame bg-white dark:bg-card border border-gray-200 dark:border-border rounded-3xl shadow-lg overflow-hidden mb-6">
          <div className="flex items-center gap-3 px-5 py-4 md:px-6 md:py-5 bg-white dark:bg-card border-b border-gray-200 dark:border-border">
            <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center flex-shrink-0 animate-pulse-glow">
              <Zap className="w-5 h-5 fill-orange-500 stroke-white" strokeWidth={2.5} />
            </div>
            <h3 className="text-[18px] md:text-[20px] font-extrabold text-gray-900 dark:text-foreground tracking-tight">
              이름은 힘이 셉니다
            </h3>
          </div>
          
          <div className="p-5 md:p-6 bg-white dark:bg-card">
            <StackItem title="이름이 맑아야 인생이 맑다">
              운칠기삼(運七技三), 운이 70%입니다.<br/>
              이름의 강력한 운을 모른 채,<br/>
              <span className="text-orange-500 font-bold">30%의 노력만으로는 인생이 바뀌지 않습니다.</span>
            </StackItem>
            <StackItem title="안 좋은 이름에 바람 잘 날 없다">
              안좋은 이름은,<br/>
              <span className="text-orange-500 font-bold">평생을 따라 다니며 괴롭힙니다.</span>
            </StackItem>
            <StackItem title="가족은 운명공동체" isLast>
              이름은 자신뿐만 아니라,<br/>
              <span className="text-orange-500 font-bold">가족 전체에 영향을 미칩니다.</span>
            </StackItem>
          </div>
        </div>

        {/* Frame 2: 이러시면 안됩니다 */}
        <div className="frame bg-white dark:bg-card border border-gray-200 dark:border-border rounded-3xl shadow-lg overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 md:px-6 md:py-5 bg-white dark:bg-card border-b border-gray-200 dark:border-border">
            <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center flex-shrink-0 animate-pulse-glow">
              <OctagonX className="w-5 h-5 stroke-white" strokeWidth={2.5} />
            </div>
            <h3 className="text-[18px] md:text-[20px] font-extrabold text-gray-900 dark:text-foreground tracking-tight">
              이러시면 안됩니다
            </h3>
          </div>
          
          <div className="p-5 md:p-6 bg-white dark:bg-card">
            <StackItem title={`"비용을 먼저 물어보시나요?"`}>
              이름은 생각보다 훨씬 막강합니다.<br/>
              비용만 아끼려다,<br/>
              <span className="text-orange-500 font-bold">더 비싼 대가를 치릅니다.</span>
            </StackItem>
            <StackItem title={`"사주 기반 작명소를 찾으시나요?"`}>
              그곳은 한글이름 작명이론이 없습니다.<br/>
              한글 이름의 운이 무너지면,<br/>
              <span className="text-orange-500 font-bold">삶이 흔들립니다.</span>
            </StackItem>
            <StackItem title={`"후기도 안살펴보시나요?"`} isLast>
              검증 없는 작명,<br/>
              <span className="text-orange-500 font-bold">고생은 결국 본인의 몫입니다.</span>
            </StackItem>
          </div>
        </div>

      </div>
    </section>
  );
}

function StackItem({ title, children, isLast = false }: { title: string; children: React.ReactNode; isLast?: boolean }) {
  return (
    <article className={`py-4 md:py-5 ${!isLast ? 'border-b border-gray-200 dark:border-border' : ''}`}>
      <h4 className="text-[16px] md:text-[17px] font-black text-gray-900 dark:text-foreground mb-2 break-keep">
        {title}
      </h4>
      <p className="text-[14px] md:text-[15px] leading-[1.65] text-gray-600 dark:text-muted-foreground relative pl-3.5 break-keep">
        <span className="absolute left-0 top-[5px] w-[3px] h-[15px] bg-orange-500 rounded-sm" />
        {children}
      </p>
    </article>
  );
}
