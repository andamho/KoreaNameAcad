// KNOP UI 공용 헬퍼
import { Badge } from "@/components/ui/badge";
import {
  KNOP_PROJECT_TYPES,
  KNOP_STATUSES,
  KNOP_PAYMENT_STATUSES,
  KNOP_EVENT_TYPES,
  KNOP_EVENT_STATUSES,
} from "@shared/schema";

export const PROJECT_TYPES = KNOP_PROJECT_TYPES;
export const STATUSES = KNOP_STATUSES;
export const PAYMENT_STATUSES = KNOP_PAYMENT_STATUSES;
export const EVENT_TYPES = KNOP_EVENT_TYPES;
export const EVENT_STATUSES = KNOP_EVENT_STATUSES;

export function fmtDateTime(v: string | Date | null | undefined): string {
  if (!v) return "-";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "-";
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const h = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${y}.${mo}.${day} ${h}:${mi}`;
}

export function fmtDate(v: string | Date | null | undefined): string {
  if (!v) return "-";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "-";
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

export function fmtTime(v: string | Date | null | undefined): string {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// <input type="datetime-local"> 값 ↔ ISO 변환 (로컬 타임존 유지)
export function toLocalInput(v: string | Date | null | undefined): string {
  if (!v) return "";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "";
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 16);
}

export function fromLocalInput(v: string): string {
  // datetime-local 은 로컬 시간 → Date 로 바로 파싱하면 로컬로 해석됨
  return new Date(v).toISOString();
}

// 상태별 배지 색 (Tailwind). 결제완료/완료=초록, 대기=회색, 보류/중지=주황/빨강
function statusVariant(status: string): { className: string } {
  if (/(완료|확인|허가 완료)/.test(status)) return { className: "bg-green-100 text-green-700 border-green-200" };
  if (/(예정|진행중|접수|안내)/.test(status)) return { className: "bg-sky-100 text-sky-700 border-sky-200" };
  if (/(대기|결제대기|신청 전)/.test(status)) return { className: "bg-gray-100 text-gray-600 border-gray-200" };
  if (/보류/.test(status)) return { className: "bg-orange-100 text-orange-700 border-orange-200" };
  if (/(중지|기각)/.test(status)) return { className: "bg-red-100 text-red-700 border-red-200" };
  return { className: "bg-gray-100 text-gray-600 border-gray-200" };
}

export function StatusBadge({ status }: { status: string }) {
  const v = statusVariant(status);
  return (
    <Badge variant="outline" className={`font-medium ${v.className}`}>
      {status}
    </Badge>
  );
}

export function PaymentBadge({ status }: { status: string }) {
  const cls =
    status === "결제완료"
      ? "bg-green-100 text-green-700 border-green-200"
      : status === "결제확인중"
        ? "bg-amber-100 text-amber-700 border-amber-200"
        : "bg-gray-100 text-gray-500 border-gray-200";
  return (
    <Badge variant="outline" className={`font-medium ${cls}`}>
      {status}
    </Badge>
  );
}

// 타임라인 유형별 아이콘/라벨
export function timelineMeta(type: string): { label: string; dot: string } {
  switch (type) {
    case "customer_created":
      return { label: "고객", dot: "bg-[#56D5DB]" };
    case "project_created":
      return { label: "프로젝트", dot: "bg-sky-400" };
    case "status_change":
      return { label: "상태변경", dot: "bg-violet-400" };
    case "file":
      return { label: "파일", dot: "bg-amber-400" };
    case "event":
      return { label: "일정", dot: "bg-emerald-400" };
    case "note":
      return { label: "메모", dot: "bg-gray-400" };
    case "consultation_intake":
      return { label: "상담접수", dot: "bg-pink-400" };
    case "call":
      return { label: "통화", dot: "bg-blue-400" };
    case "message":
      return { label: "문자", dot: "bg-cyan-400" };
    default:
      return { label: type, dot: "bg-gray-300" };
  }
}

// 진행중 문자 세트의 짧은 이름(배지·확인창용).
// 예전에는 화면마다 "gaemyeong_request 면 미용감사, 아니면 정화하기" 로 단정해서
// 새로 생긴 새이름 안내가 '정화하기' 로 잘못 표시됐다(2026-08-02). 한 곳에서만 정한다.
export function seqLabel(seq: { setKey?: string | null; setLabel?: string | null } | null | undefined): string {
  const k = seq?.setKey || "";
  if (k === "gaemyeong_request") return "미용감사";
  if (k === "gaemyeong_approved") return "정화하기";
  if (k.startsWith("newname:")) return "새이름 안내";
  return seq?.setLabel || k || "문자";
}

// 배지 색: 세트별로 구분(미용감사 초록 · 정화하기 보라 · 새이름 하늘)
export function seqBadgeClass(seq: { setKey?: string | null } | null | undefined): string {
  const k = seq?.setKey || "";
  if (k === "gaemyeong_request") return "bg-emerald-100 text-emerald-700";
  if (k.startsWith("newname:")) return "bg-sky-100 text-sky-700";
  return "bg-violet-100 text-violet-700";
}
