# 작업 이력 (history.md)

본 파일은 한국어로 작업 이력을 기록합니다. 새 작업 항목은 가장 위에 추가합니다.

## 2026-05-15

### 다이어그램·README 최신화

- 동기: `app.ts` 분리, Highlighter, Ctrl+드래그 클론·가상 Ctrl 버튼이 추가되면서 `docs/class-diagram.puml`과 `README.md`가 모두 낡았음. 다이어그램은 PNG도 함께 재생성.
- `docs/class-diagram.puml`:
  - `app` 패키지에 `App` 외에 `FileActions`, `KeyboardActions` 모듈 추가.
  - `ui` 패키지에 `UiBindings`, `Modals` 모듈 추가.
  - `HighlighterObject` 인터페이스 추가, `SceneStore.addHighlighter` 노출.
  - `EditorMode`에 `highlighter` 멤버 추가.
  - `InputHandler`에 `cloneForDrag` 및 `beginPointer(screen, logical, wantsClone)` 시그니처 반영. 클론/리사이즈 핸들 제외 설명 노트 추가.
  - `App`에 `modifierClone : boolean` 필드와 슬림 오케스트레이터 설명 노트.
  - 분리 모듈 간 협력 관계(점선 화살표)와 `App` 의존 관계 명시.
- `plantuml -tpng docs/*.puml`로 3종 PNG 재생성. 시퀀스 2종은 PUML 미변경이라 바이트 동일.
- `README.md`(한글) 정비:
  - 주요 기능에 형광펜, 16색 팔레트, Ctrl+드래그 클론, 모바일 가상 Ctrl 버튼 추가.
  - 디렉토리 구조에 `src/ui/`, `src/app/` 하위 모듈 표기, 테스트 케이스 수 35개로 갱신, `TODO.md` 항목 추가.
  - 사용 안내·키보드 단축키 섹션에 형광펜(`G`) / `Alt+N`·`Alt+L` / Ctrl+드래그 항목 보강.
  - 아키텍처 설명을 "App이 직접 모든 걸 소유" → "슬림 오케스트레이터 + 네 모듈" 구조로 갱신.
- 검증: PNG 파일 헤더(`file` 명령)로 유효성 확인. README 한글 유지.

### 번들 우클릭 드리프트 보정

- 증상: 커밋 `003458f`(우클릭으로 객체 선택)에서 TS 소스만 갱신되고 `dist/bundle.js`는 누락. 번들의 `_onMouseDown`이 `e.button === 2`도 pan으로 묶어 처리해 우클릭 선택이 동작하지 않았음.
- 수정: 번들 `_onMouseDown`에 TS 소스와 동일한 우클릭 분기 추가 — `hitTest`로 객체 찾기 → `selectedId` 갱신 → `onSelect` 호출. drag는 `none`으로 두어 우클릭만으로 드래그가 시작되지 않게 함.
- 검증: `./build.sh` → `release/index.html` 92,266 bytes 빌드. `node test/run_node.js` 35/35 통과. release에서 "Right-click: select" 주석 매칭 확인.
- 적용 위치: `dist/bundle.js`, `release/index.html` (재빌드 산출물).

### TODO #15·#16: Ctrl+드래그 객체 복제 + 모바일용 가상 Ctrl 버튼

- 동기: TODO.md에 남아 있던 두 미완료 항목. #16(Ctrl+드래그 복제)이 본 기능, #15(우측 하단 가상 Ctrl)는 물리 Ctrl 키 없는 모바일에서 #16을 트리거하기 위한 UI. 한 쌍이라 같이 구현.
- 동작:
  - 데스크톱: 객체 본체에 Ctrl/⌘ + 마우스 드래그 → 즉시 복제 후 그 클론을 드래그. 원본은 제자리.
  - 모바일: 우측 하단 둥근 "Ctrl" 토글 버튼을 탭해 활성화 → 객체 드래그 시 동일 복제 동작. sticky 토글이라 여러 번 복제 후 다시 탭해 끔.
  - 안전장치: arrow의 끝점/중간 리사이즈 핸들(`arrow-from`, `arrow-to`)과 text 리사이즈 핸들(`text-resize`)은 클론 대상에서 제외 — 리사이즈 도중 복제는 의도와 어긋남. body 계열 핸들(`arrow-body`, `arrow-mid`, `text-body`, `highlighter-body`)만 복제 트리거.
