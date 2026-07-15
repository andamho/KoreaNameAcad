// 상담녹음 폴더(.m4a) → 고객 자동 연결. 파일명에서 이름/전화 추출해 고객과 매칭.
// env KNOP_RECORDINGS_DIR 로 경로 변경. 로컬 전용.
import fs from "fs";
import path from "path";

const DIR = (process.env.KOP_RECORDINGS_DIR || process.env.KNOP_RECORDINGS_DIR)?.trim() || "C:/Users/iimoo/Desktop/상담녹음";

export function recordingsAvailable(): boolean {
  try {
    return fs.existsSync(DIR) && fs.statSync(DIR).isDirectory();
  } catch {
    return false;
  }
}

export type Recording = { file: string; name: string; phone: string; label: string; date: Date | null };

const onlyDigits = (s: string) => (s || "").replace(/\D/g, "");
const cleanName = (s: string) => (s || "").replace(/[.\s]+$/, "");

// 파일명 끝의 녹음시각 "_YYMMDD_HHMMSS" → 실제 녹음 날짜
function parseRecDate(b2: string): Date | null {
  const m = b2.match(/_(\d{6})_(\d{6})$/);
  if (!m) return null;
  const [, ymd, hms] = m;
  const d = new Date(
    2000 + +ymd.slice(0, 2),
    +ymd.slice(2, 4) - 1,
    +ymd.slice(4, 6),
    +hms.slice(0, 2),
    +hms.slice(2, 4),
    +hms.slice(4, 6),
  );
  return isNaN(d.getTime()) ? null : d;
}

export function parseRecording(file: string): Recording | null {
  if (!file.toLowerCase().endsWith(".m4a")) return null;
  const base = file.replace(/\.m4a$/i, "");
  const b2 = base.replace(/^통화\s*녹음\s*/, "").trim(); // "통화 녹음 " 접두 제거
  const phoneM = b2.match(/(01\d{7,9}|0\d{8,10}|\d{9,11})/);
  const phone = phoneM ? onlyDigits(phoneM[1]) : "";
  const nameM = b2.match(/^([가-힣]{2,4})/);
  const name = nameM ? nameM[1] : "";
  return { file, name, phone, label: base, date: parseRecDate(b2) };
}

export function listRecordings(): Recording[] {
  if (!recordingsAvailable()) return [];
  try {
    return fs.readdirSync(DIR).map(parseRecording).filter((r): r is Recording => !!r);
  } catch {
    return [];
  }
}

// 고객(이름·정규화전화)에 매칭되는 녹음. 고객명의 "가족" 꼬리는 떼고 이름 매칭.
// 동명이인 방지: 이름만 일치하는 경우, 녹음일이 고객 등록일보다 1년 이상 이전이면 제외
// (예: 2022년 "이은혜" 녹음이 2026년 등록 "이은혜"에게 붙는 것 방지). 전화번호 일치는 무조건 신뢰.
const NAME_MATCH_MAX_BEFORE_MS = 365 * 24 * 60 * 60 * 1000;

export function recordingsForCustomer(customer: {
  name: string;
  normalizedPhone: string;
  createdAt?: Date | string | null;
}): Recording[] {
  const nm = cleanName(customer.name).replace(/\s*가족\s*$/, "");
  const nq = customer.normalizedPhone || "";
  const reg = customer.createdAt ? new Date(customer.createdAt) : null;
  const regMs = reg && !isNaN(reg.getTime()) ? reg.getTime() : null;
  return listRecordings().filter((r) => {
    if (r.phone && nq && r.phone === nq) return true; // 전화 일치 → 확실
    if (!(r.name && r.name === nm)) return false; // 이름도 안 맞으면 제외
    // 이름만 일치 → 날짜 상식 확인
    if (regMs && r.date && r.date.getTime() < regMs - NAME_MATCH_MAX_BEFORE_MS) return false;
    return true;
  });
}

export function resolveRecordingPath(file: string): string | null {
  try {
    const base = path.basename(file);
    const full = path.join(DIR, base);
    if (fs.existsSync(full) && fs.statSync(full).isFile() && full.toLowerCase().endsWith(".m4a")) return full;
  } catch {
    /* noop */
  }
  return null;
}
