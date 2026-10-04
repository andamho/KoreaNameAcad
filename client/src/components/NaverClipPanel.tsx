// 네이버 클립 업로드 준비(반자동)
// 네이버 클립은 공개 업로드 API 가 없다 → 최근 배포 영상의 원본 파일과 본문(대본+홍보문구+해시태그)을 준비해 주고,
// 업로드는 클립 크리에이터(PC 웹 또는 앱)에서 직접 한다: 영상 받기 → 클립 열기 → 영상 선택 → 본문 붙여넣기 → 업로드.
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface Job { id: string; title: string; createdAt: string; ytStatus: string; ytVideoId: string | null }
interface Prep { id: string; title: string; hasScript: boolean; caption: string; fileName: string; videoUrl: string }

const FIXED_HASHTAGS = "#한국이름학교 #와츠유어네임이름연구협회 #작명 #개명 #이름분석 #이름풀이";
const cleanTitle = (t: string) => (t.endsWith(FIXED_HASHTAGS) ? t.slice(0, -FIXED_HASHTAGS.length).trim() : t);
const CLIP_UPLOAD_URL = "https://clipcreators.naver.com";

export function NaverClipPanel({ refreshKey }: { refreshKey?: unknown }) {
  const { toast } = useToast();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [prep, setPrep] = useState<Prep | null>(null);
  const [busy, setBusy] = useState(false);
  const auth = () => ({ Authorization: `Bearer ${localStorage.getItem("kna_admin_token")}` });

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/admin/video/jobs", { headers: auth() });
        const rows: Job[] = r.ok ? await r.json() : [];
        setJobs(rows.filter((j) => j.ytStatus === "published").slice(0, 5));
      } catch {
        setJobs([]);
      }
    })();
  }, [refreshKey]);

  // 서명된 영상 주소는 15분짜리라, 버튼을 누를 때마다 새로 받는다
  const load = async (id: string): Promise<Prep | null> => {
    const r = await fetch(`/api/admin/video/jobs/${id}/naver-clip`, { headers: auth() });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { toast({ title: "준비 실패", description: d.error, variant: "destructive" }); return null; }
    setPrep(d);
    return d;
  };

  const open = async (id: string) => {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    setPrep(null);
    setBusy(true);
    try { await load(id); } finally { setBusy(false); }
  };

  const download = async () => {
    if (!openId) return;
    setBusy(true);
    try {
      const d = await load(openId);
      if (d) {
        const a = document.createElement("a");
        a.href = d.videoUrl;
        a.download = d.fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        toast({ title: "영상 받는 중", description: d.fileName });
      }
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!prep) return;
    try {
      await navigator.clipboard.writeText(prep.caption);
      toast({ title: "본문 복사됨", description: "클립 업로드 화면의 설명 칸에 붙여넣으세요." });
    } catch {
      toast({ title: "자동 복사 실패", description: "아래 본문 칸을 길게 눌러 직접 복사하세요.", variant: "destructive" });
    }
  };

  return (
    <Card className="p-6 space-y-3">
      <div>
        <h2 className="text-lg font-semibold mb-1">네이버 클립 업로드 준비</h2>
        <p className="text-sm text-muted-foreground">
          네이버 클립은 자동 업로드가 안 됩니다. 영상과 본문은 여기서 준비되니, 아래 순서로 올려 주세요.
        </p>
        <ol className="text-xs text-muted-foreground list-decimal pl-4 mt-1 space-y-0.5">
          <li>영상 받기</li>
          <li>클립 열기(PC 웹 또는 클립 크리에이터 앱) → 받은 영상 선택</li>
          <li>본문 복사 → 설명 칸에 붙여넣기 → 업로드</li>
        </ol>
      </div>

      {jobs.length === 0 ? (
        <div className="text-sm text-muted-foreground">유튜브까지 배포된 최근 영상이 없습니다.</div>
      ) : (
        <div className="space-y-2">
          {jobs.map((j) => (
            <div key={j.id} className="border rounded-lg">
              <button type="button" className="w-full text-left px-3 py-2 flex items-center justify-between gap-2" onClick={() => open(j.id)}>
                <span className="text-sm truncate">{cleanTitle(j.title)}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {new Date(j.createdAt).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })} {openId === j.id ? "▲" : "▼"}
                </span>
              </button>
              {openId === j.id && (
                <div className="px-3 pb-3 space-y-2">
                  {!prep ? (
                    <div className="text-xs text-muted-foreground">{busy ? "준비 중…" : ""}</div>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" onClick={download} disabled={busy}>① 영상 받기</Button>
                        <Button size="sm" variant="outline" asChild>
                          <a href={CLIP_UPLOAD_URL} target="_blank" rel="noreferrer">② 클립 열기</a>
                        </Button>
                        <Button size="sm" variant="outline" onClick={copy}>③ 본문 복사</Button>
                      </div>
                      {!prep.hasScript && (
                        <div className="text-xs text-amber-600">이 배포에는 대본이 없어 홍보문구와 해시태그만 들어갑니다.</div>
                      )}
                      <textarea
                        readOnly
                        className="w-full min-h-40 rounded-md border border-input bg-muted/30 px-3 py-2 text-xs"
                        value={prep.caption}
                        onFocus={(e) => e.currentTarget.select()}
                      />
                      <div className="text-xs text-muted-foreground">파일: {prep.fileName} (원본 화질)</div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
