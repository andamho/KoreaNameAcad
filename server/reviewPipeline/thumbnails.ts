import type { ThumbnailCandidate } from "@shared/schema";

/**
 * 후기 분위기 키워드로 무료 스톡 이미지 후보 5장을 가져온다.
 * 우선순위: Pexels → Pixabay (키가 있는 쪽 사용). 둘 다 없으면 빈 배열.
 */

const PER_PAGE = 5;

async function searchPexels(query: string, page = 1): Promise<ThumbnailCandidate[]> {
  const key = process.env.PEXELS_API_KEY?.trim();
  if (!key) return [];
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${PER_PAGE}&page=${page}&orientation=landscape`;
  const res = await fetch(url, { headers: { Authorization: key } });
  if (!res.ok) throw new Error(`Pexels ${res.status}`);
  const data: any = await res.json();
  return (data.photos || []).map((p: any) => ({
    url: p.src?.large2x || p.src?.large || p.src?.original,
    thumbUrl: p.src?.medium || p.src?.small,
    source: "pexels",
    photographer: p.photographer,
    sourceUrl: p.url,
  })).filter((c: ThumbnailCandidate) => !!c.url);
}

async function searchPixabay(query: string, page = 1): Promise<ThumbnailCandidate[]> {
  const key = process.env.PIXABAY_API_KEY?.trim();
  if (!key) return [];
  const url = `https://pixabay.com/api/?key=${key}&q=${encodeURIComponent(query)}&per_page=${PER_PAGE}&page=${page}&image_type=photo&orientation=horizontal&safesearch=true`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Pixabay ${res.status}`);
  const data: any = await res.json();
  return (data.hits || []).map((h: any) => ({
    url: h.largeImageURL || h.webformatURL,
    thumbUrl: h.webformatURL || h.previewURL,
    source: "pixabay",
    photographer: h.user,
    sourceUrl: h.pageURL,
  })).filter((c: ThumbnailCandidate) => !!c.url);
}

export async function searchThumbnails(keywords: string[], page = 1): Promise<ThumbnailCandidate[]> {
  const query = (keywords && keywords.length ? keywords.slice(0, 3) : ["calm", "hope"]).join(" ");
  const providers: Array<(q: string, p?: number) => Promise<ThumbnailCandidate[]>> = [];
  if (process.env.PEXELS_API_KEY) providers.push(searchPexels);
  if (process.env.PIXABAY_API_KEY) providers.push(searchPixabay);

  for (const provider of providers) {
    try {
      const results = await provider(query, page);
      if (results.length) return results.slice(0, PER_PAGE);
    } catch (e: any) {
      console.error(`[thumbnails] ${provider.name} 실패: ${e?.message}`);
    }
  }
  // 해당 페이지가 비면(결과 소진) 1페이지로 순환
  if (page > 1) {
    for (const provider of providers) {
      try {
        const results = await provider(query, 1);
        if (results.length) return results.slice(0, PER_PAGE);
      } catch { /* ignore */ }
    }
  }
  // 키워드가 너무 구체적이라 0건이면 일반 키워드로 1회 재시도
  for (const provider of providers) {
    try {
      const results = await provider("warm light calm", 1);
      if (results.length) return results.slice(0, PER_PAGE);
    } catch { /* ignore */ }
  }
  return [];
}

/** URL에서 이미지 바이트를 받아온다(합성·업로드용) */
export async function fetchImageBuffer(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`이미지 다운로드 실패 ${res.status}`);
  const contentType = res.headers.get("content-type") || "image/jpeg";
  const arrayBuf = await res.arrayBuffer();
  return { buffer: Buffer.from(arrayBuf), contentType };
}
