import { Card } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ServiceCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  buttonText?: string;
  onClick: () => void;
}

export function ServiceCard({ icon: Icon, title, description, buttonText = "자세히 보기", onClick }: ServiceCardProps) {
  return (
    <Card className="p-6 space-y-4 hover-elevate transition-all duration-300">
      <div className="flex items-center gap-3">
        <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(88, 196, 196, 0.1)' }}>
          <Icon className="h-7 w-7" style={{ color: '#58C4C4' }} strokeWidth={1.5} />
        </div>
        <h3 className="text-2xl font-semibold text-foreground">{title}</h3>
      </div>
      
      <p className="text-lg text-muted-foreground leading-relaxed tracking-wide">
        {description}
      </p>
      
      <Button
        variant="ghost"
        onClick={onClick}
        data-testid={`button-service-${title}`}
        className="w-full justify-start px-0 hover:text-primary text-lg"
        style={{ color: '#58C4C4' }}
      >
        {buttonText} →
      </Button>
    </Card>
  );
}
