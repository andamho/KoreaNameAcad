// 이름분석표 큐 배선 — locator 계약 · 로컬 파일 해석 · enqueue 결정. 로컬 전용(reports 폴더 있는 Windows worker/서버).
//
// 계약(고객 PII 는 큐에 저장하지 않는다):
//   job.inputIdentity = { inputAssetHash: <sha256>, fileContentHash: <sha256>, locator: "reports-sha256:<sha256>" } 만.
//   locator 는 절대경로·파일명(=이름=PII) 을 담지 않는다. 재시작 후에도 안정적(파일 **내용** 해시 기반).
//   해석 권위 = reports 루트 안의 파일을 listReports() 로 열거하며 내용 해시로 특정(루트 밖·traversal 차단).
//   로컬 인덱스(.kop_name_report_index.json: hash→상대경로)는 재해싱을 줄이는 **힌트**일 뿐, 정답은 항상 재해시로 확정.
//   파일 이동·삭제·루트 이탈 → permanent.invalid-input(자동 재시도 없음).
import fs from "fs";
import path from "path";
import type { QueueClient } from "../jobQueue/types";
import type { CreateJobInput } from "../jobQueue/createJob";
import { createJob } from "../jobQueue/createJob";
import { AdapterError } from "../jobQueue/adapters/types";
import { NAME_REPORT_JOB_TYPE, type NameReportRef } from "../jobQueue/adapters/nameReport";
import { sha256Hex } from "../jobQueue/idempotency";
import type { RequestVersionSnapshot } from "../../shared/jobQueueContract";
import type { ProcessInput, ProcessorDeps } from "./reportProcessor";
import { gatherCandidates } from "./reportProcessor";
import { listReports, resolveReportPath, reportsDir, baseName } from "./reports";

export const LOCATOR_PREFIX = "reports-sha256:";
const SHA256 = /^[0-9a-f]{64}$/;

export function buildLocator(fileContentHash: string): string {
  if (!SHA256.test(fileContentHash)) throw new Error("locator: fileContentHash 는 sha256 hex 여야 함");
  return LOCATOR_PREFIX + fileContentHash;
}
/** locator → fileContentHash. 형식 불량이면 null. */
export function parseLocator(locator: string): string | null {
  if (!locator || !locator.startsWith(LOCATOR_PREFIX)) return null;
  const h = locator.slice(LOCATOR_PREFIX.length);
  return SHA256.test(h) ? h : null;
}

// name-report 파이프라인 버전(고정). 엔진/사전 필드는 이 업무에 해당 없음 → null.
export function nameReportSnapshot(): RequestVersionSnapshot {
  return {
    schemaVersion: 1, pipelineVersion: "name-report-pipeline-v1",
    transcriptionEngineVersion: null, transcriptionEngineHash: null,
    dictionaryVersion: null, normalizationVersion: null,
    correctionEngineVersion: null, correctionEngineHash: null, executorRequirement: null,
  };
}

/** 비-PII job 입력. 같은 파일 내용 → 같은 inputAssetHash → 같은 idempotency key(중복 job 없음). */
export function buildNameReportJobInput(fileContentHash: string, reportType: "family" | "individual"): CreateJobInput {
  if (!SHA256.test(fileContentHash)) throw new Error("buildNameReportJobInput: fileContentHash 는 sha256 hex 여야 함");
  return {
    ownerScope: "korea-name-acad", projectId: null, jobType: NAME_REPORT_JOB_TYPE,
    inputIdentity: { inputAssetHash: fileContentHash, fileContentHash, locator: buildLocator(fileContentHash) }, // PII 없음
    requestVersionSnapshot: nameReportSnapshot(), executionOptions: null,
    payloadHash: sha256Hex(`name-report:${fileContentHash}:${reportType}`), // reportType 은 파일명에서 결정적 → 재감지 시 동일
  };
}

/** feature flag — 기본 false(기존 직접 처리 유지). true 일 때만 enqueue 분기. */
export function nameReportQueueEnabled(): boolean {
  return (process.env.FEATURE_NAME_REPORT_QUEUE || "").trim() === "true";
}

