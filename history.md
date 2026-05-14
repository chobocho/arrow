# 작업 이력 (history.md)

본 파일은 한국어로 작업 이력을 기록합니다. 새 작업 항목은 가장 위에 추가합니다.

## 2026-05-15

### Insert 화살표 길이 자동 조절 (기존 평균)

- `_insertArrow`에서 새 화살표 길이를 기존 화살표들의 평균 길이로 설정.
- 화살표가 없으면 viewport 기반 기본값(60~400 사이) 사용.
- 최소 30 logical px로 클램프하여 너무 작아지지 않도록 함.

### 확인 팝업도 커스텀 모달로 (삭제/이어작업 등)

- `customConfirm(message): Promise<boolean>`를 CustomPrompt 모듈에 추가.
- `window.confirm` 4곳 모두 교체: 새 작업 시 미저장 확인, 객체 삭제 확인, 작업 불러올 때 미저장 확인, 작업물 삭제 확인.
- Enter=확인, Esc/배경 클릭/취소 버튼=취소. 열리면 OK 버튼에 포커스.
- src i18n에 `unsavedNew`/`unsavedLoad` 키 추가 (기존엔 한·영 혼합 하드코딩 문자열이었음).

### Insert 화살표 간격을 10px 고정으로

- `_insertArrow`의 gap을 `Math.max(20, lengthLogical * 0.2)` 대신 logical **10px** 상수로 변경.
- 새 화살표는 기존 bbox 기준 (maxX + 10, minY − 10)에 시작. 가로/세로 모두 10px만 떨어져 더 촘촘하게 배치.

### 브라우저 축소 시 캔버스가 컨테이너 전체를 채우게

- 기존엔 `resize()`가 `canvas.style.width/height`를 명시 픽셀로 덮어써, 헤더 wrap 등 컨테이너만 변하는 경우 표시 크기와 컨테이너 사이에 빈 공간이 보일 수 있었음.
- 해결: JS에서 style.width/height를 더 이상 설정하지 않고, CSS `width:100%; height:100%`에 표시 크기를 맡김. JS는 비트맵 버퍼(`canvas.width/.height`)만 갱신.
- `ResizeObserver`로 컨테이너 크기 변화를 직접 감지 → window resize 이벤트가 안 와도 즉시 버퍼 재계산.
- floor → round로 변경하여 서브픽셀 반올림 오차 최소화.

### 메뉴 버튼을 이모지 아이콘 + 텍스트 툴팁으로 변경

- 헤더 툴바 모든 버튼의 라벨을 이모지로 교체하고, 기존 i18n 텍스트는 `title` 속성으로 옮겨 호버 시 툴팁으로 표시.
- 매핑: 선택 🖱️ / 화살표 ➡️ / 글자 🔤 / 이동 ✋ / 주제편집 🎯 / 삭제 🗑️ / 확대 ➕ / 축소 ➖ / 맞춤 🔳 / 새작업 🆕 / 저장 💾 / 새이름저장 📝 / 작업목록 📋 / PNG 🖼️ / JSON↓ 📤 / JSON↑ 📥 / 언어 🌐.
- `button.tool.icon` 스타일 추가 (font-size 16, min-width 36).
- 언어 버튼 툴팁은 현재 언어 반대 방향 ("Switch to English" / "한국어로 전환")을 동적으로 표시.
- `_applyLangToUi`는 아이콘 버튼들에 대해 `title`만 갱신 (textContent는 정적 이모지 유지). 라벨 span(색상/굵기/글자크기)은 그대로 textContent.
- dist i18n의 일부 영어 키(`exportPng` 등)가 짧은 약어로 굳어져 있어 툴팁용 풀 텍스트로 정정.

### Enter 단축키로 글자 입력 팝업

- `Enter` 누르면 글자 입력 모달(customPrompt)이 뜨고, 확인 시 viewport 중앙에 텍스트 객체가 추가됨.
- 추가 후 자동 선택 + 모드를 `선택`으로 복귀.
- input 포커스 중이거나 작업 목록 모달이 열려있으면 무시.
- 글자 클릭으로 텍스트를 만들 때와 동일한 색/폰트크기 사용.

### 작업 목록 정렬 (이름순 / 최근 수정순)

