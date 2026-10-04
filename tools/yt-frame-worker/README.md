# 쇼츠 썸네일 장면 선택 워커 (이 PC 전용)

쇼츠는 Data API 썸네일 업로드(`thumbnails.set`)가 HTTP 200 이어도 표시되지 않는다(2026-10-03 실측).
유튜브 앱의 **장면 선택**만 반영되므로, 자동배포가 끝나면 이 PC 의 에뮬레이터에서 첫 장면(0초)을 골라 저장한다.

## 흐름

1. 서버: 배포 핸들러가 유튜브 업로드 성공 직후 `yt_frame_tasks` 에 작업 1건 등록(영상 ID 당 1건 — 중복 없음).
2. 워커: `GET /api/yt-frame/next?wait=50` 롱폴링. 서버는 넘길 일이 생기기 전에는 DB 를 조회하지 않는다.
3. 서버: 넘기기 직전 유튜브 처리 상태 확인 — 처리 중이면 2분 뒤로 보류, 처리 실패·영상 없음이면 종결+텔레그램.
4. 워커: 에뮬레이터·Appium 이 꺼져 있으면 켠다(기본 화면 없이) → 영상 ID 딥링크 → **대상 확인** → 편집 → 썸네일 0초 → Done → Save.
5. 워커: `saved` 보고(저장 성공) → 실제 썸네일 확인 → `verified` 보고(match / mismatch / uncertain / unverifiable_non_public).
6. 마지막 작업 후 5분간 일이 없으면, 워커가 켠 에뮬레이터·Appium 만 끈다(사람이 켜 둔 것은 건드리지 않음).

## 대상 확인 (하나라도 실패하면 저장하지 않고 빠져나옴)

- 영상 ID 딥링크로 연다.
- 공유 → 링크 복사 → 클립보드의 ID == 요청 ID.
- 편집 화면 제목 입력칸 == 유튜브 API 가 돌려준 그 영상의 제목(공백만 무시).
- 메뉴에 `Delete` 가 같이 있으므로 글자가 정확히 `Edit` 인 항목 1개만 누른다.

## 반영 확인(공개·일부공개만 가능)

`hqdefault.jpg`(현재 썸네일) 가운데 세로 띠를 `frame0.jpg`(영상 첫 프레임)·`hq1~3.jpg`(유튜브 자동 후보 = 본편 장면)와 비교.

- 띠 폭은 frame0 의 실제 비율로 계산(9:16 이 아닌 영상 있음), 작은 위치·크기 어긋남은 정렬 탐색으로 흡수, 색 포함 비교.
- 판정(`thumbCompare.mjs` 의 `T`):
  - 첫 프레임 차이 ≥ 40 → **mismatch**
  - 첫 프레임과 자동 후보가 12 미만으로 비슷(정지 화면 등) → **uncertain**(증명 불가)
  - 첫 프레임 차이 ≤ 12, 자동 후보 차이 > 4 이고 ≥ 첫 프레임 차이×2 → **match**
  - 자동 후보와 같음(≤ 4) → **mismatch**(자동 프레임 그대로)
  - 그 밖 → **uncertain**
- **uncertain 은 성공이 아니다** → 상태 `needs_review`(확인 필요) + 텔레그램.
- 비공개: 공개 썸네일 주소가 404 → `unverifiable_non_public`.
- **일반 시청자의 쇼츠 목록(선반) 표시는 미검증.**

### 보정 근거 (2026-10-03, 읽기 전용)

공개 쇼츠 183개(우리 채널 143 + 다른 채널 40: 어두운 수중·야경·눈·요리·글자 퀴즈·노을·슬라임 등) 측정.
판정 결과 match 64 / mismatch 56 / uncertain 63.

- 경계에 가까운 61건을 비교판으로 육안 확인: match 45건 전부 실제 첫 장면, mismatch 8건 전부 실제로 다른 장면,
  uncertain 8건은 애매하거나(정지 화면·첫 장면 위 글자) 보수적으로 남긴 실제 일치.
- match 의 최대 첫 프레임 차이 12, 자동 후보와의 최소 여유 배수 2.83, 첫 장면↔자동 후보 최소 12.2.
- 실제로는 첫 장면인데 차이가 커서 uncertain 으로 남는 경우가 있다(예: 16.6). 보수적으로 둔 것.
- 대표 사례는 `tests/youtube/ytFrameWorker.test.ts` 에 고정.

## 설정

`C:\Users\iimoo\android-test\yt-frame-worker.env` (레포 밖, 토큰은 화면·로그에 안 찍힘):