- 구현 (TS 소스):
  - `src/input/InputHandler.ts`: `InputCallbacks`에 `getModifierClone?: () => boolean` 추가. `onMouseDown`은 `e.ctrlKey || e.metaKey || cb.getModifierClone?.()`로 `wantsClone` 계산해 `beginPointer`에 전달. `onTouchStart`도 동일하게 가상 Ctrl만 읽음. `beginPointer`는 body 핸들이고 `wantsClone`이면 `cloneForDrag(obj)`로 원본을 그대로 복제하여 새 객체를 드래그 대상으로 설정. 신규 헬퍼 `cloneForDrag`는 `store.addArrow/addText/addHighlighter`를 호출.
  - `src/app.ts`: `modifierClone = false` 필드 추가. InputHandler 콜백에 `getModifierClone: () => this.modifierClone` 추가.
  - `src/ui/UiBindings.ts`: `btnVirtualCtrl` 클릭 → `app.modifierClone` 토글 + `.active` 클래스. `applyLangToUi`에 `cloneToggle` 키 매핑. 첫 구현에서 mouseup/touchend 자동 해제를 넣었으나 버튼 자체 클릭의 mouseup이 즉시 토글을 꺼버려 제거 → sticky 토글로 정착.
  - `src/i18n/lang.ts`: ko/en에 `cloneToggle` 문자열, 도움말 `helpMobile` 끝줄에 Ctrl 토글 사용법 추가.
- HTML/CSS (`index.html`):
  - `#canvasWrap` 내부에 `<button id="btnVirtualCtrl">Ctrl</button>` 추가.
  - 56px 둥근 floating 버튼. `display: none` 기본, `@media (max-width: 720px)`에서만 노출. active 시 accent 컬러 강조.
- 번들 동기화 (`dist/bundle.js`):
  - i18n STRINGS에 `cloneToggle` + `helpMobile` 추가.
  - `_onMouseDown` / `_onTouchStart`가 `wantsClone` 계산해 `_begin(screen, logical, wantsClone)` 호출.
  - `_begin`은 body 핸들이고 `wantsClone`이면 `_clone(obj)` 호출 후 클론을 move-object 대상으로.
  - 신규 `_clone(obj)` — TS의 `cloneForDrag`와 동일 동작.
  - App 생성자에 `this.modifierClone = false`, InputHandler 콜백에 `getModifierClone`.
  - `_bindUi`에 `btnVirtualCtrl` 토글 핸들러. `_applyLangToUi`에 `setTip('btnVirtualCtrl', 'cloneToggle')`.
- 검증:
  - `tsc --noEmit --ignoreDeprecations 6.0` 클린.
  - `node test/run_node.js` 35/35 통과 (기존 케이스 회귀 없음).
  - `./build.sh` → `release/index.html` 91,889 bytes 빌드 성공.
  - `python3 -m http.server 8001`로 `index.html` / `release/index.html` 모두 200 응답, `btnVirtualCtrl` / `modifierClone` / `cloneToggle` 토큰 12회 매칭.
- 사전 드리프트 메모: 번들이 이전 우클릭-선택 커밋(`003458f`)을 반영하지 못해 `_onMouseDown`에 `e.button === 2 → pan`이 남아 있음. 이번 작업과 무관하여 손대지 않았으나 추후 보정 권장.
- TODO.md: #15, #16 ✅ 처리. 남은 항목 없음.

### `app.ts` 모듈 분리 (865 → 192 줄)

