import { useRef } from "react";
import { Bold, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  "data-testid"?: string;
}

const fontSizeOptions = [
  { value: "14", label: "14px" },
  { value: "16", label: "16px (기본)" },
  { value: "18", label: "18px" },
  { value: "20", label: "20px" },
  { value: "24", label: "24px" },
  { value: "28", label: "28px" },
  { value: "32", label: "32px" },
];

export function RichTextEditor({ value, onChange, placeholder, className, "data-testid": testId }: RichTextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const wrapSelection = (before: string, after: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = value.substring(start, end);

    if (selectedText.length === 0) return;

    const newValue = value.substring(0, start) + before + selectedText + after + value.substring(end);
    onChange(newValue);

    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, end + before.length);
    });
  };

  const handleBold = () => {
    wrapSelection("**", "**");
  };

  const handleFontSize = (size: string) => {
    if (size === "16") return;
    wrapSelection(`{size:${size}}`, `{/size}`);
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 p-1.5 bg-muted/50 rounded-t-md border border-b-0 border-border">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={handleBold}
          className="h-8 px-2.5 font-bold"
          data-testid="button-bold"
        >
          <Bold className="w-4 h-4" />
        </Button>
        <div className="flex items-center gap-1">
          <Type className="w-4 h-4 text-muted-foreground" />
          <Select onValueChange={handleFontSize}>
            <SelectTrigger className="h-8 w-[110px] text-xs" data-testid="select-font-size">
              <SelectValue placeholder="글자 크기" />
            </SelectTrigger>
            <SelectContent>
              {fontSizeOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} data-testid={`font-size-${opt.value}`}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <span className="text-xs text-muted-foreground ml-auto hidden sm:inline">텍스트 선택 후 적용</span>
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`flex w-full rounded-b-md border border-border bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className || ""}`}
        data-testid={testId}
      />
    </div>
  );
}

export function renderFormattedText(text: string): JSX.Element[] {
  const parts: JSX.Element[] = [];
  const regex = /(\*\*(.+?)\*\*|\{size:(\d+)\}([\s\S]*?)\{\/size\})/g;
  let lastIndex = 0;
  let match;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(<span key={key++}>{text.substring(lastIndex, match.index)}</span>);
    }

    if (match[2]) {
      parts.push(<strong key={key++}>{match[2]}</strong>);
    } else if (match[3] && match[4] !== undefined) {
      const size = match[3];
      const innerContent = match[4];
      const boldRegex = /\*\*(.+?)\*\*/g;
      let innerLastIndex = 0;
      let innerMatch;
      const innerParts: JSX.Element[] = [];
      let innerKey = 0;

      while ((innerMatch = boldRegex.exec(innerContent)) !== null) {
        if (innerMatch.index > innerLastIndex) {
          innerParts.push(<span key={innerKey++}>{innerContent.substring(innerLastIndex, innerMatch.index)}</span>);
        }
        innerParts.push(<strong key={innerKey++}>{innerMatch[1]}</strong>);
        innerLastIndex = innerMatch.index + innerMatch[0].length;
      }
      if (innerLastIndex < innerContent.length) {
        innerParts.push(<span key={innerKey++}>{innerContent.substring(innerLastIndex)}</span>);
      }

      parts.push(
        <span key={key++} style={{ fontSize: `${size}px` }}>
          {innerParts.length > 0 ? innerParts : innerContent}
        </span>
      );
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(<span key={key++}>{text.substring(lastIndex)}</span>);
  }

  return parts.length > 0 ? parts : [<span key="0">{text}</span>];
}
