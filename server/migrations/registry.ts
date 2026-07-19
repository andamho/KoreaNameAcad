// 명시 마이그레이션 레지스트리 — migrate.ts 의 'report_matches' 하드코딩을 대체한다.
// 각 마이그레이션이 "무엇을 새로 만드는지(expectedNewTables)"와 "적용 후 구조가 무엇이어야 하는지
// (fingerprintFixture)"를 코드로 선언 → 러너는 이 선언에 맞춰 검증한다. schema_migrations 같은
// 별도 상태 테이블은 두지 않는다(적용 여부는 카탈로그 fingerprint 로 판정, 안 A).

export interface MigrationDef {
  /** 마이그레이션 id = SQL 파일 basename(확장자 제외). 예: "0001_add_report_matches" */
  id: string;
  /** migrations/ 아래 SQL 파일명 */
  sqlFile: string;
  /** 이 마이그레이션이 새로 만들어야 하는 테이블(정확히 이 집합만 생겨야 함) */
  expectedNewTables: string[];
  /** 적용 후 구조 fingerprint(레포 루트 기준 경로). 있으면 재실행/적용 시 구조 정확 일치까지 검증 */
  fingerprintFixture?: string;
  /** SQL 파일의 기대 SHA-256(CRLF→LF 정규화, lowercase 64hex). 실행 전 파일 해시와 대조 → 불일치면 거부 */
  expectedSqlSha256: string;
  /** fingerprint fixture 파일의 기대 SHA-256(정규화). fingerprintFixture 있을 때만 */
  expectedFixtureSha256?: string;
}

// 적용 순서 = 배열 순서. 파괴적 변경은 등록하지 않는다(러너가 SQL 을 추가로 스캔).
export const MIGRATIONS: MigrationDef[] = [
  {
    id: "0001_add_report_matches",
    sqlFile: "0001_add_report_matches.sql",
    expectedNewTables: ["report_matches"],
    fingerprintFixture: "tests/knop/fixtures/reportMatchesFingerprint.json",
    expectedSqlSha256: "2cdebd1bb8edf6a16f0fe78936756b57011c2f7ce10201f2840f796b6d6dc2a4",
    expectedFixtureSha256: "2d6749ca9bd383460f1a721f56b3780f5071cebf629891c80104a98d6d711f5d",
  },
  {
    id: "0002_create_persistent_job_queue",
    sqlFile: "0002_create_persistent_job_queue.sql",
    expectedNewTables: ["jobs", "job_executions"],
    fingerprintFixture: "tests/knop/fixtures/jobQueueFingerprint.json",
    expectedSqlSha256: "837dc1a1ee884262d37b7a8f04abbde1e6e817818e2ea084a5070cc7d2d01033",
    expectedFixtureSha256: "e88b9fb19ca248d40cd89abfc1a8b9bede1e1c42be5f80acfaf8a0f2c50df216",
  },
  {
    id: "0003_create_job_shadow_previews",
    sqlFile: "0003_create_job_shadow_previews.sql",
    expectedNewTables: ["job_shadow_previews"],
    fingerprintFixture: "tests/knop/fixtures/jobShadowPreviewsFingerprint.json",
    expectedSqlSha256: "0070e6facd1fb45b1d25f35a8a42a816a5c40a4ca1c2280886e0027a9f5eb724",
    expectedFixtureSha256: "8e11a4bb934466b4f334da57a04f6982e4b0197780d31fae37bb6d9145d583f8",
  },
];

// id 또는 경로("migrations/0001_add_report_matches.sql")로 조회 → 기존 CLI 호출 형식과 하위호환.
export function findMigration(idOrPath: string): MigrationDef | undefined {
  const base = idOrPath.replace(/\\/g, "/").split("/").pop()?.replace(/\.sql$/, "") ?? idOrPath;
  return MIGRATIONS.find((m) => m.id === idOrPath || m.sqlFile === idOrPath || m.id === base);
}
