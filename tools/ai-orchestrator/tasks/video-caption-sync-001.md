# 첫 실제 API 왕복 과제 패킷 — video-caption-sync-001

> 협업 엔진(Claude↔GPT)의 **첫 실제 과제**. 데모 코드가 아니라 영상편집 실제 문제로 고정.
> 실행: `npm run ai:orchestrate -- --task "<아래 목표>" --workspace <video-caption-bot 별도 worktree>`
> 사전: `--check-providers` 통과 후. 코드 수정은 엔진(Claude)이 수행 — 이 패킷은 조사 컨텍스트만 담는다(사전 수정 없음).

## 목표(고정)
최근 실제 영상에서 **자막이 발화와 맞지 않는 사례 하나를 재현**하고, 증거를 바탕으로 원인을 찾은 뒤,
Claude가 수정하고 GPT가 검문하며, **골든 회귀 테스트와 실제 영상 재처리로 검증**하라.

## 대상 저장소 (read-only 조사 결과, 2026-07-25)
- 위치: `C:\Users\iimoo\Desktop\video-caption-bot` (git, branch `main`, HEAD `8b373c9`)
- ⚠️ working tree 미커밋 16파일: `image_place.py`·`inject_images.py`(이미지 오버레이 작업 중), `learned_corrections.json`, `webapp/uploads/cf/*.jpg`(얼굴후보). → 엔진은 **별도 worktree/feature branch** 에서 작업(main 자동수정 금지). 미커밋 변경은 조사 대상 아님(격리).

## 파이프라인 (edit.sh)
1 오디오추출(ffmpeg) → 2 전사(`transcribe_wx.py`, whisper large-v3) → 3 교정(`correct.py`) →
**3c MMS 강제정렬(`align_mms.py`) = 단어 시각 정확화(자막-발화 싱크의 핵심)** → 3b 대본정제(`clean_script.py`) →
**4 컷+대본자막(`cut.py`) = 재촬영/중복 제거 + MMS 시각으로 자막 배치** → 5 faces → 7 빌드(`build_draft.py`) →
7b 제목(`inject_title.py`, 썸네일+본문) → **8 감사(`audit.py`) = 빠짐·재촬영·자막없는영상·겹침·여백·싱크** → 8c active_project.

## 자막-발화 싱크 관련 지점(원인 후보 영역)
- `align_mms.py` — MMS forced alignment. 단어 시각을 오디오에 정밀 정렬. 정렬 실패/누락이 싱크 오차의 1차 원인.
- `cut.py` — 재촬영 제거로 구간을 잘라내며 시각을 remap. 컷 경계에서 자막 start/end 어긋남 가능. `join_continuous_speech`.
- `audit.py` — 최종 감사에 **caption_lag(자막 지연)** 검출·보정 포함(골든이 `caption_lag_corrected==1` 검증).
- 최근 커밋 `359f187 fix(verify): support merged and split caption boundaries` → 자막 경계 병합/분할이 최근 수정 영역(회귀 위험 주시).

## 골든/회귀 (수정 후 반드시 통과)
- 골든 v1.16: `test_regression_caption_pipeline.py` — `_golden/구름/`(해시 봉인 manifest) 입력으로 `cut.py` 실행 후 `captions_cut.golden.json` 대조.
  검사 6종 동시: **① caption_lag 보정 정확 1건**, 재촬영제거 규칙(⑥Prefix-OneDiff·⑦ScriptAnchored·⑧FalseStart+script_veto), audio-verified insert, **캡션 수==골든**, **타이밍 허용오차 tol=0.06(60ms)**.
  실행: `./venv/Scripts/python.exe test_regression_caption_pipeline.py` (MMS 검증 포함 **~1–2분**).
- 개별 회귀: `test_insert_di.py`·`test_retake8.py`·`test_verify.py`·`test_verify_regression.py`.

## 실제 검증 영상(연속 3개 성공 대상 후보)
`input/`: `구름.mp4`(골든 원본)·`김무열.mp4`·`아기.mp4`·`충주맨.mp4`·`후기.mp4`. 대본: `output/script_*.txt`.
- 실제 1편 재처리 명령: `bash edit.sh` (전사~감사 전체, whisper/MMS 때문에 **수 분~십수 분**, GPU 사용).
- 결과 검사(프로세스 종료로 성공 판정 금지): `output/captions_cut.json`(자막·시각)·`output/decision_log.json`(재촬영/insert/audit)·최종 영상 렌더 산출물·`audit.py` "전부 통과" 여부.

## 완료 기준(엔진이 만족시켜야 함)
골든 회귀 전부 통과 · 실제 신규 영상 3개 연속 정상 · 자막 누락 0 · 명백한 오인식 0 · 자막 시작/종료가 발화와 자연스럽게 일치(tol 내) · 재촬영/중복 제거 정확 · 한 줄 자막 유지 · 썸네일/본문 제목 정상 · 최종 렌더 성공 · **기존 정상 결과 회귀 0**.

## GPT 검문 포인트(감사자)
증거 부족·추측 수정 차단 · 골든 회귀(특히 caption_lag·캡션 수·tol 0.06) 회귀 검문 · 컷 경계 remap 부작용 · 실제 영상 자막 텍스트/시각 품질 · diff 가 실제 싱크 문제를 검증하는지.

## 안전 경계
자동 허용: 코드/로그 읽기, 별도 worktree 수정, 로컬 영상 처리·테스트, diff. 사람 승인: main 병합·배포·secret·대량 삭제. (video-caption-bot 은 별도 repo — 그 main 병합/push 도 승인 필요.)
