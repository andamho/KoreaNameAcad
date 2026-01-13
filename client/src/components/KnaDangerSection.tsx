import { Zap, Ban } from "lucide-react";

export default function KnaDangerSection() {
  return (
    <section className="kna-danger-section relative overflow-hidden bg-gray-100 dark:bg-background">
      <div className="relative mx-auto max-w-7xl px-6 pt-24 pb-16 lg:px-8">
        
        <header className="flex items-center justify-center mb-16">
          <h2 className="text-[#18a999] text-[25px] sm:text-3xl md:text-4xl font-extrabold tracking-tight">
            이름, 모르면 위험합니다
          </h2>
        </header>

        {/* Frame 1: 이름은 힘이 셉니다 */}
        <div className="frame bg-white dark:bg-card border border-gray-200 dark:border-border rounded-2xl shadow-sm overflow-hidden mb-16">
          <div className="flex items-center gap-3 px-6 py-5 bg-white dark:bg-card border-b border-gray-200 dark:border-border">
            <div className="w-10 h-10 rounded-xl bg-orange-500 flex items-center justify-center flex-shrink-0 animate-pulse-glow">
              <Zap className="w-6 h-6 fill-orange-500 stroke-white" strokeWidth={2.5} />
            </div>
            <h3 className="text-[23px] md:text-[24px] font-bold text-gray-900 dark:text-foreground tracking-tight">
              이름은 힘이 셉니다
            </h3>
          </div>
          
          <div className="md:grid md:grid-cols-[1fr,280px]">
            <div className="p-6 bg-white dark:bg-card">
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
            
            {/* Right icon area with gray background */}
            <div className="hidden md:flex items-center justify-center bg-gray-50 dark:bg-muted/30">
              <div className="w-32 h-32 rounded-3xl bg-orange-500 flex items-center justify-center shadow-lg">
                <Zap className="w-16 h-16 fill-white stroke-white" strokeWidth={1.5} />
              </div>
            </div>
          </div>
        </div>

        {/* Frame 2: 이러시면 안됩니다 */}
        <div className="frame bg-white dark:bg-card border border-gray-200 dark:border-border rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 px-6 py-5 bg-white dark:bg-card border-b border-gray-200 dark:border-border">
            <div className="w-10 h-10 rounded-xl bg-orange-500 flex items-center justify-center flex-shrink-0 animate-pulse-glow">
              <Ban className="w-6 h-6 stroke-white" strokeWidth={2.5} />
            </div>
            <h3 className="text-[23px] md:text-[24px] font-bold text-gray-900 dark:text-foreground tracking-tight">
              이러시면 안됩니다
            </h3>
          </div>
          
          <div className="md:grid md:grid-cols-[1fr,280px]">
            <div className="p-6 bg-white dark:bg-card">
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
            
            {/* Right icon area with gray background */}
            <div className="hidden md:flex items-center justify-center bg-gray-50 dark:bg-muted/30">
              <div className="w-32 h-32 rounded-3xl bg-orange-500 flex items-center justify-center shadow-lg">
                <Ban className="w-16 h-16 stroke-white" strokeWidth={1.5} />
              </div>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}

function StackItem({ title, children, isLast = false }: { title: string; children: React.ReactNode; isLast?: boolean }) {
  return (
    <article className={`py-5 ${!isLast ? 'border-b border-gray-200 dark:border-border' : ''}`}>
      <h4 className="text-[21px] md:text-[22px] font-semibold text-gray-900 dark:text-foreground mb-2 break-keep">
        {title}
      </h4>
      <p className="text-lg leading-relaxed text-gray-700 dark:text-muted-foreground relative pl-4 break-keep">
        <span className="absolute left-0 top-[4px] w-[3px] h-[18px] bg-orange-500 rounded-sm" />
        {children}
      </p>
    </article>
  );
}
