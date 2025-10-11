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
}

export function ServiceCard({ 
  icon: Icon, 
  title, 
  description, 
  buttonText = "자세히 보기", 
  onClick,
  secondaryButtonText,
  onSecondaryClick
}: ServiceCardProps) {
  return (
    <Card className="p-6 space-y-4 hover-elevate transition-all duration-300">
      <div className="flex items-center gap-3">
        <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(88, 196, 196, 0.1)' }}>
          <Icon className="h-7 w-7" style={{ color: '#58C4C4' }} strokeWidth={1.5} />
        </div>
        <h3 className="text-[21px] md:text-2xl font-semibold text-foreground break-keep">{title}</h3>
      </div>
      
      <p className="text-lg md:text-lg text-muted-foreground leading-relaxed tracking-wide">
        {description}
      </p>
      
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          onClick={onClick}
          data-testid={`button-service-${title}`}
          className="justify-start px-0 hover:text-primary text-lg flex-shrink-0"
          style={{ color: '#58C4C4' }}
        >
          {buttonText} →
        </Button>
        
        {secondaryButtonText && onSecondaryClick && (
          <Button
            variant="ghost"
            onClick={onSecondaryClick}
            data-testid={`button-service-secondary-${title}`}
            className="justify-start px-0 hover:text-primary text-lg flex-shrink-0"
            style={{ color: '#58C4C4' }}
          >
            {secondaryButtonText} →
          </Button>
        )}
      </div>
    </Card>
  );
}
