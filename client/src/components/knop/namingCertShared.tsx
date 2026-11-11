// 작명장 만들기 — 한 사람 화면과 가족 한 판 화면이 같이 쓰는 것들(형·색·주문 기다리기·한자 후보 목록·링크 줄)
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

export const API = "/api/knop/naming-cert";
export const LIFE = ["초년", "청년", "중년", "총운"];

export type Cand = { 한자: string; 뜻: string; 뜻전체?: string; 오행: string; 획: number; 확인?: boolean };
export type Variant = { idx: number; 판: string; 제목: string; 글: string; 쓴횟수: number; 확인: string };
export type Row = { 수: number; 운: string; 이름: string; 넣음: boolean; 뺀이유: string; 가족겹침: boolean; 기본판: number; 판목록: Variant[] };
export type Plan = {
  이름: string; 성한자: string; 한글획수: number[]; 한자획수: number[]; 한글수리: number[]; 한자수리: number[];
  오행: { 순서: string[]; 기호: string[]; 격: string; 글: string };
  후보: { 구역: string; 찾음: boolean; 둘째: Cand[]; 셋째: Cand[]; 메모: string[] };
  둘째: Cand | null; 셋째: Cand | null;
  전체: { 한글: Row[]; 한자: Row[] };
  선택필요: string[]; 경고: string[]; 막힘?: string;
};
export type Job = { id: string; step: "plan" | "make"; status: "queued" | "working" | "done" | "error"; plan?: Plan; pdf?: string; url?: string; error?: string };

// 이름분석 프로그램과 같은 기준: 상극이거나 같은 화·수·금끼리면 함께 못 씀
export const CLASH = new Set(["목금", "금목", "목토", "토목", "화금", "금화", "화수", "수화", "토수", "수토", "화화", "수수", "금금"]);
export const clash = (a?: string, b?: string) => !!a && !!b && CLASH.has(a + b);
export const relWord = (a?: string, b?: string) => (!a || !b ? "" : clash(a, b) ? (a === b ? `같은 ${a}끼리` : "상극") : a === b ? "같은 오행" : "상생");
// 오행 동그라미 색(2026-11-11 대표님: '자원오행' 글자 대신 색 동그라미 안에 목·화·토·금·수). 전통 오방색: 목 푸름·화 붉음·토 누름·금 흼·수 검음
export const EL_CHIP: Record<string, string> = {
  목: "bg-emerald-600 text-white",
  화: "bg-red-600 text-white",
  토: "bg-amber-400 text-black",
  금: "bg-white text-slate-800 ring-2 ring-inset ring-slate-400",
  수: "bg-slate-900 text-white",
};
export const errText = (e: unknown) => String((e as Error)?.message || e).replace(/^\d{3}:\s*/, "").replace(/^\{"error":"(.*)"\}$/, "$1");

export function useJob(id: string | null) {
  const [job, setJob] = useState<Job | null>(null);
  useEffect(() => {
    setJob(null);
    if (!id) return;
    let stop = false;
    const tick = async () => {
      try {
        const j = (await (await apiRequest("GET", `${API}/job/${id}`)).json()) as Job;
        if (stop) return;
        setJob(j);
        if (j.status === "queued" || j.status === "working") setTimeout(tick, 1500);
      } catch (e) {
        if (!stop) setJob({ id, step: "plan", status: "error", error: errText(e) });
      }
    };
    tick();
    return () => { stop = true; };
  }, [id]);
  return job;
}

// 한자 획수는 한 칸에 '7 11 14' 처럼 넣는다(2026-11-11 대표님). 띄어쓰기·점·쉼표 어느 것으로 나눠도 됨.
// 휴대폰 숫자 자판에는 띄어쓰기 키가 없다(2026-11-11 대표님 "띄어쓰기가 안 돼") →
//   점·쉼표 같은 나눔 글자는 띄어쓰기로 바꿔 보여 주고, 획수는 두 자리까지라 두 자리를 넣으면 저절로 띄운다.
export const strokesOf = (s: string) => s.split(/\D+/).filter(Boolean);
export const cleanStrokes = (s: string) => {
  let out = "", run = 0, groups = 0;
  for (const ch of s) {
    if (ch >= "0" && ch <= "9") {
      if (run === 2) { if (groups === 3) break; out += " "; run = 0; }
      if (run === 0) { if (groups === 3) break; groups++; }
      out += ch; run++;
    } else if (run > 0) { out += " "; run = 0; if (groups === 3) break; }   // 세 숫자 뒤에 나눔 글자를 치면 칸을 닫아 더 받지 않는다
  }
  return out;
};
export const validStrokes = (a: string[]) => a.length === 3 && a.every((v) => /^\d{1,2}$/.test(v) && +v >= 1);

export function CandList({ title, list, value, onPick, against }: { title: string; list: Cand[]; value: string; onPick: (v: string) => void; against?: Cand }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium mb-1">{title}</legend>
      {list.length === 0 && <p className="text-sm text-muted-foreground">시트에 후보가 없습니다.</p>}
      {list.map((c) => {
        const bad = against ? clash(against.오행, c.오행) : false;
        const rel = against ? relWord(against.오행, c.오행) : "";
        return (
          <label key={c.한자} className={`flex items-center gap-3 rounded-md border p-3 min-h-[52px] ${bad ? "opacity-60 bg-muted/40" : "cursor-pointer"} ${value === c.한자 ? "border-primary border-2 bg-primary/5" : ""}`}>
            <input type="radio" name={title} className="w-5 h-5 accent-[hsl(var(--primary))]" checked={value === c.한자} disabled={bad} onChange={() => onPick(c.한자)} />
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg font-bold ${EL_CHIP[c.오행] || "bg-muted text-muted-foreground"}`}>
              {c.오행 || "?"}
            </span>
            <span className="text-3xl leading-none font-serif">{c.한자}</span>
            <span className="flex-1 min-w-0">
              <span className="font-medium">{c.뜻}</span>
              <span className="block text-xs text-muted-foreground truncate">{c.획}획{c.확인 ? " · 시트에 확인 표시" : ""}</span>
            </span>
            {rel && <span className={`text-xs font-semibold ${bad ? "text-red-600" : "text-emerald-600"}`}>{bad ? `${rel} — 뺌` : rel}</span>}
          </label>
        );
      })}
    </fieldset>
  );
}

export function LinkLine({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <a href={url} target="_blank" rel="noreferrer" className="underline break-all">{url}</a>
      <Button variant="outline" size="sm" onClick={async () => { try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* 주소를 길게 눌러 복사 */ } }}>
        <Copy className="w-3.5 h-3.5 mr-1" />{copied ? "복사됨" : "주소 복사"}
      </Button>
    </div>
  );
}