- 동기: 단일 파일이 50개+ 메서드로 비대해져 추후 기능 추가/리팩터 시 충돌 위험. 책임 그룹별로 쪼개 가독성과 협업성 확보.
- 접근: `App` 클래스는 **상태/오케스트레이터**로만 남기고, 메서드를 `App` 인스턴스를 인자로 받는 **free function**으로 추출. (TS prototype 패치 패턴 회피 → 호출 위치가 명시적.) 모듈 간 접근을 위해 `App` 필드의 `private` 키워드는 제거. 클래스 상단 주석으로 "App-internal" 컨벤션 명시.
- 신규 모듈:
  - `src/ui/UiBindings.ts` (230줄) — `bindUi`, `setMode`, `updateModeUi/Selection/Title`, `applyLangToUi`, `toggleLang`, `syncCenterFontInput`, `syncFontInputToSelection`, `PALETTE_16`.
  - `src/ui/Modals.ts` (222줄) — `openHelpModal`/`closeHelpModal`/`openWorksModal`/`closeWorksModal`/`renderWorks`/`loadWork`/`renameWork`/`deleteWork`/`refreshWorks`.
  - `src/app/FileActions.ts` (147줄) — `ensureName`/`save`/`saveAs`/`newScene`/`deleteSelected`/`exportPng`/`exportJson`/`importJsonClick`/`handleImportFile`/`fitToScreen`.
  - `src/app/KeyboardActions.ts` (143줄) — `onKey`/`copySelected`/`pasteClone`/`insertTextAtViewportCenter`/`insertArrow`.
- `src/app.ts` (192줄) — 클래스 상태 + 생성자 + `bootstrap`/`adoptScene`/`getSelectedObject`/`requestRender`/`draw`/`resize`/`flashStatus`. 모든 외부 호출 진입점은 import → free function 호출로 단순화.
- 모듈 간 함수 단위 순환 import(`UiBindings`↔`FileActions`, `Modals`↔`FileActions`)는 TS/ESM 표준 동작상 안전. `import type { App }`로 App 타입만 가져와 런타임 cycle 차단.
- `dist/bundle.js`는 손 유지 IIFE라 이번 분리는 **소스 구조만** 변경. 번들/HTML/릴리즈 파일은 미변경.
- 검증: `tsc --noEmit --ignoreDeprecations 6.0` 클린, `node test/run_node.js` 35/35 통과.

### 테스트 커버리지 보강 (12 → 35 케이스)

- 동기: v0.1까지 기능은 충분히 누적됐지만 회귀 보호가 12개 케이스로 빈약했음. 새 기능을 안전하게 추가하려면 핵심 모듈(SceneStore / CanvasView / geometry / i18n)의 엣지 케이스부터 막아야 함.
- 추가한 케이스 23건 (`test/test_arrow.js`):
  - **하이라이터(회귀 보호 3건)**: 단일 점 히트(직전 버그), 다중 점 세그먼트 히트, 마진 밖 미스.
  - **화살표 핸들 2건**: `arrow-to` 엔드포인트 핸들, 멀리 떨어진 점은 `none`.
  - **글자 핸들 2건**: 우하단 `text-resize` 코너 핸들, bbox 밖에서 미스.
  - **z-order 1건**: 겹친 객체에서 가장 나중에 추가된(최상단) 객체가 선택됨.
  - **clampToCanvas 통합 2건**: `addArrow`/`addText`가 범위 밖 좌표를 0..MAX로 클램프.
  - **이벤트/뮤테이터 4건**: `subscribe`/unsubscribe, `setCenterFontSize` 8..200 클램프, `setCenterText`+`setName` emit, `remove` 미존재 id no-op(emit 안 함).
  - **CanvasView 3건**: `panBy`는 `dx/scale`만큼 logical offset 이동, `centerOn`이 logical 점을 화면 중앙에 배치, `zoomAt`이 `minScale`/`maxScale`에서 클램프.
  - **geometry 2건**: 퇴화 세그먼트(`a==b`)에서 점까지 거리, 인바운드 점 패스스루.
  - **i18n 2건**: 미확인 키는 키 자체 반환(폴백), `getLang` ↔ `setLang` 라운드트립.
  - **scene/id 2건**: `emptyScene`의 view 기본값(offset 0, scale 1, 타임스탬프), `newId`의 고유성/접두사.
