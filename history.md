# 작업 이력 (history.md)

본 파일은 한국어로 작업 이력을 기록합니다. 새 작업 항목은 가장 위에 추가합니다.

## 2026-05-14

### 초기 구현 (단일 PR)

CLAUDE.md 명세에 맞춰 화살표 마인드맵 웹앱의 1차 기능 구현을 완료했습니다.

- **프로젝트 구조 정립**
  - `tsconfig.json` 추가 (strict, ES2019, DOM lib)
  - `src/` 하위에 모듈 분리: `canvas/`, `models/`, `input/`, `storage/`, `i18n/`, `utils/`
  - `.gitignore` 추가
- **캔버스 렌더링 / 좌표계**
  - `CanvasView`로 화면-논리좌표 변환, 줌(고정 anchor), 패닝, 클램프 구현
  - `Renderer`에서 격자, 가운데 주제 원, 화살표, 글자, 선택 핸들 그리기
  - 고해상도(DPR) 적용으로 폴더블 큰 화면에서도 또렷하게 렌더
- **데이터 모델**
  - `SceneData`(id, name, centerText, objects, view 상태) 정의
  - `SceneStore`가 객체 CRUD, 변경 이벤트, 히트테스트 제공
  - 4096×4096 캔버스 경계에 자동 클램핑
- **입력 처리**
  - 마우스 드래그로 화살표 그리기, 화살표 끝점/중점 핸들 조작
  - 글자 객체 이동 + 우하단 핸들로 크기 조정
  - 모바일 두 손가락 핀치 줌 + 이동, 더블탭/더블클릭으로 글자 수정·주제 편집
- **IndexedDB 저장소**
  - `scenes` 및 `meta` 오브젝트 스토어로 작업물 저장
  - 마지막 작업 자동 복원("이어하기")
  - 전체 작업물 JSON 내보내기 / 가져오기, 이름변경, 삭제 지원
- **UI / i18n**
  - 상단 툴바: 모드(선택/화살표/글자/이동), 색상·굵기·글자크기, 저장/내보내기, 한↔영 토글
  - 우측 사이드바: 작업물 목록 (불러오기 / 이름변경 / 삭제)
  - 한국어/영어 UI 문자열 분리, 토글로 즉시 적용
- **빌드 시스템**
  - 개발용: `dist/bundle.js`를 그대로 `index.html`이 참조
  - 릴리즈용: `build.sh` / `build.bat` → `release/index.html` 단일 파일로 인라인
  - 공통 인라인 로직은 `scripts/inline_build.py`로 분리해 OS별 동작 일치
  - `build.bat`은 `chcp 949`로 cp949 사용하여 한글 깨짐 방지
- **테스트**
  - `test/test_arrow.js` — 손수 만든 미니 테스트 프레임워크 (브라우저 + Node 양쪽)
  - geometry, CanvasView, SceneStore, i18n 등 12개 케이스 작성
  - Node 환경에서 `node test/run_node.js` 실행 시 12/12 통과 확인
- **문서**
  - `README.md` 전면 한글 개정 (실행/빌드/단축키/디렉토리 구조 설명)
  - 본 `history.md` 신설
