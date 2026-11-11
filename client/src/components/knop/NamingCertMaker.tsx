// 작명장 만들기 (2026-11-10) — 이름 + 한자 획수 3개 → PC 가 성씨 시트에서 한자·문단을 찾아 옴 → 고르고 → PDF·링크·텔레그램
// 실제 계산과 PDF 는 사무실 PC 워커가 한다(server/knop/namingCert.ts 창구). 이 화면은 주문을 넣고 답을 기다린다.
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { API, LIFE, CandList, LinkLine, clash, cleanStrokes, errText, strokesOf, useJob, validStrokes, type Row } from "./namingCertShared";
import { NamingCertFamily } from "./NamingCertFamily";


export function NamingCertMaker() {
  const [name, setName] = useState("");
  const [hjText, setHjText] = useState("");
  const hj = strokesOf(hjText);
  const [famOn, setFamOn] = useState(false);
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
    가족: [],
  });

  const startPlan = async () => {
    setFormErr(""); setMakeId(null);
    if (letters.length !== 3) return setFormErr("지금은 세 글자 이름(성 한 글자 + 이름 두 글자)만 만들 수 있습니다.");
    if (!validStrokes(hj)) return setFormErr("한자 획수 세 개를 띄어서 넣어 주세요. 예: 7 11 14");
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
    <div className={`space-y-4 ${famOn ? "max-w-7xl" : "max-w-4xl"}`}>
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

      {/* 가족작명: 켜면 가족을 한 판에 놓고 고르는 화면으로 바뀐다(2026-11-11 대표님) */}
      <Card className="p-4 flex items-center justify-between gap-3">
        <div>
          <div className="font-medium text-sm">가족작명</div>
          <p className="text-xs text-muted-foreground">가족을 한 판에 놓고, 같은 글이 겹치지 않게 저절로 나눠 넣습니다.</p>
        </div>
        <Switch checked={famOn} onCheckedChange={setFamOn} aria-label="가족작명" />
      </Card>

      {famOn ? <NamingCertFamily /> : (<>
      {/* ① 정보 입력 */}
      <Card className="p-5 space-y-4">
        {/* 이름 · 한자 획수 · 찾기 버튼을 한 줄에. 획수 칸에서 엔터를 치면 바로 찾는다(2026-11-11 대표님) */}
        <form className="grid gap-3 items-end sm:grid-cols-[minmax(0,1fr)_auto_auto]" onSubmit={(e) => { e.preventDefault(); startPlan(); }}>
          <div className="space-y-2">
            <Label htmlFor="nc-name">이름 (한글)</Label>
            <Input id="nc-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 이시안" className="h-11 text-lg font-semibold" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nc-hj" className="font-semibold text-primary">한자 획수</Label>
            <Input id="nc-hj" inputMode="decimal" value={hjText} onChange={(e) => setHjText(cleanStrokes(e.target.value))} placeholder="예: 7 11 14"
              enterKeyHint="search" className="h-11 w-full sm:w-44 text-lg font-semibold tracking-wide border-2 border-primary" />
          </div>
          <Button type="submit" disabled={planJob?.status === "queued" || planJob?.status === "working"} className="h-11">
            {planJob && planJob.status !== "done" && planJob.status !== "error" ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />PC에서 찾는 중</> : "한자·문단 찾기"}
          </Button>
        </form>
        <p className="text-xs text-muted-foreground min-h-[1rem] sm:text-right">
          {hj.length === 0 ? "한자 획수는 세 숫자를 띄어서 넣고 엔터 (점·쉼표도 됨)" : validStrokes(hj)
            ? [0, 1, 2].map((i) => `${letters[i] || ["성", "둘째", "셋째"][i]} ${hj[i]}획`).join(" · ")
            : `숫자가 ${hj.length}개입니다 — 세 개를 넣어 주세요`}
        </p>

        {formErr && <p className="text-sm text-red-600">{formErr}</p>}
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
      </>)}
    </div>
  );
}

function ParaPicker({ title, rows, on, setOn, pan, setPan, blocked }: { title: string; rows: Row[]; on: boolean[]; setOn: (v: boolean[]) => void; pan: Record<number, number>; setPan: (v: Record<number, number>) => void; blocked: number[] }) {
  const count = on.filter(Boolean).length;
  const firstIdx = useMemo(() => rows.map((r) => rows.findIndex((x) => x.수 === r.수)), [rows]);
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h4 className="font-medium text-sm">{title}</h4>
        <span className={`text-xs font-medium ${count === 3 ? "text-emerald-600" : count > 3 ? "text-red-600" : "text-amber-600"}`}>
          {count > 3 ? `${count}개 고름 — 3개만 넣을 수 있어요. 하나를 빼 주세요` : `${count}개 고름`}
        </span>
      </div>
      {rows.map((r, i) => {
        const dup = firstIdx[i] !== i;
        const inHangul = blocked.includes(r.수);
        const v = r.판목록[pan[r.수] ?? r.기본판] || r.판목록[0];
        const noText = !v || !v.글;
        // 3개가 이미 골라져 있어도 네 번째 칸을 막지 않는다(2026-11-11 대표님: 네 개 다 누를 수 있게, 앞 3개만 미리 체크). 4개가 되면 위에서 하나 빼라고 알린다.
        const disabled = dup || inHangul || noText;
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