- 검증: `node test/run_node.js` → `TOTAL 35 / PASS 35 / FAIL 0`.
- 적용 위치: `test/test_arrow.js` 한 파일만 수정. 소스 변경 없음.

### 단일 점 형광펜 선택 불가 버그 수정

- 증상: 모바일에서 펜으로 한 번 톡 찍어 만든 형광펜(점 1개짜리)을 다시 탭해도 선택되지 않아 삭제할 방법이 없었음.
- 원인: `SceneStore.hitObject`의 형광펜 분기가 세그먼트 루프(`i + 1 < points.length`)만 사용해 점이 1개인 경우 루프가 한 번도 실행되지 않아 항상 미스.
- 수정: `points.length === 1`이면 단일 점과의 거리를 `margin` 이내로 직접 비교하여 `highlighter-body` 핸들로 히트 처리. 다중 점 스트로크는 기존 세그먼트 거리 로직 유지.
- 적용 위치: `src/models/SceneStore.ts`, `dist/bundle.js`.

### 형광펜(Highlighter) 도구 추가

- 새 객체 유형 `HighlighterObject { points: Vec[], color, thickness }` 추가. `SceneObject` 유니온에 합류시켜 저장/불러오기/내보내기 흐름에 그대로 편승.
- 입력 흐름: 새 모드 `'highlighter'`. 빈 곳에서 드래그 시 폴리라인을 캡처(연속 점 사이 화면 거리 ≥ 2.5px 만 기록하여 객체 크기를 작게 유지), 마우스/터치 업에서 누적 길이 > 4px 일 때 커밋. 단일 탭은 점 1개의 짧은 마커로 커밋.
- 렌더: `globalAlpha=0.35`, `lineCap/lineJoin='round'`, 폭은 `thickness × 4`. 화살표/글자 *아래* 레이어에 먼저 그려서 실제 형광펜처럼 강조 표시가 뒤로 깔리도록 함. 선택 시 점선 바운딩 박스 표시.
- 선택/이동/삭제: 폴리라인 각 세그먼트와 거리 기반 히트테스트(`highlighter-body`). 본체 드래그로 전체 점 평행이동. Delete/Backspace, Ctrl+C/V도 그대로 동작 (`pasteClone`에서 highlighter 분기 추가).
- 툴바: 글자/이동 사이에 `🖍️ btnHighlighter` 버튼. 커서는 `cell`. 키보드 단축키 `G` 추가하고 도움말 모달 `helpModes`에 노출.
- i18n: `modeHighlighter` 추가 (`형광펜` / `Highlighter`).
- 적용 위치: `src/models/types.ts`, `src/models/SceneStore.ts`, `src/canvas/Renderer.ts`, `src/input/InputHandler.ts`, `src/app.ts`, `src/i18n/lang.ts`, `index.html`, `dist/bundle.js`.
- 검증: `tsc --noEmit` 클린, `node test/run_node.js` 12/12 통과, `python3 -m http.server 8001`로 `release/index.html` 200 응답 + `btnHighlighter`/`addHighlighter`/`_drawHighlighter`/`modeHighlighter`/`draft-highlighter` 토큰 모두 매칭.

### 색상 입력 관련 버그 2건 수정

