// --check-providers — 실제 API 호출 전 사전 점검. 키 원문 출력 금지, 사람이 이해할 실패 사유 제공.
//   확인: 키 존재 · 모델 지정 · 지정 모델 접근 가능 · 짧은 구조화 응답 1회 파싱.
import type { Provider } from "./types";

export interface ProviderCheck {
  label: string;
  keyPresent: boolean;
  model: string;
  reachable: boolean;      // API 호출 성공(인증·모델 접근 OK)
  structuredOk: boolean;   // 짧은 JSON 응답 파싱 성공
  ok: boolean;
  reason: string;          // 사람이 읽을 결과/실패 사유(키 원문 없음)
}

function humanReason(msg: string): string {
  const m = msg || "";
  if (/40[13]/.test(m) && /auth|invalid|api key|unauthor/i.test(m)) return "인증 실패 — API 키가 틀렸거나 만료됨";
  if (/401/.test(m)) return "인증 실패(401) — 키 확인 필요";
  if (/404/.test(m) || /model.*not.*found|does not exist|unknown model/i.test(m)) return "지정 모델에 접근 불가 — 모델명이 틀렸거나 계정 권한 없음";
  if (/429/.test(m)) return "요청 한도 초과(429) — 잠시 후 재시도 또는 결제 상태 확인";
  if (/insufficient_quota|billing|quota/i.test(m)) return "크레딧/결제 문제 — 계정 결제 상태 확인";
  if (/ENOTFOUND|ECONNREFUSED|fetch failed|network|timeout/i.test(m)) return "네트워크 연결 실패";
  return `호출 실패: ${m.slice(0, 120)}`;
}

export async function checkProvider(label: string, provider: Provider, keyEnv: string): Promise<ProviderCheck> {
  const keyPresent = !!(process.env[keyEnv] || "").trim();
  const model = provider.model.startsWith("(") ? "" : provider.model; // "(… 미설정)" 표시 처리
  const base: ProviderCheck = { label, keyPresent, model, reachable: false, structuredOk: false, ok: false, reason: "" };
  if (!keyPresent) return { ...base, reason: `${keyEnv} 미설정 — .env 에 키 입력 필요(값은 저장소·로그에 남기지 마세요)` };
  if (!model) return { ...base, reason: `모델 미설정 — .env 에 ${label === "claude" ? "ANTHROPIC_MODEL" : "OPENAI_MODEL"} 지정 필요(코드 기본값 없음)` };
  try {
    const raw = await provider.complete({
      system: "너는 점검용이다. 반드시 JSON 만 출력: {\"ok\":true}",
      messages: [{ role: "user", content: "점검. {\"ok\":true} 만 출력하라." }],
      maxTokens: 50,
    });
    let parsed: any = null;
    try { const s = raw.indexOf("{"), e = raw.lastIndexOf("}"); parsed = JSON.parse(raw.slice(s, e + 1)); } catch { /* */ }
    const structuredOk = parsed && typeof parsed === "object";
    return { ...base, reachable: true, structuredOk: !!structuredOk, ok: !!structuredOk, reason: structuredOk ? "정상 — 키·모델·구조화 응답 확인" : "응답을 받았으나 JSON 파싱 실패(모델이 구조화 출력을 지원하는지 확인)" };
  } catch (e: any) {
    return { ...base, reason: humanReason(String(e?.message ?? e)) };
  }
}

export function renderChecks(checks: ProviderCheck[]): string {
  const lines = ["[check-providers] 실제 API 사전 점검 (키 원문 미표시)"];
  for (const c of checks) {
    lines.push(`  - ${c.label}: ${c.ok ? "✅ OK" : "❌ 실패"} · 키=${c.keyPresent ? "있음" : "없음"} · 모델=${c.model || "미설정"} · 접근=${c.reachable ? "가능" : "불가"} · 구조화=${c.structuredOk ? "OK" : "-"}`);
    lines.push(`      → ${c.reason}`);
  }
  return lines.join("\n");
}
