# 리프트로그 (LiftLog)

헬스 운동 기록용 개인 PWA. 기록은 브라우저(localStorage)에 먼저 저장되고, Supabase에 로그인하면 서버와 동기화되어 여러 기기에서 이어진다. 아이폰 Safari에서 "홈 화면에 추가"하면 전체화면 앱처럼 동작한다.

## 구성

```
gymlog/
├── src/app.html      ← 앱 소스 (HTML+CSS+JS 한 파일). 여기만 수정한다.
├── build.py          ← src → dist 빌드 (head/manifest/sw 삽입, supabase.json 주입)
├── supabase.json     ← Supabase URL/anon key (supabase.example.json 참고)
├── supabase/schema.sql ← 동기화 테이블·RLS·분석 뷰
├── assets/           ← 앱 아이콘 PNG
└── dist/             ← 호스팅에 올리는 완성본
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
| 13 | Supabase 클라우드 동기화 (오프라인 우선, 키 단위 last-write-wins) | 설정 |

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

## 클라우드 동기화 (Supabase)

### 설정 (한 번만)

1. [supabase.com](https://supabase.com)에서 프로젝트 생성 (Free 플랜이면 충분)
2. 대시보드 → **SQL Editor** → `supabase/schema.sql` 내용을 붙여넣고 Run
3. **Authentication → Providers → Email**: 켜져 있는지 확인. 가입 확인 메일이 귀찮으면 **Confirm email**을 끈다 (개인용이므로 무방)
4. **Project Settings → API**에서 `Project URL`과 `anon public` key를 복사해 저장소 루트에 `supabase.json` 생성:
   ```json
   { "url": "https://xxxx.supabase.co", "anon": "eyJ..." }
   ```
   anon key는 RLS를 전제로 한 공개 키라 저장소에 커밋해도 된다. (키를 노출하고 싶지 않으면 `.gitignore`에 넣고 앱의 설정 화면에서 직접 입력해도 된다.)
5. 커밋·push → 배포된 앱의 **설정 → 클라우드 동기화**에서 이메일/비밀번호로 회원가입 후 로그인

### 동작 방식

- 로컬(localStorage)이 1차 저장소. 네트워크가 없어도 앱은 그대로 동작하고, 연결되면 밀어 올린다.
- 서버 테이블 `liftlog_kv`에 키 단위로 저장: `settings`, `exercises`, `routines`, `w:<날짜>`. 날짜별 기록이 독립된 행이라 두 기기에서 다른 날을 고쳐도 그대로 합쳐진다.
- 같은 키를 양쪽에서 고치면 `updated_at`이 늦은 쪽이 이긴다 (last-write-wins). 삭제는 `deleted=true` 행으로 전파된다.
- 동기화 시점: 앱 시작, 저장 후 2초, 앱을 다시 앞으로 가져올 때(30초 간격), 온라인 복귀, 설정의 "지금 동기화".
- 처음 로그인하는 기기에서는 서버 기록이 우선 적용되고, 그 기기에만 있던 키는 서버로 올라간다.
- `liftlog_sets` 뷰로 SQL에서 세트 단위 분석을 할 수 있다 (`select * from liftlog_sets where exercise_name = '랫풀다운' order by workout_date`).

## 배포 (GitHub Pages)

### 방법 A — GitHub Actions (권장: push만 하면 자동 빌드·배포)

1. `deploy/pages.yml` 을 `.github/workflows/pages.yml` 로 옮긴다
   ```bash
   mkdir -p .github/workflows && git mv deploy/pages.yml .github/workflows/pages.yml
   ```
2. GitHub에 저장소(예: `liftlog`)를 만들고 push
3. 저장소 Settings → Pages → Source: **GitHub Actions**
4. 1~2분 뒤 `https://<계정>.github.io/liftlog/` 접속
5. 아이폰 Safari에서 열고 공유 버튼 → **홈 화면에 추가**

이후에는 `src/app.html`만 고치고 push하면 Actions가 `build.py`를 돌려 배포한다. `dist/`는 로컬 확인용이므로 커밋하지 않아도 된다.

### 방법 B — 브랜치 폴더 지정 (Actions 없이)

Settings → Pages → Source: `Deploy from a branch`, Branch: `main`, Folder: `/dist`. 이 경우 수정할 때마다 `python3 build.py` 후 `dist/`를 커밋해야 한다.

어떤 정적 호스팅(Cloudflare Pages, Netlify, Vercel)이든 `dist/`만 올리면 동작한다.

## 로컬 확인

```bash
python3 build.py
python3 -m http.server 8000 --directory dist
# → http://localhost:8000  (같은 Wi-Fi의 아이폰에서는 http://<맥 IP>:8000)
```

`file://`로 직접 열면 서비스워커만 등록되지 않을 뿐 앱 자체는 동작한다.

## 주의

- 홈 화면 앱과 Safari 탭은 저장소가 분리된다. 로그인하지 않았다면 설치 후에는 홈 화면 앱만 쓸 것. 로그인했다면 둘 다 서버와 맞춰진다.
- 동기화를 쓰지 않는다면 기기 변경·브라우저 데이터 삭제 전에 설정 → 내보내기로 백업.
- "모든 기록 삭제"는 로그인 상태면 서버 기록도 지운다.
- iOS에서 홈 화면 앱은 오디오 자동재생이 막혀 있어, 타이머 알림음은 화면을 한 번 터치한 뒤부터 울린다.
