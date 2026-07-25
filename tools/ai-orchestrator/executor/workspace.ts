// 워크스페이스 — Claude 가 수정할 격리 작업공간. git diff 로 변경 추적, main 브랜치 보호, 안전 경로만 쓰기.
//   실제 프로젝트에 붙일 때는 feature branch/worktree 를 root 로 준다. 테스트는 임시 git repo.
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { assertSafeWritePath } from "../policies/safety";

export interface FileEdit { path: string; content: string; }

function git(root: string, args: string[]): { code: number; out: string } {
  const r = spawnSync("git", args, { cwd: root, encoding: "utf-8", maxBuffer: 8 * 1024 * 1024 });
  return { code: r.status ?? -1, out: `${r.stdout ?? ""}${r.stderr ?? ""}` };
}

export class Workspace {
  constructor(public readonly root: string) {}

  isGitRepo(): boolean { return git(this.root, ["rev-parse", "--is-inside-work-tree"]).out.trim() === "true"; }
  currentBranch(): string { return git(this.root, ["rev-parse", "--abbrev-ref", "HEAD"]).out.trim(); }

  // main 보호: main 브랜치에서는 자동 수정 금지(별도 branch/worktree 요구).
  assertNotMain(): void {
    if (this.isGitRepo() && ["main", "master"].includes(this.currentBranch())) {
      throw new Error("main/master 브랜치 자동 수정 금지 — feature branch/worktree 를 사용하세요.");
    }
  }

  applyEdits(edits: FileEdit[]): string[] {
    const written: string[] = [];
    for (const e of edits) {
      assertSafeWritePath(this.root, e.path);
      const abs = path.resolve(this.root, e.path);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, e.content);
      written.push(e.path);
    }
    return written;
  }

  // 변경 diff(추적+미추적). 반환: {patch, changedFiles}.
  diff(): { patch: string; changedFiles: string[] } {
    if (!this.isGitRepo()) return { patch: "", changedFiles: [] };
    git(this.root, ["add", "-A", "-N"]); // 미추적 파일도 diff 에 포함(intent-to-add)
    const patch = git(this.root, ["diff"]).out;
    const names = git(this.root, ["diff", "--name-only"]).out.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    return { patch, changedFiles: names };
  }
}

// 테스트/격리용 임시 git 워크스페이스.
export function createTempWorkspace(dir: string): Workspace {
  fs.mkdirSync(dir, { recursive: true });
  spawnSync("git", ["init", "-q"], { cwd: dir });
  spawnSync("git", ["config", "user.email", "ai@local"], { cwd: dir });
  spawnSync("git", ["config", "user.name", "ai"], { cwd: dir });
  spawnSync("git", ["config", "commit.gpgsign", "false"], { cwd: dir });
  fs.writeFileSync(path.join(dir, ".gitkeep"), "");
  spawnSync("git", ["add", "-A"], { cwd: dir });
  spawnSync("git", ["commit", "-q", "-m", "init"], { cwd: dir });
  spawnSync("git", ["checkout", "-q", "-b", "ai-run"], { cwd: dir }); // main 보호 회피(작업 브랜치)
  return new Workspace(dir);
}
