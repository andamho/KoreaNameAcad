// 노트북 '휴대폰과 연결'에 들어온 문자를 고객정보(사이트 문자 수집함)로 올린다.
//
// 원장님 결정(2026-10-24): 폰 매크로 앱 대신 노트북 휴대폰과 연결로 문자를 모은다.
//  · 2026-11-04 원장님이 폰 매크로를 끔 → 문자 수집은 이것 하나.
//  · 2026-11-17 원장님: 1시간마다 말고, 노트북을 열면 하루 한 번만(맨 아래 하루한번).
//  · 아직 안 올린 문자가 있을 때만 사이트로 보낸다 → 사이트 DB 는 새 문자가 있을 때만 깬다.
//  · 하루 한 번은 문자가 없어도 '살아 있음' 을 남긴다 → 사이트가 25일 넘게 끊기면 메일로 알린다.
//  · 사진은 올리지 않는다(사진 문자는 적힌 글자만).
//  · 사이트 쪽 채우기 기능이 같은 문자를 두 번 넣지 않는다(번호·방향·내용·2분 이내 같으면 연결만).
//
// 실행: node tools/phonelink/sync.mjs           (계속 떠 있으며 노트북을 열면 하루 한 번)
//       node tools/phonelink/sync.mjs --once    (한 번만)
//       node tools/phonelink/sync.mjs --once --dry (올리지 않고 결과만)
// 설정: %USERPROFILE%\.kop-phonelink\config.json  { "secret": "<문자 수집 비밀값>", "base": "https://korea-name-acad.com" }
// 상주: pm2 'phonelink-sync' (부팅 시 자동 실행)
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import crypto from "crypto";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// AppData 아래는 Claude 세션에서 쓰면 다른 프로그램(pm2)에 안 보인다(가상화) → 사용자 폴더에 둔다
const WORK = path.join(process.env.USERPROFILE, ".kop-phonelink");
const STATE = path.join(WORK, "state.json");
const CONFIG = path.join(WORK, "config.json");
const PKG = path.join(process.env.LOCALAPPDATA, "Packages", "Microsoft.YourPhone_8wekyb3d8bbwe", "LocalCache", "Indexed");
const DEVICE = "5f0e11c0-ba5e-4c0d-8e01-00000000f11c"; // 노트북 휴대폰과 연결 전용 고정 번호 — 사이트 phoneLinkReminder.ts 와 같아야 함
const DAYS = 31;

const args = new Set(process.argv.slice(2));
const ONCE = args.has("--once");
const DRY = args.has("--dry");
// 2026-11-06 휴대폰과 연결 업데이트로 phone.db 가 암호화(AesGcm)돼 못 읽음 → 화면 글자 읽기(uia-read.ps1)가 기본(2026-11-17).
// --db 를 주면 예전 DB 읽기. 두 방법을 섞으면 같은 문자가 두 번 들어가므로(서버는 이미 연결된 문자에 다시 연결하지 않음) 섞지 말 것.
const USE_DB = args.has("--db");
// 화면 읽기는 사이트에 들어간 마지막 문자(11/4 03:56 KST, 이미 DB 경로와 연결됨) 뒤 문자만.
// 그 전 문자는 모두 연결돼 있어 다시 보내면 서버가 새 문자로 또 넣는다(중복). 11/4~11/17 빈 기간은 이 값 덕에 채워진다.
const UIA_FROM = Date.parse("2026-11-04T03:57:00+09:00");

const log = (...a) => console.log(`[${new Date().toLocaleString("ko-KR")}]`, ...a);
const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const readJson = (p, d) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return d; } };

// +82 10… → 010… (사이트 비교가 숫자만 보므로 형식을 맞춰야 같은 문자로 알아본다)
function 번호(p) {
  let d = String(p || "").split(/[,;]/)[0].replace(/\D/g, "");
  if (d.startsWith("82") && (d.length === 11 || d.length === 12)) d = "0" + d.slice(2);
  return d;
}

// 가장 최근에 쓰인 phone.db (연결된 폰이 바뀌면 폴더 이름이 바뀐다)
function phoneDb() {
  let best = null;
  for (const dir of fs.readdirSync(PKG)) {
    const p = path.join(PKG, dir, "System", "Database", "phone.db");
    if (!fs.existsSync(p)) continue;
    const t = Math.max(...["", "-wal"].map((s) => (fs.existsSync(p + s) ? fs.statSync(p + s).mtimeMs : 0)));
    if (!best || t > best.t) best = { p, t };
  }
  return best?.p || null;
}

