// 틱톡 업로드 준비(반자동)
// 틱톡 자동 게시는 개발자 앱 심사 반려로 막혀 있다 → 최근 배포 영상의 원본 파일과 본문(인스타 캡션과 똑같이)을 준비해 주고,
// 업로드는 틱톡 앱/웹에서 직접 한다: 영상 받기 → 틱톡 열기 → 영상 선택 → 본문 붙여넣기 → 게시.
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface Job { id: string; title: string; createdAt: string; ytStatus: string }
interface Prep { id: string; title: string; hasScript: boolean; caption: string; fileName: string; videoUrl: string }

const FIXED_HASHTAGS = "#한국이름학교 #와츠유어네임이름연구협회 #작명 #개명 #이름분석 #이름풀이";
const cleanTitle = (t: string) => (t.endsWith(FIXED_HASHTAGS) ? t.slice(0, -FIXED_HASHTAGS.length).trim() : t);
const TIKTOK_UPLOAD_URL = "https://www.tiktok.com/tiktokstudio/upload";
// 목록은 최근 배포분부터(네이버 클립 준비와 같은 기준)
const LIST_FROM = Date.parse("2026-09-24T00:00:00+09:00");
// 이 기능 이전에 이미 틱톡에 올린 영상(2026-10-04 안대장님 확인): 물거품 · 16개의 운 · 좋은 뜻의 한자
const ALREADY_UPLOADED = new Set([
  "781893ba-5673-43cb-9b2d-2cdc937b3a58",
  "fdaba429-6f10-4725-9a04-60ca88681114",
  "3465d07c-9c9b-4c6a-9198-c76c3246aa8f",
]);
// "올림 완료"로 숨긴 영상(이 브라우저에만 기억, 네이버 클립과 따로)
const DONE_KEY = "tiktokManualUploadedJobIds";
const readDone = (): string[] => {
  try { const v = JSON.parse(localStorage.getItem(DONE_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
};
const writeDone = (ids: string[]) => { try { localStorage.setItem(DONE_KEY, JSON.stringify(ids)); } catch {} };

export function TiktokManualPanel({ refreshKey }: { refreshKey?: unknown }) {
  const { toast } = useToast();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [prep, setPrep] = useState<Prep | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string[]>(readDone);
  const [showHidden, setShowHidden] = useState(false);
  const auth = () => ({ Authorization: `Bearer ${localStorage.getItem("kna_admin_token")}` });

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/admin/video/jobs", { headers: auth() });
        const rows: Job[] = r.ok ? await r.json() : [];
        const seen = new Set<string>();
        setJobs(rows.filter((j) => {
          if (j.ytStatus !== "published" || Date.parse(j.createdAt) < LIST_FROM) return false;
          const t = cleanTitle(j.title);
          if (seen.has(t)) return false;
          seen.add(t);
          return true;
        }));
      } catch {
        setJobs([]);
      }
    })();
  }, [refreshKey]);

  const isHidden = (id: string) => ALREADY_UPLOADED.has(id) || done.includes(id);
  const visible = jobs.filter((j) => !isHidden(j.id)).slice(0, 5);
  const hidden = jobs.filter((j) => isHidden(j.id));

  // 서명된 영상 주소는 15분짜리라, 받을 때마다 새로 받는다
  const load = async (id: string): Promise<Prep | null> => {
    const r = await fetch(`/api/admin/video/jobs/${id}/tiktok-manual`, { headers: auth() });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { toast({ title: "준비 실패", description: d.error, variant: "destructive" }); return null; }
    setPrep(d);
    return d;
  };

  const open = async (id: string) => {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    setPrep(null);
    setText("");
    setBusy(true);
    try {
      const d = await load(id);
      if (d) setText(d.caption);
    } finally {
      setBusy(false);
    }
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
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "본문 복사됨", description: "틱톡 게시 화면의 설명 칸에 붙여넣으세요." });
    } catch {
      toast({ title: "자동 복사 실패", description: "아래 본문 칸을 길게 눌러 직접 복사하세요.", variant: "destructive" });
    }
  };

  const markDone = (id: string) => {
    const next = Array.from(new Set([...done, id]));
    setDone(next);
    writeDone(next);
    if (openId === id) setOpenId(null);
    toast({ title: "올림 완료로 숨겼습니다", description: "아래 '숨긴 영상 보기'에서 다시 보이게 할 수 있습니다." });
  };
  const unhide = (id: string) => {
    const next = done.filter((x) => x !== id);
    setDone(next);
    writeDone(next);
  };

  return (
    <Card className="p-6 space-y-3">
      <div>
        <h2 className="text-lg font-semibold mb-1">틱톡 업로드 준비</h2>
        <p className="text-sm text-muted-foreground">
          틱톡은 자동 게시가 막혀 있어 직접 올립니다. 영상과 본문(인스타와 같은 내용)은 여기서 준비됩니다.
        </p>
        <ol className="text-xs text-muted-foreground list-decimal pl-4 mt-1 space-y-0.5">
          <li>영상 받기</li>
          <li>틱톡 열기(PC 웹 또는 틱톡 앱) → 받은 영상 선택</li>
          <li>본문 복사 → 설명 칸에 붙여넣기 → 게시 → 올림 완료</li>
        </ol>
      </div>

      {visible.length === 0 ? (
        <div className="text-sm text-muted-foreground">틱톡에 올릴 영상이 없습니다(모두 올림 완료).</div>
      ) : (
        <div className="space-y-2">
          {visible.map((j) => (
            <div key={j.id} className="border rounded-lg">
              <button type="button" className="w-full text-left px-3 py-2 flex items-center justify-between gap-2" onClick={() => open(j.id)}>
                <span className="text-sm truncate">{cleanTitle(j.title)}</span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {new Date(j.createdAt).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })} {openId === j.id ? "▲" : "▼"}
                </span>
              </button>
              {openId === j.id && (
                <div className="px-3 pb-3 space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={download} disabled={busy || !prep}>① 영상 받기</Button>
                    <Button size="sm" variant="outline" asChild>
                      <a href={TIKTOK_UPLOAD_URL} target="_blank" rel="noreferrer">② 틱톡 열기</a>
                    </Button>
                    <Button size="sm" variant="outline" onClick={copy} disabled={!text}>③ 본문 복사</Button>
                    <Button size="sm" variant="secondary" className="ml-auto" onClick={() => markDone(j.id)}>✓ 올림 완료</Button>
                  </div>
                  {busy && !prep && <div className="text-xs text-muted-foreground">준비 중…</div>}
                  {prep && !prep.hasScript && (
                    <div className="text-xs text-amber-600">이 배포에는 대본이 없어 홍보문구와 해시태그만 들어갑니다.</div>
                  )}
                  {text && (
                    <textarea
                      className="w-full min-h-48 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                    />
                  )}
                  <div className="text-xs text-muted-foreground">
                    본문은 인스타 캡션과 같습니다(대본 + 고정 홍보문구 + 해시태그). 고쳐서 복사해도 됩니다.
                    {prep && <> · 파일: {prep.fileName} (원본 화질)</>}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {hidden.length > 0 && (
        <div className="pt-1">
          <button type="button" className="text-xs text-muted-foreground underline" onClick={() => setShowHidden((v) => !v)}>
            올림 완료로 숨긴 영상 {hidden.length}개 {showHidden ? "접기" : "보기"}
          </button>
          {showHidden && (
            <div className="mt-2 space-y-1">
              {hidden.map((j) => (
                <div key={j.id} className="flex items-center justify-between gap-2 text-xs text-muted-foreground border rounded px-2 py-1">
                  <span className="truncate">✓ {cleanTitle(j.title)}</span>
                  {ALREADY_UPLOADED.has(j.id) ? (
                    <span className="shrink-0">올림 완료</span>
                  ) : (
                    <button type="button" className="shrink-0 underline" onClick={() => unhide(j.id)}>다시 보이기</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
