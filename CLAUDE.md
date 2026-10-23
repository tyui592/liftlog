# 리프트로그 — 작업 규칙

- 소스는 `src/app.html` 하나. HTML/CSS/JS 모두 이 파일 안에 있고, 외부 라이브러리 없음(폰트만 Google Fonts).
- `src/app.html`은 `<!doctype>`/`<html>`/`<head>`/`<body>` 없는 프래그먼트다. `build.py`가 head·manifest·서비스워커 등록을 붙여 `dist/`를 만든다. **dist/는 직접 수정하지 않는다.**
- 수정 후 반드시 `python3 build.py` 를 실행하고, `node -e` 로 스크립트 문법을 확인한다.
- 저장 키는 `liftlog.v1`. 데이터 구조를 바꿀 때는 `normalize()` 에 마이그레이션을 추가하고 README의 데이터 구조 절을 갱신한다.
- 색은 전부 `:root` 토큰. 라이트/다크 두 블록 모두 갱신한다.
- 운동 ID: 기본 운동은 `exNNN`(시드 순서 고정, 바꾸지 말 것), 사용자 정의는 `cx…`.
- 타이머·토스트·액션바는 `position:fixed`이고 서로 겹치지 않도록 `body.has-actionbar`로 위치를 조정한다. 하단 고정 요소를 추가하면 이 규칙을 따른다.
- 커밋 메시지는 한국어로 짧게.
