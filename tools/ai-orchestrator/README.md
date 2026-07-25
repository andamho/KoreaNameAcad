# AI 작업실 협업 엔진 (Claude ↔ GPT)

서호님이 두 모델 사이에서 내용을 복사·전달하지 않고, **Claude와 GPT가 API로 자동 왕복**하며 코드 문제를 해결하는 최소 엔진.
목적은 범용 플랫폼이 아니라 **영상편집 자동화(1순위)** 문제 해결이며, 이후 통화 전사(2순위)에 재사용한다.

## 흐름
1. 작업 목표 입력 →
2. **Claude**(주담당): 저장소·로그 조사 → 원인 후보 + 근거 → 최소 수정(file_edits) + 테스트(commands) →
3. **GPT**(감사자): 증거부족·추측수정·회귀위험·diff·테스트를 검문 → verdict(approve|revise|blocked) →
4. GPT 지적이 **자동으로 Claude 다음 입력에 포함** → 재수정 → 재검문 →
5. 기준 충족(테스트+변경+수치+GPT approve) 또는 사람 승인 필요 시 종료.

## 실행
```bash
# 키 없이 흐름 검증(데모 코드 작업으로 자동 왕복):
npm run ai:orchestrate -- --task "..." --mock

# 실제(키 필요 — .env 에 ANTHROPIC_API_KEY, OPENAI_API_KEY):
npm run ai:orchestrate -- --task "현재 영상편집 실패 사례를 재현하고 원인을 찾아 수정·검증하라" --workspace <video-repo-worktree>
```
옵션: `--max-rounds N` · `--run-id <id>` · `--names 이름1,이름2`(익명화) · `--mock`.

## 계약(파일)
- `schemas/messages.ts` — Claude/GPT 응답 **JSON schema 강제**(zod). 파싱 실패 시 자동 재요청, 미검증 응답으로 진행 금지.
- `providers/` — `claude.ts`(Anthropic), `openai.ts`(OpenAI), `mock.ts`(키 없이 E2E). fetch 만 사용(SDK 의존 없음).
- `executor/` — `workspace.ts`(격리 작업공간·main 보호·git diff), `commands.ts`(allowlist 명령만 실행).
- `policies/` — `safety.ts`(명령 allow/deny·경로 안전), `completion.ts`(반복·완료 규칙).
- `anonymize.ts` — 전송 전 **PII 마스킹**(전화·이메일·주민·계좌·주소·이름 토큰화) + 키 마스킹. 마스킹 안 된 PII 감지 시 API 호출 차단.

## 안전 경계
- **자동 허용**: 코드·로그 읽기, feature branch/worktree 수정, 로컬 테스트, diff 생성, 결과 리포트.
- **자동 차단(→ blocked, 사람 승인)**: production DB 변경·main 병합·push·배포·secret 변경·대량 삭제·외부 전송.
- 모르는 명령은 allowlist 미포함으로 **차단**(기본 거부).

## 로그 (`.ai-runs/<run-id>/`, gitignore)
`task.json` · `transcript.jsonl` · `claude-analysis.json` · `gpt-review.json` · `git-diff.patch` · `tests.log` · `final-report.md`.
전 로그에 **API 키·개인정보 마스킹**. 원문은 로컬에만.

## 완료 판정(“프로세스 종료=성공” 금지)
테스트 실행 이력 + (구현 시) 변경 파일 + (품질 과제 시) 수치(metrics) + GPT `approve`+`goal_satisfied` 를 모두 만족해야 complete.
동일 실패 2회 반복·최대 반복 도달 시 안전 종료(stopped).

## 최초 1회 설정
실제 모드는 `.env` 에 `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` 필요(값은 서호님만 입력, 저장소·로그 금지). 없으면 `--mock` 로 흐름을 검증할 수 있다.
