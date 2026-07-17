// 댓글·답글·문의 본문의 URL 을 클릭 가능한 링크로 렌더링.
// 사용자가 붙여넣은 링크(http/https, www.)를 자동으로 <a> 로 바꾼다.
import { Fragment } from "react";

// http(s):// 링크 또는 www. 로 시작하는 링크. 뒤따르는 문장부호(.,!?)·괄호는 링크에서 제외.
const URL_RE = /((?:https?:\/\/|www\.)[^\s<]+)/gi;
const trimTrailing = (u: string): [string, string] => {
  const m = u.match(/[.,!?)\]}'"」』]+$/);
  if (!m) return [u, ""];
  return [u.slice(0, -m[0].length), m[0]];
};

export function Linkify({ children, className }: { children: string | null | undefined; className?: string }) {
  const text = children ?? "";
  const parts: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  const re = new RegExp(URL_RE);
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const raw = match[0];
    const idx = match.index;
    if (idx > last) parts.push(<Fragment key={key++}>{text.slice(last, idx)}</Fragment>);
    const [url, trailing] = trimTrailing(raw);
    const href = url.startsWith("www.") ? `https://${url}` : url;
    parts.push(
      <a
        key={key++}
        href={href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className={className ?? "text-[#18a999] underline underline-offset-2 hover:text-[#149085] break-all"}
      >
        {url}
      </a>,
    );
    if (trailing) parts.push(<Fragment key={key++}>{trailing}</Fragment>);
    last = idx + raw.length;
  }
  if (last < text.length) parts.push(<Fragment key={key++}>{text.slice(last)}</Fragment>);
  return <>{parts}</>;
}
