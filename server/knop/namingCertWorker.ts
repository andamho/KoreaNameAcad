// 작명장 만들기 — PC 워커 쪽 (kop-report-sync 안에서만 돈다).
//   서버 창구(namingCert.ts)에서 주문을 길게 기다렸다 가져와, Desktop\작명장\만들기\작명장만들기.mjs 를 돌리고 결과를 보고한다.
//   'make' 주문은 PDF 를 PDF작명장 에 넣는다 → 링크·텔레그램은 namingSync 가 이어서 한다(여기서는 링크가 생길 때까지 잠깐 기다려 주소만 읽어 보고).
//   HTTP 만 쓰고 DB 는 건드리지 않는다.
import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { namingCertWorkerToken } from "./namingCert";

const SERVER = (process.env.PUBLIC_BASE_URL || "https://korea-name-acad.com").replace(/\/$/, "");
const MAKER = (process.env.KOP_NAMING_MAKER || path.join(os.homedir(), "Desktop", "작명장", "만들기", "작명장만들기.mjs")).trim();
const LINK_STATE = path.join((process.env.KOP_NAMING_LINK_DIR || "C:/Users/iimoo/Desktop/작명장/링크").trim(), ".kop_naming_state.json");
const API = `${SERVER}/api/knop/naming-cert/worker`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const log = (...a: unknown[]) => console.log("[작명장 만들기]", ...a);

function runMaker(job: { step: string; order: unknown; overwrite: boolean }): Promise<Record<string, any>> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kop-naming-make-"));
  const inF = path.join(dir, "in.json"), outF = path.join(dir, "out.json");
  fs.writeFileSync(inF, JSON.stringify({ 단계: job.step, 주문: job.order, 덮어쓰기: job.overwrite }), "utf8");
  return new Promise((resolve) => {
    execFile(process.execPath, [MAKER, "--주문파일", inF, "--결과파일", outF], { timeout: 180_000, windowsHide: true }, (err, _so, se) => {
      let res: Record<string, any>;
      try { res = JSON.parse(fs.readFileSync(outF, "utf8")); }
      catch { res = { ok: false, error: "만들기 도구가 답을 내지 못했습니다: " + String(err?.message || se || "").slice(-200) }; }
      try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* noop */ }
      resolve(res);
    });
  });
}

/** PDF 를 넣은 뒤 namingSync 가 링크를 만들 때까지(감시 8초 + 그리기·올리기) 기다려 주소를 읽는다. 못 읽어도 실패는 아님. */
async function waitLink(pdfName: string, since: number): Promise<string | undefined> {
  for (let i = 0; i < 30; i++) {
    await sleep(4000);
    try {
      const s = JSON.parse(fs.readFileSync(LINK_STATE, "utf8"))[pdfName];
      if (s?.url && Number(s.mtime) >= since - 3000) return String(s.url);
    } catch { /* 아직 */ }
  }
  return undefined;
}

async function report(id: string, body: Record<string, any>, token: string) {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(`${API}/${id}/report`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
      if (r.ok || r.status === 404) return;
    } catch { /* 다시 */ }
    await sleep(3000);
  }
}

export function startNamingCertWorker() {
  const token = namingCertWorkerToken();
  if (!token) return log("열쇠가 없어 건너뜀(KOP_ALERT_BOT_TOKEN 없음)");
  if (!fs.existsSync(MAKER)) return log("만들기 도구가 없어 건너뜀:", MAKER);
  log("주문 기다리는 중 —", SERVER);
  (async () => {
    let quiet = false;
    for (;;) {
      try {
        const r = await fetch(`${API}/next?wait=50`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(75_000) });
        if (r.status === 200) {
          const { job } = (await r.json()) as { job: { id: string; step: string; order: any; overwrite: boolean } };
          log(`${job.step === "make" ? "만들기" : "한자·문단 찾기"} — ${job.order?.이름} ${(job.order?.한자 || []).join("·")}`);
          const t0 = Date.now();
          const res = await runMaker(job);
          if (res.ok && job.step === "make" && res.pdf) res.url = await waitLink(String(res.pdf), t0);
          await report(job.id, res, token);
          log(res.ok ? `끝 (${Math.round((Date.now() - t0) / 1000)}초)${res.url ? " " + res.url : ""}` : `실패: ${res.error}`);
          quiet = false;
        } else if (r.status === 204) {
          quiet = false;
        } else {
          // 404 = 서버에 아직 이 기능이 올라가지 않음(푸시 전). 조용히 5분 뒤 다시.
          if (!quiet) log(`서버 응답 ${r.status} — 5분마다 다시 확인`);
          quiet = true;
          await sleep(5 * 60_000);
        }
      } catch {
        await sleep(20_000);
      }
    }
  })();
}
