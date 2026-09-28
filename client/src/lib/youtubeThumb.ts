// 유튜브 주소에서 영상 번호와 썸네일 주소를 뽑는다.
//
// 이름이야기 글은 썸네일을 따로 안 올리고 영상만 넣는 경우가 있다(2026-09-28 원장님 지적:
// '좋은 뜻의 한자를 쓰면…' 글이 목록에서 회색 빈칸으로 보였다).
//
// 주의: maxresdefault 는 세로 영상도 16:9 판에 넣어 좌우를 회색으로 채운다. 정사각 카드에
// 넣으면 그림이 한가운데 조그맣게 박혀 다른 카드와 따로 논다. 그래서 세로 원본(oar2 →
// oardefault)을 먼저 쓰고, 없을 때만 16:9 로 내려간다.
const CHAIN = ["oar2", "oardefault", "maxresdefault", "hqdefault"];

export function youtubeId(url?: string | null): string | null {
  if (!url) return null;
  const m = String(url).match(/(?:youtu\.be\/|\/v\/|\/u\/\w\/|\/embed\/|watch\?v=|&v=|\/shorts\/)([^#&?\s/]+)/);
  return m?.[1] || null;
}

export function youtubeThumb(url?: string | null): string | null {
  const id = youtubeId(url);
  return id ? `https://i.ytimg.com/vi/${id}/${CHAIN[0]}.jpg` : null;
}

// 지금 주소를 못 받았을 때 다음으로 시도할 주소(없으면 null).
export function nextYoutubeThumb(src: string): string | null {
  const i = CHAIN.findIndex((v) => src.includes(`/${v}.jpg`));
  if (i < 0 || i + 1 >= CHAIN.length) return null;
  return src.replace(`/${CHAIN[i]}.jpg`, `/${CHAIN[i + 1]}.jpg`);
}

export function isYoutubeThumb(src?: string | null): boolean {
  return !!src && /(?:i\.ytimg\.com|img\.youtube\.com)\/vi\//.test(src);
}
