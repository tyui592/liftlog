# 리프트로그 (LiftLog)

헬스 운동 기록용 개인 PWA. 서버 없이 브라우저(localStorage)에만 저장되며, 아이폰 Safari에서 "홈 화면에 추가"하면 전체화면 앱처럼 동작한다.

## 구성

```
Liftlog/
├── src/app.html      ← 앱 소스 (HTML+CSS+JS 한 파일). 여기만 수정한다.
├── build.py          ← src → dist 빌드 (head/manifest/sw 삽입)
├── assets/           ← 앱 아이콘 PNG
├── .github/workflows/pages.yml ← push 시 GitHub Pages 자동 배포
└── dist/             ← 빌드 결과 (git 제외, 로컬 확인용)
    ├── index.html
    ├── manifest.webmanifest
    ├── sw.js         ← 오프라인 캐시 (네트워크 우선, 실패 시 캐시)
    ├── icon-180.png
    └── icon-512.png
```

빌드: `python3 build.py`

## 기능

| # | 기능 | 위치 |
|---|------|------|
| 1 | 운동 라이브러리 (부위별 58개 기본 운동, 검색, 북마크, 최근 운동순 정렬) | 운동 추가 → 직접 추가 |
| 2 | 사용자 정의 운동 추가/삭제 | 직접 추가의 `+` / 설정 |
| 3 | 세트 추가/삭제, 세트별 완료 체크 (빈 세트는 이전 세트 값으로 자동 채움) | 오늘 |
| 4 | 종목 볼륨 / 전체 볼륨 자동 계산 | 오늘 |
| 5 | 날짜별 저장, 주간 캘린더(운동일 점 표시), 과거 날짜 조회·수정 | 오늘 |
| 6 | 루틴 만들기/편집/복제/삭제, 오늘 운동을 루틴으로 저장 | 루틴 / 오늘 ⋮ 메뉴 |
| 7 | 운동 추가 시 마지막 기록(무게·횟수·휴식) 자동 채우기 | 자동 |
| 8 | 휴식 타이머: 세트 완료 시 자동 시작, 종목별 휴식 시간, 알림음·진동 | 오늘 / 설정 |
| 9 | 종목별 메모 | 오늘 |
| 10 | 운동 순서 변경, 삭제, 다른 운동으로 교체 | 종목 ⋮ 메뉴 |
| 11 | 분석: 종목별 최고 무게·추정 1RM(Epley) 추이, 주간 볼륨 8주, 부위별 빈도 4주 | 분석 |
| 12 | JSON 내보내기/가져오기 | 설정 |

유산소·플랭크 같은 시간 기준 운동은 `분` / `강도·거리` 열로 기록되고 볼륨 계산에서 제외된다.

## 데이터 구조 (localStorage key `liftlog.v1`)

```jsonc
{
  "version": 1,
  "exercises": [{ "id": "ex019", "part": "등", "name": "랫풀다운", "mode": "weight|time", "custom": false, "bookmark": true }],
  "routines":  [{ "id": "...", "name": "등·이두", "createdAt": 0, "lastUsed": "2026-10-22",
                  "items": [{ "exId": "ex019", "sets": [{ "kg": 45, "reps": 10 }] }] }],
  "workouts":  { "2026-10-23": { "date": "2026-10-23", "startedAt": 0, "finishedAt": null,
                  "items": [{ "id": "...", "exId": "ex019", "restSec": null, "memo": "",
                              "sets": [{ "kg": "45", "reps": "10", "done": true }] }] } },
  "settings":  { "restSec": 90, "autoTimer": true, "sound": true, "vibrate": true, "routineFill": "last|routine" }
}
```

`restSec: null` 은 설정의 기본값 사용, `0` 은 OFF.

## 배포 (GitHub Pages)

### 방법 A — GitHub Actions (기본: push만 하면 자동 빌드·배포)

1. GitHub에 빈 저장소(예: `liftlog`)를 만든다
2. ```bash
   git remote add origin git@github.com:<계정>/liftlog.git
   git push -u origin main
   ```
3. 저장소 Settings → Pages → Source: **GitHub Actions**
4. 1~2분 뒤 `https://<계정>.github.io/liftlog/` 접속
5. 아이폰 Safari에서 열고 공유 버튼 → **홈 화면에 추가**

이후에는 `src/app.html`만 고치고 push하면 `.github/workflows/pages.yml`이 `build.py`를 돌려 배포한다. `dist/`는 `.gitignore`에 들어 있다.

### 방법 B — 브랜치 폴더 지정 (Actions 없이)

`.gitignore`에서 `dist/` 줄을 지우고 커밋한 뒤, Settings → Pages → Source: `Deploy from a branch`, Branch: `main`, Folder: `/dist`. 수정할 때마다 `python3 build.py` 후 `dist/`를 커밋해야 한다.

어떤 정적 호스팅(Cloudflare Pages, Netlify, Vercel)이든 `dist/`만 올리면 동작한다.

## 로컬 확인

```bash
python3 build.py
python3 -m http.server 8000 --directory dist
# → http://localhost:8000  (같은 Wi-Fi의 아이폰에서는 http://<맥 IP>:8000)
```

`file://`로 직접 열면 서비스워커만 등록되지 않을 뿐 앱 자체는 동작한다.

## 주의

- 기록은 그 브라우저 안에만 있다. 홈 화면 앱과 Safari 탭은 저장소가 분리되므로, 설치 후에는 홈 화면 앱만 쓸 것.
- 기기 변경·브라우저 데이터 삭제 전에 설정 → 내보내기로 백업.
- iOS에서 홈 화면 앱은 오디오 자동재생이 막혀 있어, 타이머 알림음은 화면을 한 번 터치한 뒤부터 울린다.
