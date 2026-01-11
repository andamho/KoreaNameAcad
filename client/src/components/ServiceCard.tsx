import { Card } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ServiceCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  buttonText?: string;
  onClick: () => void;
  secondaryButtonText?: string;
  onSecondaryClick?: () => void;
  'data-testid'?: string;
}

export function ServiceCard({ 
  icon: Icon, 
  title, 
  description, 
  buttonText = "자세히 보기", 
  onClick,
  secondaryButtonText,
  onSecondaryClick,
  'data-testid': dataTestId
}: ServiceCardProps) {
  return (
    <Card className="p-6 space-y-4 hover-elevate transition-all duration-300" data-testid={dataTestId}>
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(88, 196, 196, 0.1)' }}>
          <Icon className="h-7 w-7" style={{ color: '#58C4C4' }} strokeWidth={1.5} />
        </div>
        <h3 className="text-[21px] md:text-2xl font-semibold text-foreground break-keep">{title}</h3>
      </div>
      
      <p className="text-lg md:text-lg text-muted-foreground leading-relaxed tracking-wide">
        {description}
      </p>
      
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={onClick}
          data-testid={`button-service-${title}`}
          className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full font-semibold text-sm bg-[#56D5DB] text-white shadow-sm transition-all duration-200 hover:bg-[#4ac5cb] hover:shadow-md active:scale-[0.98]"
        >
          {buttonText} <span className="text-lg">›</span>
        </button>
        
        {secondaryButtonText && onSecondaryClick && (
          <button
            onClick={onSecondaryClick}
            data-testid={`button-service-secondary-${title}`}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full font-semibold text-sm bg-[#56D5DB] text-white shadow-sm transition-all duration-200 hover:bg-[#4ac5cb] hover:shadow-md active:scale-[0.98]"
          >
            {secondaryButtonText} <span className="text-lg">›</span>
          </button>
        )}
      </div>
    </Card>
  );
}
