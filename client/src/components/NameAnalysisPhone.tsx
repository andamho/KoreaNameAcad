import { useEffect, useRef } from "react";

export function NameAnalysisPhone() {
  const phoneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const phone = phoneRef.current;
    if (!phone) return;

    const handleTouchStart = () => {
      phone.classList.add("touch-active");
    };

    const handleTouchEnd = () => {
      phone.classList.remove("touch-active");
    };

    phone.addEventListener("touchstart", handleTouchStart, { passive: true });
    phone.addEventListener("touchend", handleTouchEnd);
    phone.addEventListener("touchcancel", handleTouchEnd);

    return () => {
      phone.removeEventListener("touchstart", handleTouchStart);
      phone.removeEventListener("touchend", handleTouchEnd);
      phone.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, []);

  return (
    <section className="name-analysis-phone-section py-16 md:py-24 flex items-center justify-center bg-[#f6f9fc] dark:bg-slate-900" style={{ 
      backgroundImage: "radial-gradient(#e3e8ee 1px, transparent 1px)",
      backgroundSize: "20px 20px"
    }}>
      <style>{`
        .name-phone {
          width: 280px;
          height: 580px;
          max-width: 85vw;
          max-height: 70vh;
          border-radius: 36px;
          position: relative;
          background: linear-gradient(135deg, #b2fef7 0%, #81D8D0 50%, #4db6ac 100%);
          padding: 12px;
          box-shadow: 
            0 30px 60px -20px rgba(50, 50, 93, 0.25), 
            0 15px 30px -20px rgba(0, 0, 0, 0.3),
            inset 0 -2px 6px rgba(0,0,0,0.1);
          transform: rotateY(-12deg) rotateX(6deg) rotateZ(-2deg);
          transition: transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
          box-sizing: border-box;
          overflow: hidden;
          will-change: transform;
          cursor: pointer;
          touch-action: pan-y;
          -webkit-user-select: none;
          user-select: none;
        }
        
        @media (hover: hover) {
          .name-phone:hover {
            transform: rotateY(0deg) rotateX(0deg) rotateZ(0deg) scale(1.05);
            box-shadow: 0 30px 60px -12px rgba(50, 50, 93, 0.25);
            z-index: 10;
          }
          .name-phone:hover .phone-scroll-content {
            animation-play-state: paused;
          }
        }
        
        .name-phone.touch-active {
          transform: rotateY(0deg) rotateX(0deg) rotateZ(0deg) scale(1.0) !important;
          box-shadow: 0 20px 40px -12px rgba(50, 50, 93, 0.3);
          z-index: 10;
        }
        
        .name-phone.touch-active .phone-scroll-content {
          animation-play-state: paused !important;
        }
        
        .phone-screen {
          height: 100%;
          width: 100%;
          background: #f8f9fe;
          border-radius: 26px;
          position: relative;
          overflow: hidden;
          -webkit-mask-image: -webkit-radial-gradient(white, black);
          pointer-events: none;
        }
        
        .phone-scroll-content {
          padding: 30px 14px;
          animation: phoneAutoScroll 30s linear infinite;
        }
        
        @keyframes phoneAutoScroll {
          0% { transform: translateY(0); }
          100% { transform: translateY(-55%); }
        }
        
        .phone-header { text-align: center; margin-bottom: 20px; }
        .phone-super-tag {
          display: inline-block;
          background: #e9ecef;
          color: #525f7f;
          font-size: 10px;
          font-weight: 700;
          padding: 5px 10px;
          border-radius: 12px;
          margin-bottom: 8px;
        }
        .phone-name-title {
          font-size: 28px;
          font-weight: 900;
          color: #0a2540;
          margin: 0 0 6px 0;
          letter-spacing: -1px;
        }
        .phone-element-info {
          font-size: 13px;
          color: #525f7f;
          font-weight: 600;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }
        .phone-dot {
          width: 7px;
          height: 7px;
          background: #fb6340;
          border-radius: 50%;
          box-shadow: 0 0 8px rgba(251, 99, 64, 0.5);
        }
        .phone-section-title {
          font-size: 12px;
          font-weight: 800;
          color: #8898aa;
          text-transform: uppercase;
          letter-spacing: 1px;
          margin: 24px 0 12px 0;
          text-align: center;
        }
        
        .phone-card {
          background: #fff;
          border-radius: 18px;
          box-shadow: 0 5px 10px rgba(50, 50, 93, 0.1), 0 2px 4px rgba(0, 0, 0, 0.08);
          margin-bottom: 14px;
          overflow: hidden;
        }
        .phone-card-header {
          background: #fff;
          padding: 10px 0 0 0;
          font-size: 11px;
          font-weight: 700;
          color: #525f7f;
          text-align: center;
        }
        .phone-card-body {
          display: flex;
          padding: 6px 0;
        }
        
        .phone-half {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          padding: 12px;
          position: relative;
          overflow: hidden;
          min-height: 90px;
        }
        .phone-half.left { align-items: flex-end; text-align: right; padding-right: 10px; }
        .phone-half.right { align-items: flex-start; text-align: left; padding-left: 10px; }
        .phone-divider { width: 1px; background: #e9ecef; margin: 8px 0; }
        
        .phone-half::before {
          position: absolute;
          top: 50%;
          transform: translateY(-50%);
          font-size: 60px;
          font-weight: 900;
          color: #000;
          opacity: 0.04;
          pointer-events: none;
          z-index: 0;
          white-space: nowrap;
          font-family: "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
        }
        .phone-half.left::before { right: 6px; left: auto; }
        .phone-half.right::before { left: 6px; right: auto; }
        
        .wm-hong::before { content: '홍'; }
        .wm-gil::before { content: '길'; }
        .wm-dong::before { content: '동'; }
        .wm-h-hong::before { content: '洪'; }
        .wm-h-gil::before { content: '吉'; }
        .wm-h-dong::before { content: '童'; }
        
        .phone-val-num {
          font-size: 26px;
          font-weight: 900;
          color: #0a2540;
          line-height: 1;
          margin-bottom: 4px;
          letter-spacing: -1px;
          position: relative;
          z-index: 1;
        }
        .phone-val-text {
          font-size: 15px;
          font-weight: 800;
          color: #0a2540;
          margin-bottom: 4px;
          letter-spacing: -0.5px;
          position: relative;
          z-index: 1;
        }
        .phone-desc-text {
          font-size: 11px;
          color: #525f7f;
          margin-bottom: 6px;
          line-height: 1.4;
          font-weight: 600;
          position: relative;
          z-index: 1;
        }
        .phone-like-badge {
          font-size: 10px;
          color: #525f7f;
          background: #f6f9fc;
          padding: 3px 6px;
          border-radius: 5px;
          display: inline-block;
          font-weight: 600;
          position: relative;
          z-index: 1;
        }
        .phone-tag {
          font-size: 9px;
          font-weight: 800;
          text-transform: uppercase;
          padding: 3px 6px;
          border-radius: 6px;
          margin-bottom: 6px;
          display: inline-block;
          position: relative;
          z-index: 1;
        }
        
        .t-excellent { color: #5e72e4; background: rgba(94, 114, 228, 0.1); }
        .t-great { color: #11cdef; background: rgba(17, 205, 239, 0.1); }
        .t-good { color: #2dce89; background: rgba(45, 206, 137, 0.1); }
        .t-peak { color: #00d4ff; background: rgba(0, 212, 255, 0.1); }
        .t-risk { color: #fb6340; background: rgba(251, 99, 64, 0.1); }
        .t-danger { color: #f5365c; background: rgba(245, 54, 92, 0.1); }
        
        .c-risk { color: #fb6340; }
        .c-danger { color: #f5365c; }
        .c-peak { color: #00d4ff; }
        .c-excellent { color: #5e72e4; }
        
        /* 인앱 브라우저 82% 스케일링 */
        html.ua-instagram .phone-name-title,
        html.ua-tiktok .phone-name-title { font-size: 23px !important; }
        
        html.ua-instagram .phone-val-num,
        html.ua-tiktok .phone-val-num { font-size: 21px !important; }
        
        html.ua-instagram .phone-val-text,
        html.ua-tiktok .phone-val-text { font-size: 12px !important; }
        
        html.ua-instagram .phone-element-info,
        html.ua-tiktok .phone-element-info { font-size: 11px !important; }
        
        html.ua-instagram .phone-section-title,
        html.ua-tiktok .phone-section-title { font-size: 10px !important; }
        
        html.ua-instagram .phone-card-header,
        html.ua-tiktok .phone-card-header { font-size: 9px !important; }
        
        html.ua-instagram .phone-desc-text,
        html.ua-tiktok .phone-desc-text { font-size: 9px !important; }
        
        html.ua-instagram .phone-super-tag,
        html.ua-tiktok .phone-super-tag { font-size: 8px !important; }
        
        html.ua-instagram .phone-like-badge,
        html.ua-tiktok .phone-like-badge { font-size: 8px !important; }
        
        html.ua-instagram .phone-tag,
        html.ua-tiktok .phone-tag { font-size: 8px !important; }
        
        html.ua-instagram .name-phone,
        html.ua-tiktok .name-phone {
          width: 230px !important;
          height: 476px !important;
        }
      `}</style>
      
      <div style={{ perspective: "5000px" }}>
        <div className="name-phone" ref={phoneRef} data-testid="name-analysis-phone">
          <div className="phone-screen">
            <div className="phone-scroll-content">
              <div className="phone-header">
                <span className="phone-super-tag">SUPERHERO DNA</span>
                <h2 className="phone-name-title">홍길동</h2>
                <div className="phone-element-info">
                  <span className="phone-dot"></span>
                  토/목 → <strong>화 (상생 & 상극)</strong>
                </div>
              </div>

              <div className="phone-section-title">NAME ANALYSIS (수리운)</div>
              
              <div className="phone-card">
                <div className="phone-card-header">~19세 (초년)</div>
                <div className="phone-card-body">
                  <div className="phone-half left wm-hong">
                    <span className="phone-tag t-excellent">Excellent</span>
                    <div className="phone-val-num">11</div>
                    <div className="phone-desc-text">인기순조</div>
                    <span className="phone-like-badge">Like 유재석</span>
                  </div>
                  <div className="phone-divider"></div>
                  <div className="phone-half right wm-h-hong">
                    <span className="phone-tag t-risk">Risk</span>
                    <div className="phone-val-num c-risk">19</div>
                    <div className="phone-desc-text">고독비참</div>
                    <span className="phone-like-badge">내면의 고독</span>
                  </div>
                </div>
              </div>

              <div className="phone-card">
                <div className="phone-card-header">20~39세 (청년)</div>
                <div className="phone-card-body">
                  <div className="phone-half left wm-gil">
                    <span className="phone-tag t-great">Great</span>
                    <div className="phone-val-num">13</div>
                    <div className="phone-desc-text">학습창조</div>
                    <span className="phone-like-badge">Like 삼성</span>
                  </div>
                  <div className="phone-divider"></div>
                  <div className="phone-half right wm-h-gil">
                    <span className="phone-tag t-good">Good</span>
                    <div className="phone-val-num">16</div>
                    <div className="phone-desc-text">인자배려</div>
                    <span className="phone-like-badge">Like 이정재</span>
                  </div>
                </div>
              </div>

              <div className="phone-card">
                <div className="phone-card-header">40~59세 (중년)</div>
                <div className="phone-card-body">
                  <div className="phone-half left wm-dong">
                    <span className="phone-tag t-danger">Danger</span>
                    <div className="phone-val-num c-danger">14</div>
                    <div className="phone-desc-text">이산파멸</div>
                    <span className="phone-like-badge">Like 전쟁</span>
                  </div>
                  <div className="phone-divider"></div>
                  <div className="phone-half right wm-h-dong">
                    <span className="phone-tag t-peak">Peak</span>
                    <div className="phone-val-num c-peak">23</div>
                    <div className="phone-desc-text">일약출세</div>
                    <span className="phone-like-badge">Like Hero</span>
                  </div>
                </div>
              </div>

              <div className="phone-card">
                <div className="phone-card-header">60세~ (말년)</div>
                <div className="phone-card-body">
                  <div className="phone-half left">
                    <span className="phone-tag t-risk">Risk</span>
                    <div className="phone-val-num c-risk">19</div>
                    <div className="phone-desc-text">고독비참</div>
                    <span className="phone-like-badge">총운</span>
                  </div>
                  <div className="phone-divider"></div>
                  <div className="phone-half right">
                    <span className="phone-tag t-excellent">Power</span>
                    <div className="phone-val-num c-excellent">29</div>
                    <div className="phone-desc-text">권력재물</div>
                    <span className="phone-like-badge">Like 배민</span>
                  </div>
                </div>
              </div>

              <div className="phone-section-title">NAME ANALYSIS (주역운)</div>
              
              <div className="phone-card">
                <div className="phone-card-header">~32세</div>
                <div className="phone-card-body">
                  <div className="phone-half left wm-hong">
                    <span className="phone-tag t-excellent">Excellent</span>
                    <div className="phone-val-text">풍화가인</div>
                    <div className="phone-desc-text">매력화합</div>
                    <span className="phone-like-badge">Like 송중기</span>
                  </div>
                  <div className="phone-divider"></div>
                  <div className="phone-half right wm-h-hong">
                    <span className="phone-tag t-risk">Risk</span>
                    <div className="phone-val-text">지화명이</div>
                    <div className="phone-desc-text">성장발전</div>
                    <span className="phone-like-badge">실패 주의</span>
                  </div>
                </div>
              </div>

              <div className="phone-card">
                <div className="phone-card-header">33~52세</div>
                <div className="phone-card-body">
                  <div className="phone-half left wm-gil">
                    <span className="phone-tag t-danger">Danger</span>
                    <div className="phone-val-text c-danger">풍수환</div>
                    <div className="phone-desc-text">영적개혁</div>
                    <span className="phone-like-badge">Like 문선명</span>
                  </div>
                  <div className="phone-divider"></div>
                  <div className="phone-half right wm-h-gil">
                    <span className="phone-tag t-good">Good</span>
                    <div className="phone-val-text">지산겸</div>
                    <div className="phone-desc-text">겸손배려</div>
                    <span className="phone-like-badge">무난함</span>
                  </div>
                </div>
              </div>

              <div className="phone-card">
                <div className="phone-card-header">53세~</div>
                <div className="phone-card-body">
                  <div className="phone-half left wm-dong">
                    <span className="phone-tag t-danger">Danger</span>
                    <div className="phone-val-text c-danger">풍천소축</div>
                    <div className="phone-desc-text">축소다툼</div>
                    <span className="phone-like-badge">병고 주의</span>
                  </div>
                  <div className="phone-divider"></div>
                  <div className="phone-half right wm-h-dong">
                    <span className="phone-tag t-peak">Peak</span>
                    <div className="phone-val-text c-peak">지풍승</div>
                    <div className="phone-desc-text">EV성공</div>
                    <span className="phone-like-badge">Like 노무현</span>
                  </div>
                </div>
              </div>

              <div style={{ height: "100px" }}></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
