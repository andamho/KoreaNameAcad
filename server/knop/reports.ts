// 이름분석표 PDF 연계: 로컬 폴더의 "{이름}님 … 이름분석 … .pdf" 를 고객 이름과 매칭.
// 로컬 전용(localhost). env KNOP_REPORTS_DIR 로 경로 변경 가능.
import fs from "fs";
import path from "path";

const DIR = process.env.KNOP_REPORTS_DIR?.trim() || "C:/Users/iimoo/Documents/이름분석";

export function reportsDir(): string {
  return DIR;
}

export function reportsAvailable(): boolean {
  try {
    return fs.existsSync(DIR) && fs.statSync(DIR).isDirectory();
  } catch {
    return false;
  }
}

export type Report = { file: string; name: string; label: string; family: boolean };

// 고객명에서 "가족" 꼬리 제거 → 기준 이름 (강보경가족 → 강보경). PDF/녹음 매칭용.
export function baseName(n: string): string {
  return (n || "").replace(/\s*가족\s*$/, "").replace(/[.\s]+$/, "");
}

function parseReport(file: string): Report | null {
  if (!file.toLowerCase().endsWith(".pdf")) return null;
  const base = file.replace(/\.pdf$/i, "");
  const m = base.match(/^(.+?)님/);
  if (!m) return null;
  const name = m[1].trim();
  const label = base.replace(/^.+?님\s*/, "").trim() || "이름분석";
  return { file, name, label, family: /가족/.test(base) };
}

export function listReports(): Report[] {
  if (!reportsAvailable()) return [];
  try {
    return fs.readdirSync(DIR).map(parseReport).filter((r): r is Report => !!r);
  } catch {
    return [];
  }
}

// 이름 배열 → 기준이름별 리포트 목록 (고객명의 "가족" 꼬리 제거해서 매칭)
export function reportsByName(names: string[]): Record<string, Report[]> {
  const wanted = new Set(names.map(baseName));
  const out: Record<string, Report[]> = {};
  for (const r of listReports()) {
    const nm = baseName(r.name);
    if (wanted.has(nm)) (out[nm] ||= []).push(r);
  }
  return out;
}

export function reportsForName(name: string): Report[] {
  return reportsByName([name])[baseName(name)] || [];
}

// 경로 조작 방지: 폴더 안의 실제 파일만 반환
// 그 이름의 PDF 파일 중 가장 이른 생성일 (등록일 추정용). 없으면 null.
export function reportDateForName(name: string): Date | null {
  const bn = baseName(name);
  let earliest: Date | null = null;
  for (const r of listReports()) {
    if (baseName(r.name) !== bn) continue;
    try {
      const s = fs.statSync(path.join(DIR, r.file));
      const d = s.birthtimeMs ? s.birthtime : s.mtime;
      if (!earliest || d < earliest) earliest = d;
    } catch {
      /* noop */
    }
  }
  return earliest;
}

export function resolveReportPath(file: string): string | null {
  try {
    const base = path.basename(file);
    const full = path.join(DIR, base);
    if (fs.existsSync(full) && fs.statSync(full).isFile() && full.toLowerCase().endsWith(".pdf")) return full;
  } catch {
    /* noop */
  }
  return null;
}
