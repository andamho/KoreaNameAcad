// 작명장 만들기 (2026-11-10) — 이름 + 한자 획수 3개 → PC 가 성씨 시트에서 한자·문단을 찾아 옴 → 고르고 → PDF·링크·텔레그램
// 실제 계산과 PDF 는 사무실 PC 워커가 한다(server/knop/namingCert.ts 창구). 이 화면은 주문을 넣고 답을 기다린다.
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AlertTriangle, Check, Copy, Loader2, Plus, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

const API = "/api/knop/naming-cert";
const LIFE = ["초년", "청년", "중년", "총운"];

type Cand = { 한자: string; 뜻: string; 뜻전체?: string; 오행: string; 획: number; 확인?: boolean };
type Variant = { idx: number; 판: string; 제목: string; 글: string; 쓴횟수: number; 확인: string };
type Row = { 수: number; 운: string; 이름: string; 넣음: boolean; 뺀이유: string; 가족겹침: boolean; 기본판: number; 판목록: Variant[] };
type Plan = {
  이름: string; 성한자: string; 한글획수: number[]; 한자획수: number[]; 한글수리: number[]; 한자수리: number[];
  오행: { 순서: string[]; 기호: string[]; 격: string; 글: string };
  후보: { 구역: string; 찾음: boolean; 둘째: Cand[]; 셋째: Cand[]; 메모: string[] };
  둘째: Cand | null; 셋째: Cand | null;
  전체: { 한글: Row[]; 한자: Row[] };
  선택필요: string[]; 경고: string[];
};
type Job = { id: string; step: "plan" | "make"; status: "queued" | "working" | "done" | "error"; plan?: Plan; pdf?: string; url?: string; error?: string };

// 이름분석 프로그램과 같은 기준: 상극이거나 같은 화·수·금끼리면 함께 못 씀
const CLASH = new Set(["목금", "금목", "목토", "토목", "화금", "금화", "화수", "수화", "토수", "수토", "화화", "수수", "금금"]);
const clash = (a?: string, b?: string) => !!a && !!b && CLASH.has(a + b);
const relWord = (a?: string, b?: string) => (!a || !b ? "" : clash(a, b) ? (a === b ? `같은 ${a}끼리` : "상극") : a === b ? "같은 오행" : "상생");
const errText = (e: unknown) => String((e as Error)?.message || e).replace(/^\d{3}:\s*/, "").replace(/^\{"error":"(.*)"\}$/, "$1");