- 증상 1: 콘솔에 `The specified value "#222" does not conform to the required format. "#rrggbb"` 에러가 떴고, 색상 입력 초깃값이 의도(`#222222`, 짙은 회색)와 달리 `#000000`(검정)으로 표시됨.
- 원인 1: 앱의 기본 색상이 `#222`(3자리 단축형)였는데, `<input type="color">`는 6자리 `#rrggbb`만 허용. 생성자에서 `colorEl.value = this.color` 시 형식이 맞지 않아 브라우저가 거부하면서 콘솔 에러 발생 + 입력값이 검정으로 폴백.
- 수정 1: `App.color` 기본값을 `#222` → `#222222`로 변경(`src/app.ts`, `dist/bundle.js`). 캔버스 fillStyle/strokeStyle은 두 형식 모두 허용하므로 렌더링에 영향 없음.

- 증상 2: 색상을 한 번 바꾼 뒤 키보드 `+`(화살표 추가) 단축키가 동작하지 않음.
- 원인 2: 네이티브 색상 다이얼로그를 닫으면 포커스가 `inputColor`(INPUT)에 남음. `onKey`는 `target.tagName === 'INPUT'`일 때 즉시 return하므로 단축키가 차단됨.
- 수정 2: 색상 입력의 `change` 이벤트와 16색 스와치 click 핸들러에서 `colorEl.blur()` 호출하여 포커스를 body로 반환. 입력 중인 thickness/fontSize 같은 숫자 입력은 그대로 두어 타이핑 흐름 방해 없음.

### 색상 입력에 16색 기본 팔레트 추가 (데스크톱)

- 헤더 색상 입력 옆에 16개 스와치(`#colorPalette`)를 추가하여 데스크톱에서 클릭 한 번으로 자주 쓰는 색을 선택 가능하도록 함.
- 팔레트 16색: 흑/회/백 4종 + Material 계열 12색(빨강/주황/노랑/초록/시안/파랑/인디고/보라/핑크/갈색/틸/블루그레이).
- 네이티브 `<input type="color">`도 그대로 유지. 한쪽에서 변경하면 다른 쪽의 active 표시가 동기화됨.
- 모바일에서는 헤더 공간이 좁아 `@media (max-width: 720px)`로 팔레트 영역 숨김 처리.
- 적용 위치: `index.html`(스와치 컨테이너 + CSS), `src/app.ts`(팔레트 생성/이벤트 와이어링), `dist/bundle.js`(IIFE 번들 동기화).
- 검증: `python3 -m http.server 8001`로 `index.html` 200 응답 및 `#colorPalette` / `PALETTE_16` 문자열 매칭 확인.

### 목록 보기 / 새 문서 단축키 추가 (Alt+L / Alt+N)

- 키보드 단축키 추가: `Alt + L` → 작업 목록(`openWorksModal`), `Alt + N` → 새 문서(`newScene`).
- 초기 구현은 `Ctrl/⌘ + L` · `Ctrl/⌘ + N`이었으나, 브라우저 기본(주소창 포커스 / 새 창)과 충돌이 잦아 Alt 조합으로 변경.
- 키 매칭은 `e.key` 대신 `e.code === 'KeyL'` / `'KeyN'` 사용. macOS에서 Option+L/N은 `e.key`로 ¬/˜ 같은 특수 문자를 반환하므로 물리 키 코드 기반 비교가 안전.
- 도움말 모달 / `lang.ts`(ko, en) `helpKeys` 문자열에 두 단축키 노출. `Ctrl/⌘ + S`(저장) 행 다음에 배치.
- 적용 위치: `src/app.ts`(`onKey`), `src/i18n/lang.ts`, `dist/bundle.js`, `release/index.html`.
- 검증: `node test/run_node.js` 12/12 통과, `tsc --noEmit` 클린, `python -m http.server 8001`로 `index.html` 및 번들 200 응답 + 핸들러/문자열 매칭 확인.

### 작업 목록 모달 첫 오픈 시 안 보이는 버그 수정