// ── 로컬 인덱스(힌트) ────────────────────────────────────────────────────────
function indexPath(): string { return path.join(reportsDir(), ".kop_name_report_index.json"); }
type Index = Record<string, string>; // fileContentHash → reports 루트 상대경로
function loadIndex(): Index { try { return JSON.parse(fs.readFileSync(indexPath(), "utf-8")); } catch { return {}; } }
export function saveIndexEntry(fileContentHash: string, relPath: string): void {
  try { const idx = loadIndex(); idx[fileContentHash] = relPath; fs.writeFileSync(indexPath(), JSON.stringify(idx)); } catch { /* best-effort */ }
}

function withinRoot(root: string, abs: string): boolean {
  const r = path.resolve(root), a = path.resolve(abs);
  return a === r || a.startsWith(r + path.sep);
}

// ── enqueue: 감지된 report 파일을 job 으로(직접 처리 대신) ──────────────────
/** listReports() 의 각 파일에 대해 name-report job 생성. 반환: 신규/중복(dedup) 수. PII 미포함. */
export async function enqueueDetectedReports(
  qc: QueueClient, deps: Pick<ProcessorDeps, "hashFile">,
): Promise<{ queued: number; deduped: number; failed: number }> {
  const root = path.resolve(reportsDir());
  const reps = listReports().filter((r) => !/상세/.test(r.file));
  let queued = 0, deduped = 0, failed = 0;
  for (const r of reps) {
    const abs = resolveReportPath(r.file);
    if (!abs || !withinRoot(root, abs)) { failed++; continue; }
    try {
      const hash = deps.hashFile(abs);
      const reportType: "family" | "individual" = r.family ? "family" : "individual";
      const { created } = await createJob(qc, buildNameReportJobInput(hash, reportType));
      saveIndexEntry(hash, path.relative(root, path.resolve(abs)));
      if (created) queued++; else deduped++;
    } catch { failed++; }
  }
  return { queued, deduped, failed };
}

// ── worker: 비-PII ref → 로컬 ProcessInput(이름·후보는 로컬에서만 해석) ──────
/** ref.fileContentHash 로 reports 루트 안의 파일을 특정해 ProcessInput 구성. 미해결 → permanent. */
export async function resolveNameReportInput(
  deps: Pick<ProcessorDeps, "db" | "hashFile">, ref: NameReportRef,
): Promise<ProcessInput> {
  const wantHash = parseLocator(ref.locator) ?? ref.fileContentHash;
  if (!SHA256.test(wantHash) || (parseLocator(ref.locator) && parseLocator(ref.locator) !== ref.fileContentHash)) {
    throw new AdapterError("permanent.invalid-input", "name-report locator/해시 불일치");
  }
  const root = path.resolve(reportsDir());
  const reps = listReports().filter((r) => !/상세/.test(r.file));
  // 인덱스 힌트로 후보 순서만 조정(정답은 재해시로 확정 — traversal 은 listReports 열거로 이미 루트 내부).
  const hintRel = loadIndex()[wantHash];
  const hintBase = hintRel ? path.basename(hintRel) : null;
  const ordered = hintBase ? [...reps].sort((a, b) => (a.file === hintBase ? -1 : b.file === hintBase ? 1 : 0)) : reps;
  for (const r of ordered) {
    const abs = resolveReportPath(r.file);
    if (!abs || !withinRoot(root, abs)) continue;
    if (deps.hashFile(abs) !== wantHash) continue;
    saveIndexEntry(wantHash, path.relative(root, path.resolve(abs)));
    const extractedName = baseName(r.name);
    const reportType: "family" | "individual" = r.family ? "family" : "individual";
    const { candidates, failed } = await gatherCandidates(deps.db, extractedName, reportType);
    return { file: r.file, absPath: abs, extractedName, reportType, label: r.label, candidates, candidatesFailed: failed };
  }
  throw new AdapterError("permanent.invalid-input", "name-report 파일 미해결(이동·삭제·루트 이탈)");
}
