import { Card } from "@/components/ui/card";
import { Star } from "lucide-react";

interface TestimonialCardProps {
  name: string;
  service: string;
  content: string;
  rating: number;
}

export function TestimonialCard({ name, service, content, rating }: TestimonialCardProps) {
  return (
    <Card className="p-6 space-y-4 h-full">
      <div className="flex items-center gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className={`h-4 w-4 ${
              i < rating ? "fill-primary text-primary" : "text-muted"
            }`}
          />
        ))}
      </div>
      
      <p className="text-foreground leading-relaxed tracking-wide">
        "{content}"
      </p>
      
      <div className="pt-4 border-t space-y-1">
        <p className="font-semibold text-foreground" data-testid={`text-name-${name}`}>
          {name}
        </p>
        <p className="text-sm text-muted-foreground" data-testid={`text-service-${service}`}>
          {service}
        </p>
      </div>
    </Card>
  );
}
