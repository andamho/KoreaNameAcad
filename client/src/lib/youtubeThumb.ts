// 유튜브 주소에서 영상 번호와 썸네일 주소를 뽑는다.
//
// 이름이야기 글은 썸네일을 따로 안 올리고 영상만 넣는 경우가 있다(2026-09-28 원장님 지적:
// '좋은 뜻의 한자를 쓰면…' 글이 목록에서 회색 빈칸으로 보였다).
// 그럴 때는 영상 썸네일을 대표 이미지로 쓴다.
export function youtubeId(url?: string | null): string | null {
  if (!url) return null;
  const m = String(url).match(/(?:youtu\.be\/|\/v\/|\/u\/\w\/|\/embed\/|watch\?v=|&v=|\/shorts\/)([^#&?\s/]+)/);
  return m?.[1] || null;
}

// maxres 는 없는 영상도 있어서, 못 받으면 hq 로 내려간다(nextYoutubeThumb).
export function youtubeThumb(url?: string | null): string | null {
  const id = youtubeId(url);
  return id ? `https://img.youtube.com/vi/${id}/maxresdefault.jpg` : null;
}

export function nextYoutubeThumb(src: string): string | null {
  if (src.includes("maxresdefault")) return src.replace("maxresdefault", "hqdefault");
  return null;
}
