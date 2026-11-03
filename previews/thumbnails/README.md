# 운동 썸네일 비교

`index.html`을 브라우저로 열면 현재/후보 6종을 세 크기와 두 테마로 비교할 수 있습니다. 전체 앱에는 적용하지 않았습니다. 일반 바벨 컬은 정확한 자료가 없어 미대응이며 EZ바 컬은 별도 참고입니다.

원본: Workout Guide commit `aac599224bb9780305239607ef98540b7e0ce389`. 내려받은 SVG 파일은 수정하지 않았습니다. 비교 HTML은 CSS로 색과 크기를 바꾸며 형상은 보존합니다. 프레임별 기여자와 출처는 source-manifest.json, 상위 고지는 ATTRIBUTION.md 및 LICENSES.md에 있습니다. 그림과 그 변형은 CC BY-SA 4.0입니다. 기존 Liftlog 아이콘은 src/app.html에서 추출한 비교용 복사본입니다.

## 검증 및 한계

Chromium과 WebKit에서 SVG48개가 비어 있지 않음을 확인했고, 320·390·1180px 화면에서 가로 넘침이 없었습니다. 스크린샷은 `/tmp/liftlog-thumbnails-chromium.png`, `/tmp/liftlog-thumbnails-webkit.png`입니다. 원본의 한 자세가 viewBox 위로 0.5단위 벗어나는 점은 원본 그대로 유지했습니다.

시각 검토 결과: frame2는 다른 프레임보다 굵고 스타일 차이가 있습니다. 벤치 프레스 그림은 벤치가 생략되어 자세 인지가 애매하며, 32px에서는 인체 내부 디테일이 복잡해질 수 있습니다. 따라서 이 비교본은 자료의 전면 채택이 아니라 시각적 후보 검토용입니다. 일반 바벨 컬은 자료에 없으므로 잘못 연결하지 않았습니다.
