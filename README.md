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
│   └── ex/           ← 운동 사진 (exNNN.webp 썸네일, exNNN-0/1.webp 시작·끝 자세). 출처 free-exercise-db, Unlicense
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
| 1 | 운동 라이브러리 (부위별 120개 기본 운동, 초성/한글 검색, 북마크, 최근 운동순 정렬) | 운동 추가 → 직접 추가 |
| 2 | 사용자 정의 운동 추가/수정/삭제 (무게×횟수 / 횟수만(맨몸) / 시간(분) 선택) | 직접 추가의 `+` / 설정 |
| 3 | 세트 추가/삭제, 세트별 완료 체크, 세트 옵션 시트(세트 번호 탭): 세트 타입(일반/`W`웜업/`D`드롭/`F`실패), RPE, 운동 강도(세트·종목 추정 1RM 대비 %), 바벨 원판 계산 | 오늘 / 루틴 편집 |
| 4 | 완료된 본세트 기준 종목 볼륨 / 전체 볼륨 자동 계산 | 오늘 |
| 5 | 날짜별 저장, 홈 캘린더(월간 그리드 ⇄ 주간 스트립 전환, 완료/미완료 상태 바, 이 달·이 주 운동 일수와 볼륨), `오늘로` 빠른 복귀 | 오늘 |
| 6 | 루틴 만들기/편집/복제/삭제, 오늘 운동을 루틴으로 저장 | 루틴 / 오늘 ⋮ 메뉴 |
| 7 | 운동 추가 시 마지막 기록 자동 채우기 + 지난 세션 요약 & 신기록(`PR`) 배지 표시 | 오늘 |
| 8 | 전체 운동 시간: 시작·일시정지·계속하기·완료, 날짜별 시간 저장·직접 수정, 운동 중 화면 꺼짐 방지(Wake Lock) | 오늘 / 설정 |
| 9 | 종목별 메모 | 오늘 |
| 10 | 운동 순서 변경, 삭제, 다른 운동으로 교체 | 종목 ⋮ 메뉴 |
| 11 | 분석: 종목별 최고 무게·추정 1RM(Epley) 추이(맨몸 운동은 최다 횟수·총 횟수 추이), 주간 볼륨 8주, 부위별 빈도 4주 | 분석 |
| 12 | JSON 내보내기/가져오기 | 설정 |
| 13 | Supabase 클라우드 동기화 (오프라인 우선, 키 단위 last-write-wins, 초기 로그인 시 로컬 커스텀 항목 병합) | 설정 |
| 14 | 운동 아이콘: 목록·카드에 동작·기구 SVG 픽토그램, 탭하면 확대 아이콘과 기록 방식 확인. 기존 운동 57개는 시작/끝 자세 사진도 제공 (아이콘은 오프라인 즉시 표시) | 운동 추가 / 오늘 |
| 15 | 세트 입력 키패드: 시스템 키보드 대신 앱 키패드(±2.5/±5kg, ±1/±5회, 위 세트 값 복사, 이전/다음). 설정에서 끄면 기기 키보드 사용 | 오늘 / 루틴 편집 |
| 16 | 종목별 `지난 기록 불러오기` 버튼 (루틴 값으로 채워진 세트를 마지막 기록으로 교체) | 오늘 |
| 17 | 하루 요약 카드: 운동 시간(진행 중이면 경과 시간)·운동 개수·전체 볼륨·본세트 완료 타일, PR 개수, 하루 후기 메모. 운동을 완료한 날은 카드를 접고 `수행 운동 정보`(종목별 세트·볼륨·완료 여부) 읽기 전용 목록으로 보여줌 — `다시 열기`로 편집 | 오늘 |
| 18 | 기록 없는 날의 빠른 시작: `루틴 불러오기` / `지난 운동 불러오기` 바로가기 | 오늘 |

