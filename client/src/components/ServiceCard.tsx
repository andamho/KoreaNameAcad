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
      <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center">
        <Icon className="h-6 w-6 text-primary" />
      </div>
      
      <div className="space-y-2">
        <h3 className="text-xl font-semibold text-foreground">{title}</h3>
        <p className="text-muted-foreground leading-relaxed tracking-wide">
          {description}
        </p>
      </div>
      
      <Button
        variant="ghost"
        onClick={onClick}
        data-testid={`button-service-${title}`}
        className="w-full justify-start px-0 text-primary hover:text-primary"
      >
        {buttonText} →
      </Button>
    </Card>
  );
}