- 작업 목록 모달 헤더 아래에 정렬 버튼 추가 — `이름순` / `최근수정순`.
- 기본은 최근수정순 (`updatedAt` 내림차순), 토글 시 즉시 재렌더.
- 이름순은 `localeCompare(numeric: true, sensitivity: 'base')`로 한/영 혼재와 숫자 자연정렬 지원.
- 현재 선택은 파란색 active 상태로 표시.
- 정렬 상태(`worksSortKey`)는 세션 동안 유지 (모달을 닫았다 다시 열어도 기억).
- i18n에 `sortLabel`/`sortByName`/`sortByDate` 키 추가.

### 작업 목록을 팝업 모달로 (사이드바 제거)

- 우측 240px 사이드바 제거 → `#app`는 1열 그리드로 단순화 (캔버스 영역 확장).
- 헤더에 "작업 목록" 버튼(`#btnWorks`) 추가. 누르면 ap-works-card 모달 오픈.
- 모달 각 항목: 이름 + `불러오기` / `이름변경` / `삭제` 명시적 버튼 (기존엔 이름 클릭으로 로드).
- 빈 목록일 땐 "저장된 작업이 없습니다" 메시지.
- Esc / 배경 클릭 / 닫기 버튼으로 모달 종료. `_loadWork` 성공 시 모달 자동 닫힘.
- i18n에 `load` / `close` / `noWorks` 키 추가.
- 모달 스타일은 CustomPrompt 모듈의 styles에 함께 주입 (`ap-works-*` 클래스).

## 2026-05-14

### Insert 키 동작: 기존 화살표 우상단에 새 화살표 추가

- 기존엔 viewport 중앙에 추가되어 연속 입력 시 한곳에 겹쳤음.
- 변경: 씬 내 화살표들의 bbox를 계산해 (maxX + gap, minY - gap)에 새 화살표 시작점을 둠.
- 화살표가 없으면 기존처럼 viewport 중앙에 fallback.
- 캔버스 경계(4096)에 clamp.
- 함수명 `insertArrowAtViewportCenter` → `insertArrow`로 변경 (`_insertArrowAtViewportCenter` → `_insertArrow`).
- `src/app.ts` + `dist/bundle.js` 동기화, `release/index.html` 재빌드, 노드 테스트 12/12 통과.

### 글자/이름 입력 팝업을 커스텀 모달로 교체

브라우저 기본 `window.prompt` 대화상자를 앱 UI 톤에 맞춘 커스텀 모달로 모두 교체했습니다.

- `src/ui/CustomPrompt.ts` 모듈 신설 — `customPrompt(message, defaultValue)`이 `Promise<string|null>`을 반환.
  - Enter 키로 확인, Esc / 배경 클릭 / 취소 버튼으로 취소.
  - 첫 호출 시 전용 스타일을 `<head>`에 한 번만 주입(외부 라이브러리 없음).
  - 모달이 마운트된 다음 프레임에 input에 포커스 + 전체 선택.
- 교체된 호출 지점 (모두 `customPrompt`로):
  - `InputHandler` — 텍스트 모드에서 빈 영역 클릭 시 "글자 입력" 팝업.
  - `App` — 더블클릭으로 주제/글자 편집, 툴바 "주제 편집" 버튼.
  - `App` — 저장(이름 입력), 새이름저장, 작업물 이름 변경.
- i18n에 `ok` / `cancel` 키 추가 (한/영 모두).
- 동일 변경을 `src/*.ts`와 `dist/bundle.js` 양쪽에 반영, `release/index.html` 재빌드.
- 기존 노드 테스트 12/12 통과 확인. 모달 자체는 DOM 의존이라 수동 브라우저 검증 필요 (python -m http.server 8001 → 글자/주제/저장/이름변경 흐름).

### Insert 키로 화살표 추가 (단축키)

- `Insert` 키 누르면 현재 화면 중앙에 가로 방향 화살표가 즉시 추가됩니다.
- 길이는 보이는 영역의 25% 정도 (60~400 논리 픽셀 사이로 클램프)로 줌과 무관하게 적절한 크기로 보입니다.
- 추가 후 자동 선택되어 끝점 핸들을 바로 조작할 수 있고, 모드는 `선택`으로 복귀합니다.
- 변경 위치: `src/app.ts` (onKey + insertArrowAtViewportCenter), `dist/bundle.js`, `README.md`.

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
