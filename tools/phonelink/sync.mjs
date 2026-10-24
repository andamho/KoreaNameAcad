// 노트북 '휴대폰과 연결'에 들어온 문자를 고객정보(사이트 문자 수집함)로 올린다.
//
// 원장님 결정(2026-10-24): 폰 매크로 앱 대신 노트북 휴대폰과 연결로 문자를 모은다.
//  · 1시간마다 휴대폰과 연결 DB 를 복사해 문자를 읽는다(이 PC 안에서만 — 요금 없음).
//  · 아직 안 올린 문자가 있을 때만 사이트로 보낸다 → 사이트 DB 는 새 문자가 있을 때만 깬다.
//  · 하루 한 번은 문자가 없어도 '살아 있음' 을 남긴다 → 사이트가 25일 넘게 끊기면 메일로 알린다.
//  · 사진은 올리지 않는다(사진 문자는 적힌 글자만).
//  · 사이트 쪽 채우기 기능이 같은 문자를 두 번 넣지 않는다(번호·방향·내용·2분 이내 같으면 연결만).
//
// 실행: node tools/phonelink/sync.mjs           (계속 돌며 1시간마다)
//       node tools/phonelink/sync.mjs --once    (한 번만)
//       node tools/phonelink/sync.mjs --once --dry (올리지 않고 결과만)
// 설정: %LOCALAPPDATA%\kop-phonelink\config.json  { "secret": "<문자 수집 비밀값>", "base": "https://korea-name-acad.com" }
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORK = path.join(process.env.LOCALAPPDATA, "kop-phonelink");
const STATE = path.join(WORK, "state.json");
const CONFIG = path.join(WORK, "config.json");
const PKG = path.join(process.env.LOCALAPPDATA, "Packages", "Microsoft.YourPhone_8wekyb3d8bbwe", "LocalCache", "Indexed");
const DEVICE = "5f0e11c0-ba5e-4c0d-8e01-00000000f11c"; // 노트북 휴대폰과 연결 전용 고정 번호 — 사이트 phoneLinkReminder.ts 와 같아야 함
const EVERY_MS = 60 * 60 * 1000;
const DAYS = 31;

const args = new Set(process.argv.slice(2));
const ONCE = args.has("--once");
const DRY = args.has("--dry");

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
  execFileSync("py", ["-3", path.join(HERE, "extract.py"), copy, out], { env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
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
  const all = 읽기();
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
    // 31일 넘은 id 는 휴대폰과 연결에서도 사라지므로 기록도 정리
    const keep = new Set(all.map((m) => m.providerId));
    for (const id of Object.keys(state.sent)) if (!keep.has(id)) delete state.sent[id];
    fs.writeFileSync(STATE, JSON.stringify(state), "utf8");
  }
  log(`${DRY ? "[미리보기] " : ""}올림 ${fresh.length}건 → 새로 들어감 ${total.new} · 기존 문자와 연결 ${total.legacy_linked} · 이미 있음 ${total.existing_exact} · 애매 ${total.ambiguous} · 형식오류 ${total.invalid}`);
}

async function 돌기() {
  try { await 한번(); } catch (e) { log("오류:", e.message); }
}

if (ONCE) await 돌기();
else {
  log(`휴대폰과 연결 문자 동기화 시작 — ${EVERY_MS / 60000}분마다`);
  await 돌기();
  setInterval(돌기, EVERY_MS);
}