function 읽기() {
  const src = phoneDb();
  if (!src) throw new Error("휴대폰과 연결 문자 DB 를 찾지 못함");
  fs.mkdirSync(WORK, { recursive: true });
  const copy = path.join(WORK, "phone.db");
  for (const s of ["", "-wal", "-shm"]) {
    try { fs.copyFileSync(src + s, copy + s); } catch { try { fs.unlinkSync(copy + s); } catch {} }
  }
  const out = path.join(WORK, "messages.json");
  // windowsHide: pm2 에서 돌 때 1시간마다 검은 콘솔 창이 떴다 사라지던 문제
  execFileSync("py", ["-3", path.join(HERE, "extract.py"), copy, out], { env: { ...process.env, PYTHONIOENCODING: "utf-8" }, windowsHide: true });
  const rows = readJson(out, []);
  for (const s of ["", "-wal", "-shm"]) { try { fs.unlinkSync(copy + s); } catch {} } // 복사본은 바로 지운다
  try { fs.unlinkSync(out); } catch {}
  const since = Date.now() - DAYS * 86400e3;
  const msgs = [];
  for (const r of rows) {
    if (r.ms < since || !r.body) continue; // 글자 없는 사진 문자는 건너뜀
    const sent = r.type === 2;
    const phone = 번호(sent ? r.to : r.from);
    if (phone.length < 8) continue;
    msgs.push({
      providerType: "sms",
      // 사이트는 숫자 id 만 받는다. 사진 문자는 앞에 9 를 붙여 일반 문자 번호와 겹치지 않게.
      providerId: (r.kind === "mms" ? "9" + String(r.id).padStart(12, "0") : String(r.id)),
      direction: sent ? "발신" : "수신",
      date: Math.round(r.ms),
      phone,
      body: String(r.body).slice(0, 2000),
    });
  }
  return msgs;
}

// 화면 글자 읽기: 휴대폰과 연결 창의 대화방을 차례로 '선택'해 문자를 읽는다(마우스·키보드 안 씀, 읽지 않은 대화방은 안 엶).
const 맑게 = (s) => String(s || "").replace(/[‎‏‪-‮]/g, "");
function 화면읽기() {
  const since = Math.max(UIA_FROM, Date.now() - DAYS * 86400e3);
  fs.mkdirSync(WORK, { recursive: true });
  const out = path.join(WORK, "uia.json");
  try { fs.unlinkSync(out); } catch {}
  execFileSync("powershell", ["-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File", path.join(HERE, "uia-read.ps1"), "-SinceMs", String(since), "-Out", out],
    { windowsHide: true, timeout: 15 * 60e3 });
  const j = JSON.parse(fs.readFileSync(out, "utf8").replace(/^﻿/, ""));
  try { fs.unlinkSync(out); } catch {}
  if (!j.ok) throw new Error(j.error || "화면 읽기 실패");
  if (j.skipped?.length) log(`읽지 않은 대화방은 건너뜀(읽으신 뒤 다음 번에 가져옴): ${j.skipped.join(", ")}`);
  const msgs = [];
  for (const c of j.conversations || []) {
    const phone = 번호(c.phone);
    if (phone.length < 8) continue;
    const 횟수 = {};
    for (const m of c.messages || []) {
      if (!m.body || !m.ms || m.ms < since) continue; // 글자 없는 사진 문자는 건너뜀
      const nm = 맑게(m.name);
      const direction = /%4의 메시지/.test(nm) ? "수신" : /\d{4}-\d{1,2}-\d{1,2} (오전|오후) \d{1,2}:\d{2}의 메시지/.test(nm) ? "발신" : null;
      if (!direction) continue;
      const body = String(m.body).replace(/\r\n?/g, "\n").trim();
      if (!body) continue;
      // 화면에는 문자 번호가 없다 → 번호·방향·분·내용으로 고정 번호를 만든다(같은 분에 같은 문자 여러 통이면 순번).
      const key = `${phone}|${direction}|${m.ms}|${body}`;
      const n = (횟수[key] = (횟수[key] || 0) + 1);
      const h = BigInt("0x" + crypto.createHash("sha256").update(key + "|" + n).digest("hex").slice(0, 15)) % 10n ** 15n;
      msgs.push({ providerType: "sms", providerId: "7" + h.toString().padStart(15, "0"), direction, date: Math.round(m.ms), phone, body: body.slice(0, 2000) });
    }
  }
  return msgs;
}

async function 보내기(cfg, messages) {
  const url = `${cfg.base.replace(/\/+$/, "")}/api/kop/sms-backfill`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-knop-secret": cfg.secret },
    body: JSON.stringify({ deviceId: DEVICE, dryRun: DRY, messages }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`사이트 응답 ${res.status} ${j.error || ""}`);
  return j.counts || {};
}

