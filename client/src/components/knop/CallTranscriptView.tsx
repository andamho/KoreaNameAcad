// 통화 전사: 화자 구분 + 음성 연동(클릭=이동, 더블클릭=그 문단 수정) + 편집 시 자동 학습
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Play, Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { knopApi, type Call } from "@/lib/knopApi";

type W = { word: string; start: number; end: number; speaker?: string };
type Item = { w: W; i: number };

// 화자별 색/라벨 (등장 순서대로 화자1, 화자2 …)
const SPK = [
  { label: "화자 1", text: "text-blue-700", bg: "bg-blue-50" },
  { label: "화자 2", text: "text-emerald-700", bg: "bg-emerald-50" },
  { label: "화자 3", text: "text-purple-700", bg: "bg-purple-50" },
  { label: "화자 4", text: "text-orange-700", bg: "bg-orange-50" },
];

// 문장 끝(. ? !) 판정
const isSentenceEnd = (w: string) => /[.?!。]$/.test(w);

// 한 발화(턴)를 읽기 좋은 문단으로 분할: ① 문장부호 ② 말 멈춤(>0.55s) ③ 과도한 길이(하드캡).
// 한국어 STT는 마침표가 거의 없어서 ②③이 실제 분할을 담당한다.
function splitChunks(items: Item[]): Item[][] {
  const out: Item[][] = [];
  let cur: Item[] = [];
  for (let k = 0; k < items.length; k++) {
    const it = items[k];
    cur.push(it);
    const next = items[k + 1];
    if (!next) break;
    const gap = next.w.start - it.w.end;
    const punct = isSentenceEnd(it.w.word);
    const pause = cur.length >= 6 && gap > 0.55;
    const tooLong = cur.length >= 20; // 문단 최대 단어 수(통짜 방지)
    if (punct || pause || tooLong) {
      out.push(cur);
      cur = [];
    }
  }
  if (cur.length) out.push(cur);
  return out.length ? out : [items];
}

// 편집용 텍스트 + 각 단어의 문자 범위(offset) → 더블클릭한 단어에 커서
function buildChunkText(items: Item[]): { text: string; offsets: Array<[number, number]> } {
  let text = "";
  const offsets: Array<[number, number]> = [];
  items.forEach(({ w }, idx) => {
    const start = text.length;
    text += w.word;
    offsets.push([start, text.length]);
    if (idx < items.length - 1) text += " ";
  });
  return { text, offsets };
}

// 더블클릭한 화면 좌표 → 그 단어 안에서의 문자 위치 (정확히 클릭한 자리에 커서를 놓기 위함)
function caretOffsetInWord(clientX: number, clientY: number, word: string): number {
  try {
    const doc = document as any;
    let node: Node | null = null;
    let off = 0;
    if (typeof doc.caretRangeFromPoint === "function") {
      const r = doc.caretRangeFromPoint(clientX, clientY);
      if (r) {
        node = r.startContainer;
        off = r.startOffset;
      }
    } else if (typeof doc.caretPositionFromPoint === "function") {
      const p = doc.caretPositionFromPoint(clientX, clientY);
      if (p) {
        node = p.offsetNode;
        off = p.offset;
      }
    }
    if (node && node.nodeType === 3 && (node.textContent || "").startsWith(word)) {
      return Math.max(0, Math.min(off, word.length));
    }
  } catch {
    /* noop */
  }
  return word.length; // 판정 실패 시 그 단어 끝
}

// textarea 를 내용 높이에 딱 맞게(줄바꿈까지 반영) — 문단 전체가 보이도록
function autosize(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight + 2, 520) + "px";
}