function useJob(id: string | null) {
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

const numInput = "h-11 w-14 text-center text-lg";

export function NamingCertMaker() {
  const [name, setName] = useState("");
  const [hj, setHj] = useState(["", "", ""]);
  const [famOn, setFamOn] = useState(false);
  const [fam, setFam] = useState([{ 이름: "", 한자: ["", "", ""] }]);
  const [formErr, setFormErr] = useState("");
  const [planId, setPlanId] = useState<string | null>(null);
  const [makeId, setMakeId] = useState<string | null>(null);
  const planJob = useJob(planId);
  const makeJob = useJob(makeId);
  const plan = planJob?.status === "done" ? planJob.plan ?? null : null;

  const [second, setSecond] = useState("");
  const [third, setThird] = useState("");
  const [hgOn, setHgOn] = useState<boolean[]>([]);
  const [hnOn, setHnOn] = useState<boolean[]>([]);
  const [pan, setPan] = useState<Record<number, number>>({});
  const planned = useRef<string | null>(null);

  const worker = useQuery({
    queryKey: [API, "worker"],
    queryFn: async () => (await (await apiRequest("GET", `${API}/worker`)).json()) as { online: boolean; enabled: boolean },
    refetchInterval: 30000,
    retry: false,
  });

  // 찾아온 결과가 새로 오면 기본 선택을 채운다
  useEffect(() => {
    if (!plan || planned.current === planId) return;
    planned.current = planId;
    setSecond(plan.둘째?.한자 || "");
    setThird(plan.셋째?.한자 || "");
    setHgOn(plan.전체.한글.map((r) => r.넣음));
    setHnOn(plan.전체.한자.map((r) => r.넣음));
    const p: Record<number, number> = {};
    for (const r of [...plan.전체.한글, ...plan.전체.한자]) if (r.기본판 >= 0) p[r.수] = r.기본판;
    setPan(p);
    setMakeId(null);
  }, [plan, planId]);

  const letters = Array.from(name.replace(/\s/g, ""));
  const order = () => ({
    이름: name.replace(/\s/g, ""),
    한자: hj.map(Number),
    가족: famOn ? fam.filter((f) => f.이름.trim()).map((f) => ({ 이름: f.이름.replace(/\s/g, ""), 한자: f.한자.map(Number) })) : [],
  });

  const startPlan = async () => {
    setFormErr(""); setMakeId(null);
    if (letters.length !== 3) return setFormErr("지금은 세 글자 이름(성 한 글자 + 이름 두 글자)만 만들 수 있습니다.");
    if (hj.some((v) => !/^\d{1,2}$/.test(v) || +v < 1)) return setFormErr("한자 획수 세 개를 숫자로 넣어 주세요.");
    try {
      const r = (await (await apiRequest("POST", `${API}/plan`, order())).json()) as { id: string };
      setPlanId(r.id);
    } catch (e) { setFormErr(errText(e)); }
  };

  const secondCand = plan?.후보.둘째.find((c) => c.한자 === second);
  const picked = (rows: Row[], on: boolean[]) => rows.filter((_, i) => on[i]).map((r) => r.수);
  const hgNums = plan ? picked(plan.전체.한글, hgOn) : [];
  const hnNums = plan ? picked(plan.전체.한자, hnOn) : [];
  const ready = !!plan && !!second && !!third && hgNums.length >= 1 && hgNums.length <= 3 && hnNums.length >= 1 && hnNums.length <= 3;
  const making = makeJob?.status === "queued" || makeJob?.status === "working";

  const startMake = async (overwrite = false) => {
    if (!plan) return;
    try {
      const body = { ...order(), 성한자: plan.성한자, 둘째: second, 셋째: third, 한글문단: hgNums, 한자문단: hnNums, 판: pan, 덮어쓰기: overwrite };
      const r = (await (await apiRequest("POST", `${API}/make`, body)).json()) as { id: string };
      setMakeId(r.id);
    } catch (e) { setFormErr(errText(e)); }
  };

  const offline = worker.data && !worker.data.online;

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold mb-1">작명장 만들기</h2>
          <p className="text-sm text-muted-foreground">이름과 한자 획수를 넣으면 사무실 PC가 성씨 시트에서 한자와 문단을 찾아 작명장을 만듭니다.</p>
        </div>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className={`inline-block w-2 h-2 rounded-full ${worker.data?.online ? "bg-emerald-500" : "bg-amber-500"}`} />
          {worker.data?.online ? "사무실 PC 연결됨" : "사무실 PC 응답 없음"}
        </span>
      </div>
      {offline && (
        <p className="text-sm bg-amber-50 text-amber-800 border border-amber-200 p-3 rounded">
          사무실 PC가 켜져 있어야 만들 수 있습니다. PC를 켜고 1분쯤 뒤에 다시 열어 주세요.
        </p>
      )}

      {/* ① 정보 입력 */}
      <Card className="p-5 space-y-4">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="space-y-2">
            <Label htmlFor="nc-name">이름 (한글)</Label>
            <Input id="nc-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 이시안" className="h-11 text-lg font-semibold" />
          </div>
          <fieldset className="space-y-2 rounded-md border-2 border-primary px-4 pb-3 pt-1">
            <legend className="px-1 text-sm font-semibold text-primary">한자 획수</legend>
            <div className="flex gap-3">
              {[0, 1, 2].map((i) => (
                <label key={i} className="flex flex-col items-center gap-1 text-xs text-muted-foreground">
                  {letters[i] || ["성", "둘째", "셋째"][i]}
                  <Input id={`nc-hj-${i}`} inputMode="numeric" value={hj[i]} onChange={(e) => setHj(hj.map((v, k) => (k === i ? e.target.value.replace(/\D/g, "").slice(0, 2) : v)))} className={numInput} aria-label={`${["성", "둘째 글자", "셋째 글자"][i]} 한자 획수`} />
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="font-medium text-sm">가족작명</div>
            <p className="text-xs text-muted-foreground">가족 이름에서 나온 수리운과 가능한 한 겹치지 않게 문단을 고릅니다.</p>
          </div>
          <Switch checked={famOn} onCheckedChange={setFamOn} aria-label="가족작명" />
        </div>
        {famOn && (
          <div className="space-y-2">
            {fam.map((f, i) => (
              <div key={i} className="flex flex-wrap items-end gap-2">
                <div className="space-y-1">
                  <Label htmlFor={`nc-fam-${i}`} className="text-xs text-muted-foreground">가족 이름</Label>
                  <Input id={`nc-fam-${i}`} value={f.이름} onChange={(e) => setFam(fam.map((x, k) => (k === i ? { ...x, 이름: e.target.value } : x)))} placeholder="예: 이시유" className="h-11 w-32" />
                </div>
                {[0, 1, 2].map((j) => (
                  <Input key={j} inputMode="numeric" value={f.한자[j]} aria-label={`가족 ${i + 1} 한자 획수 ${j + 1}`} placeholder="획"
                    onChange={(e) => setFam(fam.map((x, k) => (k === i ? { ...x, 한자: x.한자.map((v, m) => (m === j ? e.target.value.replace(/\D/g, "").slice(0, 2) : v)) } : x)))} className={numInput} />
                ))}
                {fam.length > 1 && (
                  <Button variant="ghost" size="icon" className="h-11 w-11" aria-label="가족 줄 지우기" onClick={() => setFam(fam.filter((_, k) => k !== i))}><X className="w-4 h-4" /></Button>
                )}
              </div>
            ))}
            {fam.length < 6 && (
              <Button variant="outline" size="sm" onClick={() => setFam([...fam, { 이름: "", 한자: ["", "", ""] }])}><Plus className="w-4 h-4 mr-1" />가족 추가</Button>
            )}
          </div>
        )}

        {formErr && <p className="text-sm text-red-600">{formErr}</p>}
        <Button onClick={startPlan} disabled={planJob?.status === "queued" || planJob?.status === "working"} className="h-11">
          {planJob && planJob.status !== "done" && planJob.status !== "error" ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />PC에서 찾는 중</> : "한자·문단 찾기"}
        </Button>
        {planJob?.status === "error" && <p className="text-sm text-red-600">{planJob.error}</p>}
      </Card>

      {plan && (
        <>
          {/* ② 한자 고르기 */}
          <Card className="p-5 space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-semibold">한자 고르기</h3>
              <span className="text-xs text-muted-foreground">{plan.후보.찾음 ? plan.후보.구역 : "성씨 시트에서 이 이름을 찾지 못했습니다"}</span>
            </div>
            <div className="text-sm bg-muted/30 p-3 rounded flex flex-wrap gap-x-6 gap-y-1">
              <span>한글 {plan.한글획수.join("·")} → 수리 {plan.한글수리.join("·")}</span>
              <span>한자 {plan.한자획수.join("·")} → 수리 {plan.한자수리.join("·")}</span>
              <span>소리오행 {plan.오행.순서.join("")} {plan.오행.격}</span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <CandList title={`'${letters[1]}' ${plan.한자획수[1]}획`} list={plan.후보.둘째} value={second} onPick={(v) => { setSecond(v); const s = plan.후보.둘째.find((c) => c.한자 === v); const t = plan.후보.셋째.find((c) => c.한자 === third); if (clash(s?.오행, t?.오행)) setThird(""); }} />
              <CandList title={`'${letters[2]}' ${plan.한자획수[2]}획`} list={plan.후보.셋째} value={third} onPick={setThird} against={secondCand} />
            </div>
            {plan.후보.메모.length > 0 && <p className="text-xs text-muted-foreground">시트 메모: {plan.후보.메모.join(" / ")}</p>}
          </Card>

          {/* ③ 수리 문단 */}
          <Card className="p-5 space-y-5">
            <h3 className="font-semibold">수리 문단 (쪽마다 3개)</h3>
            {plan.선택필요.map((w, i) => (
              <p key={i} className="text-sm bg-amber-50 text-amber-800 border border-amber-200 p-3 rounded flex gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />{w}</p>
            ))}
            <ParaPicker title="한글이름의 에너지" rows={plan.전체.한글} on={hgOn} setOn={setHgOn} pan={pan} setPan={setPan} blocked={[]} />
            <ParaPicker title="한문이름의 에너지" rows={plan.전체.한자} on={hnOn} setOn={setHnOn} pan={pan} setPan={setPan} blocked={plan.한글수리} />
            {plan.경고.length > 0 && (
              <ul className="text-xs text-muted-foreground space-y-1">{plan.경고.map((w, i) => <li key={i}>확인: {w}</li>)}</ul>
            )}
          </Card>

          {/* ④ 만들기 */}
          <Card className="p-5 space-y-3">
            <h3 className="font-semibold">만들기</h3>
            <p className="text-sm">
              <span className="font-semibold">{plan.이름}</span> {plan.성한자} {second || "?"} {third || "?"} · 한글 {hgNums.join("·") || "-"} · 한문 {hnNums.join("·") || "-"}
            </p>
            <Button onClick={() => startMake(false)} disabled={!ready || making} className="h-11">
              {making ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />PC에서 만드는 중 (1분쯤)</> : "작명장 만들기"}
            </Button>
            {!ready && <p className="text-xs text-muted-foreground">한자 두 글자와 문단(쪽마다 1~3개)을 골라 주세요.</p>}
            {makeJob?.status === "error" && (
              <div className="space-y-2">
                <p className="text-sm text-red-600">{makeJob.error}</p>
                {/이미 있습니다/.test(makeJob.error || "") && (
                  <Button variant="outline" onClick={() => startMake(true)}>그래도 새 작명장으로 바꾸기</Button>
                )}
              </div>
            )}
            {makeJob?.status === "done" && (
              <div className="text-sm bg-emerald-50 text-emerald-800 border border-emerald-200 p-3 rounded space-y-2">
                <p className="flex items-center gap-2 font-medium"><Check className="w-4 h-4" />만들었습니다 — {makeJob.pdf}</p>
                {makeJob.url ? <LinkLine url={makeJob.url} /> : <p>링크는 잠시 뒤 텔레그램으로 옵니다.</p>}
                <p className="text-xs">PDF는 PDF작명장 폴더에 들어갔고, 링크는 텔레그램 알림봇으로도 보냈습니다.</p>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function CandList({ title, list, value, onPick, against }: { title: string; list: Cand[]; value: string; onPick: (v: string) => void; against?: Cand }) {
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
            <span className="text-3xl leading-none font-serif">{c.한자}</span>
            <span className="flex-1 min-w-0">
              <span className="font-medium">{c.뜻}</span>
              <span className="block text-xs text-muted-foreground truncate">{c.획}획 · 자원오행 {c.오행 || "모름"}{c.확인 ? " · 시트에 확인 표시" : ""}</span>
            </span>
            {rel && <span className={`text-xs font-semibold ${bad ? "text-red-600" : "text-emerald-600"}`}>{bad ? `${rel} — 뺌` : rel}</span>}
          </label>
        );
      })}
    </fieldset>
  );
}

function ParaPicker({ title, rows, on, setOn, pan, setPan, blocked }: { title: string; rows: Row[]; on: boolean[]; setOn: (v: boolean[]) => void; pan: Record<number, number>; setPan: (v: Record<number, number>) => void; blocked: number[] }) {
  const count = on.filter(Boolean).length;
  const firstIdx = useMemo(() => rows.map((r) => rows.findIndex((x) => x.수 === r.수)), [rows]);
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h4 className="font-medium text-sm">{title}</h4>
        <span className={`text-xs ${count === 3 ? "text-emerald-600" : "text-amber-600"}`}>{count}개 고름</span>
      </div>
      {rows.map((r, i) => {
        const dup = firstIdx[i] !== i;
        const inHangul = blocked.includes(r.수);
        const v = r.판목록[pan[r.수] ?? r.기본판] || r.판목록[0];
        const noText = !v || !v.글;
        const disabled = dup || inHangul || noText || (!on[i] && count >= 3);
        const why = dup ? `${LIFE[firstIdx[i]]}과 같은 숫자` : inHangul ? "한글 쪽에 나온 숫자" : noText ? "수리운 정리에 글이 없음" : r.가족겹침 ? "가족 이름과 겹침" : "";
        return (
          <div key={i} className={`rounded-md border p-3 ${on[i] ? "border-primary/60 bg-primary/5" : ""}`}>
            <label className={`flex items-center gap-3 min-h-[44px] ${disabled && !on[i] ? "opacity-60" : "cursor-pointer"}`}>
              <input type="checkbox" className="w-5 h-5 accent-[hsl(var(--primary))]" checked={!!on[i]} disabled={disabled && !on[i]} onChange={(e) => setOn(on.map((x, k) => (k === i ? e.target.checked : x)))} />
              <span className="w-10 text-xs text-muted-foreground">{r.운}</span>
              <span className="font-semibold tabular-nums w-8">{r.수}</span>
              <span className="flex-1 min-w-0 truncate">{r.이름}</span>
              {why && <span className={`text-xs font-medium ${r.가족겹침 && !dup && !inHangul && !noText ? "text-amber-600" : "text-muted-foreground"}`}>{why}</span>}
            </label>
            {on[i] && v && (
              <div className="mt-2 pl-8 space-y-2">
                {r.판목록.length > 1 && (
                  <select aria-label={`${r.수} 글 고르기`} value={pan[r.수] ?? r.기본판} onChange={(e) => setPan({ ...pan, [r.수]: Number(e.target.value) })} className="h-10 w-full rounded-md border bg-background px-2 text-sm">
                    {r.판목록.map((o) => (
                      <option key={o.idx} value={o.idx} disabled={!o.글}>
                        {o.글 ? `${o.글.slice(0, 22)}… (지난 작명장 ${o.쓴횟수}번)` : "글 없음"}{o.확인 && o.글 ? ` — ${o.확인}` : ""}
                      </option>
                    ))}
                  </select>
                )}
                <p className="text-sm text-muted-foreground leading-relaxed">{v.글}</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function LinkLine({ url }: { url: string }) {
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
