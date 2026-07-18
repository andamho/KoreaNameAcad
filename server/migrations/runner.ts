// 명시 마이그레이션 러너(범용) — drizzle-kit push 사용 안 함.
// 핵심 보증(기존 migrate.ts 계승 + 일반화):
//   1) SQL 정적 안전 스캔: DROP/TRUNCATE/DML/권한변경 거부, CREATE/ALTER TABLE 대상은 expectedNewTables 로 제한.
//   2) 사전 catalog 검문: 대상 테이블이 하나도 없을 때만 신규 적용. 일부만 존재=불완전→중단(자동수정 금지).
//      전부 존재=구조 fingerprint 대조(일치=already-applied, 불일치=중단). CREATE ... IF NOT EXISTS 를 안전근거로 삼지 않음.
//   3) 트랜잭션 내부 검증: 기대한 새 테이블이 정확히 생겼는가 / 예상 밖 테이블이 생기지 않았는가 /
//      기존 테이블 행 수 전부 동일한가 / (fixture 있으면) 구조 fingerprint 정확 일치.
//   4) 기본은 dry-run(검증 후 ROLLBACK). 실제 COMMIT 은 호출부가 apply=true 를 명시할 때만.
import type { MigrationDef } from "./registry";
import {
  computeCatalogFingerprint,
  fingerprintMatches,
  type FingerprintFixture,
} from "./catalogFingerprint";

// pg.Client / PGlite 공통 최소 인터페이스. query=단일(파라미터), exec=다중 구문(마이그레이션 본문·트랜잭션 제어).
export interface RunnerClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>;
  exec(sql: string): Promise<void>;
}

export type RunOutcome =
  | "applied" // 실제 적용(COMMIT)
  | "dry-run-verified" // 검증 통과, 미적용(ROLLBACK)
  | "already-applied" // 이미 적용됨(구조 fingerprint 일치)
  | "already-applied-unverified" // 대상 전부 존재하나 대조할 fixture 없음(경고)
  | "aborted-incomplete" // 대상 일부만 존재 = 불완전 상태
  | "aborted-fingerprint-mismatch" // 대상 존재하나 구조 불일치
  | "aborted-missing-tables" // 적용 후 기대 테이블 미생성
  | "aborted-unexpected-tables" // 적용 후 예상 밖 테이블 생성
  | "aborted-existing-data-changed" // 기존 테이블 행 수 변동
  | "aborted-sql-error" // SQL 실행 오류
  | "rejected-unsafe-sql"; // 정적 스캔에서 위험 SQL 거부

const SUCCESS: ReadonlySet<RunOutcome> = new Set<RunOutcome>([
  "applied",
  "dry-run-verified",
  "already-applied",
  "already-applied-unverified",
]);
export const isSuccessOutcome = (o: RunOutcome): boolean => SUCCESS.has(o);

export interface RunResult {
  outcome: RunOutcome;
  migrationId: string;
  committed: boolean;
  createdTables: string[];
  detail: string;
}

export interface RunOptions {
  sqlText: string; // 마이그레이션 SQL 본문(호출부가 파일에서 읽어 주입 → 테스트 주입도 가능)
  fixture?: FingerprintFixture | null; // fingerprintFixture JSON(있으면 구조 정확 대조)
  apply: boolean; // true=COMMIT, false(기본)=dry-run(ROLLBACK)
}

// ── 정적 안전 스캔 ────────────────────────────────────────────────────────────
// 주석·문자열 리터럴을 제거한 뒤 키워드/대상 테이블을 검사한다(주석 속 'DROP' 오탐 방지).
function stripNoise(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ") // 블록 주석
    .replace(/--[^\n]*/g, " ") // 라인 주석
    .replace(/'(?:''|[^'])*'/g, "''"); // 작은따옴표 문자열
}

