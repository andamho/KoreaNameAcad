// 네이버 클립 업로드 준비(반자동)
// 네이버 클립은 공개 업로드 API 가 없다 → 최근 배포 영상의 원본 파일과 설명란 글을 준비해 주고,
// 업로드는 클립 크리에이터(PC 웹 또는 앱)에서 직접 한다: 영상 받기 → 클립 열기 → 영상 선택 → 설명 붙여넣기 → 업로드.
// 설명란 글 = 대본을 읽고 시청자에게 영상을 설명하는 글(AI) + #한국이름학교 #와츠유어네임이름연구협회(항상).
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface Job { id: string; title: string; createdAt: string; ytStatus: string; ytVideoId: string | null }
interface Prep { id: string; title: string; hasScript: boolean; fileName: string; videoUrl: string }

const FIXED_HASHTAGS = "#한국이름학교 #와츠유어네임이름연구협회 #작명 #개명 #이름분석 #이름풀이";
const cleanTitle = (t: string) => (t.endsWith(FIXED_HASHTAGS) ? t.slice(0, -FIXED_HASHTAGS.length).trim() : t);
const CLIP_UPLOAD_URL = "https://clipcreators.naver.com";
const MAX_CHARS = 300; // 클립 설명란 글자 수 제한(설명 + 해시태그)

export function NaverClipPanel({ refreshKey }: { refreshKey?: unknown }) {
  const { toast } = useToast();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [prep, setPrep] = useState<Prep | null>(null);
  const [desc, setDesc] = useState("");
  const [descState, setDescState] = useState<"idle" | "writing" | "error">("idle");
  const [descError, setDescError] = useState("");
  const [busy, setBusy] = useState(false);
  const [direction, setDirection] = useState(""); // 수정 방향(예: 더 짧게, 질문으로 시작)
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

  // instruction 이 있으면 지금 설명글(previous)을 그 방향으로 고쳐 쓴다
  const writeDescription = async (id: string, regenerate = false, instruction = "") => {
    setDescState("writing");
    setDescError("");
    try {
      const r = await fetch(`/api/admin/video/jobs/${id}/naver-clip/description`, {
        method: "POST",
        headers: { ...auth(), "Content-Type": "application/json" },
        body: JSON.stringify({ regenerate, instruction, previous: instruction ? desc : "" }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "설명 만들기 실패");
      setDesc(d.text);
      setDescState("idle");
    } catch (e: any) {
      setDescError(e?.message || "설명 만들기 실패");
      setDescState("error");
    }
  };

  const open = async (id: string) => {
    if (openId === id) { setOpenId(null); return; }
    setOpenId(id);
    setPrep(null);
    setDesc("");
    setDirection("");
    setBusy(true);
    try {
      await Promise.all([load(id), writeDescription(id)]);
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
    if (!desc) return;
    try {
      await navigator.clipboard.writeText(desc);
      toast({ title: "설명 복사됨", description: "클립 업로드 화면의 설명란에 붙여넣으세요." });
    } catch {
      toast({ title: "자동 복사 실패", description: "아래 설명 칸을 길게 눌러 직접 복사하세요.", variant: "destructive" });
    }
  };

  return (
    <Card className="p-6 space-y-3">
      <div>
        <h2 className="text-lg font-semibold mb-1">네이버 클립 업로드 준비</h2>
        <p className="text-sm text-muted-foreground">
          네이버 클립은 자동 업로드가 안 됩니다. 영상과 설명란 글은 여기서 준비되니, 아래 순서로 올려 주세요.
        </p>
        <ol className="text-xs text-muted-foreground list-decimal pl-4 mt-1 space-y-0.5">
          <li>영상 받기</li>
          <li>클립 열기(PC 웹 또는 클립 크리에이터 앱) → 받은 영상 선택</li>
          <li>설명 복사 → 설명란에 붙여넣기 → 업로드</li>
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
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={download} disabled={busy || !prep}>① 영상 받기</Button>
                    <Button size="sm" variant="outline" asChild>
                      <a href={CLIP_UPLOAD_URL} target="_blank" rel="noreferrer">② 클립 열기</a>
                    </Button>
                    <Button size="sm" variant="outline" onClick={copy} disabled={!desc || descState === "writing"}>③ 설명 복사</Button>
                    <Button size="sm" variant="ghost" onClick={() => writeDescription(j.id, true)} disabled={descState === "writing"}>
                      다시 쓰기
                    </Button>
                  </div>
                  {descState === "writing" && <div className="text-xs text-muted-foreground">영상 대본을 읽고 설명을 쓰는 중… (몇 초 걸립니다)</div>}
                  {descState === "error" && <div className="text-xs text-red-600">{descError}</div>}
                  {desc && (
                    <textarea
                      className="w-full min-h-48 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={desc}
                      onChange={(e) => setDesc(e.target.value)}
                    />
                  )}
                  {desc && (() => {
                    const n = Array.from(desc).length;
                    return (
                      <div className={`text-xs text-right ${n > MAX_CHARS ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                        {n} / {MAX_CHARS}자{n > MAX_CHARS ? " — 넘었습니다. 줄여서 복사하세요" : ""}
                      </div>
                    );
                  })()}
                  {desc && (
                    <div className="space-y-1.5">
                      <div className="text-xs font-medium">수정 방향 <span className="text-muted-foreground font-normal">(이렇게 고쳐 줬으면 하는 점)</span></div>
                      <textarea
                        className="w-full min-h-16 rounded-md border border-input bg-background px-3 py-2 text-sm"
                        maxLength={300}
                        value={direction}
                        onChange={(e) => setDirection(e.target.value)}
                        placeholder="예: 더 짧게 / 질문으로 시작해줘 / 제주 이야기는 빼고 수리운 설명을 더 / 좀 더 친근한 말투로"
                      />
                      <Button
                        size="sm"
                        onClick={() => writeDescription(j.id, true, direction.trim())}
                        disabled={!direction.trim() || descState === "writing"}
                      >
                        이 방향으로 다시 쓰기
                      </Button>
                      <div className="text-xs text-muted-foreground">
                        지금 설명글을 보고 적어 주신 방향으로 고쳐 씁니다. 300자 제한·기본 해시태그·대본에 없는 내용 금지는 그대로 지킵니다.
                      </div>
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    설명은 고쳐서 복사해도 됩니다(설명란 전체 300자 이하로 맞춰 둠). 해시태그는 <b>#한국이름학교 #와츠유어네임이름연구협회</b> 가 항상 맨 앞, 그 뒤에 영상 내용 해시태그.
                    {prep && <> · 파일: {prep.fileName} (원본 화질)</>}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
