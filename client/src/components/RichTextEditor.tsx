import { useRef, useEffect, useCallback, useState } from "react";
import { Bold, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  "data-testid"?: string;
}

const fontSizeOptions = [
  { value: "14", label: "14px" },
  { value: "16", label: "16px 기본" },
  { value: "18", label: "18px" },
  { value: "20", label: "20px" },
  { value: "24", label: "24px" },
  { value: "28", label: "28px" },
  { value: "32", label: "32px" },
];

function markersToHtml(text: string): string {
  if (!text) return "";
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  html = html.replace(
    /\{size:(\d+)\}([\s\S]*?)\{\/size\}/g,
    (_match, size, content) => {
      const processed = content.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      return `<span style="font-size:${size}px">${processed}</span>`;
    }
  );
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\n/g, "<br>");
  return html;
}

function domToMarkers(node: Node): string {
  let result = "";
  const children = Array.from(node.childNodes);

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.nodeType === Node.TEXT_NODE) {
      result += child.textContent || "";
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as HTMLElement;
      const tag = el.tagName.toLowerCase();

      if (tag === "br") {
        result += "\n";
      } else if (tag === "strong" || tag === "b") {
        const inner = domToMarkers(el);
        if (inner) result += "**" + inner + "**";
      } else if (tag === "span") {
        const fontSize = el.style.fontSize;
        if (fontSize) {
          const size = parseInt(fontSize);
          if (size && size !== 16) {
            result += `{size:${size}}` + domToMarkers(el) + "{/size}";
          } else {
            result += domToMarkers(el);
          }
        } else {
          result += domToMarkers(el);
        }
      } else if (tag === "div" || tag === "p") {
        if (i > 0) result += "\n";
        result += domToMarkers(el);
      } else if (tag === "img") {
        const alt = el.getAttribute("alt") || "이미지";
        const src = el.getAttribute("src") || "";
        result += `![${alt}](${src})`;
      } else {
        result += domToMarkers(el);
      }
    }
  }
  return result;
}