- 증상: 앱 시작 후 다른 모달(글자 입력/확인/도움말)을 한 번도 안 띄운 상태에서 작업 목록 버튼을 누르면 모달 DOM은 추가되지만 공용 CSS가 없어 보이지 않음.
- 원인: 도움말 모달 사례와 동일. `openWorksModal`이 `ensureModalStyles()` / `injectCustomPromptStyles()`를 호출하지 않아 lazy 주입이 일어나지 않았음.
- 수정: `openWorksModal` 시작부에서 스타일 주입 함수를 명시적으로 호출. `src/app.ts`, `dist/bundle.js`, `release/index.html` 모두 동일 패치.
- 사후 점검: `customPrompt`, `customConfirm`, `openHelpModal`, `openWorksModal` 네 개 모달 진입점이 모두 스타일 주입을 보장함을 확인.

### Ctrl+C / Ctrl+V로 선택 객체 복제

- App에 내부 클립보드 필드 `clipboard: SceneObject | null` 추가. 시스템 클립보드는 사용하지 않음 (객체 구조를 그대로 보존하기 위함).
- `Ctrl/⌘ + C` — 선택 객체를 `JSON.parse(JSON.stringify(...))`로 깊은 복사하여 클립보드에 보관. 선택이 없으면 무동작.
- `Ctrl/⌘ + V` — 클립보드 객체에 (+20, +20) logical px 오프셋을 더해 새 객체로 추가 후 자동 선택. 연속 붙여넣기 시 클립보드 좌표도 함께 이동하여 사본들이 계단식으로 펼쳐짐.
- 도움말 모달 / README 단축키 항목에 `Ctrl/⌘ + C / V` 추가.
- 충돌 방지: 기존 `V` 단축키(선택 모드 토글)가 Ctrl+V를 가로채지 않도록 Ctrl+V 체크를 먼저 수행.

### 화살표 그리기 후 모드 유지

- 기존엔 InputHandler가 draft 화살표를 commit한 뒤 자동으로 `select` 모드로 전환했음 → 연속 화살표 그리기가 불편.
- 변경: 화살표 commit 후 모드를 그대로 유지. 사용자가 명시적으로 다른 모드를 고르기 전까지 화살표 그리기 모드 지속.

### IME 조합 중 Enter로 모달이 닫히는 버그 수정

- 한글/일본어 IME 조합 중 Enter 키는 조합 완료(commit)용으로 사용되는데, customPrompt / customConfirm의 keydown 핸들러가 이 Enter도 가로채 모달을 닫아버렸음.
- 수정: keydown 핸들러에서 `ev.isComposing` 또는 `ev.keyCode === 229`이면 무시. 사용자가 조합을 마치고 다시 Enter를 눌렀을 때만 실제 제출이 일어남.

### `+`/Insert 화살표 길이 1/3, 간격 5px로 축소

- `insertArrow` 자동 길이를 기존 계산의 1/3로 줄임 (`Math.max(60, min(400, vw*0.25)) / 3` 또는 평균/3).
- 연속 삽입 시 stagger 간격을 10px → 5px로 변경. 결과: 새 화살표가 직전 화살표의 오른쪽으로 5px, 위로 5px 오프셋된 위치에 시작.

### `+` 키로 화살표 추가 지원

- 기존 `Insert` 단축키와 동일하게 `+` 입력 시 `insertArrow` 호출. 메인 키보드의 Shift+= 와 숫자키패드 + 모두 `e.key === '+'`로 감지.
- 도움말 모달 / README 단축키 항목을 `Insert / +`로 갱신.

### 도움말 모달 첫 오픈 시 안 보이는 버그 수정

- 증상: 앱 시작 후 다른 팝업(글자 입력 등)을 한 번도 안 띄운 상태에서 F1/❓를 누르면 도움말 DOM은 있지만 화면에 안 보임. 글자 입력 팝업 등을 한 번 띄운 뒤에는 정상 표시.
- 원인: `.ap-overlay` / `.ap-card` 등 모달 공용 CSS는 `customPrompt` / `customConfirm`이 처음 호출될 때 `injectCustomPromptStyles()`가 lazy 주입. 도움말 모달은 이 함수를 거치지 않아 스타일 없는 채로 마운트됐음.
- 수정: `CustomPrompt`에서 `ensureModalStyles()`를 export하고 `openHelpModal` 시작 시 호출. 번들에서도 `injectCustomPromptStyles()` 직접 호출.

