// 가족 작명 한 판 (2026-11-11 대표님) — 가족 이름·획수를 한 번에 넣고, 사람마다 왼쪽 한글 운 · 오른쪽 한자 운을 한 화면에서 본다.
//   같은 숫자라도 글이 다르면(23-1, 23-2) 겹침이 아니다. 처음 판이 뜰 때 도구가 겹치지 않게 나눠 넣고, 대표님은 고치고 싶은 곳만 누른다.
//   서버·PC 워커는 한 사람 주문(plan/make)을 그대로 쓴다. 가족 수만큼 주문을 넣고, 만들기는 한 사람씩 차례로 한다.
import { useEffect, useMemo, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Check, Copy, Loader2, Plus, Shuffle, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { API, CandList, LinkLine, clash, cleanStrokes, errText, strokesOf, validStrokes, type Job, type Plan, type Row } from "./namingCertShared";
import { assignFamily, chosenIdx, eligibleRows, textVariants, usersByNumber, varLabel, type FamPick } from "./namingCertFamilyPick";

const LETTER = "ABCDEF";
type Member = { 이름: string; 한자: string };
type Slot = { status: "finding" | "ready" | "error"; plan?: Plan; error?: string; second: string; third: string };
type Made = { status: "wait" | "making" | "done" | "error"; pdf?: string; url?: string; error?: string };
type Open = { m: number; kind: "hanja" } | { m: number; kind: "text"; side: "hg" | "hn"; i: number } | null;

/** 주문을 넣고 끝날 때까지 기다린다 */
async function runJob(path: "plan" | "make", body: unknown, alive: () => boolean): Promise<Job> {
  const { id } = (await (await apiRequest("POST", `${API}/${path}`, body)).json()) as { id: string };
  for (;;) {
    const j = (await (await apiRequest("GET", `${API}/job/${id}`)).json()) as Job;
    if (j.status === "done") return j;
    if (j.status === "error") throw new Error(j.error || "PC에서 하지 못했습니다.");
    if (!alive()) throw new Error("멈췄습니다.");
    await new Promise((r) => setTimeout(r, 1500));
  }
}

export function NamingCertFamily() {
  const [members, setMembers] = useState<Member[]>([{ 이름: "", 한자: "" }, { 이름: "", 한자: "" }]);
  const [formErr, setFormErr] = useState("");
  const [found, setFound] = useState<Array<{ 이름: string; 한자: number[] }>>([]);   // 찾을 때의 이름·획수(판은 이것으로 그린다)
  const [slots, setSlots] = useState<Slot[]>([]);
  const [picks, setPicks] = useState<FamPick[]>([]);
  const [open, setOpen] = useState<Open>(null);
  const [made, setMade] = useState<Made[]>([]);
  const run = useRef(0);
  useEffect(() => () => { run.current = -1; }, []);

  const finding = slots.some((s) => s.status === "finding");
  const making = made.some((m) => m.status === "making" || m.status === "wait");
  const plans = useMemo(() => slots.map((s) => (s.status === "ready" ? s.plan : undefined)), [slots]);
  const users = useMemo(() => usersByNumber(plans, picks), [plans, picks]);

  const findAll = async () => {
    setFormErr("");
    const list = members.map((m) => ({ 이름: m.이름.replace(/\s/g, ""), st: strokesOf(m.한자) })).filter((m) => m.이름 || m.st.length);
    if (list.length < 2) return setFormErr("가족은 두 사람부터 넣어 주세요. 한 사람이면 위의 가족작명을 끄고 만드시면 됩니다.");
    if (list.some((m) => Array.from(m.이름).length !== 3)) return setFormErr("지금은 세 글자 이름(성 한 글자 + 이름 두 글자)만 만들 수 있습니다.");
    if (list.some((m) => !validStrokes(m.st))) return setFormErr("사람마다 한자 획수 세 개를 띄어서 넣어 주세요. 예: 7 11 14");
    if (new Set(list.map((m) => m.이름)).size !== list.length) return setFormErr("같은 이름이 두 번 들어 있습니다.");
    const orders = list.map((m) => ({ 이름: m.이름, 한자: m.st.map(Number) }));
    const my = ++run.current;
    const alive = () => run.current === my;
    setFound(orders); setPicks([]); setMade([]); setOpen(null);
    setSlots(orders.map(() => ({ status: "finding", second: "", third: "" })));
    const got = await Promise.all(orders.map(async (o, i): Promise<Slot> => {
      let slot: Slot;
      try {
        const j = await runJob("plan", { ...o, 가족: [] }, alive);
        slot = j.plan ? { status: "ready", plan: j.plan, second: j.plan.둘째?.한자 || "", third: j.plan.셋째?.한자 || "" } : { status: "error", error: "PC가 답을 주지 않았습니다.", second: "", third: "" };
      } catch (e) { slot = { status: "error", error: errText(e), second: "", third: "" }; }
      if (alive()) setSlots((prev) => prev.map((s, k) => (k === i ? slot : s)));
      return slot;
    }));
    if (!alive()) return;
    // 모두 찾아오면 겹치지 않게 저절로 나눠 넣는다
    setPicks(assignFamily(got.map((s) => (s.status === "ready" ? s.plan : undefined))));
  };

  const setPick = (m: number, f: (p: FamPick) => FamPick) => setPicks((prev) => prev.map((p, k) => (k === m ? f(p) : p)));
  const setSlot = (m: number, f: (s: Slot) => Slot) => setSlots((prev) => prev.map((s, k) => (k === m ? f(s) : s)));

  const numsOf = (rows: Row[], on: boolean[]) => rows.filter((_, i) => on[i]).map((r) => r.수);
  const memberReady = (m: number) => {
    const s = slots[m], p = picks[m];
    if (!s || s.status !== "ready" || !s.plan || !p || s.plan.막힘) return false;
    const a = numsOf(s.plan.전체.한글, p.hg).length, b = numsOf(s.plan.전체.한자, p.hn).length;
    return !!s.second && !!s.third && a >= 1 && a <= 3 && b >= 1 && b <= 3;
  };
  const allReady = slots.length > 0 && picks.length === slots.length && slots.every((_, m) => memberReady(m));

  // 같은 글을 두 사람 이상이 쓰는 곳
  const clashes = useMemo(() => {
    const out: Array<{ label: string; ms: number[] }> = [];
    users.forEach((list, n) => {
      const by = new Map<number, number[]>();
      list.forEach((x) => by.set(x.idx, [...(by.get(x.idx) || []), x.m]));
      by.forEach((ms, idx) => {
        if (ms.length < 2) return;
        const p = plans[ms[0]]; const row = p && [...p.전체.한글, ...p.전체.한자].find((r) => r.수 === n);
        out.push({ label: row ? varLabel(row, idx) : String(n), ms });
      });
    });
    return out;
  }, [users, plans]);

  const makeOne = async (m: number, overwrite: boolean) => {
    const s = slots[m], p = picks[m], o = found[m];
    if (!s?.plan || !p || !o) return;
    const my = run.current;
    setMade((prev) => prev.map((x, k) => (k === m ? { status: "making" } : x)));
    try {
      const body = { ...o, 가족: [], 성한자: s.plan.성한자, 둘째: s.second, 셋째: s.third, 한글문단: numsOf(s.plan.전체.한글, p.hg), 한자문단: numsOf(s.plan.전체.한자, p.hn), 판: p.pan, 덮어쓰기: overwrite };
      const j = await runJob("make", body, () => run.current === my);
      setMade((prev) => prev.map((x, k) => (k === m ? { status: "done", pdf: j.pdf, url: j.url } : x)));
    } catch (e) {
      setMade((prev) => prev.map((x, k) => (k === m ? { status: "error", error: errText(e) } : x)));
    }
  };
  const makeAll = async () => {
    setMade(slots.map(() => ({ status: "wait" })));
    for (let m = 0; m < slots.length; m++) await makeOne(m, false);   // PC가 한 번에 하나씩 만든다
  };
  const urls = made.map((x) => x.url).filter(Boolean) as string[];
  const [copied, setCopied] = useState(false);

  return (
    <div className="space-y-4">
      {/* ① 가족 넣기 */}
      <Card className="p-5 space-y-3">
        <h3 className="font-semibold">가족 이름과 한자 획수</h3>
        <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (!finding && !making) findAll(); }}>
          {members.map((f, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">{LETTER[i]}</span>
              <Input aria-label={`${LETTER[i]} 이름`} value={f.이름} placeholder="예: 오준이" className="h-11 flex-1 min-w-0 sm:max-w-[14rem] text-lg font-semibold"
                onChange={(e) => setMembers(members.map((x, k) => (k === i ? { ...x, 이름: e.target.value } : x)))} />
              <Input aria-label={`${LETTER[i]} 한자 획수`} inputMode="decimal" enterKeyHint="search" value={f.한자} placeholder="예: 7 17 8" className="h-11 w-32 sm:w-40 text-lg font-semibold tracking-wide border-2 border-primary"
                onChange={(e) => setMembers(members.map((x, k) => (k === i ? { ...x, 한자: cleanStrokes(e.target.value) } : x)))} />
              {members.length > 2 && (
                <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label={`${LETTER[i]} 줄 지우기`} onClick={() => setMembers(members.filter((_, k) => k !== i))}><X className="w-4 h-4" /></Button>
              )}
            </div>
          ))}
          <div className="flex flex-wrap gap-2 pt-1">
            {members.length < 6 && (
              <Button type="button" variant="outline" className="h-11" onClick={() => setMembers([...members, { 이름: "", 한자: "" }])}><Plus className="w-4 h-4 mr-1" />가족 추가</Button>
            )}
            <Button type="submit" className="h-11" disabled={finding || making}>
              {finding ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />PC에서 찾는 중</> : "모두 찾기"}
            </Button>
          </div>
        </form>
        <p className="text-xs text-muted-foreground">성씨가 달라도 됩니다. 획수 칸에서 엔터를 치면 모두 찾습니다.</p>
        {formErr && <p className="text-sm text-red-600">{formErr}</p>}
      </Card>

      {slots.length > 0 && (
        <>
          {/* ② 한 판 */}
          <Card className="p-4 sm:p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">한 판 — 왼쪽 한글 이름의 운 · 오른쪽 한자 이름의 운</h3>
              <Button variant="outline" size="sm" disabled={finding || making || picks.length === 0} onClick={() => setPicks(assignFamily(plans))}>
                <Shuffle className="w-3.5 h-3.5 mr-1" />겹치지 않게 다시 나누기
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              같은 글이 겹치지 않게 미리 나눠 넣었습니다. 23-1, 23-2는 같은 23의 다른 글입니다. 숫자 옆 단추를 누르면 글이 바뀌고, 운 이름을 누르면 글을 읽을 수 있습니다.
            </p>
            {picks.length > 0 && (clashes.length > 0 ? (
              <p className="text-sm bg-red-50 text-red-800 border border-red-200 p-3 rounded flex gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <span>같은 글을 함께 쓰는 곳 {clashes.length}군데: {clashes.map((c) => `${c.label}(${c.ms.map((m) => LETTER[m]).join("·")})`).join(", ")}. [겹치지 않게 다시 나누기]를 누르면 비켜 갈 수 있는 곳은 풀립니다. 다른 글이 없어 남는 곳은 이대로 만들 수 있습니다.</span>
              </p>
            ) : !finding && (
              <p className="text-sm bg-emerald-50 text-emerald-800 border border-emerald-200 p-3 rounded flex gap-2"><Check className="w-4 h-4 mt-0.5 shrink-0" />가족끼리 겹치는 글이 없습니다.</p>
            ))}
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
              {slots.map((s, m) => (
                <PersonCard key={m} m={m} name={found[m]?.이름 || ""} strokes={found[m]?.한자 || []} slot={s} pick={picks[m]} users={users} locked={making}
                  onToggle={(side, i, v) => setPick(m, (p) => ({ ...p, [side]: p[side].map((x, k) => (k === i ? v : x)) }))}
                  onVariant={(n, idx) => setPick(m, (p) => ({ ...p, pan: { ...p.pan, [n]: idx } }))}
                  onOpen={(o) => setOpen(open && o && JSON.stringify(open) === JSON.stringify(o) ? null : o)} />
              ))}
            </div>
          </Card>

          {/* ③ 펼친 곳: 한자 고르기 / 글 읽기 */}
          {open && slots[open.m]?.plan && picks[open.m] && (
            <Card className="p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold">{LETTER[open.m]} {found[open.m]?.이름} — {open.kind === "hanja" ? "한자 고르기" : "글 읽기"}</h3>
                <Button variant="ghost" size="sm" onClick={() => setOpen(null)}><X className="w-4 h-4 mr-1" />닫기</Button>
              </div>
              {open.kind === "hanja" ? (
                <HanjaPanel plan={slots[open.m].plan!} slot={slots[open.m]} name={found[open.m]?.이름 || ""}
                  onSecond={(v) => setSlot(open.m, (s) => { const a = s.plan!.후보.둘째.find((c) => c.한자 === v), b = s.plan!.후보.셋째.find((c) => c.한자 === s.third); return { ...s, second: v, third: clash(a?.오행, b?.오행) ? "" : s.third }; })}
                  onThird={(v) => setSlot(open.m, (s) => ({ ...s, third: v }))} />
              ) : (
                <TextPanel row={(open.side === "hg" ? slots[open.m].plan!.전체.한글 : slots[open.m].plan!.전체.한자)[open.i]} m={open.m} pick={picks[open.m]} users={users}
                  onVariant={(n, idx) => setPick(open.m, (p) => ({ ...p, pan: { ...p.pan, [n]: idx } }))} />
              )}
            </Card>
          )}

          {/* ④ 모두 만들기 */}
          <Card className="p-5 space-y-3">
            <h3 className="font-semibold">가족 작명장 만들기</h3>
            <Button onClick={makeAll} disabled={!allReady || making || finding} className="h-11">
              {making ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />PC에서 차례로 만드는 중 (한 사람에 1분쯤)</> : "가족 작명장 모두 만들기"}
            </Button>
            {!allReady && !finding && <p className="text-xs text-muted-foreground">사람마다 한자 두 글자와 문단(쪽마다 1~3개)이 정해지면 눌립니다.</p>}
            {made.length > 0 && (
              <ul className="space-y-2">
                {made.map((x, m) => (
                  <li key={m} className="rounded-md border p-3 text-sm space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{LETTER[m]} {found[m]?.이름}</span>
                      {x.status === "wait" && <span className="text-muted-foreground">기다리는 중</span>}
                      {x.status === "making" && <span className="flex items-center gap-1 text-primary"><Loader2 className="w-3.5 h-3.5 animate-spin" />만드는 중</span>}
                      {x.status === "done" && <span className="flex items-center gap-1 text-emerald-700 font-medium"><Check className="w-3.5 h-3.5" />만들었습니다 — {x.pdf}</span>}
                      {x.status === "error" && <span className="text-red-600">{x.error}</span>}
                    </div>
                    {x.status === "done" && (x.url ? <LinkLine url={x.url} /> : <p className="text-muted-foreground">링크는 잠시 뒤 텔레그램으로 옵니다.</p>)}
                    {x.status === "error" && (/이미 있습니다/.test(x.error || "")
                      ? <Button variant="outline" size="sm" disabled={making} onClick={() => makeOne(m, true)}>그래도 새 작명장으로 바꾸기</Button>
                      : <Button variant="outline" size="sm" disabled={making} onClick={() => makeOne(m, false)}>이 사람만 다시 만들기</Button>)}
                  </li>
                ))}
              </ul>
            )}
            {urls.length > 1 && !making && (
              <Button variant="outline" onClick={async () => {
                const text = made.map((x, m) => (x.url ? `${found[m]?.이름} ${x.url}` : "")).filter(Boolean).join("\n");
                try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* 주소를 길게 눌러 복사 */ }
              }}><Copy className="w-4 h-4 mr-1" />{copied ? "복사됨" : "가족 링크 모두 복사"}</Button>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

type Users = Map<number, Array<{ m: number; idx: number }>>;

function PersonCard({ m, name, strokes, slot, pick, users, locked, onToggle, onVariant, onOpen }: {
  m: number; name: string; strokes: number[]; slot: Slot; pick?: FamPick; users: Users; locked: boolean;
  onToggle: (side: "hg" | "hn", i: number, v: boolean) => void; onVariant: (n: number, idx: number) => void; onOpen: (o: Open) => void;
}) {
  const plan = slot.plan;
  return (
    <section className="rounded-lg border bg-muted/20 p-3 space-y-3 min-w-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-bold">{LETTER[m]}</span>
        <span className="font-semibold text-base">{name}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{strokes.join(" · ")}</span>
      </div>
      {slot.status === "finding" && <p className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />PC에서 찾는 중</p>}
      {slot.status === "error" && <p className="text-sm text-red-600">{slot.error}</p>}
      {plan && (
        <>
          {plan.막힘 && <p className="text-sm text-red-600">{plan.막힘}</p>}
          <button type="button" disabled={locked} onClick={() => onOpen({ m, kind: "hanja" })} aria-label={`${LETTER[m]} ${name} 한자 고르기`}
            className={`w-full min-h-[44px] rounded-md border px-3 py-2 text-left flex items-center justify-between gap-2 bg-background ${slot.second && slot.third ? "border-primary/50" : "border-amber-400"}`}>
            <span className="font-serif text-xl leading-none tracking-widest">{plan.성한자 || "?"} {slot.second || "?"} {slot.third || "?"}</span>
            <span className={`text-xs font-medium ${slot.second && slot.third ? "text-primary" : "text-amber-700"}`}>{slot.second && slot.third ? "한자 바꾸기" : "한자 고르기"}</span>
          </button>
          {pick ? (
            <div className="grid grid-cols-2 gap-2">
              <SideCol title="한글 이름" side="hg" m={m} rows={plan.전체.한글} on={pick.hg} blocked={[]} pick={pick} users={users} locked={locked} onToggle={onToggle} onVariant={onVariant} onOpen={onOpen} />
              <SideCol title="한자 이름" side="hn" m={m} rows={plan.전체.한자} on={pick.hn} blocked={plan.한글수리} pick={pick} users={users} locked={locked} onToggle={onToggle} onVariant={onVariant} onOpen={onOpen} />
            </div>
          ) : <p className="text-xs text-muted-foreground">다른 가족을 기다리는 중</p>}
        </>
      )}
    </section>
  );
}

function SideCol({ title, side, m, rows, on, blocked, pick, users, locked, onToggle, onVariant, onOpen }: {
  title: string; side: "hg" | "hn"; m: number; rows: Row[]; on: boolean[]; blocked: number[]; pick: FamPick; users: Users; locked: boolean;
  onToggle: (side: "hg" | "hn", i: number, v: boolean) => void; onVariant: (n: number, idx: number) => void; onOpen: (o: Open) => void;
}) {
  const ok = eligibleRows(rows, blocked);
  const count = on.filter(Boolean).length;
  return (
    <div className="space-y-1.5 min-w-0">
      <div className="flex items-baseline justify-between gap-1">
        <h4 className="text-xs text-muted-foreground">{title}</h4>
        <span className={`text-xs font-semibold ${count === 3 ? "text-emerald-600" : count > 3 ? "text-red-600" : "text-amber-600"}`}>{count > 3 ? "3개까지" : `${count}개`}</span>
      </div>
      {rows.map((r, i) => {
        const tv = textVariants(r);
        const cur = chosenIdx(r, pick.pan);
        const first = rows.findIndex((x) => x.수 === r.수);
        const why = tv.length === 0 ? "글 없음" : first !== i ? `${rows[first].운}과 같음` : blocked.includes(r.수) && !ok[i] ? "한글에 나옴" : "";
        const others = (users.get(r.수) || []).filter((u) => u.m !== m);
        const same = on[i] ? others.filter((u) => u.idx === cur) : [];
        const diff = on[i] ? others.filter((u) => u.idx !== cur) : [];
        const disabled = locked || (!ok[i] && !on[i]);
        const next = () => { const k = tv.findIndex((v) => v.idx === cur); onVariant(r.수, tv[(k + 1) % tv.length].idx); };
        return (
          <div key={i} className="space-y-0.5">
            <div className={`flex items-center gap-1 rounded-md border px-1.5 min-h-[44px] bg-background ${same.length ? "border-2 border-red-500 bg-red-50" : on[i] ? "border-primary/60 bg-primary/5" : ""} ${!ok[i] && !on[i] ? "opacity-55" : ""}`}>
              <input type="checkbox" aria-label={`${LETTER[m]} ${title} ${r.운} ${r.수}`} className="w-5 h-5 shrink-0 accent-[hsl(var(--primary))]" checked={!!on[i]} disabled={disabled} onChange={(e) => onToggle(side, i, e.target.checked)} />
              <button type="button" disabled={tv.length === 0} onClick={() => onOpen({ m, kind: "text", side, i })} aria-label={`${LETTER[m]} ${title} ${r.운} ${r.수} 글 읽기`} className="flex flex-1 min-w-0 items-baseline gap-1 text-left min-h-[40px] py-1">
                <span className="text-[11px] text-muted-foreground shrink-0">{r.운.slice(0, 1)}</span>
                <span className="font-bold tabular-nums">{r.수}</span>
              </button>
              {tv.length > 1 ? (
                <button type="button" disabled={locked} onClick={next} aria-label={`${r.수} 글 바꾸기 (지금 ${varLabel(r, cur)})`}
                  className={`shrink-0 rounded-full border px-2 min-h-[32px] text-xs font-bold tabular-nums ${on[i] ? "border-primary text-primary bg-background" : "text-muted-foreground"}`}>{varLabel(r, cur)}</button>
              ) : why ? <span className="shrink-0 text-[11px] text-muted-foreground">{why}</span> : null}
            </div>
            {same.length > 0 && <p className="text-[11px] font-semibold text-red-600">{same.map((u) => LETTER[u.m]).join("·")}와 같은 글</p>}
            {same.length === 0 && diff.length > 0 && <p className="text-[11px] font-semibold text-emerald-700">{diff.map((u) => LETTER[u.m]).join("·")}와 다른 글</p>}
            {tv.length > 1 && why && <p className="text-[11px] text-muted-foreground">{why}</p>}
          </div>
        );
      })}
    </div>
  );
}

function HanjaPanel({ plan, slot, name, onSecond, onThird }: { plan: Plan; slot: Slot; name: string; onSecond: (v: string) => void; onThird: (v: string) => void }) {
  const letters = Array.from(name);
  const secondCand = plan.후보.둘째.find((c) => c.한자 === slot.second);
  return (
    <div className="space-y-3">
      <div className="text-sm bg-muted/30 p-3 rounded flex flex-wrap gap-x-6 gap-y-1">
        <span>{plan.후보.찾음 ? plan.후보.구역 : "성씨 시트에서 이 이름을 찾지 못했습니다"}</span>
        <span>소리오행 {plan.오행.순서.join("")} {plan.오행.격}</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <CandList title={`'${letters[1]}' ${plan.한자획수[1]}획`} list={plan.후보.둘째} value={slot.second} onPick={onSecond} />
        <CandList title={`'${letters[2]}' ${plan.한자획수[2]}획`} list={plan.후보.셋째} value={slot.third} onPick={onThird} against={secondCand} />
      </div>
      {plan.후보.메모.length > 0 && <p className="text-xs text-muted-foreground">시트 메모: {plan.후보.메모.join(" / ")}</p>}
    </div>
  );
}

function TextPanel({ row, m, pick, users, onVariant }: { row: Row; m: number; pick: FamPick; users: Users; onVariant: (n: number, idx: number) => void }) {
  const tv = textVariants(row);
  const cur = chosenIdx(row, pick.pan);
  const others = (users.get(row.수) || []).filter((u) => u.m !== m);
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">{row.운} {row.수} {row.이름}{tv.length > 1 ? ` — 글이 ${tv.length}가지 있습니다` : ""}</p>
      {tv.map((v) => {
        const by = others.filter((u) => u.idx === v.idx).map((u) => LETTER[u.m]);
        return (
          <div key={v.idx} className={`rounded-md border p-3 space-y-2 ${v.idx === cur ? "border-primary border-2 bg-primary/5" : ""}`}>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-bold tabular-nums">{varLabel(row, v.idx)}</span>
              <span className="text-xs text-muted-foreground">지난 작명장 {v.쓴횟수}번</span>
              {v.확인 && <span className="text-xs font-medium text-amber-700">{v.확인}</span>}
              {by.length > 0 && <span className="text-xs font-semibold text-red-600">{by.join("·")}가 씀</span>}
              {v.idx === cur ? <span className="ml-auto text-xs font-semibold text-primary">지금 이 글</span>
                : <Button variant="outline" size="sm" className="ml-auto" onClick={() => onVariant(row.수, v.idx)}>이 글 쓰기</Button>}
            </div>
            <p className="text-sm leading-relaxed">{v.글}</p>
          </div>
        );
      })}
    </div>
  );
}