function htmlToMarkers(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  let result = domToMarkers(div);
  result = result.replace(/\n{3,}/g, "\n\n");
  result = result.replace(/\n$/, "");
  return result;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  className,
  "data-testid": testId,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const savedRange = useRef<Range | null>(null);
  const lastSentValue = useRef(value);
  const [sizeMenuOpen, setSizeMenuOpen] = useState(false);

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.innerHTML = markersToHtml(value);
      lastSentValue.current = value;
    }
  }, []);

  useEffect(() => {
    if (!editorRef.current) return;
    if (value === lastSentValue.current) return;
    const currentContent = htmlToMarkers(editorRef.current.innerHTML);
    if (currentContent === value) {
      lastSentValue.current = value;
      return;
    }
    editorRef.current.innerHTML = markersToHtml(value);
    lastSentValue.current = value;
  }, [value]);

  const saveRange = useCallback(() => {
    const sel = window.getSelection();
    if (
      sel &&
      sel.rangeCount > 0 &&
      editorRef.current?.contains(sel.anchorNode)
    ) {
      try {
        savedRange.current = sel.getRangeAt(0).cloneRange();
      } catch {
        savedRange.current = null;
      }
    }
  }, []);

  const restoreRange = useCallback((): boolean => {
    if (!savedRange.current || !editorRef.current) return false;
    editorRef.current.focus();
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      try {
        sel.addRange(savedRange.current);
        return !sel.isCollapsed;
      } catch {
        return false;
      }
    }
    return false;
  }, []);

  const emitChange = useCallback(() => {
    if (!editorRef.current) return;
    const markers = htmlToMarkers(editorRef.current.innerHTML);
    lastSentValue.current = markers;
    onChange(markers);
  }, [onChange]);

  const applyBold = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const ancestor =
      range.commonAncestorContainer.nodeType === Node.TEXT_NODE
        ? range.commonAncestorContainer.parentElement
        : (range.commonAncestorContainer as Element);
    const existingBold = ancestor?.closest("strong, b");

    if (existingBold) {
      const parent = existingBold.parentNode!;
      while (existingBold.firstChild) {
        parent.insertBefore(existingBold.firstChild, existingBold);
      }
      parent.removeChild(existingBold);
    } else {
      try {
        const strong = document.createElement("strong");
        range.surroundContents(strong);
      } catch {
        const fragment = range.extractContents();
        const strong = document.createElement("strong");
        strong.appendChild(fragment);
        range.insertNode(strong);
      }
    }
    saveRange();
    emitChange();
  }, [saveRange, emitChange]);

  const applyFontSize = useCallback(
    (size: string) => {
      setSizeMenuOpen(false);

      const restored = restoreRange();
      if (!restored) return;

      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;

      const range = sel.getRangeAt(0);
      const span = document.createElement("span");
      span.style.fontSize = `${size}px`;
      try {
        range.surroundContents(span);
      } catch {
        const fragment = range.extractContents();
        span.appendChild(fragment);
        range.insertNode(span);
      }
      sel.removeAllRanges();
      const newRange = document.createRange();
      newRange.selectNodeContents(span);
      sel.addRange(newRange);
      saveRange();
      emitChange();
    },
    [restoreRange, saveRange, emitChange]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      e.preventDefault();
      const text = e.clipboardData.getData("text/plain");
      document.execCommand("insertText", false, text);
      emitChange();
    },
    [emitChange]
  );

  const handleInput = useCallback(() => {
    emitChange();
  }, [emitChange]);

  const isEmpty = !value || value.trim() === "";

  return (
    <div className="space-y-0">
      <div className="flex items-center gap-2 p-1.5 bg-muted/50 rounded-t-md border border-b-0 border-border">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onPointerDown={(e) => {
            e.preventDefault();
            applyBold();
          }}
          className="h-8 px-2.5 font-bold"
          data-testid="button-bold"
        >
          <Bold className="w-4 h-4" />
        </Button>

        <div className="relative">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setSizeMenuOpen((prev) => !prev)}
            className="h-8 px-2.5 flex items-center gap-1 text-xs"
            data-testid="button-font-size-toggle"
          >
            글자 크기
            <ChevronDown className="w-3 h-3" />
          </Button>

          {sizeMenuOpen && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-background border border-border rounded-md shadow-md overflow-hidden min-w-[110px]">
              {fontSizeOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    applyFontSize(opt.value);
                  }}
                  className="w-full text-left px-3 py-1.5 text-sm hover-elevate"
                  style={{ fontSize: `${Math.min(parseInt(opt.value), 20)}px` }}
                  data-testid={`font-size-${opt.value}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <span className="text-xs text-muted-foreground ml-auto hidden sm:inline">
          텍스트 선택 후 적용
        </span>
      </div>

      <div className="relative">
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onSelect={saveRange}
          onMouseUp={saveRange}
          onKeyUp={saveRange}
          onTouchEnd={saveRange}
          onBlur={() => {
            saveRange();
          }}
          onPaste={handlePaste}
          onClick={() => setSizeMenuOpen(false)}
          className={`w-full rounded-b-md border border-border bg-background px-3 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 overflow-auto whitespace-pre-wrap break-words ${className || ""}`}
          style={{ minHeight: "150px" }}
          data-testid={testId}
        />
        {isEmpty && placeholder && (
          <div className="absolute top-2 left-3 text-muted-foreground pointer-events-none select-none text-base">
            {placeholder}
          </div>
        )}
      </div>
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
      parts.push(
        <span key={key++}>{text.substring(lastIndex, match.index)}</span>
      );
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
          innerParts.push(
            <span key={innerKey++}>
              {innerContent.substring(innerLastIndex, innerMatch.index)}
            </span>
          );
        }
        innerParts.push(<strong key={innerKey++}>{innerMatch[1]}</strong>);
        innerLastIndex = innerMatch.index + innerMatch[0].length;
      }
      if (innerLastIndex < innerContent.length) {
        innerParts.push(
          <span key={innerKey++}>
            {innerContent.substring(innerLastIndex)}
          </span>
        );
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
