import { useRef, useEffect, useCallback, useState } from "react";
import { Bold, ChevronDown, ImagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  "data-testid"?: string;
  onUploadImage?: (file: File) => Promise<string>;
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

  // Extract image markers before HTML escaping
  const images: { alt: string; src: string }[] = [];
  let processed = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => {
    const idx = images.length;
    images.push({ alt, src });
    return `__IMG_${idx}__`;
  });

  let html = processed
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  html = html.replace(
    /\{size:(\d+)\}([\s\S]*?)\{\/size\}/g,
    (_match, size, content) => {
      const sizeNum = parseInt(size);
      const inner = content.replace(/\*\*([\s\S]+?)\*\*/g, "<strong>$1</strong>");
      // Invalid size (e.g. {size:1} from browser em units) — render without size
      if (sizeNum < 12) return inner;
      return `<span style="font-size:${sizeNum}px">${inner}</span>`;
    }
  );
  html = html.replace(/\*\*([\s\S]+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\n/g, "<br>");

  // Restore images
  images.forEach(({ alt, src }, idx) => {
    const escapedAlt = alt.replace(/"/g, "&quot;");
    html = html.replace(
      `__IMG_${idx}__`,
      `<img src="${src}" alt="${escapedAlt}" style="max-width:100%;display:block;margin:8px 0" />`
    );
  });

  return html;
}

function hasVisibleText(s: string): boolean {
  return /[^\s\n]/.test(s);
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
        // Only wrap in bold markers when there is actual visible text content
        if (inner && hasVisibleText(inner)) {
          result += "**" + inner + "**";
        } else {
          result += inner;
        }
      } else if (tag === "span") {
        const fontSize = el.style.fontSize;
        // Only process px font sizes in a valid range (avoid 1em → 1px bug)
        if (fontSize && fontSize.endsWith("px")) {
          const size = parseInt(fontSize);
          const inner = domToMarkers(el);
          // Only wrap when size is valid, not default 16, and has visible text
          if (size >= 12 && size !== 16 && inner && hasVisibleText(inner)) {
            result += `{size:${size}}` + inner + "{/size}";
          } else {
            result += inner;
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
        // Handles <font>, <u>, and any other browser-generated elements
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
  onUploadImage,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const savedRange = useRef<Range | null>(null);
  const lastSentValue = useRef(value);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sizeMenuOpen, setSizeMenuOpen] = useState(false);
  const [isImageUploading, setIsImageUploading] = useState(false);

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
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand("bold");
    emitChange();
  }, [emitChange]);

  const applyFontSize = useCallback(
    (size: string) => {
      setSizeMenuOpen(false);

      const restored = restoreRange();
      if (!restored) return;

      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;

      const range = sel.getRangeAt(0);
      const ancestor = range.commonAncestorContainer;

      const walker = document.createTreeWalker(
        ancestor.nodeType === Node.TEXT_NODE ? ancestor.parentNode! : ancestor,
        NodeFilter.SHOW_TEXT,
        null
      );

      const toWrap: { node: Text; start: number; end: number }[] = [];
      let n: Text | null;
      while ((n = walker.nextNode() as Text | null)) {
        if (!range.intersectsNode(n)) continue;
        const nr = document.createRange();
        nr.selectNode(n);
        const s =
          range.compareBoundaryPoints(Range.START_TO_START, nr) > 0
            ? range.startOffset
            : 0;
        const e =
          range.compareBoundaryPoints(Range.END_TO_END, nr) < 0
            ? range.endOffset
            : n.length;
        if (s < e) toWrap.push({ node: n, start: s, end: e });
      }

      for (let i = toWrap.length - 1; i >= 0; i--) {
        const { node, start, end } = toWrap[i];

        // Split out exactly the selected portion of the text node
        const target = node.splitText(start);
        if (end - start < target.length) target.splitText(end - start);

        const parent = target.parentNode as HTMLElement;

        // If the parent is already a font-size span AND contains only this one text node,
        // just update the parent's size instead of nesting a new span inside it.
        if (
          parent &&
          parent.tagName.toLowerCase() === "span" &&
          parent.style.fontSize &&
          parent.childNodes.length === 1
        ) {
          parent.style.fontSize = `${size}px`;
        } else {
          const span = document.createElement("span");
          span.style.fontSize = `${size}px`;
          parent.insertBefore(span, target);
          span.appendChild(target);
        }
      }

      emitChange();
    },
    [restoreRange, emitChange]
  );

  const insertImageAtCursor = useCallback(
    (url: string) => {
      if (!editorRef.current) return;

      // Restore saved selection (cursor position before file dialog opened)
      if (savedRange.current) {
        editorRef.current.focus();
        const sel = window.getSelection();
        if (sel) {
          sel.removeAllRanges();
          try {
            sel.addRange(savedRange.current);
          } catch {}
        }
      } else {
        editorRef.current.focus();
      }

      const img = document.createElement("img");
      img.src = url;
      img.alt = "이미지";
      img.style.maxWidth = "100%";
      img.style.display = "block";
      img.style.margin = "8px 0";

      const sel2 = window.getSelection();
      if (sel2 && sel2.rangeCount > 0) {
        const r = sel2.getRangeAt(0);
        r.collapse(true);
        r.insertNode(img);
        r.setStartAfter(img);
        r.setEndAfter(img);
        sel2.removeAllRanges();
        sel2.addRange(r);
      } else {
        editorRef.current.appendChild(img);
      }

      emitChange();
    },
    [emitChange]
  );

  const handleImageFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !onUploadImage) return;
      e.target.value = "";
      setIsImageUploading(true);
      try {
        const url = await onUploadImage(file);
        insertImageAtCursor(url);
      } catch (err) {
        console.error("Image upload failed:", err);
      } finally {
        setIsImageUploading(false);
      }
    },
    [onUploadImage, insertImageAtCursor]
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
      <div className="sticky top-0 z-[100] flex items-center gap-1 p-1.5 bg-muted/80 backdrop-blur-sm rounded-t-md border border-b-0 border-border">
        <div className="flex items-center">
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

          {onUploadImage && (
            <>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={isImageUploading}
                onPointerDown={(e) => {
                  e.preventDefault();
                  saveRange();
                }}
                onClick={() => {
                  fileInputRef.current?.click();
                }}
                className="h-8 px-2.5 flex items-center gap-1 text-xs"
                data-testid="button-insert-image"
              >
                <ImagePlus className="w-4 h-4" />
                {isImageUploading ? "업로드 중..." : "이미지"}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageFileChange}
              />
            </>
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

function parseFormatted(text: string, keyRef: { v: number }): JSX.Element[] {
  const parts: JSX.Element[] = [];
  let i = 0;

  while (i < text.length) {
    const sizeOpenRe = /\{size:(\d+)\}/g;
    sizeOpenRe.lastIndex = i;
    const sizeMatch = sizeOpenRe.exec(text);
    const sizeIdx = sizeMatch ? sizeMatch.index : -1;

    const boldIdx = text.indexOf("**", i);

    const hasSizeFirst =
      sizeIdx >= 0 && (boldIdx < 0 || sizeIdx <= boldIdx);
    const hasBoldFirst =
      boldIdx >= 0 && (sizeIdx < 0 || boldIdx < sizeIdx);

    if (!hasSizeFirst && !hasBoldFirst) {
      if (i < text.length)
        parts.push(<span key={keyRef.v++}>{text.slice(i)}</span>);
      break;
    }

    if (hasSizeFirst) {
      const matchStart = sizeMatch!.index;
      const size = sizeMatch![1];
      const contentStart = matchStart + sizeMatch![0].length;
      const closeIdx = text.indexOf("{/size}", contentStart);

      if (closeIdx < 0) {
        // No closing {/size} found — output text before marker and silently skip the marker
        if (matchStart > i)
          parts.push(<span key={keyRef.v++}>{text.slice(i, matchStart)}</span>);
        i = contentStart;
        continue;
      }

      if (matchStart > i)
        parts.push(<span key={keyRef.v++}>{text.slice(i, matchStart)}</span>);

      const sizeNum = parseInt(size);
      const inner = parseFormatted(text.slice(contentStart, closeIdx), keyRef);
      if (sizeNum >= 12) {
        parts.push(
          <span key={keyRef.v++} style={{ fontSize: `${sizeNum}px` }}>
            {inner}
          </span>
        );
      } else {
        // Invalid size (e.g. {size:1} from browser-generated em units) — render content unstyled
        inner.forEach((el) => parts.push(el));
      }
      i = closeIdx + "{/size}".length;
    } else {
      const matchStart = boldIdx;
      const contentStart = matchStart + 2;
      const closeIdx = text.indexOf("**", contentStart);

      if (closeIdx < 0) {
        // No closing ** found — output text before marker and silently skip the marker
        if (matchStart > i)
          parts.push(<span key={keyRef.v++}>{text.slice(i, matchStart)}</span>);
        i = contentStart;
        continue;
      }

      if (matchStart > i)
        parts.push(<span key={keyRef.v++}>{text.slice(i, matchStart)}</span>);

      parts.push(
        <strong key={keyRef.v++}>
          {parseFormatted(text.slice(contentStart, closeIdx), keyRef)}
        </strong>
      );
      i = closeIdx + 2;
    }
  }

  return parts;
}

export function renderFormattedText(text: string): JSX.Element[] {
  const keyRef = { v: 0 };
  const result = parseFormatted(text, keyRef);
  return result.length > 0 ? result : [<span key="0">{text}</span>];
}