async function 한번() {
  const cfg = { base: "https://korea-name-acad.com", ...readJson(CONFIG, {}) };
  if (!cfg.secret) throw new Error(`설정 파일에 secret 이 없음: ${CONFIG}`);
  const state = readJson(STATE, { sent: {}, lastBeat: "" });
  const all = USE_DB ? 읽기() : 화면읽기();
  const fresh = all.filter((m) => !state.sent[m.providerId]);
  const needBeat = state.lastBeat !== today();
  if (!fresh.length && !needBeat) { log(`새 문자 없음 (최근 ${DAYS}일 ${all.length}건)`); return; }

  const total = { new: 0, legacy_linked: 0, existing_exact: 0, ambiguous: 0, invalid: 0 };
  const batches = fresh.length ? [] : [[]]; // 새 문자가 없으면 빈 요청 하나로 '살아 있음' 만 남긴다
  for (let i = 0; i < fresh.length; i += 50) batches.push(fresh.slice(i, i + 50)); // 한 번에 많이 보내면 사이트가 시간 초과(502)
  for (const b of batches) {
    const c = await 보내기(cfg, b);
    for (const k of Object.keys(total)) total[k] += c[k] || 0;
    if (!DRY) for (const m of b) state.sent[m.providerId] = 1;
  }
  if (!DRY) {
    state.lastBeat = today();
    if (USE_DB) {
      // 31일 넘은 id 는 휴대폰과 연결에서도 사라지므로 기록도 정리
      const keep = new Set(all.map((m) => m.providerId));
      for (const id of Object.keys(state.sent)) if (!keep.has(id)) delete state.sent[id];
    } else {
      // 화면 읽기는 매번 일부 대화방만 읽으므로 '이번에 안 보였다'로 지우지 않고 문자 날짜로 정리(33일)
      for (const m of fresh) state.sent[m.providerId] = m.date;
      const old = Date.now() - (DAYS + 2) * 86400e3;
      for (const [id, v] of Object.entries(state.sent)) if (v === 1 || v < old) delete state.sent[id];
    }
    fs.writeFileSync(STATE, JSON.stringify(state), "utf8");
  }
  log(`${DRY ? "[미리보기] " : ""}올림 ${fresh.length}건 → 새로 들어감 ${total.new} · 기존 문자와 연결 ${total.legacy_linked} · 이미 있음 ${total.existing_exact} · 애매 ${total.ambiguous} · 형식오류 ${total.invalid}`);
}

async function 돌기() {
  try { await 한번(); } catch (e) { log("오류:", e.message); }
}

// 원장님 결정(2026-11-17): 1시간마다 돌지 않는다. 노트북을 열면(깨어나면·켜면) 그날 한 번만 모은다.
//  · 1분마다 '오늘 모았나'만 본다(화면·사이트 안 건드림). 안 모았으면 모은다.
//  · 깨어난 직후 3분은 기다린다 — 휴대폰과 연결이 폰과 다시 이어질 시간.
//  · 실패하면(폰 연결 안 됨 등) 15분 뒤 다시. 성공한 날짜는 lastrun.txt 에.
const RUN_FILE = path.join(WORK, "lastrun.txt");
const WAKE_WAIT_MS = 3 * 60e3;
const RETRY_MS = 15 * 60e3;
let lastTick = Date.now();
let wokeAt = Date.now();
let lastTry = 0;
let busy = false;
async function 하루한번() {
  const now = Date.now();
  if (now - lastTick > 3 * 60e3) wokeAt = now; // 1분 틱이 3분 넘게 비었으면 잠자다 깨어난 것
  lastTick = now;
  if (busy) return;
  let done = "";
  try { done = fs.readFileSync(RUN_FILE, "utf8").trim(); } catch {}
  if (done === today()) return;
  if (now - wokeAt < WAKE_WAIT_MS || now - lastTry < RETRY_MS) return;
  busy = true;
  lastTry = now;
  try {
    await 한번();
    fs.mkdirSync(WORK, { recursive: true });
    fs.writeFileSync(RUN_FILE, today(), "utf8");
  } catch (e) {
    log("오류(15분 뒤 다시):", e.message);
  } finally {
    busy = false;
  }
}

if (ONCE) await 돌기();
else {
  log("휴대폰과 연결 문자 수집 대기 — 노트북을 열면 하루 한 번");
  setInterval(() => void 하루한번(), 60e3);
}