### 글자크기 입력에서 "12" 같은 값 입력 불가 버그 수정

- 증상: 텍스트가 선택된 상태에서 "글자크기" 입력란에 12를 치려고 하면 "1"을 입력하는 순간 값이 8로 점프해 두번째 자리를 칠 수 없었음.
- 원인: 입력값을 받자마자 `Math.max(8, ...)` 클램프가 객체 fontSize에 적용 → 스토어 emit → `syncFontInputToSelection`이 input.value를 클램프된 "8"로 덮어씀.
- 수정: `syncFontInputToSelection`가 현재 input이 포커스된 상태(`document.activeElement === el`)이면 덮어쓰지 않도록 가드. 사용자가 다 치고 blur할 때 동작하는 `change` 핸들러를 추가해 최종 클램프 값으로 스냅.
- HTML `min` 속성을 `1`로 낮춰 입력 중 브라우저가 invalid로 표시하지 않도록 함. 실제 클램프 범위(8~200)는 모델 계층에서 유지.

### F1 / ❓ 버튼으로 도움말 모달 추가

- 헤더 우측 끝에 `btnHelp`(❓) 아이콘 버튼 추가, 클릭 시 도움말 모달 오픈.
- `F1` 키 단축키로도 동일 모달 오픈. 모달이 열린 상태에서 `Esc` 또는 `F1`로 닫힘.
- 모달은 `.ap-overlay` / `.ap-card` 스타일을 재사용하고 `.ap-help-card` / `.ap-help-body` CSS만 추가.
- 내용: 모드 전환 단축키(V/A/T/H), 키보드 단축키(Insert/Enter/Delete/Ctrl-S/F1), 마우스 동작, 모바일 제스처 4개 섹션.
- i18n: `help`, `helpTitle`, `helpSecModes/Keys/Mouse/Mobile`, `helpModes/Keys/Mouse/Mobile` 한/영 추가.
- 모달 키 핸들러는 `stopPropagation`으로 window 레벨 `_onKey` F1 재실행 방지.

### 글자크기 입력이 선택된 텍스트도 리사이즈하도록

- 기존: "글자크기" 입력은 새로 만들 텍스트의 기본값만 바꿔, 이미 그려진 텍스트는 드래그 핸들로만 크기 조정 가능했음.
- 변경: 텍스트 객체가 **선택된 상태**에서 입력값을 바꾸면 선택된 텍스트의 fontSize를 즉시 변경. 선택이 없거나 화살표 선택이면 기존대로 새 텍스트 기본값을 설정.
- 선택이 바뀌면 입력값을 선택된 텍스트의 fontSize로 자동 동기화. 드래그 핸들로 리사이즈할 때도 입력값이 따라감.
- 클램프: 8~200.

### 주제 원 제거 + 주제 글자 크기 변경 가능

- Renderer의 `drawCenter`에서 노란 원(`#fff7d6` 채움 + `#c9a227` 테두리)을 그리던 호출 제거. 이제 가운데에 글자만 표시.
- `SceneData`에 `centerFontSize?: number` 필드 추가, 기본값 `DEFAULT_CENTER_FONT_SIZE = 28`.
- `SceneStore.setCenterFontSize(size)` 추가 (8~200 클램프).
- 헤더 툴바에 "주제크기" 입력(`#inputCenterFontSize`) 추가 → 입력 시 `setCenterFontSize` 호출 → 캔버스 즉시 반영.
- 작업 불러오기 시 누락된 `centerFontSize`는 기본값으로 채우고 입력값을 동기화.
- 래핑 너비를 글자 크기 비례 (`max(120, fs*8)`)로 확장하여 큰 글자도 단어 단위로 줄바꿈.
- i18n에 `centerFontSize` 키 추가 ('주제크기' / 'Topic Size').

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