기록 방식(`mode`)은 세 가지이고 모든 화면·계산이 같은 기준을 따른다. **무게 × 횟수**(`weight`): kg·회 입력, 볼륨(kg×회)·추정 1RM·강도·원판·PR(무게) 계산 — 가중 풀업·딥스처럼 무게를 다는 맨몸운동도 여기. **횟수 기준**(`reps`): 회만 입력(kg 칸 없음, 데이터에 kg 가 남아 있어도 무시), 볼륨 없음, 카드에는 완료 횟수, PR·추이는 횟수 기준. **시간 기준**(`time`): `분` / `강도·거리` 열로 기록(세트의 kg 자리에 분, reps 자리에 강도·거리), 볼륨·1RM·PR·추이에서 제외. 무게 운동이 없는 날은 볼륨을 `–`로 보여준다. 사용자 정의 운동은 카드 ⋮ 메뉴나 설정에서 부위·기록 방식을 수정할 수 있고 기존 기록에 바로 반영된다. 웜업 세트(`W`)는 기록으로 남지만 본세트 볼륨 및 1RM·PR 통계에서는 제외된다. 드롭(`D`)·실패(`F`) 세트는 표시만 다르고 본세트로 계산된다.

## 전체 운동 시간

- 운동이나 루틴을 추가한 뒤 **운동 시작**을 누르면 측정한다. 목록만 미리 준비해 두는 동안에는 시간이 흐르지 않는다.
- 일반적인 세트 사이 휴식도 전체 운동 시간에 포함된다. **일시정지** 중인 시간은 제외하고 **계속하기**로 이어서 측정한다.
- **운동 완료** 시 총 시간을 저장한다. 완료한 기록을 다시 열어도 시간이 자동으로 늘지 않고, **계속하기**를 눌러야 다시 측정한다.
- 측정 중 앱을 닫거나 화면을 꺼도 실제 경과 시간을 계산한다. 다른 날짜에 진행 중인 운동이 있으면 돌아가기 버튼을 보여준다.
- **직접 입력 / 시간 수정**으로 지난 운동 시간이나 잘못 측정한 시간을 분·초 단위로 수정할 수 있다. 측정하지 않은 기록은 `미기록`으로 표시한다.
- `startedAt`은 최초 시작 시각, `finishedAt`은 완료 처리 시각이다. `durationMs`는 측정을 마친 구간의 누적 밀리초이며, `null`은 미기록, `0`은 측정된 0초다. `resumedAt`이 있으면 현재 측정 중인 구간의 시작 시각이며, 현재 총 시간은 `durationMs + (현재 시각 - resumedAt)`이다.
- 기존 완료 기록은 시작 시각이 해당 운동 날짜에 속하고 종료 시각이 유효한 경우 두 시각의 차이를 옮긴다. 예전 버전에서는 운동 추가 시각부터 측정했으므로 필요하면 직접 수정한다. 기존 미완료 기록은 준비 시간을 운동 시간으로 잘못 계산하지 않도록 `미기록`으로 전환한다.
- 예전 휴식 설정(`restSec`, `autoTimer`, `sound`, `vibrate`)은 불러오기·가져오기·동기화 후 정규화 과정에서 제거한다. 운동·세트 기록은 유지한다. 시간 필드는 기존 날짜별 JSON에 함께 저장되어 서버 테이블 변경 없이 동기화·백업된다.

검증: `python3 build.py` 및 `node --test tests/workout-duration.test.cjs`

## 운동 목록과 아이콘

