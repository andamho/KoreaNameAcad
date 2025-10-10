import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface StoryCardProps {
  title: string;
  excerpt: string;
  category: string;
  onClick: () => void;
}

export function StoryCard({ title, excerpt, category, onClick }: StoryCardProps) {
  return (
    <Card className="p-6 space-y-4 hover-elevate transition-all duration-300 h-full flex flex-col">
      <div className="inline-block">
        <span className="text-xs font-medium text-primary bg-primary/10 px-3 py-1 rounded-full">
          {category}
        </span>
      </div>
      
      <div className="space-y-2 flex-1">
        <h3 className="text-2xl font-semibold text-foreground" data-testid={`text-title-${title}`}>
          {title}
        </h3>
        <p className="text-muted-foreground leading-relaxed tracking-wide line-clamp-3">
          {excerpt}
        </p>
      </div>
      
      <Button
        variant="ghost"
        onClick={onClick}
        data-testid={`button-read-${title}`}
        className="w-full justify-start px-0 text-primary hover:text-primary"
      >
        더 읽기 →
      </Button>
    </Card>
  );
}
