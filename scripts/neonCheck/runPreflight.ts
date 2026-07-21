// select-only-preflight 실행 경로(CLI 진입). 실제 연결을 만들지만 **읽기 전용**이다.
// ⚠️ 이 저장소 Gate 에서는 호출되지 않았다(실제 Neon 접속 0).
import { probeDirect, probePooled, summarizePreflight, formatPreflightReport, issueEvidence } from "./selectOnlyPreflight";
import { saveEvidence } from "./evidenceStore";
import type { HarnessConfig } from "./guards";
import type { RawDriver } from "./readOnlyAdapter";

/** pg.Client 를 RawDriver 로 감싼다. 연결 문자열은 로그에 남기지 않는다. */
export async function createRawDriver(url: string): Promise<RawDriver> {
  const pg = await import("pg");
  const client = new pg.default.Client({ connectionString: url });
  return {
    connect: () => client.connect(),
    query: (sql, params) => client.query(sql, params as any[]) as any,
    end: () => client.end(),
  };
}

export async function runSelectOnlyPreflight(
  cfg: HarnessConfig,
  makeDriver: (url: string) => Promise<RawDriver> = createRawDriver,
): Promise<number> {
  const directDriver = await makeDriver(cfg.directUrl);
  const pooledDriver = await makeDriver(cfg.pooledUrl);
  try {
    const direct = await probeDirect(directDriver, cfg);
    const pooled = await probePooled(pooledDriver, async () => makeDriver(cfg.pooledUrl).catch(() => null as any));
    const report = summarizePreflight({ cfg, direct, pooled });
    for (const line of formatPreflightReport(report)) console.log(line);

    if (report.status === "preflight-passed") {
      saveEvidence(issueEvidence(cfg, report, direct.identityFingerprint, Date.now()), { persist: true });
      console.log("[preflight] evidence 발급됨(secret 0 · repository 밖 임시 경로 · 만료 30분).");
      return 0;
    }
    console.error(`[preflight] ❌ ${report.status} → execute 승인 불가`);
    return 3;
  } finally {
    await directDriver.end().catch(() => {});
    await pooledDriver.end().catch(() => {});
  }
}