```
YT_FRAME_SERVER=https://<운영 주소>
YT_FRAME_WORKER_TOKEN=<서버 Railway 환경변수와 같은 값, 32자 이상>
```

## 실행 폴더·버전 (개발 작업트리를 직접 실행하지 않음)

`C:\Users\iimoo\android-test\yt-frame-worker\`
- `releases\<버전>\` — 워커 파일 + `MANIFEST.json`(파일 sha256, node·webdriverio·appium·uiautomator2·ffmpeg 버전) + `node_modules`(webdriverio 고정)
- `current.txt` 사용 중 버전 / `history.log` 전환 기록 / `run-worker.cmd`·`start-hidden.vbs` 감독 루프

```bash
node tools/yt-frame-worker/release.mjs build             # 워커 시험 통과 후 새 버전 폴더 생성(아직 사용 안 함)
node tools/yt-frame-worker/release.mjs activate <버전>    # 전환(감독 루프 재시작 → 즉시 새 버전)
node tools/yt-frame-worker/release.mjs rollback          # 직전 버전으로
node tools/yt-frame-worker/release.mjs status            # 현재 버전·무결성·실행 중 워커 위치
node tools/yt-frame-worker/release.mjs install-task      # 감독 스크립트를 실행 폴더에 두고 작업 스케줄러 등록
```

- 워커는 시작할 때 MANIFEST 와 파일 해시를 대조한다. 다르면 실행하지 않는다(종료코드 4 → 10분마다 재확인).
- `node releases\<버전>\worker.mjs --version` 으로 버전·무결성 확인.
- 레포의 tools/yt-frame-worker 를 고쳐도 실행 중 워커는 바뀌지 않는다 — build → activate 해야 반영.

## 자동 시작

- 작업 스케줄러 `KOP 쇼츠 썸네일 워커`: 윈도우 로그인 시 실행 폴더의 `start-hidden.vbs` → `run-worker.cmd`(창 없음, 관리자 권한 불필요).
  해제: `powershell -ExecutionPolicy Bypass -File tools\yt-frame-worker\install-autostart.ps1 -Remove`
- 감독 루프는 매번 `current.txt` 를 읽어 그 버전의 `worker.mjs` 를 실행한다.
  워커가 죽으면 30초 뒤 재시작, 설정 없음(2)·무결성 실패(4)는 10분마다 재확인, 다른 워커가 이미 있으면(3) 종료.
- 네트워크가 끊기면 5초→최대 2분 간격으로 다시 연결. 대기 작업은 서버 DB 에 있으므로 재연결·재부팅 뒤 이어서 처리.
- 작업 중 죽으면 서버가 리스(15분) 만료 후 다시 넘긴다. 워커가 켠 에뮬레이터·Appium 은 다음 실행이 넘겨받아 끈다.
- 잠금 파일의 PID 를 재부팅 뒤 다른 프로그램이 쓰고 있어도, 실제 워커일 때만 "실행 중"으로 본다.
- 로그: `android-test\dl\yt-frame-worker\` (worker.log, supervisor.log, 작업별 화면 캡처 폴더).
- **실제 PC 재시작으로는 아직 시험하지 않았다**(로그인 시 실행 + 서버 DB 대기열 구조로 이어 처리하도록 설계).

수동 실행(개발용): `node tools/yt-frame-worker/worker.mjs [--once] [--dry]`.

## 앱 화면 회복 동작

- 딥링크 뒤 20초 안에 쇼츠 화면이 안 보이면 딥링크 재전송(최대 3번) — 에뮬레이터를 막 켠 직후 홈 화면에 떨어진 사례. (재전송 자체는 아직 실제로 일어난 적 없음)
- More actions 가 안 보이면 화면 탭(최대 3번) → 그래도 없으면 앱을 다시 열고 **ID 확인부터 다시**(편집 진입 전이라 안전).
- 별도 시험: `node tools/yt-frame-worker/test-reveal.mjs <비공개영상ID> --flow "<제목>"` — 버튼을 일부러 숨겨(Clear Screen) 회복 경로 확인, 저장 안 함.
  결과(2026-10-04): 화면 탭으로는 안 돌아오고, 앱 재시작·ID 재확인으로 회복해 장면 선택기까지 도달.

## 주의

- 구글 로그인은 사람이 에뮬레이터에서 직접 한다(워커는 비밀번호를 다루지 않음). 창을 보려면 `YT_FRAME_EMULATOR_WINDOW=1`.
