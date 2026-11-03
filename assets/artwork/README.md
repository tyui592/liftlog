# 운동 일러스트 자산

기본120종 중112종 일러스트,8종 부위·기구 대체 타일입니다. Everkinetic65종, Workout Guide47종(중복 공유 포함111개 고유 SVG)입니다. `manifest.json`은 운동 ID별 실제 대응, 원본 URL, 원본 메타데이터, 자세 변형·한계, 측정된 SVG 경계를 보존합니다. 운동 기록과 서버 데이터에는 이 메타데이터를 넣지 않습니다.

원본 SVG는 `original/`에 수정 없이 보관합니다. Everkinetic commit446bb9a3d0c3beb6b84f7c9d77dfc8af707a2ab6, Workout Guide commitaac599224bb9780305239607ef98540b7e0ce389. 저작자·조건은 동봉한 LICENSE-EVERKINETIC.md, LICENSE-WORKOUT-GUIDE.md, ATTRIBUTION-WORKOUT-GUIDE.md를 참조합니다. 그림 및 변경본은 CC BY-SA4.0이며 앱 전체 코드의 라이선스를 뜻하지 않습니다.

`python3 scripts/build_artwork.py`는 네트워크 없이 원본과 대응표에서 src/app.html의 GENERATED ARTWORK 블록을 재생성합니다. 원본 흰 배경 그룹을 제거하고, 실제 형상의 측정 경계를64px 캔버스의 중앙54px 영역에 맞춰 정규화합니다. 표시 때 테마 전경색과 Everkinetic 썸네일의 비확대0.45px 윤곽선을 적용합니다. 자세·기구 경로는 수정하지 않습니다. 새 원본을 추가할 때는 브라우저 SVG getBBox로 bounds=[x,y,width,height]를 측정하여 대응표에 기록하고 실제 기구·자세를 시각 확인해야 합니다.

소스 앱 자체에 SVG가 들어 있어 외부 요청이나 이미지 파일 요청 없이 오프라인 동작합니다. build.py는 대응표·라이선스·출처 고지를dist/artwork/에 복사합니다. 설정의 일러스트 출처와 종목 상세에서 출처를 확인할 수 있습니다.

정확한 대응을 확인하지 못한8종: 카프 레이즈, 랫풀다운, 로우 케이블 플라이, 시티드 로우 머신, 스미스 머신 숄더 프레스, 싯업, 복근 크런치 머신, 야외 달리기. 사용자 정의 운동도 부위·기구 타일을 사용합니다. 일반 랫풀다운에 언더핸드 원본을 대신 붙이지 않습니다. 벤치 프레스 원본의 벤치 생략은 상세에 명시하며 기존 실제 자세 사진을 유지합니다.
