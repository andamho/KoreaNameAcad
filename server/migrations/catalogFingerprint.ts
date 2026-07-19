// 카탈로그 구조 fingerprint — 컬럼/제약/인덱스를 information_schema·pg_catalog 에서 그대로 읽어
// "구조가 기대와 정확히 같은가"를 테이블 개수만이 아니라 실제 정의로 판정한다.
// tests/knop/jobQueueMigration.test.ts 가 인라인으로 쓰던 것과 동일한 쿼리·정렬 = 단일 소스.
// pg.Client 와 PGlite 를 같은 모양으로 다루기 위해 최소 인터페이스만 요구한다.

export interface FpClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: any[] }>;
}

export interface CatalogFingerprint {
  columnCount: number;
  columns: any[];
  constraints: any[];
  indexes: any[];
}

// 레지스트리에서 온 코드 상수만 넘어온다(사용자 입력 아님). 그래도 방어적으로 식별자 형식 검증.
function assertIdent(t: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(t)) throw new Error(`잘못된 테이블 식별자: ${JSON.stringify(t)}`);
  return t;
}

export async function computeCatalogFingerprint(c: FpClient, tables: string[]): Promise<CatalogFingerprint> {
  const list = tables.map((t) => `'${assertIdent(t)}'`).join(",");
  const columns = (
    await c.query(
      `SELECT table_name,column_name,data_type,character_maximum_length,is_nullable,column_default
         FROM information_schema.columns
        WHERE table_schema='public' AND table_name IN (${list})
        ORDER BY table_name,ordinal_position`,
    )
  ).rows;
  const constraints = (
    await c.query(
      `SELECT rel.relname tbl,con.conname,con.contype,pg_get_constraintdef(con.oid) def
         FROM pg_constraint con
         JOIN pg_class rel ON rel.oid=con.conrelid
         JOIN pg_namespace n ON n.oid=rel.relnamespace
        WHERE n.nspname='public' AND rel.relname IN (${list}) AND con.contype IN ('p','u','f','c')
        ORDER BY rel.relname,con.contype,con.conname`,
    )
  ).rows;
  const indexes = (
    await c.query(
      `SELECT tablename,indexname,indexdef
         FROM pg_indexes
        WHERE schemaname='public' AND tablename IN (${list})
        ORDER BY tablename,indexname`,
    )
  ).rows;
  return { columnCount: columns.length, columns, constraints, indexes };
}

// 키 순서·부동 표현에 흔들리지 않는 정준 비교(fixture ↔ 실측).
function canon(x: unknown): string {
  const seen = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(seen);
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      return Object.keys(o)
        .sort()
        .reduce((acc, k) => {
          acc[k] = seen(o[k]);
          return acc;
        }, {} as Record<string, unknown>);
    }
    return v;
  };
  return JSON.stringify(seen(x));
}

export interface FingerprintFixture {
  columns: any[];
  constraints: any[];
  indexes: any[];
}

// fixture 의 columns/constraints/indexes 3영역만 대조(_note·columnCount 등 부가필드 무시).
export function fingerprintMatches(fp: CatalogFingerprint, fixture: FingerprintFixture): boolean {
  return (
    canon(fp.columns) === canon(fixture.columns) &&
    canon(fp.constraints) === canon(fixture.constraints) &&
    canon(fp.indexes) === canon(fixture.indexes)
  );
}
