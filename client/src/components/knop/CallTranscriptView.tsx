// 통화 전사: 화자 구분 화면 + 음성 연동(클릭=이동, 더블클릭=그 줄 바로 수정) + 편집 시 자동 학습
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Play } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { knopApi, type Call } from "@/lib/knopApi";

type W = { word: string; start: number; end: number; speaker?: string };

// 화자별 색/라벨 (등장 순서대로 화자1, 화자2 …)
const SPK = [
  { label: "화자 1", text: "text-blue-700", bg: "bg-blue-50" },
  { label: "화자 2", text: "text-emerald-700", bg: "bg-emerald-50" },
  { label: "화자 3", text: "text-purple-700", bg: "bg-purple-50" },
  { label: "화자 4", text: "text-orange-700", bg: "bg-orange-50" },
];

export function CallTranscriptView({ call, onSaved }: { call: Call; onSaved: () => void }) {
  const { toast } = useToast();
  const audioRef = useRef<HTMLAudioElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const [curIdx, setCurIdx] = useState(-1);
  const [editTurn, setEditTurn] = useState<number | null>(null);
  const [editVal, setEditVal] = useState("");

  const words: W[] = useMemo(() => {
    try {
      return JSON.parse(call.words || "[]");
    } catch {
      return [];
    }
  }, [call.words]);

  const spkIndex = useMemo(() => {
    const m = new Map<string, number>();
    for (const w of words) if (w.speaker && !m.has(w.speaker)) m.set(w.speaker, m.size);
    return m;
  }, [words]);

  // 발화 단위(턴) 그룹핑
  const turns = useMemo(() => {
    const out: Array<{ speaker?: string; items: Array<{ w: W; i: number }> }> = [];
    let cur: { speaker?: string; items: Array<{ w: W; i: number }> } | null = null;
    words.forEach((w, i) => {
      const spk = w.speaker || undefined;
      const prevEnd = cur && cur.items.length ? cur.items[cur.items.length - 1].w.end : 0;
      const gap = cur && cur.items.length ? w.start - prevEnd : 0;
      const newTurn = !cur || (spk !== undefined && spk !== cur.speaker) || (spk === undefined && gap > 1.5);
      if (newTurn) {
        cur = { speaker: spk, items: [] };
        out.push(cur);
      }
      cur!.items.push({ w, i });
    });
    return out;
  }, [words]);

  const turnText = (ti: number) => turns[ti].items.map((x) => x.w.word).join(" ");

  // 수정률: 최초 기계전사(originalTranscript) 대비 현재본에서 바뀐 단어 비율 (순서무관 단어 다중집합 비교 → 빠름)
  const stats = useMemo(() => {
    const orig = (call.originalTranscript || "").trim();
    const cur = (words.length > 0 ? words.map((w) => w.word).join(" ") : call.transcriptText || "").trim();
    if (!orig || !cur) return null;
    const ow = orig.split(/\s+/).filter(Boolean);
    const cw = cur.split(/\s+/).filter(Boolean);
    if (!cw.length) return null;
    const freq = new Map<string, number>();
    for (const w of ow) freq.set(w, (freq.get(w) || 0) + 1);
    let common = 0;
    for (const w of cw) {
      const n = freq.get(w) || 0;
      if (n > 0) {
        common++;
        freq.set(w, n - 1);
      }
    }
    const changed = cw.length - common;
    const pct = Math.round((changed / cw.length) * 100);
    return { changed, total: cw.length, pct };
  }, [call.originalTranscript, call.transcriptText, words]);

  useEffect(() => {
    if (editTurn !== null && editRef.current) {
      editRef.current.focus();
      editRef.current.select();
    }
  }, [editTurn]);

  const seekTo = (start: number, idx?: number) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = Math.max(0, start - 0.02);
    if (idx !== undefined) setCurIdx(idx);
  };
  const playFrom = (start: number) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = Math.max(0, start - 0.02);
    a.play().catch(() => {});
  };

  const startEdit = (ti: number, wordStart: number) => {
    setEditTurn(ti);
    setEditVal(turnText(ti));
    seekTo(wordStart); // 음성 위치만 맞춰둠(무음). 애매하면 '듣기'로 재생
  };

  const onTime = () => {
    const a = audioRef.current;
    if (!a || words.length === 0) return;
    const t = a.currentTime;
    let idx = -1;
    for (let i = 0; i < words.length; i++) {
      if (words[i].start <= t && t < words[i].end + 0.08) {
        idx = i;
        break;
      }
      if (words[i].start > t) break;
    }
    if (idx !== curIdx) setCurIdx(idx);
  };

  // 저장은 즉시(요약 재생성 안 함). 학습은 서버가 백그라운드로 처리.
  const editMut = useMutation({
    mutationFn: (payload: { transcript: string; words: W[] }) =>
      knopApi.editCallTranscript(call.id, payload.transcript, false, payload.words),
    onSuccess: () => {
      setEditTurn(null);
      onSaved();
      toast({ title: "저장됨" });
    },
    onError: (e: any) => toast({ title: "저장 실패", description: e?.message, variant: "destructive" }),
  });

  // 요약 갱신(느린 AI 호출) — 원할 때만 수동으로
  const summarizeMut = useMutation({
    mutationFn: () => {
      const text = words.length > 0 ? words.map((w) => w.word).join(" ") : call.transcriptText || "";
      return knopApi.editCallTranscript(call.id, text, true, words.length > 0 ? words : undefined);
    },
    onSuccess: () => {
      onSaved();
      toast({ title: "요약 갱신됨" });
    },
    onError: (e: any) => toast({ title: "요약 실패", description: e?.message, variant: "destructive" }),
  });

  const saveTurn = () => {
    if (editTurn === null) return;
    if (editVal.trim() === turnText(editTurn).trim()) {
      setEditTurn(null);
      return; // 변경 없음
    }
    // 수정한 턴만 재토큰화(타임스탬프 균등 분배), 나머지는 원본 유지 → 음성연동/화자 보존
    const newWords: W[] = [];
    turns.forEach((turn, ti) => {
      if (ti === editTurn) {
        const toks = editVal.trim().split(/\s+/).filter(Boolean);
        const s = turn.items[0].w.start;
        const e = turn.items[turn.items.length - 1].w.end;
        const step = (e - s) / Math.max(1, toks.length);
        toks.forEach((tok, k) =>
          newWords.push({
            word: tok,
            start: +(s + k * step).toFixed(3),
            end: +(s + (k + 1) * step).toFixed(3),
            speaker: turn.speaker,
          }),
        );
      } else {
        turn.items.forEach((x) => newWords.push(x.w));
      }
    });
    editMut.mutate({ transcript: newWords.map((w) => w.word).join(" "), words: newWords });
  };

  if (words.length === 0 && !call.transcriptText) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="text-xs font-medium text-gray-500">
          전사{words.length > 0 && " · 클릭=위치 이동 · 더블클릭=그 줄 바로 수정"}
        </div>
        {stats && (
          <span
            className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#56D5DB]/15 text-[#2fa8ae]"
            title={`최초 기계전사 대비 ${stats.changed}단어 수정 / 전체 ${stats.total}단어`}
          >
            수정 {stats.pct}% · {stats.changed}/{stats.total}단어
          </span>
        )}
        <button
          type="button"
          onClick={() => summarizeMut.mutate()}
          disabled={summarizeMut.isPending}
          className="ml-auto text-xs text-gray-400 hover:text-[#3fc4ca] disabled:opacity-50"
          title="AI 요약을 다시 생성합니다(몇 초 걸림)"
        >
          {summarizeMut.isPending ? "요약 갱신 중…" : "요약 갱신"}
        </button>
      </div>

      {call.audioFileUrl && (
        <audio ref={audioRef} controls src={call.audioFileUrl} className="w-full h-9" onTimeUpdate={onTime} />
      )}

      {words.length > 0 ? (
        <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
          {turns.map((turn, ti) => {
            const si = turn.speaker !== undefined ? spkIndex.get(turn.speaker) ?? 0 : -1;
            const st = si >= 0 ? SPK[si % SPK.length] : null;
            const editingThis = editTurn === ti;
            return (
              <div key={ti} className="flex gap-2">
                {st && <span className={`shrink-0 text-xs font-semibold w-11 pt-1 ${st.text}`}>{st.label}</span>}
                <div className={`flex-1 ${st ? st.bg + " rounded px-2 py-1" : ""}`}>
                  {editingThis ? (
                    <div className="space-y-1.5">
                      <textarea
                        ref={editRef}
                        value={editVal}
                        onChange={(e) => setEditVal(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            saveTurn();
                          } else if (e.key === "Escape") {
                            setEditTurn(null);
                          }
                        }}
                        rows={Math.max(1, Math.ceil(editVal.length / 40))}
                        className="w-full text-sm rounded border border-[#56D5DB] px-2 py-1 focus:outline-none resize-none bg-white"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          className="text-xs text-gray-500 hover:text-[#3fc4ca] flex items-center gap-1"
                          onClick={() => playFrom(turn.items[0].w.start)}
                          type="button"
                        >
                          <Play className="w-3 h-3" /> 듣기
                        </button>
                        <button
                          className="text-xs text-[#3fc4ca] font-medium hover:underline"
                          onClick={saveTurn}
                          type="button"
                        >
                          저장(Enter)
                        </button>
                        <button
                          className="text-xs text-gray-400 hover:underline"
                          onClick={() => setEditTurn(null)}
                          type="button"
                        >
                          취소(Esc)
                        </button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm leading-relaxed">
                      {turn.items.map(({ w, i }) => (
                        <span
                          key={i}
                          onClick={() => seekTo(w.start, i)}
                          onDoubleClick={() => startEdit(ti, w.start)}
                          title="클릭: 위치 이동 · 더블클릭: 이 줄 수정"
                          className={`cursor-text rounded px-0.5 hover:bg-[#56D5DB]/20 ${
                            i === curIdx ? "bg-[#56D5DB]/50 text-gray-900" : "text-gray-700"
                          }`}
                        >
                          {w.word}{" "}
                        </span>
                      ))}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-gray-600 whitespace-pre-wrap max-h-96 overflow-y-auto">{call.transcriptText}</p>
      )}
    </div>
  );
}
