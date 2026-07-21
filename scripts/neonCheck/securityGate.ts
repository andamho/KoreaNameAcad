// actual Neon execute **전** 관문(fail-closed).
//
// 관문의 대상은 disposable Neon branch 가 아니라 **이 워킹트리의 hardening SQL** 이다:
// 격리 PGlite 인스턴스에 0002+0004+hardening 을 적용한 뒤 function security assertion 을 평가한다.
// 하나라도 실패하면 **DB 연결을 만들기 전에** 중단한다(Neon 접속 0, DDL 0).
//
// ⚠️ 결과를 Neon capability 결과와 섞지 않는다. 보고는 세 줄로 분리:
//    Neon capabilities / hardening security assertions / preflight assertions.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { evaluateFunctionSecurityAssertions, type AssertionReport } from "../../server/migrations/hardening/functionSecurityCheck";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, "..", "..");
const read = (...p: string[]) => readFileSync(path.join(root, ...p), "utf-8");

export interface SecurityGateResult {
  gateOpen: boolean;
  report: AssertionReport | null;
  /** 평가 자체가 실패한 경우(부트스트랩 오류 등) — 이때도 gateOpen=false(fail-closed) */
  error?: string;
  /** 평가에 쓴 엔진(정본 아님을 표시하기 위해 기록) */
  engine?: string;
}

/** 격리 PGlite 에서 hardening SQL 을 적용하고 assertion 을 평가한다. 운영/Neon 미접촉. */
export async function runSecurityGate(): Promise<SecurityGateResult> {
  try {
    const { PGlite } = await import("@electric-sql/pglite");
    const db = new PGlite();
    await db.exec(read("migrations", "0002_create_persistent_job_queue.sql"));
    await db.exec(read("migrations", "0004_cross_agent_orchestration.sql"));
    await db.exec(read("migrations", "hardening", "0001_orchestration_immutability_roles.sql"));
    const engine = (await db.query<{ server_version: string }>("SHOW server_version")).rows[0].server_version;
    const report = await evaluateFunctionSecurityAssertions({
      query: (sql, params) => db.query(sql, params as any[]) as any,
    });
    return { gateOpen: report.gateOpen, report, engine };
  } catch (e: any) {
    return { gateOpen: false, report: null, error: String(e?.message ?? e).slice(0, 200) };
  }
}

export function formatSecurityGate(r: SecurityGateResult): string[] {
  if (!r.report) return [`[hardening-assertions] gate=CLOSED 평가 실패: ${r.error ?? "unknown"} → actual Neon execute 중단`];
  const lines = [
    `[hardening-assertions] total=${r.report.total} passed=${r.report.passed} failed=${r.report.failed} gate=${r.gateOpen ? "open" : "CLOSED"} engine=PGlite ${r.engine ?? "?"}(정본 아님)`,
    ...r.report.results.filter((x) => !x.ok).map((x) => `[hardening-assertions] FAIL ${x.id}: ${x.detail}`),
  ];
  if (!r.gateOpen) lines.push("[hardening-assertions] → actual Neon execute 중단(연결·DDL 0)");
  return lines;
}