export function scanSql(sql: string, expectedNewTables: string[]): { safe: true } | { safe: false; reason: string } {
  const s = stripNoise(sql);
  const allowed = new Set(expectedNewTables.map((t) => t.toLowerCase()));

  const forbidden: Array<[RegExp, string]> = [
    [/\bDROP\b/i, "DROP"],
    [/\bTRUNCATE\b/i, "TRUNCATE"],
    [/\bGRANT\b/i, "GRANT"],
    [/\bREVOKE\b/i, "REVOKE"],
    [/\bDELETE\s+FROM\b/i, "DELETE FROM"],
    [/\bUPDATE\s+["a-zA-Z_]/i, "UPDATE"],
    [/\bINSERT\s+INTO\b/i, "INSERT INTO"],
    [/\bCOPY\s+["a-zA-Z_]/i, "COPY"],
    [/\bALTER\s+TYPE\b/i, "ALTER TYPE"],
  ];
  for (const [re, name] of forbidden) {
    if (re.test(s)) return { safe: false, reason: `금지된 구문 감지: ${name}` };
  }

  const ident = `"?([a-zA-Z_][a-zA-Z0-9_]*)"?`;
  const check = (re: RegExp, kind: string): { safe: false; reason: string } | null => {
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(s)) !== null) {
      const tbl = m[1].toLowerCase();
      if (!allowed.has(tbl)) {
        return { safe: false, reason: `${kind} 대상이 expectedNewTables 밖: ${tbl}` };
      }
    }
    return null;
  };
  const badCreate = check(new RegExp(`\\bCREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${ident}`, "gi"), "CREATE TABLE");
  if (badCreate) return badCreate;
  const badAlter = check(new RegExp(`\\bALTER\\s+TABLE\\s+(?:ONLY\\s+)?${ident}`, "gi"), "ALTER TABLE");
  if (badAlter) return badAlter;

  return { safe: true };
}

// ── catalog 헬퍼 ─────────────────────────────────────────────────────────────
async function listTables(c: RunnerClient): Promise<string[]> {
  return (
    await c.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`)
  ).rows.map((r: any) => r.tablename);
}

async function tableCounts(c: RunnerClient): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of await listTables(c)) {
    const n = await c.query(`SELECT count(*)::int AS n FROM "${t}"`);
    out[t] = n.rows[0].n;
  }
  return out;
}

// 순수 사후검증 로직(합성 count 맵으로도 단위 테스트 가능하게 분리).
export function verifyPostApply(
  before: Record<string, number>,
  after: Record<string, number>,
  expectedNewTables: string[],
): { ok: true; newTables: string[] } | { ok: false; outcome: RunOutcome; detail: string } {
  const newTables = Object.keys(after).filter((t) => !(t in before));
  const missing = expectedNewTables.filter((t) => !newTables.includes(t));
  if (missing.length) return { ok: false, outcome: "aborted-missing-tables", detail: `미생성: ${missing.join(", ")}` };
  const stray = newTables.filter((t) => !expectedNewTables.includes(t));
  if (stray.length) return { ok: false, outcome: "aborted-unexpected-tables", detail: `예상 밖 생성: ${stray.join(", ")}` };
  const changed = Object.keys(before).filter((t) => before[t] !== after[t]);
  if (changed.length)
    return {
      ok: false,
      outcome: "aborted-existing-data-changed",
      detail: changed.map((t) => `${t} ${before[t]}→${after[t]}`).join(", "),
    };
  return { ok: true, newTables };
}

// ── 러너 코어 ────────────────────────────────────────────────────────────────
export async function runMigration(c: RunnerClient, def: MigrationDef, opts: RunOptions): Promise<RunResult> {
  const base = { migrationId: def.id, committed: false, createdTables: [] as string[] };

  // 1) 정적 안전 스캔
  const scan = scanSql(opts.sqlText, def.expectedNewTables);
  if (!scan.safe) return { ...base, outcome: "rejected-unsafe-sql", detail: scan.reason };

  // 2) 사전 catalog 검문
  const present = new Set(await listTables(c));
  const existing = def.expectedNewTables.filter((t) => present.has(t));
  if (existing.length === def.expectedNewTables.length) {
    if (opts.fixture) {
      const fp = await computeCatalogFingerprint(c, def.expectedNewTables);
      return fingerprintMatches(fp, opts.fixture)
        ? { ...base, outcome: "already-applied", detail: "대상 테이블 존재 · 구조 fingerprint 일치" }
        : { ...base, outcome: "aborted-fingerprint-mismatch", detail: "대상 테이블 존재하나 구조 불일치 → 중단" };
    }
    return { ...base, outcome: "already-applied-unverified", detail: "대상 테이블 존재하나 대조 fixture 없음" };
  }
  if (existing.length > 0) {
    return { ...base, outcome: "aborted-incomplete", detail: `일부만 존재(${existing.join(", ")}) = 불완전 → 중단` };
  }

  // 3) 신규 적용(트랜잭션 내부 검증)
  const before = await tableCounts(c);
  await c.exec("BEGIN");
  try {
    await c.exec(opts.sqlText);
    const after = await tableCounts(c);
    const chk = verifyPostApply(before, after, def.expectedNewTables);
    if (!chk.ok) {
      await c.exec("ROLLBACK");
      return { ...base, outcome: chk.outcome, detail: chk.detail };
    }
    if (opts.fixture) {
      const fp = await computeCatalogFingerprint(c, def.expectedNewTables);
      if (!fingerprintMatches(fp, opts.fixture)) {
        await c.exec("ROLLBACK");
        return { ...base, outcome: "aborted-fingerprint-mismatch", detail: "적용 후 구조가 fixture 와 불일치 → ROLLBACK" };
      }
    }
    if (opts.apply) {
      await c.exec("COMMIT");
      return { ...base, outcome: "applied", committed: true, createdTables: chk.newTables, detail: `적용 완료: ${chk.newTables.join(", ")}` };
    }
    await c.exec("ROLLBACK");
    return { ...base, outcome: "dry-run-verified", createdTables: chk.newTables, detail: `검증 통과(미적용): ${chk.newTables.join(", ")}` };
  } catch (e: any) {
    await c.exec("ROLLBACK").catch(() => {});
    return { ...base, outcome: "aborted-sql-error", detail: e?.message ?? String(e) };
  }
}
