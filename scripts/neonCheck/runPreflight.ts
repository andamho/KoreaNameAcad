// select-only-preflight 실행 경로(CLI 진입). 실제 연결을 만들지만 **읽기 전용**이다.
// ⚠️ 이 저장소 Gate 에서는 호출되지 않았다(실제 Neon 접속 0).
import { probeDirect, probePooled, summarizePreflight, formatPreflightReport } from "./selectOnlyPreflight";
import { issueSignedEvidence, generateEvidenceKey, EVIDENCE_MAX_AGE_MS } from "./evidenceAuth";
import { saveEvidence, clearEvidence } from "./evidenceStore";
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
      // 서명 키는 이 실행에서만 만들어지고 evidence 와 **분리 저장**된다. execute 가 1회 소비하면 둘 다 폐기된다.
      const key = generateEvidenceKey();
      saveEvidence(issueSignedEvidence(cfg, report.status, direct.identityFingerprint, key, { nowMs: Date.now() }), key, { persist: true });
      console.log(`[preflight] HMAC 서명 evidence 발급(secret 0 · evidence/key 분리 · 저장소 밖 · TTL ${EVIDENCE_MAX_AGE_MS / 60000}분 · 1회 소비).`);
      return 0;
    }
    clearEvidence(); // 실패 시 이전 evidence 가 남아 execute 를 여는 일이 없도록 폐기
    console.error(`[preflight] ❌ ${report.status} → execute 승인 불가`);
    return 3;
  } finally {
    await directDriver.end().catch(() => {});
    await pooledDriver.end().catch(() => {});
  }
}
