// 문자·카톡 링크 미리보기(대표 이미지·제목) — 페이지마다 따로 준다.
//
// 이 사이트는 SPA 라서, 링크를 읽는 쪽(문자 앱·카톡 크롤러)은 자바스크립트를 돌리지 않고
// index.html 의 메타만 읽는다. 그래서 어떤 주소를 보내도 홈 대표 이미지가 떴다.
// 아래 표에 있는 주소는 서버가 index.html 의 og/twitter 메타를 바꿔서 내려준다.
// (개발 모드에서는 vite 가 index.html 을 직접 다루므로 건드리지 않는다.)
import fs from "fs";
import path from "path";
import type { Express } from "express";
import { db } from "./db";
import { contents } from "@shared/schema";
import { eq } from "drizzle-orm";

// preload: 리액트가 뜨기 전에 브라우저가 먼저 받아두게 할 첫 화면 사진.
// 없으면 JS 가 다 돌고 화면이 그려진 뒤에야 사진을 받기 시작해 한참 비어 있다.
type Preview = { title: string; description: string; image: string; preload?: string };

const PAGES: Record<string, Preview> = {
  "/gratitude": {
    title: "미용감사",
    description: "미안합니다 · 용서하세요 · 감사합니다 · 사랑합니다",
    image: "/gratitude/og.jpg",
    preload: "/gratitude/self-kindness.webp",
  },
  "/purify": {
    title: "과거 이름 정화하기",
    description: "그 이름과 함께했던 시간을, 감사히 보내주는 시간입니다.",
    image: "/purify/hero.webp",
    preload: "/purify/hero.webp",
  },
};

const esc = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// index.html 의 메타 한 줄을 새 값으로 바꾼다(없으면 그대로 둔다).
function setMeta(html: string, attr: "property" | "name", key: string, value: string): string {
  const re = new RegExp(`(<meta[^>]*${attr}="${key}"[^>]*content=")[^"]*(")`, "i");
  return html.replace(re, `$1${esc(value)}$2`);
}

export function applyPreview(html: string, url: string, page: Preview, siteUrl: string, opts: { keepRobots?: boolean } = {}): string {
  const img = /^https?:\/\//.test(page.image) ? page.image : `${siteUrl}${page.image}`;
  let out = html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${esc(page.title)}</title>`);
  out = setMeta(out, "property", "og:title", page.title);
  out = setMeta(out, "property", "og:description", page.description);
  out = setMeta(out, "property", "og:url", `${siteUrl}${url}`);
  out = setMeta(out, "property", "og:image", img);
  out = setMeta(out, "name", "twitter:title", page.title);
  out = setMeta(out, "name", "twitter:description", page.description);
  out = setMeta(out, "name", "twitter:image", img);
  // 대표 사진이 정사각이라 큰 가로 카드가 아니라 작은 썸네일 카드로 뜨게 한다(원장님 확정).
  out = setMeta(out, "name", "twitter:card", "summary");
  // 주소를 아는 사람만 보는 페이지라 검색엔진에서 뺀다(화면 쪽에서도 같은 값을 넣는다).
  if (!opts.keepRobots) out = setMeta(out, "name", "robots", "noindex, nofollow");
  // index.html 은 홈 화면 사진 몇 장을 미리 받게 해 둔다. 이 페이지에선 쓰지 않으면서
  // 대역폭만 먼저 차지해 정작 볼 사진이 늦게 뜨므로 뺀다.
  out = out.split("\n").filter((l) => !/<link rel="preload" as="image"/i.test(l)).join("\n");
  if (page.preload) {
    const tag = `<link rel="preload" as="image" fetchpriority="high" href="${esc(page.preload)}">`;
    out = out.replace(/<\/head>/i, `  ${tag}
  </head>`);
  }
  return out;
}

// 유튜브 주소에서 썸네일 주소를 뽑는다(화면 쪽 client/src/lib/youtubeThumb.ts 와 같은 규칙).
function youtubeThumb(url?: string | null): string | null {
  if (!url) return null;
  const m = String(url).match(/(?:youtu[.]be[/]|[/]v[/]|[/]embed[/]|watch[?]v=|&v=|[/]shorts[/])([^#&?\s/]+)/);
  return m?.[1] ? `https://img.youtube.com/vi/${m[1]}/maxresdefault.jpg` : null;
}

export function registerPagePreview(app: Express, siteUrl: string) {
  if (process.env.NODE_ENV === "development") return;
  const indexPath = path.resolve(import.meta.dirname, "public", "index.html");

  // 이름이야기 글: 글마다 제목과 대표 사진을 따로 내려준다.
  // 썸네일을 안 올린 글은 영상 썸네일을 쓴다(2026-09-28 원장님 지적).
  app.get("/name-stories/:id", async (req, res, next) => {
    try {
      if (!db) return next();
      const [row] = await db.select().from(contents).where(eq(contents.id, String(req.params.id)));
      if (!row) return next();
      const image = row.thumbnail || youtubeThumb(row.videoUrl);
      if (!image) return next(); // 쓸 사진이 없으면 평소대로(홈 대표 이미지)
      const html = fs.readFileSync(indexPath, "utf-8");
      const desc = String(row.content || "").replace(/!\[[^\]]*\]\([^)]+\)/g, " ").replace(/[#*_>`]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100);
      const page: Preview = { title: row.title, description: desc || "흥미진진 이름이야기", image };
      // 이름이야기는 검색에 나와야 하므로 robots 는 건드리지 않는다.
      res.type("html").send(applyPreview(html, `/name-stories/${row.id}`, page, siteUrl, { keepRobots: true }));
    } catch {
      next();
    }
  });
  for (const url of Object.keys(PAGES)) {
    app.get(url, (_req, res, next) => {
      try {
        const html = fs.readFileSync(indexPath, "utf-8");
        res.type("html").send(applyPreview(html, url, PAGES[url], siteUrl));
      } catch {
        next(); // index.html 을 못 읽으면 평소대로 내보낸다
      }
    });
  }
}
