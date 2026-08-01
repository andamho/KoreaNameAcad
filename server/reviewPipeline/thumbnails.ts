import type { ThumbnailCandidate, SearchTerm } from "@shared/schema";

/**
 * 저장된 검색어를 SearchTerm[]로 정규화.
 * 예전 후기는 thumbnailKeywords가 문자열 배열(["family","hope"])이라 둘 다 받는다.
 */
export function parseTerms(raw: unknown): SearchTerm[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t: any) => ({
      query: String(typeof t === "string" ? t : t?.query || "").trim(),
      angle: typeof t === "string" ? undefined : (String(t?.angle || "").trim() || undefined),
    }))
    .filter(t => !!t.query);
}

/**
 * 후기 분위기 키워드로 무료 스톡 이미지 후보 5장을 가져온다.
 * 우선순위: Pexels → Pixabay (키가 있는 쪽 사용). 둘 다 없으면 빈 배열.
 */

const PER_PAGE = 5;        // 사용자에게 최종으로 보여줄 장수
const PER_KEYWORD = 8;     // 검색어 하나당 가져올 후보 수
const MAX_KEYWORDS = 4;    // 동시에 검색할 관점(검색어) 수

/** 내부용: 정사각 적합도 판정을 위해 원본 비율을 함께 들고 다닌다 */
type Candidate = ThumbnailCandidate & { aspect?: number };

async function searchPexels(query: string, page = 1): Promise<Candidate[]> {
  const key = process.env.PEXELS_API_KEY?.trim();
  if (!key) return [];
  // orientation은 걸지 않는다. 1:1로 자르므로 가로 고정보다 정사각에 가까운 사진이 유리 →
  // 결과를 받은 뒤 비율로 걸러낸다(아래 squarePenalty).
  const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${PER_KEYWORD}&page=${page}`;
  const res = await fetch(url, { headers: { Authorization: key } });
  if (!res.ok) throw new Error(`Pexels ${res.status}`);
  const data: any = await res.json();
  return (data.photos || []).map((p: any) => ({
    url: p.src?.large2x || p.src?.large || p.src?.original,
    thumbUrl: p.src?.medium || p.src?.small,
    source: "pexels",
    photographer: p.photographer,
    sourceUrl: p.url,
    aspect: p.width && p.height ? p.width / p.height : undefined,
  })).filter((c: Candidate) => !!c.url);
}

async function searchPixabay(query: string, page = 1): Promise<Candidate[]> {
  const key = process.env.PIXABAY_API_KEY?.trim();
  if (!key) return [];
  const url = `https://pixabay.com/api/?key=${key}&q=${encodeURIComponent(query)}&per_page=${PER_KEYWORD}&page=${page}&image_type=photo&safesearch=true`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Pixabay ${res.status}`);
  const data: any = await res.json();
  return (data.hits || []).map((h: any) => ({
    url: h.largeImageURL || h.webformatURL,
    thumbUrl: h.webformatURL || h.previewURL,
    source: "pixabay",
    photographer: h.user,
    sourceUrl: h.pageURL,
    aspect: h.imageWidth && h.imageHeight ? h.imageWidth / h.imageHeight : undefined,
  })).filter((c: Candidate) => !!c.url);
}

/**
 * 1:1 썸네일로 자를 때의 손해. 정사각(1.0)에 가까울수록 0에 가깝고,
 * 파노라마(2.5:1)나 세로로 긴 사진은 좌우/상하가 크게 잘리므로 뒤로 밀린다.
 */
function squarePenalty(c: Candidate): number {
  if (!c.aspect || !isFinite(c.aspect)) return 0.35; // 비율을 모르면 중간 정도로 취급
  const r = c.aspect >= 1 ? c.aspect : 1 / c.aspect;
  return Math.min(1, (r - 1) / 2);                    // 1:1→0, 3:1→1
}

/** 검색어별 결과를 한 장씩 번갈아 뽑아 섞는다(한 검색어가 목록을 독점하지 않게). */
function interleave(lists: Candidate[][]): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Set<string>();
  const depth = Math.max(0, ...lists.map(l => l.length));
  for (let i = 0; i < depth; i++) {
    for (const list of lists) {
      const c = list[i];
      if (!c || seen.has(c.url)) continue;
      seen.add(c.url);
      out.push(c);
    }
  }
  return out;
}

/** 검색어 하나로 사용 가능한 제공자에서 결과를 가져온다(먼저 성공한 쪽 사용). */
async function searchOne(query: string, page: number): Promise<Candidate[]> {
  const providers: Array<(q: string, p?: number) => Promise<Candidate[]>> = [];
  if (process.env.PEXELS_API_KEY) providers.push(searchPexels);
  if (process.env.PIXABAY_API_KEY) providers.push(searchPixabay);
  for (const provider of providers) {
    try {
      const results = await provider(query, page);
      if (results.length) return results;
    } catch (e: any) {
      console.error(`[thumbnails] ${provider.name}("${query}") 실패: ${e?.message}`);
    }
  }
  return [];
}

/**
 * 키워드들로 스톡 이미지 후보를 찾는다.
 * 키워드를 한 문자열로 붙이면(AND 검색) 결과가 급격히 좁아지므로,
 * **검색어마다 따로 검색해 관점을 다양화**하고 번갈아 섞어서 5장을 고른다.
 */
export async function searchThumbnails(terms: SearchTerm[] | string[], page = 1): Promise<ThumbnailCandidate[]> {
  const list = parseTerms(terms).slice(0, MAX_KEYWORDS);
  const queries: SearchTerm[] = list.length ? list : [{ query: "calm", angle: "상징" }, { query: "hope", angle: "상징" }];

  const pick = (lists: Candidate[][]): ThumbnailCandidate[] => {
    // 검색어별 순위를 유지한 채 섞고, 1:1로 자르기 나쁜 비율만 뒤로 민다
    const merged = interleave(lists.map(l => [...l].sort((a, b) => squarePenalty(a) - squarePenalty(b))));
    return merged.slice(0, PER_PAGE).map(({ aspect, ...c }) => c);
  };
  // 어떤 검색어가 찾아온 사진인지 표시(검수 화면에서 보여줌)
  const tag = (cs: Candidate[], t: SearchTerm) => cs.map(c => ({ ...c, query: t.query, angle: t.angle }));

  const lists = await Promise.all(queries.map(async t => tag(await searchOne(t.query, page), t)));
  const primary = pick(lists);
  if (primary.length) return primary;

  // 해당 페이지가 비면(결과 소진) 1페이지로 순환
  if (page > 1) {
    const first = pick(await Promise.all(queries.map(async t => tag(await searchOne(t.query, 1), t))));
    if (first.length) return first;
  }
  // 키워드가 너무 구체적이라 0건이면 일반 키워드로 1회 재시도
  const fb: SearchTerm = { query: "warm light calm", angle: "대체" };
  return pick([tag(await searchOne(fb.query, 1), fb)]);
}

/** URL에서 이미지 바이트를 받아온다(합성·업로드용) */
export async function fetchImageBuffer(url: string): Promise<{ buffer: Buffer; contentType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`이미지 다운로드 실패 ${res.status}`);
  const contentType = res.headers.get("content-type") || "image/jpeg";
  const arrayBuf = await res.arrayBuffer();
  return { buffer: Buffer.from(arrayBuf), contentType };
}
