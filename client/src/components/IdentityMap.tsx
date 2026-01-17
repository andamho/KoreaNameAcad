import { useEffect, useRef, useState } from "react";

export default function IdentityMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const animationRef = useRef<number | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  // IntersectionObserver로 화면에 보일 때만 초기화
  useEffect(() => {
    if (!containerRef.current) return;
    
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            observer.disconnect();
          }
        });
      },
      { threshold: 0.1 }
    );
    
    observer.observe(containerRef.current);
    
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!containerRef.current || !svgRef.current || !isVisible) return;

    const svg = svgRef.current;
    const container = containerRef.current;

    // 약간의 지연 후 초기화 (레이아웃 완료 보장)
    const initTimeout = setTimeout(() => {
      createElements();
      updateLines();
    }, 100);

    function createElements() {
      svg.innerHTML = '';
      const nodes = container.querySelectorAll('.id-node');

      nodes.forEach((node, i) => {
        const style = getComputedStyle(node);
        const color = style.getPropertyValue('--c').trim() || '#ffffff';

        let lineWidth = 1;
        if (node.id === 'n1') lineWidth = 5;
        else if (node.id === 'n2' || node.id === 'n8') lineWidth = 4;
        else if (node.id === 'n4') lineWidth = 3;

        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("id", `line-${i}`);
        path.setAttribute("class", "energy-line");
        path.setAttribute("stroke", color);
        path.setAttribute("stroke-width", String(lineWidth));
        path.setAttribute("fill", "none");
        path.style.strokeOpacity = "0.6";
        path.style.strokeLinecap = "round";
        svg.appendChild(path);

        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        const particleRadius = lineWidth === 1 ? 3 : (lineWidth + 1.5);
        circle.setAttribute("r", String(particleRadius));
        circle.setAttribute("fill", color);
        circle.style.filter = "blur(2px)";

        const animateMotion = document.createElementNS("http://www.w3.org/2000/svg", "animateMotion");
        animateMotion.setAttribute("dur", (3 + Math.random() * 3) + "s");
        animateMotion.setAttribute("repeatCount", "indefinite");

        const mpath = document.createElementNS("http://www.w3.org/2000/svg", "mpath");
        mpath.setAttribute("href", `#line-${i}`);

        animateMotion.appendChild(mpath);
        circle.appendChild(animateMotion);
        svg.appendChild(circle);
      });
    }

    function updateLines() {
      const hubElement = container.querySelector('.id-center-wrapper');
      if (!hubElement) return;

      // zoom 값 감지 (CSS zoom 속성으로 인한 좌표 오차 보정)
      const computedStyle = getComputedStyle(container);
      const zoom = parseFloat(computedStyle.zoom) || 1;

      const containerRect = container.getBoundingClientRect();
      const hubRect = hubElement.getBoundingClientRect();
      
      // zoom으로 나눠서 실제 SVG 좌표계로 변환
      const hX = (hubRect.left - containerRect.left + hubRect.width / 2) / zoom;
      const hY = (hubRect.top - containerRect.top + hubRect.height / 2) / zoom;

      const nodes = container.querySelectorAll('.id-node');
      nodes.forEach((node, i) => {
        const anchorEl = node.querySelector('.anchor') || node;
        const aRect = anchorEl.getBoundingClientRect();
        
        // zoom으로 나눠서 실제 SVG 좌표계로 변환
        const nX = (aRect.left - containerRect.left + aRect.width / 2) / zoom;
        const nY = (aRect.top - containerRect.top + aRect.height / 2) / zoom;

        const cpX = (nX + hX) / 2 + (Math.sin(i) * 20);
        const cpY = (nY + hY) / 2 + (Math.cos(i) * 20);
        const d = `M ${nX} ${nY} Q ${cpX} ${cpY} ${hX} ${hY}`;

        const path = svg.querySelector(`#line-${i}`);
        if (path) {
          path.setAttribute("d", d);
        }
      });

      animationRef.current = requestAnimationFrame(updateLines);
    }

    let resizeTimer: NodeJS.Timeout;
    const handleResize = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        createElements();
      }, 100);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(initTimeout);
      window.removeEventListener('resize', handleResize);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isVisible]);

  return (
    <div
      className="relative w-full aspect-[1/1.56] max-w-[500px] lg:max-w-none lg:aspect-auto lg:h-full lg:min-h-[400px] mx-auto rounded-3xl rounded-t-none lg:rounded-l-none lg:rounded-tr-3xl overflow-hidden flex items-center justify-center"
      style={{ background: "radial-gradient(circle at 50% 50%, #0d1b35 0%, #050a15 100%)" }}
    >
      {/* 내부 래퍼 - 원래 비율 유지하면서 상하 중앙 정렬 */}
      <div
        ref={containerRef}
        className="identity-map-inner relative w-full aspect-[1/1.3] lg:aspect-auto lg:h-full"
      >
      <div className="id-center-wrapper absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-30">
        <div 
          className="w-16 h-16 md:w-20 md:h-20 rounded-full flex justify-center items-center border-2 border-white/30"
          style={{ 
            animation: "hub-color 8s linear infinite, hub-breath 3s ease-in-out infinite",
            backgroundColor: "#635bff"
          }}
        >
          <svg viewBox="0 0 24 24" className="w-9 h-9 md:w-11 md:h-11 fill-white">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
        </div>
      </div>

      {/* n1: 홍길동 - 이메일보다 위로, 이름 라벨은 위에, 박스 20% 축소 */}
      <div className="id-node absolute top-[8%] md:top-[15%] left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-20" id="n1" style={{ "--c": "#ff4757", animationDelay: "0s" } as React.CSSProperties}>
        <div className="mb-1 text-white text-[10px] md:text-xs font-semibold">이름</div>
        <div className="anchor text-white font-black text-base md:text-lg px-3 md:px-3.5 py-1.5 rounded-xl whitespace-nowrap" style={{ background: "#ff3b4f", boxShadow: "0 0 25px rgba(255, 59, 79, 0.5)", border: "1.5px solid rgba(255,255,255,0.25)" }}>홍길동</div>
      </div>

      {/* n2: 전화번호 - 모바일에서 더 왼쪽 위로, 데스크탑 선 100% 더 길게 */}
      <div className="id-node absolute top-[48%] md:top-[60%] left-[12%] md:left-[6%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-20" id="n2" style={{ "--c": "#ffa502", animationDelay: "0.5s" } as React.CSSProperties}>
        <div className="anchor rounded-2xl flex justify-center items-center mb-1 w-10 h-10 md:w-12 md:h-12" style={{ backgroundColor: "#ffa502", boxShadow: "0 0 20px #ffa502" }}>
          <svg viewBox="0 0 24 24" className="stroke-white fill-none w-5 h-5 md:w-6 md:h-6" style={{ strokeWidth: 2.2 }}>
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
          </svg>
        </div>
        <div className="text-[#adbdcc] text-[10px] md:text-xs font-semibold">전화번호</div>
      </div>

      {/* n4: 여권이름 - 데스크탑 선 25% 더 길게 */}
      <div className="id-node absolute top-[35%] md:top-[38%] left-[82%] md:left-[78%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-20" id="n4" style={{ "--c": "#1e90ff", animationDelay: "1.5s" } as React.CSSProperties}>
        <div className="anchor rounded-2xl flex justify-center items-center mb-1 w-9 h-9 md:w-11 md:h-11" style={{ backgroundColor: "#1e90ff", boxShadow: "0 0 20px #1e90ff" }}>
          <svg viewBox="0 0 24 24" className="stroke-white fill-none w-5 h-5 md:w-6 md:h-6" style={{ strokeWidth: 2.2 }}>
            <path d="M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/>
            <path d="M10 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/>
            <path d="M14 18v-2a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v2"/>
          </svg>
        </div>
        <div className="text-[#adbdcc] text-[10px] md:text-xs font-semibold">여권이름</div>
      </div>

      {/* n3: 차량번호 - 중심에 가깝게 */}
      <div className="id-node absolute top-[18%] md:top-[25%] left-[75%] md:left-[72%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-20" id="n3" style={{ "--c": "#2ed573", animationDelay: "1s" } as React.CSSProperties}>
        <div className="anchor rounded-2xl flex justify-center items-center mb-1 w-9 h-9 md:w-10 md:h-10" style={{ backgroundColor: "#2ed573", boxShadow: "0 0 20px #2ed573" }}>
          <svg viewBox="0 0 24 24" className="stroke-white fill-none w-5 h-5 md:w-[22px] md:h-[22px]" style={{ strokeWidth: 2.2 }}>
            <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/>
            <circle cx="7" cy="17" r="2"/>
            <path d="M9 17h6"/>
            <circle cx="17" cy="17" r="2"/>
          </svg>
        </div>
        <div className="text-[#adbdcc] text-[10px] md:text-xs font-semibold">차량번호</div>
      </div>

      {/* n5: 아이디 - 모바일에서 더 아래 왼쪽으로 */}
      <div className="id-node absolute top-[72%] md:top-[75%] left-[10%] md:left-[22%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-20" id="n5" style={{ "--c": "#70a1ff", animationDelay: "2s" } as React.CSSProperties}>
        <div className="anchor rounded-2xl flex justify-center items-center mb-1 w-9 h-9 md:w-10 md:h-10" style={{ backgroundColor: "#70a1ff", boxShadow: "0 0 20px #70a1ff" }}>
          <svg viewBox="0 0 24 24" className="stroke-white fill-none w-5 h-5 md:w-[22px] md:h-[22px]" style={{ strokeWidth: 2.2 }}>
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            <path d="M12 8v4"/>
            <path d="M12 16h.01"/>
          </svg>
        </div>
        <div className="text-[#adbdcc] text-[10px] md:text-xs font-semibold">아이디</div>
      </div>

      {/* n6: 비밀번호 */}
      <div className="id-node absolute top-[88%] md:top-[82%] left-[50%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-20" id="n6" style={{ "--c": "#ff6b81", animationDelay: "2.5s" } as React.CSSProperties}>
        <div className="anchor rounded-2xl flex justify-center items-center mb-1 w-9 h-9 md:w-10 md:h-10" style={{ backgroundColor: "#ff6b81", boxShadow: "0 0 20px #ff6b81" }}>
          <svg viewBox="0 0 24 24" className="stroke-white fill-none w-5 h-5 md:w-[22px] md:h-[22px]" style={{ strokeWidth: 2.2 }}>
            <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3-3.5 3.5z"/>
          </svg>
        </div>
        <div className="text-[#adbdcc] text-[10px] md:text-xs font-semibold">비밀번호</div>
      </div>

      {/* n7: 인스타명 - 모바일에서 더 아래로 */}
      <div className="id-node absolute top-[78%] md:top-[68%] left-[88%] md:left-[78%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-20" id="n7" style={{ "--c": "#eccc68", animationDelay: "3s" } as React.CSSProperties}>
        <div className="anchor rounded-2xl flex justify-center items-center mb-1 w-9 h-9 md:w-10 md:h-10" style={{ backgroundColor: "#eccc68", boxShadow: "0 0 20px #eccc68" }}>
          <svg viewBox="0 0 24 24" className="stroke-white fill-none w-5 h-5 md:w-[22px] md:h-[22px]" style={{ strokeWidth: 2.2 }}>
            <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
            <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/>
            <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>
          </svg>
        </div>
        <div className="text-[#adbdcc] text-[10px] md:text-xs font-semibold whitespace-nowrap">인스타명</div>
      </div>

      {/* n8: 사업자명 - 모바일에서 더 아래로, 데스크탑 선 80% 더 길게 */}
      <div className="id-node absolute top-[55%] md:top-[59%] left-[88%] md:left-[90%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-20" id="n8" style={{ "--c": "#7bed9f", animationDelay: "3.5s" } as React.CSSProperties}>
        <div className="anchor rounded-2xl flex justify-center items-center mb-1 w-10 h-10 md:w-12 md:h-12" style={{ backgroundColor: "#7bed9f", boxShadow: "0 0 20px #7bed9f" }}>
          <svg viewBox="0 0 24 24" className="stroke-white fill-none w-5 h-5 md:w-[22px] md:h-[22px]" style={{ strokeWidth: 2.2 }}>
            <rect x="2" y="7" width="20" height="14" rx="2"/>
            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
          </svg>
        </div>
        <div className="text-[#adbdcc] text-[10px] md:text-xs font-semibold whitespace-nowrap">사업자명</div>
      </div>

      {/* n9: 이메일주소 - 홍길동보다 아래로 */}
      <div className="id-node absolute top-[18%] md:top-[25%] left-[22%] md:left-[22%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-20" id="n9" style={{ "--c": "#a29bfe", animationDelay: "4s" } as React.CSSProperties}>
        <div className="anchor rounded-2xl flex justify-center items-center mb-1 w-9 h-9 md:w-10 md:h-10" style={{ backgroundColor: "#a29bfe", boxShadow: "0 0 20px #a29bfe" }}>
          <svg viewBox="0 0 24 24" className="stroke-white fill-none w-5 h-5 md:w-[22px] md:h-[22px]" style={{ strokeWidth: 2.2 }}>
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22,6 12,13 2,6"/>
          </svg>
        </div>
        <div className="text-[#adbdcc] text-[10px] md:text-xs font-semibold">이메일주소</div>
      </div>

      <svg ref={svgRef} className="absolute top-0 left-0 w-full h-full pointer-events-none z-10"></svg>

      <style>{`
        @keyframes hub-breath {
          0%, 100% { transform: scale(1); box-shadow: 0 0 40px rgba(99, 91, 255, 0.6); }
          50% { transform: scale(1.08); box-shadow: 0 0 70px rgba(99, 91, 255, 0.9); }
        }
        @keyframes hub-color {
          0% { background-color: #635bff; border-color: rgba(255,255,255,0.3); }
          50% { background-color: #ff4757; border-color: rgba(255,71,87,0.5); }
          100% { background-color: #635bff; border-color: rgba(255,255,255,0.3); }
        }
        @keyframes float {
          0%, 100% { transform: translate(-50%, -50%); }
          50% { transform: translate(-50%, calc(-50% - 12px)); }
        }
        .id-node { animation: float 4s ease-in-out infinite; }
      `}</style>
      </div>
    </div>
  );
}
