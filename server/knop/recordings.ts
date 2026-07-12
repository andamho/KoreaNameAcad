// 상담녹음 폴더(.m4a) → 고객 자동 연결. 파일명에서 이름/전화 추출해 고객과 매칭.
// env KNOP_RECORDINGS_DIR 로 경로 변경. 로컬 전용.
import fs from "fs";
import path from "path";

const DIR = process.env.KNOP_RECORDINGS_DIR?.trim() || "C:/Users/iimoo/Desktop/상담녹음";

export function recordingsAvailable(): boolean {
  try {
    return fs.existsSync(DIR) && fs.statSync(DIR).isDirectory();
  } catch {
    return false;
  }
}

export type Recording = { file: string; name: string; phone: string; label: string };

const onlyDigits = (s: string) => (s || "").replace(/\D/g, "");
const cleanName = (s: string) => (s || "").replace(/[.\s]+$/, "");

export function parseRecording(file: string): Recording | null {
  if (!file.toLowerCase().endsWith(".m4a")) return null;
  const base = file.replace(/\.m4a$/i, "");
  const b2 = base.replace(/^통화\s*녹음\s*/, "").trim(); // "통화 녹음 " 접두 제거
  const phoneM = b2.match(/(01\d{7,9}|0\d{8,10}|\d{9,11})/);
  const phone = phoneM ? onlyDigits(phoneM[1]) : "";
  const nameM = b2.match(/^([가-힣]{2,4})/);
  const name = nameM ? nameM[1] : "";
  return { file, name, phone, label: base };
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
export function recordingsForCustomer(customer: { name: string; normalizedPhone: string }): Recording[] {
  const nm = cleanName(customer.name).replace(/\s*가족\s*$/, "");
  const nq = customer.normalizedPhone || "";
  return listRecordings().filter((r) => (r.phone && nq && r.phone === nq) || (r.name && r.name === nm));
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