기본 운동은 120개(하체 27, 가슴 17, 등 19, 어깨 14, 팔 18, 복근 15, 유산소 10)다. [ACE Exercise Library](https://www.acefitness.org/resources/everyone/exercise-library/)와 [Muscle & Strength 운동 라이브러리](https://www.muscleandstrength.com/exercises/all.html)를 참고해 바벨·덤벨·스미스·머신·케이블·맨몸 운동을 확장했다. 기존 `ex000`~`ex056`은 순서·이름·기록 방식을 유지하고, 새 운동 63개를 `ex057`~`ex119`에 추가했다. `normalize()`가 기존 저장·가져오기·동기화 데이터에 없는 기본 운동만 합치므로 기록·루틴·북마크는 유지된다. 신규 친업·맨몸 스쿼트·어시스트 풀업 등은 `reps`(보조 무게는 메모에 기록), 사이드 플랭크·야외 달리기·줄넘기는 `time`으로 기록한다. 기존 가중 풀업·딥스의 방식은 변경하지 않는다.

작은 사진 썸네일 대신 `src/app.html`의 자체 제작 SVG 픽토그램을 쓴다. `SEED`의 네 번째 값은 소스 전용 아이콘 키이고, 고정 운동 ID로 조회하므로 사용자 저장 데이터나 서버 스키마에는 이미지 필드를 추가하지 않는다. 사람은 `--fg`, 기구는 `--accent`, 지지대는 `--muted` 토큰을 사용해 라이트·다크 모드를 따른다. 목록(52px)·카드(40px)·루틴 미리보기(32px)에서 같은 아이콘을 쓰며 외부 요청 없이 오프라인에서도 표시된다. 사용자 정의 운동은 부위별 대표 아이콘으로 표시한다. 아이콘을 누르거나 키보드로 포커스한 뒤 Enter/Space를 누르면 확대 아이콘과 기록 방식을 확인할 수 있다. 아이콘은 동작 식별용으로 단순화한 그림이다.

검증: `python3 build.py` 및 `node --test tests/*.test.cjs` (기존 기록 보존·자동 병합·아이콘과 상세 사진 경로 포함).

### 자세 참고 사진

기존 기본 운동 57개의 상세 보기에는 [free-exercise-db](https://github.com/yuhonas/free-exercise-db)(Unlicense, 퍼블릭 도메인) 사진도 남겨 둔다. `assets/ex/_source-map.json`은 운동 ID → 원본 슬러그 매핑이다. 시작·끝 자세 두 프레임(440px WebP)은 `assets/ex/`에서 빌드 시 `dist/img/`로 복사된다. 신규 운동과 사용자 정의 운동은 확대 아이콘과 기록 방식을 보여주며, 존재하지 않는 사진을 요청하지 않는다.

## 데이터 구조 (localStorage key `liftlog.v1`)

```jsonc
{
  "version": 1,
  "exercises": [{ "id": "ex019", "part": "등", "name": "랫풀다운", "mode": "weight|reps|time", "custom": false, "bookmark": true }],
  "routines":  [{ "id": "...", "name": "등·이두", "createdAt": 0, "lastUsed": "2026-10-22",
                  "items": [{ "exId": "ex019", "sets": [{ "kg": 45, "reps": 10, "warm": false, "type": "" }] }] }],
  "workouts":  { "2026-10-23": { "date": "2026-10-23", "startedAt": null, "finishedAt": null, "durationMs": null, "resumedAt": null, "note": "하루 후기 (없으면 키 없음)",
                  "items": [{ "id": "...", "exId": "ex019", "memo": "",
                              "sets": [{ "kg": "45", "reps": "10", "done": true, "warm": false, "type": "", "rpe": 8.5 }] }] } },
  "settings":  { "wakeLock": true, "routineFill": "last|routine",
                 "keypad": true, "barKg": 20, "calView": "month|week" }
}
```

세트 `type` 은 `""`(일반) / `warm` / `drop` / `fail`. `warm` 불리언은 `type === "warm"` 과 항상 같게 유지한다 (예전 데이터·SQL 뷰 `liftlog_sets.warmup` 호환). `rpe` 는 6~10(0.5 단위) 또는 없음. `keypad` 는 앱 키패드 사용 여부, `barKg` 는 원판 계산용 봉 무게, `calView` 는 홈 캘린더 표시(월간/주간). `note` 는 하루 후기이고 비어 있으면 키를 지운다. 캘린더의 "완료"는 `finishedAt` 이 있거나 모든 세트가 완료된 날, "미완료"는 기록은 있지만 그렇지 않은 날. 측정하지 않은 운동 시간은 `미기록`으로 표시한다.

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
6. **(권장)** 본인 계정 가입을 마친 뒤에는 Supabase 대시보드 → **Authentication → User Signups → Allow new users to sign up**을 꺼두면 공개 저장소에서도 제3자의 임의 가입·쿼터 소진을 막을 수 있다.

### 동작 방식

- 로컬(localStorage)이 1차 저장소. 네트워크가 없어도 앱은 그대로 동작하고, 연결되면 밀어 올린다.
- 서버 테이블 `liftlog_kv`에 키 단위로 저장: `settings`, `exercises`, `routines`, `w:<날짜>`. 날짜별 기록이 독립된 행이라 두 기기에서 다른 날을 고쳐도 그대로 합쳐진다.
- 같은 키를 양쪽에서 고치면 `updated_at`이 늦은 쪽이 이긴다 (last-write-wins). 삭제는 `deleted=true` 행으로 전파된다.
- 동기화 시점: 앱 시작, 저장 후 2초, 앱을 다시 앞으로 가져올 때(30초 간격), 온라인 복귀, 설정의 "지금 동기화". 동기화 도중 발생한 추가 변경은 대기열에 두었다가 직후 자동 재동기화한다.
- 처음 로그인하는 기기에서는 서버 기록이 우선 적용되되, 로컬에만 있던 사용자 정의 운동·북마크·루틴과 날짜 기록은 유실 없이 병합되어 서버로 올라간다.
- `liftlog_sets` 뷰로 SQL에서 세트 단위 분석을 할 수 있다 (`select * from liftlog_sets where exercise_name = '랫풀다운' and not warmup order by workout_date`).

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

### Playwright 브라우저 검증

`tests/browser-smoke.cjs`는 임시 로컬 서버와 새 브라우저 컨텍스트로 Chromium·WebKit에서 모바일 라이트/다크 화면 및 기존 데이터 이관·오프라인 재실행(총 6개 시나리오)을 검증한다. 운동 검색·부위 필터·선택 스크롤 보존·아이콘/사진 상세 보기·키보드 접근·세 기록 방식·앱 키패드·저장 후 새로고침·운동 시간·완료/재개·화면 넘침·브라우저 오류를 확인한다. 실제 사용자 프로필을 사용하지 않고 클라우드 설정과 외부 폰트/SDK 요청을 테스트 환경에서 차단하므로 서버 동기화와 실제 기기 Safari 검증은 포함하지 않는다.

앱의 런타임 의존성을 늘리지 않도록 테스트 도구와 브라우저는 임시 폴더에 설치한다:

```bash
npm install --prefix /tmp/liftlog-playwright @playwright/test@1.64.1
PLAYWRIGHT_BROWSERS_PATH=/tmp/liftlog-playwright-browsers /tmp/liftlog-playwright/node_modules/.bin/playwright install chromium webkit
python3 build.py
NODE_PATH=/tmp/liftlog-playwright/node_modules PLAYWRIGHT_BROWSERS_PATH=/tmp/liftlog-playwright-browsers node tests/browser-smoke.cjs
```

스크린샷과 `results.json`은 출력된 임시 경로에 저장된다. `LIFTLOG_BROWSER_OUTPUT` 환경 변수로 저장 위치를 지정할 수 있다.


## 주의

- 홈 화면 앱과 Safari 탭은 저장소가 분리된다. 로그인하지 않았다면 설치 후에는 홈 화면 앱만 쓸 것. 로그인했다면 둘 다 서버와 맞춰진다.
- 동기화를 쓰지 않는다면 기기 변경·브라우저 데이터 삭제 전에 설정 → 내보내기로 백업.
- "모든 기록 삭제"는 로그인 상태면 서버 기록도 지운다.
