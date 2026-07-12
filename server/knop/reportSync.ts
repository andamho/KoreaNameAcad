// 이름분석 PDF 폴더 자동 동기화 (로컬 전용): 새 PDF → PNG 변환 → R2 업로드 → 고객 매칭(없으면 생성) → crm_files 저장.
// 로컬 서버 시작 시 밀린 것 일괄 처리 + 폴더 감시(fs.watch). 배포 서버는 폴더 없어서 no-op.
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { db } from "../db";
import { crmFiles, customers } from "@shared/schema";
import { knopStore } from "./store";
import { ObjectStorageService } from "../object_storage/objectStorage";
import {
  listReports,
  baseName,
  reportDateForName,
  resolveReportPath,
  reportsAvailable,
  reportsDir,
  type Report,
} from "./reports";

const PY = process.env.KNOP_WHISPER_PY?.trim() || "C:/Users/iimoo/Desktop/video-caption-bot/venv/Scripts/python.exe";
const RENDER = fileURLToPath(new URL("./py/render_pdf.py", import.meta.url));
const PREFIX = "이름분석표:";
const store = new ObjectStorageService();

function renderPng(pdfAbs: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const tmp = path.join(os.tmpdir(), `knoprep_${crypto.randomUUID()}.png`);
    const p = spawn(PY, [RENDER, pdfAbs, tmp], { windowsHide: true });
    let err = "";
    p.stderr.on("data", (d) => (err += d.toString()));
    p.on("error", reject);
    p.on("close", (code) => {
      try {
        if (code === 0 && fs.existsSync(tmp)) {
          const b = fs.readFileSync(tmp);
          fs.unlinkSync(tmp);
          resolve(b);
        } else reject(new Error("render 실패: " + err.slice(0, 120)));
      } catch (e) {
        reject(e);
      }
    });
  });
}

let _syncing = false;
export async function syncReports(): Promise<{ added: number; created: number }> {
  if (!db || _syncing || !reportsAvailable()) return { added: 0, created: 0 };
  _syncing = true;
  try {
    const reps = listReports().filter((r) => !/상세/.test(r.file));
    // 기준이름별 그룹 (가족여부)
    const groups = new Map<string, { family: boolean; files: Report[] }>();
    for (const r of reps) {
      const bn = baseName(r.name);
      if (!bn) continue;
      const g = groups.get(bn) || { family: false, files: [] };
      if ((r as any).family) g.family = true;
      g.files.push(r as any);
      groups.set(bn, g);
    }
    const allCusts = await db.select().from(customers);
    const byBase = new Map<string, typeof allCusts>(); // 활성만(첨부 대상)
    const anyBase = new Set<string>(); // 휴지통 포함(재생성 방지)
    for (const c of allCusts) {
      const b = baseName(c.name);
      anyBase.add(b);
      if (!c.deletedAt) (byBase.get(b) || byBase.set(b, []).get(b)!).push(c);
    }
    const existing = await db.select().from(crmFiles);
    const done = new Set(
      existing.filter((f) => f.memo?.startsWith(PREFIX)).map((f) => `${f.customerId}|${f.memo!.slice(PREFIX.length)}`)
    );
    let added = 0;
    let created = 0;
    for (const [bn, g] of Array.from(groups)) {
      let matched = byBase.get(bn) || [];
      if (matched.length === 0) {
        if (anyBase.has(bn)) continue; // 휴지통에 있음 → 재생성 안 함
        const c = await knopStore.createCustomerForReport(bn, g.family, reportDateForName(bn));
        matched = [c];
        created++;
      }
      for (const r of g.files) {
        const abs = resolveReportPath(r.file);
        if (!abs) continue;
        let buf: Buffer | null = null;
        for (const c of matched) {
          const key = `${c.id}|${r.file}`;
          if (done.has(key)) continue;
          try {
            if (!buf) buf = await renderPng(abs);
          } catch (e: any) {
            console.error(`[KNOP] 렌더 실패 ${r.file}: ${e?.message}`);
            break;
          }
          const okey = `uploads/${crypto.randomUUID()}.png`;
          await store.putObject(okey, buf, "image/png");
          await db.insert(crmFiles).values({
            customerId: c.id,
            fileName: `이름분석표 (${r.label})`,
            fileType: "image/png",
            fileUrl: `/objects/${okey}`,
            memo: `${PREFIX}${r.file}`,
          });
          done.add(key);
          added++;
        }
      }
    }
    if (added || created) console.log(`[KNOP] 이름분석표 동기화: ${added}개 첨부, 고객 ${created}명 생성`);
    return { added, created };
  } catch (e: any) {
    console.error(`[KNOP] 이름분석표 동기화 오류: ${e?.message}`);
    return { added: 0, created: 0 };
  } finally {
    _syncing = false;
  }
}

let _watching = false;
export function startReportSync() {
  if (_watching || !reportsAvailable()) return; // 배포 서버(폴더 없음)는 no-op
  _watching = true;
  // 서버 시작 후 밀린 것 처리
  setTimeout(() => syncReports().catch(() => {}), 15000);
  // 폴더 감시 (새 PDF 감지 → 디바운스 후 동기화)
  try {
    let timer: NodeJS.Timeout | null = null;
    fs.watch(reportsDir(), (_ev, file) => {
      if (!file || !String(file).toLowerCase().endsWith(".pdf")) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => syncReports().catch(() => {}), 6000);
    });
    console.log("[KNOP] 이름분석 폴더 자동 동기화 시작:", reportsDir());
  } catch (e: any) {
    console.error("[KNOP] 폴더 감시 실패:", e?.message);
  }
}
