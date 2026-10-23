# 리프트로그 — 작업 규칙

- 소스는 `src/app.html` 하나. HTML/CSS/JS 모두 이 파일 안에 있고, 외부 의존은 Google Fonts와 jsDelivr의 `@supabase/supabase-js` UMD(버전 고정)뿐.
- `src/app.html`은 `<!doctype>`/`<html>`/`<head>`/`<body>` 없는 프래그먼트다. `build.py`가 head·manifest·서비스워커 등록을 붙여 `dist/`를 만든다. **dist/는 직접 수정하지 않는다.**
- 수정 후 반드시 `python3 build.py` 를 실행하고, `node -e` 로 스크립트 문법을 확인한다.
- 저장 키는 `liftlog.v1`. 데이터 구조를 바꿀 때는 `normalize()` 에 마이그레이션을 추가하고 README의 데이터 구조 절을 갱신한다.
- 색은 전부 `:root` 토큰. 라이트/다크 두 블록 모두 갱신한다.
- 운동 ID: 기본 운동은 `exNNN`(시드 순서 고정, 바꾸지 말 것), 사용자 정의는 `cx…`.
- 타이머·토스트·액션바는 `position:fixed`이고 서로 겹치지 않도록 `body.has-actionbar`로 위치를 조정한다. 하단 고정 요소를 추가하면 이 규칙을 따른다.
- 동기화는 `cloud sync` 절의 `C`(메타)·`sync()`·`markLocalChanges()`가 담당. 로컬 저장은 `save()`(→ `persist()` + 변경 감지) 하나로 통일하고, 서버에서 받은 데이터를 적용할 때만 `persist()`를 직접 쓴다.
- 서버 스키마를 바꾸면 `supabase/schema.sql`과 README의 동기화 절을 같이 갱신한다. 키 체계(`settings`/`exercises`/`routines`/`w:<날짜>`)는 바꾸지 말 것.
- `supabase.json`은 배포 설정이라 커밋한다. `window.__liftlog`는 테스트용 디버그 핸들.
- 운동 사진은 `assets/ex/`(WebP) → 빌드 시 `dist/img/`. ID 기반(`img/<exId>.webp`)이라 데이터 모델에는 넣지 않는다. 원본 매핑은 `assets/ex/_source-map.json`.
- 운동 추가 시트 본문(`.sheet .body`)은 세로 flex라 자식에 `flex:none`이 필수. 빼면 스크롤 가능한 자식이 찌그러진다.
- 화면을 `innerHTML`로 다시 그릴 때는 스크롤을 보존한다: `render()`는 같은 탭이면 `window.scrollY`, `renderPicker()`/`renderRoutineEditor()`는 `.sheet .body`의 `scrollTop`을 복원. 피커의 선택 토글은 `updatePickerSelection()`으로 행만 갱신한다.
- 커밋 메시지는 한국어로 짧게.
- 세트 데이터는 `type`('' | warm | drop | fail)이 기준이고 `warm` 불리언은 `normSet()`/`setType()`이 `type==='warm'`과 맞춰 둔다. 세트를 복사할 때는 `copySet()`, 새로 만들 때는 `blankSets()`를 쓴다.
- 세트 입력칸(`.sets input`)은 `inputmode="none"`(설정 keypad 켜짐)이면 앱 키패드(`#keypad`, `keypad` 절)가 뜬다. 키패드는 `pointerdown`/`mousedown`을 `preventDefault`해 입력칸 포커스를 유지하고, 값은 `input` 이벤트를 다시 쏴서 바꾼다. 키패드가 열리면 `body.has-keypad`로 액션바·탭바·타이머를 숨기고 본문 하단 여백을 늘린다.
- 운동 카드 헤더(`.ex-head`)는 한 줄: 번호 · 썸네일 · `부위 | 이름` · 아이콘 버튼 최대 2개. 루틴 편집의 순서 변경·삭제는 ⋮ 메뉴(`re-menu`)로 둔다 (버튼 3개를 나란히 두면 제목이 줄바꿈된다).
