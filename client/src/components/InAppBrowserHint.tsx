import { useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

interface InAppBrowserHintProps {
  platform: "instagram" | "tiktok";
}

export default function InAppBrowserHint({ platform }: InAppBrowserHintProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.origin);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  const handleOpenExternal = () => {
    window.open(window.location.href, "_blank");
  };

  const platformName = platform === "instagram" ? "인스타그램" : "틱톡";
  const menuIcon = platform === "instagram" ? "···" : "···";

  return (
    <div className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border-b border-amber-200 dark:border-amber-800">
      <div className="max-w-7xl mx-auto px-4 py-2.5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200">
            <span>📌</span>
            <span className="font-medium">더 정확한 화면은 브라우저에서</span>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleOpenExternal}
              className="h-7 px-3 text-xs bg-white dark:bg-gray-800 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/30"
              data-testid="button-open-browser"
            >
              <ExternalLink className="w-3 h-3 mr-1.5" />
              브라우저로 열기
            </Button>
            
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200 transition-colors"
              data-testid="button-toggle-help"
            >
              <span>열기 방법</span>
              {isExpanded ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>
        
        {isExpanded && (
          <div className="mt-3 pt-3 border-t border-amber-200 dark:border-amber-800">
            <div className="text-sm text-amber-700 dark:text-amber-300 space-y-2">
              <p className="font-medium">
                {platformName} 인앱 브라우저에서 외부 브라우저로 여는 방법:
              </p>
              <ol className="list-decimal list-inside space-y-1.5 text-amber-600 dark:text-amber-400 ml-1">
                <li>화면 오른쪽 상단의 <span className="font-bold">{menuIcon}</span> 메뉴를 탭하세요</li>
                <li><span className="font-medium">"브라우저에서 열기"</span> 또는 <span className="font-medium">"Safari/Chrome에서 열기"</span>를 선택하세요</li>
              </ol>
              
              <div className="flex items-center gap-2 mt-3 pt-2">
                <span className="text-xs text-amber-500 dark:text-amber-500">또는 링크 복사:</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleCopyLink}
                  className="h-6 px-2 text-xs text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                  data-testid="button-copy-link"
                >
                  {copied ? (
                    <>
                      <Check className="w-3 h-3 mr-1" />
                      복사됨!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3 mr-1" />
                      주소 복사
                    </>
                  )}
                </Button>
              </div>
              
              <p className="text-xs text-amber-500 dark:text-amber-500 mt-2">
                💡 외부 브라우저에서 열면 모든 기능이 정상적으로 작동합니다
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