export function CallTranscriptView({ call, onSaved }: { call: Call; onSaved: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const audioRef = useRef<HTMLAudioElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const caretRef = useRef<[number, number] | null>(null); // 더블클릭한 단어의 문자 범위
  const editCtxRef = useRef<{ items: Item[]; speaker?: string } | null>(null); // 편집 중인 문단
  const [curIdx, setCurIdx] = useState(-1);
  const [editKey, setEditKey] = useState<string | null>(null); // "턴:문단" 식별자
  const [editVal, setEditVal] = useState("");
  const [query, setQuery] = useState("");
  const [matchPos, setMatchPos] = useState(0);
  const [focusIdx, setFocusIdx] = useState<number | null>(null); // 저장 후 그 자리로 스크롤

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

  // 발화 단위(턴) 그룹핑 — 화자 라벨용
  const turns = useMemo(() => {
    const out: Array<{ speaker?: string; items: Item[] }> = [];
    let cur: { speaker?: string; items: Item[] } | null = null;
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

  // 각 턴을 문단으로 분할 (표시·편집 공통 단위)
  const chunksByTurn = useMemo(() => turns.map((t) => splitChunks(t.items)), [turns]);

  // 수정률: 최초 기계전사(originalTranscript) 대비 현재본에서 바뀐 단어 비율 (순서무관 단어 다중집합 비교)
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

  // 스크롤 컨테이너 안에서만 해당 단어를 보이게(페이지 전체는 안 움직임)
  const scrollWordIntoView = (idx: number, center = false) => {
    const cont = listRef.current;
    const el = document.getElementById(`kw-${idx}`);
    if (!cont || !el) return;
    const c = cont.getBoundingClientRect();
    const e = el.getBoundingClientRect();
    if (center) {
      cont.scrollTop += e.top - c.top - cont.clientHeight / 2 + e.height / 2;
    } else if (e.top < c.top + 4) {
      cont.scrollTop += e.top - c.top - 8;
    } else if (e.bottom > c.bottom - 4) {
      cont.scrollTop += e.bottom - c.bottom + 8;
    }
  };

  // 편집창이 열리면 더블클릭한 단어에 커서 + 보이게
  useEffect(() => {
    if (editKey === null || !editRef.current) return;
    const el = editRef.current;
    el.focus();
    const r = caretRef.current;
    if (r) el.setSelectionRange(r[0], r[1]);
    else el.select();
    autosize(el); // 문단 전체(줄바꿈 포함)가 다 보이게
  }, [editKey]);

  // 저장 후: 편집했던 자리로 스크롤 + 그 단어 하이라이트 (그 위쪽으로 밀리는 문제 해결)
  useEffect(() => {
    if (focusIdx === null || editKey !== null) return;
    const id = requestAnimationFrame(() => {
      setCurIdx(focusIdx);
      scrollWordIntoView(focusIdx, true);
      setFocusIdx(null);
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusIdx, editKey, call.words]);

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

  // ── 전사문 검색 ──
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [] as number[];
    const out: number[] = [];
    words.forEach((w, i) => {
      if ((w.word || "").toLowerCase().includes(q)) out.push(i);
    });
    return out;
  }, [query, words]);
  const matchSet = useMemo(() => new Set(matches), [matches]);
  const curMatch = matches.length ? matches[matchPos % matches.length] : -1;

  useEffect(() => {
    if (!matches.length) return;
    const idx = matches[0];
    const w = words[idx];
    if (w) seekTo(w.start, idx);
    requestAnimationFrame(() => scrollWordIntoView(idx, true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const goMatch = (pos: number) => {
    if (!matches.length) return;
    const p = ((pos % matches.length) + matches.length) % matches.length;
    setMatchPos(p);
    const idx = matches[p];
    const w = words[idx];
    if (w) seekTo(w.start, idx);
    requestAnimationFrame(() => scrollWordIntoView(idx, true));
  };

  // 편집창 커서 위치 → 그 자리 단어(앞쪽 단어 수로 계산)
  const itemAtCaret = (): Item | null => {
    const el = editRef.current;
    const ctx = editCtxRef.current;
    if (!el || !ctx) return null;
    const pos = el.selectionStart ?? 0;
    const idx = el.value.slice(0, pos).split(/\s+/).filter(Boolean).length - 1;
    const items = ctx.items;
    if (!items.length) return null;
    return items[Math.min(Math.max(0, idx), items.length - 1)];
  };
  const seekToCaret = () => {
    const it = itemAtCaret();
    if (it) seekTo(it.w.start, it.i);
  };
  const playFromCaret = () => {
    const it = itemAtCaret();
    const ctx = editCtxRef.current;
    if (it) playFrom(it.w.start);
    else if (ctx && ctx.items.length) playFrom(ctx.items[0].w.start);
  };

  // 더블클릭 → 그 문단을 편집. wi = 문단 안에서 클릭한 단어 번호
  const startEdit = (key: string, items: Item[], speaker: string | undefined, wi: number, charInWord = 0) => {
    const { text, offsets } = buildChunkText(items);
    // 단어 전체 선택이 아니라, 더블클릭한 바로 그 자리에 커서만 놓는다
    const base = offsets[wi]?.[0] ?? 0;
    const pos = Math.max(0, Math.min(base + charInWord, text.length));
    caretRef.current = [pos, pos];
    editCtxRef.current = { items, speaker };
    setEditKey(key);
    setEditVal(text);
    seekTo(items[wi]?.w.start ?? items[0].w.start);
  };

  // 재생 위치 → 지금 칠할 단어 = "마지막으로 시작된 단어"(카라오케식). 침묵에도 직전 단어 유지.
  const onTime = () => {
    const a = audioRef.current;
    if (!a || words.length === 0) return;
    const t = a.currentTime;
    let lo = 0,
      hi = words.length - 1,
      idx = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (words[mid].start <= t + 0.04) {
        idx = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    if (idx !== curIdx) {
      setCurIdx(idx);
      if (idx >= 0 && editKey === null && !a.paused) scrollWordIntoView(idx, false);
    }
  };

  // 저장: 바뀐 문단만 splice 전송(전체 words 업로드 회피). 낙관적 즉시 반영.
  const editMut = useMutation({
    mutationFn: (payload: { wordPatch: { startIdx: number; delCount: number; words: W[] } }) =>
      knopApi.editCallTranscriptPatch(call.id, payload.wordPatch, false),
    onError: (e: any) => {
      toast({ title: "저장 실패(되돌림)", description: e?.message, variant: "destructive" });
      qc.invalidateQueries({ queryKey: ["knop-customer", call.customerId] });
    },
  });

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

  const saveChunk = () => {
    const ctx = editCtxRef.current;
    if (editKey === null || !ctx || !ctx.items.length) return;
    const items = ctx.items;
    const origText = items.map((x) => x.w.word).join(" ").trim();
    if (editVal.trim() === origText) {
      setEditKey(null);
      return; // 변경 없음
    }
    const startIdx = items[0].i;
    const delCount = items[items.length - 1].i - startIdx + 1;
    const s = items[0].w.start;
    const e = items[items.length - 1].w.end;
    const toks = editVal.trim().split(/\s+/).filter(Boolean);

    // 타임스탬프는 글자수 비례로 분배(균등보다 실제 말에 가깝게) → 하이라이트 싱크 개선
    const span = Math.max(0.001, e - s);
    const weights = toks.map((t) => Math.max(1, t.length));
    const totalW = weights.reduce((a, b) => a + b, 0) || 1;
    let acc = 0;
    const patchWords: W[] = toks.map((tok, k) => {
      const st = s + (acc / totalW) * span;
      acc += weights[k];
      const en = s + (acc / totalW) * span;
      return { word: tok, start: +st.toFixed(3), end: +en.toFixed(3), speaker: ctx.speaker };
    });
    const newWords = words.slice(0, startIdx).concat(patchWords, words.slice(startIdx + delCount));

    // 저장 후 돌아갈 자리(커서가 있던 단어) 계산
    const caretPos = editRef.current?.selectionStart ?? editVal.length;
    const caretTok = editVal.slice(0, caretPos).trim().split(/\s+/).filter(Boolean).length;
    const anchorIdx = startIdx + Math.max(0, Math.min(caretTok - 1, patchWords.length - 1));

    // 즉시 반영(낙관적): 편집창 닫기 + 캐시 갱신. 실제 업로드는 바뀐 문단만 백그라운드로.
    setEditKey(null);
    editCtxRef.current = null;
    qc.setQueryData(["knop-customer", call.customerId], (old: any) =>
      old?.calls
        ? {
            ...old,
            calls: old.calls.map((c: any) =>
              c.id === call.id ? { ...c, transcriptText: newWords.map((w) => w.word).join(" "), words: JSON.stringify(newWords) } : c,
            ),
          }
        : old,
    );
    setFocusIdx(anchorIdx);
    editMut.mutate({ wordPatch: { startIdx, delCount, words: patchWords } });
  };

  if (words.length === 0 && !call.transcriptText) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="text-xs font-medium text-gray-500">
          전사{words.length > 0 && " · 클릭=위치 이동 · 더블클릭=그 문단 수정"}
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

      {/* 전사문 검색 */}
      {words.length > 0 && (
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-gray-300" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setMatchPos(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  goMatch(e.shiftKey ? matchPos - 1 : matchPos + 1);
                } else if (e.key === "Escape") setQuery("");
              }}
              placeholder="전사문 검색 (Enter=다음, Shift+Enter=이전)"
              className="w-full text-xs rounded border border-gray-200 pl-7 pr-2 py-1.5 focus:outline-none focus:border-[#56D5DB]"
            />
          </div>
          {query && (
            <>
              <span className="text-xs text-gray-500 tabular-nums shrink-0">
                {matches.length ? `${(matchPos % matches.length) + 1}/${matches.length}` : "0"}
              </span>
              <button
                type="button"
                onClick={() => goMatch(matchPos - 1)}
                disabled={!matches.length}
                className="px-1.5 py-1 rounded text-gray-500 hover:bg-gray-100 disabled:opacity-30 text-xs"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={() => goMatch(matchPos + 1)}
                disabled={!matches.length}
                className="px-1.5 py-1 rounded text-gray-500 hover:bg-gray-100 disabled:opacity-30 text-xs"
              >
                ›
              </button>
              <button
                type="button"
                onClick={() => setQuery("")}
                className="px-1.5 py-1 rounded text-gray-400 hover:bg-gray-100 text-xs"
              >
                ✕
              </button>
            </>
          )}
        </div>
      )}

      {call.audioFileUrl && (
        <audio ref={audioRef} controls src={call.audioFileUrl} className="w-full h-9" onTimeUpdate={onTime} />
      )}

      {words.length > 0 ? (
        <div ref={listRef} className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
          {turns.map((turn, ti) => {
            const si = turn.speaker !== undefined ? spkIndex.get(turn.speaker) ?? 0 : -1;
            const st = si >= 0 ? SPK[si % SPK.length] : null;
            return (
              <div key={ti} className="flex gap-2">
                {st && <span className={`shrink-0 text-xs font-semibold w-11 pt-1 ${st.text}`}>{st.label}</span>}
                <div className={`flex-1 space-y-2 ${st ? st.bg + " rounded px-2 py-1" : ""}`}>
                  {chunksByTurn[ti].map((items, ci) => {
                    const key = `${ti}:${ci}`;
                    if (editKey === key) {
                      return (
                        <div key={ci} className="space-y-1.5">
                          <textarea
                            ref={editRef}
                            value={editVal}
                            onChange={(e) => {
                              setEditVal(e.target.value);
                              autosize(e.target);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                saveChunk();
                              } else if (e.key === "Escape") {
                                setEditKey(null);
                                editCtxRef.current = null;
                              }
                            }}
                            onClick={seekToCaret}
                            onSelect={seekToCaret}
                            onKeyUp={(e) => {
                              if (e.key.startsWith("Arrow") || e.key === "Home" || e.key === "End") seekToCaret();
                            }}
                            rows={2}
                            className="w-full text-sm leading-relaxed rounded border border-[#56D5DB] px-2 py-1 focus:outline-none resize-y bg-white overflow-hidden"
                          />
                          <div className="flex items-center gap-2">
                            <button
                              className="text-xs text-gray-500 hover:text-[#3fc4ca] flex items-center gap-1"
                              onClick={playFromCaret}
                              type="button"
                              title="커서가 있는 위치부터 재생됩니다"
                            >
                              <Play className="w-3 h-3" /> 커서부터 듣기
                            </button>
                            <button
                              className="text-xs text-gray-400 hover:text-[#3fc4ca] flex items-center gap-1"
                              onClick={() => playFrom(items[0].w.start)}
                              type="button"
                              title="이 문단 처음부터 재생"
                            >
                              <Play className="w-3 h-3" /> 처음부터
                            </button>
                            <button className="text-xs text-[#3fc4ca] font-medium hover:underline" onClick={saveChunk} type="button">
                              저장(Enter)
                            </button>
                            <button
                              className="text-xs text-gray-400 hover:underline"
                              onClick={() => {
                                setEditKey(null);
                                editCtxRef.current = null;
                              }}
                              type="button"
                            >
                              취소(Esc)
                            </button>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <p key={ci} className="text-sm leading-relaxed">
                        {items.map(({ w, i }, wi) => {
                          const isHit = matchSet.has(i);
                          const isCur = i === curMatch;
                          return (
                            <span
                              key={i}
                              id={`kw-${i}`}
                              onClick={() => seekTo(w.start, i)}
                              onDoubleClick={(ev) => {
                                ev.preventDefault(); // 브라우저 기본 단어 선택 방지
                                startEdit(key, items, turn.speaker, wi, caretOffsetInWord(ev.clientX, ev.clientY, w.word));
                              }}
                              title="클릭: 위치 이동 · 더블클릭: 이 문단 수정"
                              className={`cursor-text rounded px-0.5 hover:bg-[#56D5DB]/20 ${
                                isCur
                                  ? "bg-orange-400 text-white font-semibold"
                                  : isHit
                                    ? "bg-yellow-200 text-gray-900"
                                    : i === curIdx
                                      ? "bg-[#56D5DB]/50 text-gray-900"
                                      : "text-gray-700"
                              }`}
                            >
                              {w.word}{" "}
                            </span>
                          );
                        })}
                      </p>
                    );
                  })}
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
