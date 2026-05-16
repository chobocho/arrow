# 작업 이력 (history.md)

본 파일은 한국어로 작업 이력을 기록합니다. 새 작업 항목은 가장 위에 추가합니다.

## 2026-05-16

### .arrow 내보내기 기능 제거 (가져오기는 유지)

- 동기: 사용 빈도가 낮아 기능 표면을 줄이는 게 좋다는 판단. import 한 방향만으로도 "키보드로 빠르게 씬 짜기" 사용 목적은 충분히 달성.
- 제거 대상:
  - `src/storage/ArrowFile.ts`의 `serializeArrowFile` 함수 + `SERIALIZE_MATCH_RADIUS` 상수.
  - `src/app/FileActions.ts`의 `exportArrow` 함수 + 그 import.
  - `index.html` 헤더의 📃 `btnExportArrow` 버튼.
  - `src/ui/UiBindings.ts`의 wiring + `setTip` + `exportArrow` import.
  - `src/i18n/lang.ts`의 `exportArrow` 한·영 키.
  - 도움말 `helpFormat`에서 📃 내보내기 한 줄.
  - README 두 곳(상단 기능 요약, .arrow 섹션).
  - 테스트 2건(serialize round-trip, floating-text 보존). 52 → 50개로 감소.
  - 번들(`dist/bundle.js`)의 `serializeArrowFile` 본문, ArrowApp 익스포트, `_exportArrow` prototype, UI 바인딩, STRINGS, applyLangToUi setTip 모두 미러 제거.
- 유지: `parseArrowFile` 및 `.arrow` import 경로 전체. 도움말의 import 설명·규칙·샘플 경로도 그대로.

### .arrow 파서 버그 — 새 시작점에 토픽→루트 화살표가 자동 추가되던 문제

- 증상: `📚독서 -> 📖정리 -> 🧠LLM`처럼 토픽이 아닌 단어로 시작하는 체인을 import하면, 토픽 → 📚독서로 가는 화살표가 자동으로 추가됨. 사용자는 📚독서를 토픽과 무관한 독립 루트로 의도했음.
- 원인: `buildTree`가 새 시작점을 `linkParentChild(topicNode, newRoot)`로 처리해 (a) 레이아웃용 children 추가와 (b) 엣지 추가를 동시에 수행. (b)가 의도치 않은 토픽→루트 화살표를 만듦.
- 수정: 레이아웃-only 도우미 `attachForLayoutOnly(parent, child)`를 신설. `children`에는 넣어 layout 패스가 토픽 근처에 배치하지만 `edges`에는 추가하지 않음. 새 시작점에만 사용. 체인 중간/끝 단어는 종전대로 `linkParentChild`로 둘 다 수행.
- 영향: 사용자 case에서 화살표 수 9 → 8(토픽→📚독서 제거), 스펙 예시에서 10 → 9(토픽→할일 제거). 의미상 변화 없음 — 새 시작점은 그래도 토픽 근처에 보이도록 배치, 단지 화살표만 사라짐.
- 도움말 텍스트도 갱신: "주제의 또 다른 자식 가지로 추가" → "독립된 새 루트로 추가됩니다 — 주제와 화살표로 연결되지 않습니다."
- 번들 동기화(`dist/bundle.js`): `attachForLayoutOnly` 헬퍼와 `parent ` 분기 모두 미러. STRINGS.helpFormat 갱신.
- 테스트 갱신/추가:
  - 스펙 예시 테스트 기대값을 10 → 9 화살표로 수정.
  - round-trip 테스트에 "free root는 자기 이름으로 chain 시작" 단언 추가.
  - 회귀 테스트 신설 — `Standalone -> Leaf` 단 한 줄에서 화살표는 정확히 1개여야 함.
- 총 49 → 52 통과.

### .arrow 텍스트 포맷 내보내기 추가

- 동기: import만 있고 export가 없어 한 번 GUI로 편집하면 텍스트로 되돌릴 수 없었음. 외부 편집기·git diff·LLM 협업 등 텍스트 표현이 필요한 워크플로우를 위해 export 추가.
- 알고리즘 — `serializeArrowFile(scene)`:
  - 가상 topic 노드를 캔버스 중심(MAX/2, MAX/2)에 두고, 각 텍스트 객체를 노드로 수집.
  - 각 화살표에 대해 endpoint 둘 다에서 가장 가까운 노드(거리 ≤ 220)를 찾아 source→target 엣지 생성. 동일 페어 중복 엣지는 dedupe.
  - 루트 선정: topic(out-degree > 0) + non-topic 중 in-degree 0인 노드.
  - 각 루트에서 DFS — 매 leaf마다 path를 하나의 chain으로 emit. 모든 엣지가 적어도 한 번 출력에 등장.
  - 부동(floating) 텍스트(in/out 모두 0)는 single-label chain으로 emit해 round-trip 손실 방지.
- 동작: 헤더에 📃 버튼(`btnExportArrow`) 추가. 클릭 시 `scene.name + '.arrow'`로 다운로드.
- Round-trip 의미론: 원본 `할일 -> ...`처럼 topic 없이 시작하는 chain은 import 시 topic의 자식으로 추가되므로, 다시 export하면 `Book -> 할일 -> ...`로 명시적으로 나옴 — 구조는 동일.
- i18n: `exportArrow` 한·영 추가. 도움말 `helpFormat`에 📃 내보내기 한 줄 추가.
- 번들 동기화(`dist/bundle.js`): `serializeArrowFile` 함수, ArrowApp 익스포트, `App.prototype._exportArrow`, UI 바인딩, STRINGS, helpFormat, applyLangToUi 모두 미러.
- 테스트 추가(2건): 스펙 예시 round-trip(leaf 모두 등장 + 텍스트/화살표 카운트 보존), floating 텍스트 노드 보존. 총 49 → 51개 통과.

### 도움말 모달에 ".arrow 텍스트 포맷" 섹션 추가

- 동기: .arrow 가져오기 기능이 비명시적이라 사용자가 발견하기 어려움. 도움말에 형식·규칙·샘플 경로까지 한 화면에 보이도록.
- 변경: i18n에 `helpSecFormat` 섹션 제목과 `helpFormat` 본문(한·영) 추가. `Modals.ts` sections 배열에 `['helpSecFormat', 'helpFormat']` 한 줄 추가. 기존 `.ap-help-body` `white-space: pre-line`이 줄바꿈 + 워드랩 처리.
- 내용: 형식(1줄 마커 / 2줄 주제 / 3줄+ 체인 / # 주석), 규칙(기존 노드면 가지 이어 붙임, 새 단어면 주제의 새 가지로), 레이아웃(360°/N 시계 방향, 글자 크기 24), 샘플 경로(docs/examples/spec.arrow) 모두 한 섹션에 명시.
- 번들 동기화(`dist/bundle.js`): STRINGS.ko/en에 두 키 추가, help sections 배열에 새 섹션 추가.

### .arrow 텍스트 포맷 가져오기 — 한 줄 = 한 체인

- 동기: 키보드만으로 빠르게 마인드맵 씬을 만들고 싶을 때 JSON 직접 편집은 부담스러움. 사용자 정의 텍스트 형식으로 한 줄에 한 체인을 적으면 자동 트리 레이아웃되도록.
- 형식:
  - 1줄: `arrow` (파일 마커, 대소문자 무시)
  - 2줄: 주제(centerText)
  - 3줄+: `A -> B -> C` 형태의 체인 (`->` 또는 `→` 인식)
  - `#` 이후 줄 끝까지 주석, 빈 줄 무시
- 의미론: 체인의 첫 단어가 기존 노드(주제 포함)면 거기서 가지를 이어 붙임. 기존에 없는 단어면 주제의 또 다른 자식 가지로 추가됨 → 다중 루트 지원.
- 레이아웃: 주제는 중심, 각 부모는 자식을 360°/N 간격으로 시계 방향 회전 배치. 깊은 레벨은 부모의 outward angle을 시작각으로 사용 → 단일 자식 체인은 직선으로 뻗음. 글자 크기는 24로 통일 (사양 명시).
- 좌표 변환: 트리는 원점(0,0)에서 시작해 layout되고, 마지막에 캔버스 중심(MAX/2, MAX/2)으로 일괄 평행이동 — 에디터 월드 경계 안에 들어가도록.
- 화살표 트리밍: 양 끝을 텍스트 bbox 절반 + 14px 여유로 줄여 글자와 화살표가 겹치지 않게.
- 신규 파일:
  - `src/storage/ArrowFile.ts` — 토큰화 / 트리 빌드 / 폴라 레이아웃 / SceneData 변환.
  - `docs/examples/spec.arrow` — 사양에 등장한 예시 그대로의 샘플.
- 통합:
  - `FileActions.handleImportFile`이 확장자로 분기(`.arrow` → 파서 + 씬 교체, 그 외 → 기존 JSON DB import). `.arrow`는 현재 씬을 교체하므로 dirty 상태일 때 `confirmUnsaved` 게이트를 통과해야 함.
  - 같은 게이트가 필요한 `loadWork`(Modals)도 새로 추출한 `confirmUnsaved`로 통일 — Save/Don't Save/Cancel 로직 중복 제거.
- UI: `index.html`의 `<input type="file">` accept를 `application/json,.json,.arrow`로 확장. 기존 📥 버튼 그대로 사용.
- i18n: `invalidArrow` 한·영 추가 (파서 거부 시 alert 메시지).
- 번들 동기화(`dist/bundle.js`): `parseArrowFile` 함수 + ArrowApp 익스포트, `_confirmUnsaved` 헬퍼, `_handleImportFile` 확장자 분기, `_loadWork` 헬퍼 사용, STRINGS 추가 모두 미러.
- 테스트 추가(4건): 사양 예시 파싱(10 texts + 10 arrows), 마커 부재 거부, 라벨 중복 dedupe, 주석/빈 줄 무시. 총 45 → 49개 통과.

### arrow2png 스크립트 + 소개용 마인드맵 (PNG/SVG)

- 동기: README에 "우리 앱으로 우리 앱을 설명하는" 마인드맵 예시가 필요. 동일한 `SceneData` JSON에서 이미지로 변환하는 단일 파일 스크립트로 처리.
- 신규 파일:
  - `scripts/arrow2png.ts` — 단일 파일 CLI. 입력 JSON과 출력 경로를 받아 PNG(node-canvas 필요) 또는 SVG(순수 JS, 무의존성)로 변환. 출력 확장자로 자동 분기. `src/canvas/Renderer.ts`의 수식(highlighter 우선·shaft+삼각형 head·text top-left·중심 라벨 wrap)을 그대로 가져옴.
  - `scripts/tsconfig.json` — Node 타깃 별도 tsconfig (DOM lib 제외, `types: []`). 메인 프로젝트 빌드와 분리.
  - `docs/intro-scene.json` — 6개 스포크 + 체인 예시 + 중심 라벨로 구성된 소개 씬. 한·영 라벨, 카테고리별 색상 코드.
  - `docs/intro.svg` — arrow2png로 생성한 SVG. README가 참조하는 예시 이미지.
- 의존성 처리: `@types/node`는 환경마다 다를 수 있어 의존하지 않음. 필요한 Node API(`process`, `require`, fs/path 모듈, Buffer)는 스크립트 상단에 ambient 선언으로 직접 선언. `require('canvas')`는 lazy하게 호출 — canvas 미설치 환경에서도 SVG 경로는 정상 동작.
- 환경 한계: 본 작업 환경(PRoot/Termux)은 node-canvas native build가 실패하므로 PNG 직접 생성은 불가. SVG는 GitHub markdown에서 정상 렌더되고, 이모지는 뷰어의 폰트로 처리되어 색상 이모지가 보존됨. PNG가 필요한 사용자는 `npm install canvas` 후 동일 스크립트로 변환 가능.
- README: 상단 "예시" 섹션 신설 — intro.svg 임베드 + arrow2png 사용법 + 디렉토리 구조에 신규 파일 반영.

### 체인 삽입 앵커를 마지막 편집 객체 + (10, 10)으로

- 동기: 매번 뷰포트 가운데에 체인이 나오면 연달아 삽입할 때 정확히 같은 위치에 겹쳐 표시돼 결과가 잘 안 보임. 사용자가 마지막 편집한 객체 기준으로 약간 어긋난 위치에 새 체인이 놓이도록.
- 동작: `insertChain`에서 `app.getSelectedObject()` 결과가 있으면 그 객체의 top-left bbox + (10, 10)을 시작 좌표로 사용. 없으면(첫 삽입 또는 deselect 직후) 종전대로 뷰포트 가운데 정렬.
- "마지막 편집한 객체" 정의: `app.selectedId`로 충분. 체인 삽입은 마지막 글자를 자동 선택하고, 다른 편집/드래그/추가도 결국 그 객체를 선택 상태로 만듦 → 사용자가 명시적으로 deselect하지 않는 한 자연스럽게 cascade.
- 헬퍼: `objectTopLeft(obj)` 추가 — text는 `pos`, arrow는 `min(from, to)`, highlighter는 `points` 전수의 min. 한 곳에서 통일된 "객체의 x, y" 정의.
- offset 10은 논리 좌표(canvas coord) 기준. 줌 배율과 무관하게 일정한 간격.
- 번들 동기화(`dist/bundle.js`): `objectTopLeft` 헬퍼와 selected-anchor 분기 모두 미러.

### 도움말 모달에 "도구" 섹션 추가 — 🦀 체인 추가 설명

- 동기: 체인 추가는 비명시적 기능이라 사용자가 발견하기 어려움. 도움말에 분명하게 노출.
- 변경: i18n에 `helpSecTools` 섹션 제목과 `helpTools` 본문(한·영) 추가. `Modals.ts`의 `sections` 배열에 `['helpSecTools', 'helpTools']` 한 줄 추가. CSS는 기존 `.ap-help-body` (`white-space: pre-line`)가 자동 워드랩 처리 — 추가 스타일 불필요.
- 내용: 형식(`A -> B -> C` / `→`도 가능), 마지막 노드 자동 선택, 단일 Undo 단계, 최대 10개 cap을 모두 한 문단에 명시.
- 번들 동기화(`dist/bundle.js`): STRINGS.ko / STRINGS.en에 키 추가, help sections 배열에 새 섹션 추가.

### 체인 입력을 아이콘 + 팝업으로 전환 (🦀)

- 동기: 헤더 인라인 입력창이 폭(220px)을 차지해 다른 컨트롤과 좁아 보임. 자주 쓰는 입력이 아니므로 아이콘만 노출하고 클릭 시 팝업으로 받도록 UX 단순화.
- 변경:
  - `index.html`에서 `<input id="inputChain">`+`<button id="btnChainInsert">` 묶음 삭제 → 단일 아이콘 버튼 `<button id="btnChain">🦀</button>`로 교체. `.chain-input` CSS도 함께 제거(사용처 없음).
  - `UiBindings.ts` 인라인 wiring 제거. 아이콘 클릭 시 `customPrompt(t('chainInsert'), '', t('chainPlaceholder'))` 호출 → 입력값을 `insertChain`에 전달. 취소(null)는 noop.
  - `applyLangToUi`의 `setTip` 대상이 `btnChainInsert` → `btnChain`. 인라인 input placeholder/title 동기화 로직 제거(불필요).
- `customPrompt` 확장: 세 번째 인자 `placeholder` 추가 — 비어있지 않으면 input의 `placeholder` 속성으로 적용. 기본값이 있으면 그것을, 없으면 placeholder만 보이는 형태로 작동. 다른 호출자에는 영향 없음(기본값 `''`).
- i18n 정리: 더 이상 참조되지 않는 `chainTooltip` 키 삭제. `chainInsert`(아이콘 툴팁 + 다이얼로그 제목)·`chainPlaceholder`(다이얼로그 input placeholder)만 유지.
- 번들 동기화(`dist/bundle.js`): `customPrompt`에 `placeholder` 파라미터, 인라인 wiring을 팝업 wiring으로 교체, `applyLangToUi`·STRINGS 키 정리 모두 미러.

### 체인 입력 — "A -> B -> C" 한 줄로 글자+화살표 추가

- 동기: 매번 글자→배치→화살표→연결을 반복하는 대신, "독서 -> 전공서적 -> LLM" 같은 직관적 한 줄을 입력하면 자동으로 글자 노드들과 그 사이를 잇는 화살표가 한 번에 추가되도록.
- UI: 헤더 우상단 "삭제 / Undo / Redo" 다음에 신규 그룹으로 텍스트 입력 + ⛓️ 버튼 추가. 입력 placeholder/툴팁은 i18n으로 한·영 분기. CSS는 헤더 인라인 스타일에 `.chain-input` 추가(폭 220px, 모바일 140px).
- 파서: `->` 또는 유니코드 `→` 어느 쪽이든 구분자로 인정, 좌우 공백 trim, 빈 세그먼트 폐기. 한·영 모두에서 자연스럽게 동작.
- 제한: `CHAIN_MAX_SEGMENTS = 10`. 11개 이상이면 앞 10개만 사용 — 폭주 붙여넣기로 캔버스 폭격 방지.
- 레이아웃: 폰트 크기 기반으로 글자 폭(≈ `fontSize * 0.65 * length`)과 화살표 길이(`max(60, fontSize * 2.5)`)를 계산해 전체 폭을 뷰포트 가운데 정렬. 화살표는 글자 우변에서 짧은 gap 후 시작, 다음 글자 좌변 직전까지. 마지막 생성된 글자는 자동 선택 → 사용자가 바로 위치/크기를 조정 가능.
- 히스토리: 체인 전체를 단일 `pushHistory()`로 묶어 한 번의 Undo로 전체 취소.
- 입력 처리: Enter 또는 ⛓️ 버튼이 commit. IME 조합 중 Enter(`isComposing`, `keyCode 229`)는 무시 — 한국어 마지막 음절 조합 중 사고로 추가되는 일 방지. commit 후 입력 비우고 포커스를 Select 버튼으로 이동해 단축키 부활.
- i18n: 신규 키 `chainInsert`, `chainPlaceholder`, `chainTooltip`(한·영).
- 번들 동기화(`dist/bundle.js`): UI 바인딩 + i18n + `App.prototype._insertChain` + `applyLangToUi`에 placeholder/title 적용 모두 미러.

### ensureName placeholder 판정에 'New Work' 추가 — 불러오기 → 저장 흐름 보완

- 동기: 직전 변경에서 `newScene`이 `t('newWork')`로 이름을 박아 넣으면서 한국어 모드는 '새 작업'(기존 bail 목록에 포함)이라 정상 동작하지만, 영어 모드에서는 'New Work'가 bail 목록에 없어 불러오기 → 저장 시 이름 입력 없이 'New Work'를 그대로 이름으로 저장.
- 수정: `ensureName`의 bail 판정을 단일 if 체인에서 `placeholders` 배열 `indexOf` 검사로 교체. 배열에 현재 언어의 `t('newWork')`, `t('untitled')`와 legacy 리터럴(`'새 작업'`, `'제목 없음'`, `'New Work'`, `'Untitled'`)을 모두 포함 — 언어 전환·구버전 DB·SceneStore 기본값까지 한 번에 커버.
- 번들 동기화(`dist/bundle.js`): `App.prototype._ensureName`에 동일 placeholders 배열 + `indexOf` 검사 적용.

### 작업 중 불러오기 시 저장/저장 안 함/취소 3-옵션 다이얼로그

- 동기: 기존 `loadWork`는 dirty 상태에서 `customConfirm(t('unsavedLoad'))` 하나만 띄워 "버리기 / 취소" 이진 선택만 가능 → 작업 중인 내용을 잃을 위험. 표준 데스크탑 패턴인 "Save / Don't Save / Cancel" 3-옵션으로 교체.
- 신규 도우미: `ui/CustomPrompt.ts`에 `customChoice(message, buttons)` 추가. 각 버튼은 `{ label, value, variant?: 'primary' }`. 클릭 시 `value` resolve, Esc/배경 클릭 시 `null`. Enter는 `variant: 'primary'` 버튼을 활성화. 기존 `customConfirm`은 그대로 두고 새 도우미만 추가 — 다른 호출자 영향 없음.
- `loadWork` 변경:
  - dirty가 true이면 `customChoice`로 [취소, 저장 안 함, 저장(primary)] 표시.
  - `null`/`cancel` → return.
  - `discard` → 그대로 load 진행.
  - `save` → `await save(app)` 후 `app.dirty`가 여전히 true이면 abort(이름 입력 취소된 경우 등) — 안전한 fail-stop.
- i18n: ko `unsavedLoad`를 "변경사항이 있습니다. 저장할까요?"로 자연스러운 질문형으로 변경, en도 "Unsaved changes. Save them?"로. 신규 키 `dontSave`("저장 안 함" / "Don't Save") 추가.
- 모듈 의존성: `Modals.ts`가 `FileActions.save`를 import — 기존 `FileActions → Modals.refreshWorks` 경로와 함께 cycle이 되지만 둘 다 함수 본문 내에서만 참조하므로 ES 모듈의 cyclic dependency 규칙상 런타임 안전.
- 번들 동기화(`dist/bundle.js`): `customChoice` 함수 추가, `STRINGS.ko/en`에 변경 반영, `App.prototype._save`가 promise를 반환하도록 (caller가 await 가능) — 내부 chain은 동일. `App.prototype._loadWork`를 동일한 3-옵션 로직으로 교체.

### 새 작업 생성 시 헤더가 "Untitled / 제목 없음"으로 뜨던 문제 수정

- 증상: 직전 변경으로 헤더 제목이 토픽 → 이름 → "untitled" 순으로 폴백하는데, 새 작업 버튼이 `emptyScene(t('untitled'))`로 이름을 "제목 없음"으로 박아 넣어 토픽이 빈 상태에서 헤더가 "제목 없음" / "Untitled"로 표시.
- 수정: `FileActions.newScene`이 `t('newWork')`를 사용하도록 변경. 한국어 '새 작업', 영어 'New Work'(기존 'New'에서 헤더용으로 더 자연스럽게 확장)로 표시. 사용자가 명시적으로 빈 이름으로 저장(save/saveAs)할 때는 종전대로 `t('untitled')` 폴백 유지 — 사용자 의도가 다름.
- 번들 동기화(`dist/bundle.js`): `_newScene`의 `t('untitled')` → `t('newWork')`, 영어 사전 `newWork: 'New'` → `'New Work'`.

### 좌측 상단 제목이 중심 토픽을 따라가도록 변경

- 동기: 화면 좌측 상단 `#titleName`이 저장된 작업명(`scene.name`)만 보여줘서 사용자가 토픽을 정해도 헤더는 그대로였음. 화면의 정체성을 즉시 반영하도록 토픽 우선 표시로 전환.
- 동작: `updateTitle()`이 `scene.centerText` 트림 결과가 비어있지 않으면 그것을 표시하고, 비어있으면 종전대로 `scene.name`, 그래도 없으면 i18n `untitled` 폴백. 토픽 우선 → 이름 폴백 → "제목 없음" 순.
- 트리거: `app.ts`의 `store.subscribe`에 `updateTitle(this)` 추가 — 중심 텍스트가 어떤 경로(헤더 ✏️ 버튼, 빈 영역 더블클릭)로 바뀌어도 즉시 헤더에 반영.
- 번들 동기화(`dist/bundle.js`): `App.prototype._updateTitle` 본문 교체 + `store.subscribe` 콜백에 `_updateTitle()` 추가. TS `String.trim()` 대신 정규식 `replace`로 더 보수적인 ES5 호환 작성.

### 글자 크기 입력에 undo 지원 추가

- 동기: 글자 크기 입력은 이전부터 선택된 텍스트의 `fontSize`를 즉석에서 바꾸도록 동작했지만 `pushHistory()` 호출이 없어 되돌릴 수 없었음. 색상·굵기는 이번 작업에서 focus + 첫 input 플래그로 undo를 지원하도록 했으므로 글자 크기도 일관되게 맞춤.
- 동작: 텍스트가 선택돼 있을 때만 `fontHistoryPushed` 플래그가 false면 `pushHistory()`를 한 번 호출하고 true로 세팅. 같은 포커스 세션의 후속 input은 누적하지 않음. `focus` 이벤트에서 플래그 reset. 선택 없는 기본값 변경(`app.fontSize`)은 종전대로 push 안 함 — SceneData에 속하지 않으므로.
- 번들 동기화(`dist/bundle.js`): 동일 플래그 + focus/input 핸들러 추가.

### 선택된 화살표 / 하이라이터의 굵기 변경 지원

- 동기: 색상은 직전 작업으로 선택 객체에 적용되도록 했고, 굵기도 같은 selection-aware 패턴이 필요. 폰트 크기와 동일하게 굵기 입력이 선택 객체를 즉석에서 바꾸도록 함.
- 동작: 화살표·하이라이터가 선택돼 있으면 `#inputThickness`의 `input` 이벤트가 `store.update`로 그 객체의 `thickness`를 1..40 범위로 클램프해 변경. 텍스트가 선택돼 있거나 선택이 없으면 종전대로 `app.thickness`(기본값) 갱신. 텍스트는 `thickness` 필드가 없으므로 명시적으로 제외.
- 동기화: `syncThicknessInputToSelection(app)` 추가. `onSelect`·`store.subscribe`에서 호출해 입력 값을 선택 객체 굵기에 맞춤. 입력이 포커스 상태면 사용자 타이핑을 끊지 않도록 스킵(폰트 크기 입력과 동일 규칙).
- 커밋 처리: `change`/`Enter`에서 클램프된 실제 값으로 입력을 스냅. "100" 입력 → "40"으로 시각 보정.
- 히스토리: 색상 피커와 같은 focus + 첫 input 플래그 패턴(`thickHistoryPushed`). 한 번 포커스해 여러 자리 타이핑해도 undo 단계는 1개. 선택 없는 기본값 변경은 push하지 않음(SceneData에 속하지 않음).
- 번들 동기화(`dist/bundle.js`): thickness 블록 전체 교체, `App.prototype._syncThicknessInputToSelection` 추가, `onSelect`/`store.subscribe`에 호출 추가.
- 테스트 추가(1건): `SceneStore.update`로 화살표·하이라이터 두 타입의 `thickness`를 변경 가능함을 보장. 총 44 → 45개 통과.

### 선택된 객체의 색상 변경 지원

- 동기: 글자 크기 입력은 이미 선택된 텍스트의 `fontSize`를 즉석에서 바꾸지만 색상 입력은 기본값만 바꾸고 있어 사용자가 만든 객체의 색을 바꾸려면 지우고 다시 그려야 했음. 폰트 크기와 동일한 selection-aware 패턴을 색상에도 적용.
- 동작: 선택된 객체가 있으면 색상 피커(`#inputColor`)와 16색 팔레트 스와치 클릭이 그 객체의 `color`를 `store.update`로 변경, 없으면 종전대로 `app.color`(다음 신규 객체용 기본값)를 갱신. 화살표·텍스트·하이라이터 세 타입 모두 동일 적용 — 모든 `SceneObject`가 `color`를 가짐.
- 동기화: `syncColorInputToSelection(app)` 추가. 선택 변경(`onSelect`)과 store 변경(`store.subscribe`) 시 색상 입력 값과 활성 스와치를 선택 객체 색에 맞춤. 단, 색상 입력이 현재 포커스 상태면 네이티브 피커 드래그를 끊지 않도록 스킵.
- 히스토리:
  - 스와치 클릭은 1회 클릭당 `pushHistory()` 1번 — 명확한 단일 액션이므로.
  - 색상 피커는 `input` 이벤트가 드래그 중 연속 발화하므로 `focus` 시 플래그를 reset하고 첫 `input`에서만 `pushHistory()`. 같은 피커 세션의 후속 input은 히스토리를 누적하지 않음.
  - 선택이 없을 때(기본값만 바뀜)는 push 안 함 — 기본값은 SceneData에 속하지 않아 undo 대상이 아님.
- 번들 동기화(`dist/bundle.js`): UiBindings 색상 블록(스와치 핸들러·`applyColor` 도우미·picker focus/input 핸들러), `App.prototype._syncColorInputToSelection`, `onSelect` 콜백, `store.subscribe` 콜백 모두 미러.
- 테스트 추가(1건): `SceneStore.update`가 세 객체 타입의 `color` 필드를 모두 변경할 수 있음을 보장. 총 43 → 44개 통과.

## 2026-05-15

### 실행 취소 / 다시 실행 (Undo/Redo, 최대 8단계)

- 동기: 잘못 추가/이동/삭제한 객체를 되돌릴 수 있어야 편집 사이클이 빨라짐. 영구 저장이나 무한 히스토리는 과한 비용 — 세션 메모리에 8단계만.
- 데이터 모델: `SceneData`의 deep-clone 스냅샷 스택 2개 (`undoStack`, `redoStack`). 사용자 액션 직전에 push, 새 액션이 들어오면 `redoStack` 비움. 8 초과 시 `shift()`로 가장 오래된 항목 폐기.
- 캡처 시점(모두 "변경 직전" 보장):
  - `InputHandler.beginPointer`의 객체 hit 분기 — pending 스냅샷을 보관해두고, `movePointer`에서 실제로 mutating drag(move/resize)가 첫 프레임을 그릴 때 `flushPendingHistory`로 commit. 클릭만 하고 드래그 안 한 경우 `endPointer`에서 폐기 → no-op undo 진입 방지.
  - Clone-and-drag(Ctrl/⌘ + 객체 본체 드래그): 클론 자체가 mutation이므로 즉시 commit.
  - `endPointer`의 draft-arrow / draft-highlighter commit 직전.
  - `beginPointer`의 text 모드 dialog 콜백, addText 직전.
  - `KeyboardActions.insertArrow`, `insertTextAtViewportCenter`, `pasteClone` 진입부.
  - `FileActions.deleteSelected` 진입부.
  - `App` 콜백 `onDoubleClickEmpty`(중심 텍스트), `onDoubleClickText`(텍스트 내용) dialog OK 직후.
  - `UiBindings`의 `#btnEditCenter` 클릭 dialog OK 직후.
- 적용/복구: `applyHistorySnapshot`이 pan/zoom은 현재 값으로 유지(스크롤은 되돌리지 않음). 선택된 객체가 사라졌으면 selection clear.
- 폐기 시점: `adoptScene`(DB 로드/`newScene`) 시 두 스택 모두 비움 — 다른 timeline.
- UI:
  - `index.html` 툴바 "주제 편집" 다음에 ↩️ Undo / ↪️ Redo 버튼 추가. 초기 `disabled`, 스택 변화마다 `updateUndoRedoUi`로 토글.
  - `UiBindings`에서 setTip + click 핸들러 연결.
  - i18n: `undo`/`redo` 한·영 키 추가, `helpKeys`에 단축키 안내 추가.
- 단축키(`KeyboardActions.onKey`):
  - `Ctrl/⌘ + Z` (shift 아님) → `undo()`
  - `Ctrl/⌘ + Y` 또는 `Ctrl/⌘ + Shift + Z` → `redo()`
- 번들 동기화(`dist/bundle.js`): 모든 변경 미러 — `App.UNDO_LIMIT`, `_cloneSceneData`, `pushHistory`, `commitHistorySnapshot`, `undo`, `redo`, `_applyHistorySnapshot`, `_updateUndoRedoUi`. `InputHandler`에 `pendingHistorySnap`/`_snapshotScene`/`_flushPendingHistory`. `_onKey`에 Ctrl+Z/Y 분기.
- 테스트 추가(3건): pushHistory/undo/redo 라운드트립, 8단계 cap, commit이 redoStack을 비움. 총 40 → 43개 통과.
- 검증: `tsc --noEmit` 무에러, `node test/run_node.js` 43/43, `./build.sh`로 `release/index.html` 104,880 bytes.

### 색상 입력에도 Enter / change → 선택 버튼 포커스 이양 적용

- 동기: 글자/주제/굵기 입력과 통일성. 기존 `colorEl` `change` 핸들러는 `.blur()`로 body에 포커스를 떨궜는데, 명시적으로 `#btnSelect`로 보내 다른 입력과 동일한 destination 사용.
- 변경(`src/ui/UiBindings.ts`):
  - `colorEl` `change` 핸들러를 `colorEl.blur()` → `document.getElementById('btnSelect')?.focus()`로 변경. 네이티브 컬러 피커가 commit될 때 자동으로 선택 버튼으로 이양.
  - `colorEl` `keydown` 추가: Enter면 `preventDefault` 후 `#btnSelect.focus()` — 일부 브라우저는 피커를 열지 않고 입력 자체에서 Enter를 받기도 함.
- 번들 동기화(`dist/bundle.js`): 동일 변경.
- 검증: `tsc --noEmit` 무에러, `node test/run_node.js` 40/40 통과, `./build.sh`로 `release/index.html` 99,044 bytes 재생성.

### 굵기 입력에도 Enter → 선택 버튼 포커스 이양 적용

- 동기: 글자/주제 크기 입력에 적용한 Enter→focus 이양을 굵기(`inputThickness`)에도 동일하게.
- 변경(`src/ui/UiBindings.ts`): `thickEl`에 `keydown` 리스너 추가 — Enter면 `preventDefault`, 표시값을 현재 `app.thickness`로 스냅, `#btnSelect`로 `.focus()`. 기존엔 `change` 핸들러도 없었음.
- 번들 동기화(`dist/bundle.js`): `_bindUi` 안 thickEl `input` 직후에 동일 `keydown` 핸들러 삽입.
- 검증: `tsc --noEmit` 무에러, `node test/run_node.js` 40/40 통과, `./build.sh`로 `release/index.html` 98,539 bytes 재생성.

### 주제 크기 입력에도 Enter → 선택 버튼 포커스 이양 적용

- 동기: 직전 변경으로 `inputFontSize`(글자 크기)만 Enter→focus 이양이 적용됐는데, 주제 크기(`inputCenterFontSize`)도 동일 동작을 요청.
- 변경(`src/ui/UiBindings.ts`): `centerFontEl`에 동일 패턴의 `keydown` 리스너 추가 — Enter면 `preventDefault`, 표시값을 현재 `centerFontSize`로 스냅, `#btnSelect`로 `.focus()`.
- 번들 동기화(`dist/bundle.js`): `_bindUi` 안 centerFontEl `change` 직후에 동일 `keydown` 핸들러 삽입.
- 검증: `tsc --noEmit` 무에러, `node test/run_node.js` 40/40 통과, `./build.sh`로 `release/index.html` 98,129 bytes 재생성.

### 글자 크기 입력에서 Enter → 선택 버튼으로 포커스 이동

- 동기: `inputFontSize`에서 값 조정 후 곧장 키보드 단축키(V/A/T/G/Delete 등)를 쓰려고 했지만, `onKey`가 `(e.target as HTMLElement).tagName === 'INPUT'`인 경우 일찍 return하므로 포커스가 인풋에 있으면 단축키가 먹지 않았음. Enter로 값 커밋 후 자연스럽게 단축키 사용 가능하도록 포커스 이양.
- 변경(`src/ui/UiBindings.ts`): `inputFontSize`에 `keydown` 리스너 추가 — Enter면 기본 동작 차단 후 클램프 값으로 표시 동기화, `#btnSelect`로 `.focus()`. 기존 `change`(blur/Enter 공용) 핸들러는 그대로 둠.
- 번들 동기화(`dist/bundle.js`): 동일 `keydown` 핸들러를 `_bindUi` 내 fontEl change 직후에 추가.
- 영향 범위: `inputFontSize` 한정. `inputCenterFontSize`(주제 크기)는 사용자 요청 범위가 아니라 그대로 둠.
- 검증: `tsc --noEmit` 무에러, `node test/run_node.js` 40/40 통과, `./build.sh`로 `release/index.html` 97,653 bytes 재생성.

### README 최신화 (자동 저장 · 직선 형광펜 · 글자 크기 정수화)

- 동기: 최근 추가된 사용자 가시 기능 3종(자동 저장, Ctrl 직선 형광펜, 글자 크기 정수화)이 README에 누락되어 갱신.
- 변경:
  - 주요 기능: 형광펜 항목에 "Ctrl 직선 모드" 서브불릿, IndexedDB 항목을 "수동 저장" → "자동 저장(120초) + 페이지 이탈 강제 저장"으로 정정, 글자 크기 정수화 항목 신설.
  - 사용 안내: 형광펜 절차에 Ctrl 직선 모드 안내, 모바일 가상 Ctrl이 형광펜 모드에서 직선 토글 겸용임을 명시, 저장 절차에 자동 저장 동작 추가.
  - 키보드 단축키: `Ctrl/⌘ + 형광펜 드래그 — 직선 형광펜 스트로크` 항목 추가.
  - 테스트 케이스 수 35 → 40 (디렉토리 구조 트리·테스트 절 동기화).
- 검증: 변경은 문서뿐. 빌드/테스트 영향 없음(이전 커밋들의 산출물 유지).

### 형광펜 직선 모드 (Ctrl + 드래그)

- 동기: 자유 곡선 외에 강조 박스/밑줄용 깔끔한 직선이 자주 필요. 별도 도구 추가 없이 Ctrl 수정자로 토글.
- 동작: 형광펜 모드에서 마우스를 드래그할 때 `Ctrl`(또는 `⌘`)을 누르고 있으면 draft의 `points`를 `[시작점, 현재 포인터]` 단일 세그먼트로 압축. Ctrl을 떼면 그 지점부터 자유 곡선 재개. 즉 스트로크 도중에 Ctrl을 토글하면 누적된 곡선이 즉시 직선으로 "스냅"되고, 떼면 새 자유 구간을 이어 그릴 수 있음.
- 모바일: 물리 Ctrl이 없으므로 좌측 하단 가상 Ctrl 토글 버튼(`modifierClone`)을 동일 modifier로 재사용 — 형광펜 모드에서는 "직선", 선택 모드에서는 기존대로 "복제 드래그".
- 변경:
  - `InputHandler.movePointer(screen, wantsStraight=false)`로 시그니처 확장.
  - `onMouseMove`: `e.ctrlKey || e.metaKey || cb.getModifierClone()` 결과를 전달.
  - `onTouchMove`: `cb.getModifierClone()` 결과를 전달.
  - `draft-highlighter` 분기에서 `wantsStraight`면 `draft.points = [drag.startLogical, clampToCanvas(logical)]`로 덮어쓰기. 자유 곡선 경로(`HL_MIN_STEP_SCREEN` 임계 체크)는 기존 그대로.
  - 번들(`dist/bundle.js`)에는 `draft.points[0]`를 시작점으로 사용(번들 drag state에 `startLogical` 미보관)하여 동일 로직 적용.
- 도움말 갱신: `helpMouse`/`helpMobile`(ko·en) 항목에 "Ctrl + 드래그 (형광펜) — 직선 형광펜" / "Ctrl + drag (highlighter) — Straight stroke" 추가.
- 검증: `tsc --noEmit` 무에러, `node test/run_node.js` 40/40 통과, `./build.sh`로 `release/index.html` 97,055 bytes.

### 형광펜이 텍스트를 잡아 끄는 버그 수정

- 증상: 형광펜 모드에서 글자(텍스트 객체) 위를 시작점으로 드래그하면, 스트로크가 생성되지 않고 텍스트가 선택되며 따라 움직임. 그어진 형광펜 흔적은 없고 글자만 끌려가 화면이 "꼬임".
- 원인: `InputHandler.beginPointer`가 모드 확인 전에 `hitTest`를 먼저 수행. 객체에 맞으면 무조건 `selectedId` 갱신 + `move-object` 드래그로 분기 → 형광펜 모드도 텍스트 바디 히트에 가로채임.
- 수정: `beginPointer` 진입부에서 `mode === 'highlighter'`를 최우선으로 처리하여 hit-test를 건너뛰고 곧바로 `draft-highlighter`를 시작. 기존 빈 공간용 highlighter 분기는 도달 불가가 되므로 제거(중복 코드 제거).
- 영향 범위:
  - `arrow` 모드는 그대로 — 화살표 모드에서 글자 위 드래그는 기존대로 글자 이동. 사용자가 보고한 증상은 형광펜만이라 보수적으로 한정.
  - 형광펜 모드는 선택 상태가 강제 해제(`onSelect(null)`)되어 핸들 클릭으로 인한 추가 꼬임도 차단.
- 번들 동기화: `dist/bundle.js`의 `_begin`도 동일하게 mode 분기를 맨 위로 끌어올리고 중복 highlighter 블록 제거.
- 검증: `tsc --noEmit` 무에러, `node test/run_node.js` 40/40 통과, `./build.sh`로 `release/index.html` 95,976 bytes 재생성. release에서 새 주석 매칭 확인.

### 자동 저장(120초) + 페이지 이탈 강제 저장

- 동기: 그동안 저장은 사용자가 명시적으로 Ctrl+S/툴바를 눌러야만 발생. 장시간 편집 후 탭/창을 닫으면 작업이 통째로 날아갈 수 있었음.
- 정책:
  - 오브젝트 변화(스토어 emit)로 `dirty`가 처음 true가 될 때 120초 타이머 무장. 같은 윈도 안의 추가 변경은 타이머를 **리셋하지 않음** → 연속 편집에서도 첫 변경 후 2분 이내에는 한 번 저장. (디바운스 대신 "bounded staleness".)
  - 수동 `Save`/`Save As` 성공 시 `dirty=false`로 내리고 대기 중인 타이머 취소.
  - `adoptScene`(DB 로드, `newScene`) 진입 시 타이머 취소.
  - 페이지 종료(`beforeunload`/`pagehide`/`visibilitychange→hidden`) 시 `dirty`면 즉시 `autosaveNow()` 호출(IDB 비동기지만 대부분 브라우저가 진행 중 트랜잭션 커밋 허용).
  - 자동 저장은 이름 프롬프트를 띄우지 않고 현재 씬 이름 그대로 silent save. 실패는 콘솔 경고만, UI는 침묵.
- TS 변경(`src/app.ts`):
  - `autosaveTimer`/`AUTOSAVE_DELAY_MS=120_000` 필드 도입.
  - `armAutosave`/`cancelAutosave`/`autosaveNow` 메서드 추가.
  - 스토어 subscribe 콜백에 `armAutosave()` 끼움.
  - 생성자에 `beforeunload`/`pagehide`/`visibilitychange` 리스너 등록.
  - `adoptScene` 진입 시 `cancelAutosave()` 호출.
- TS 변경(`src/app/FileActions.ts`): `save`/`saveAs` 성공 직후 `app.cancelAutosave()`. `saveAs`에 누락돼 있던 `dirty=false`도 함께 정리.
- 번들 동기화: `dist/bundle.js`에 동일 로직 — `autosaveTimer` 필드, `_armAutosave`/`_cancelAutosave`/`_autosaveNow` 프로토타입 메서드, 스토어 subscribe·생성자 리스너·`_save`/`_saveAs`/`_adoptScene` 갱신.
- 검증: `tsc --noEmit` 무에러, `node test/run_node.js` 40/40 통과, `./build.sh`로 `release/index.html` 95,654 bytes. release에서 `autosave`/`beforeunload`/`pagehide` 17회 매칭 확인.

### 글자 크기 정수화 (소수점 차단)

- 동기: 글자/중심 텍스트의 `fontSize`가 입력·리사이즈·과거 DB/JSON에서 소수값으로 흘러 들어와 렌더링 미세 변동과 비교 오류를 유발할 수 있었음. 모든 경로에서 정수만 허용하도록 정리.
- 추가: `src/models/types.ts`에 `floorFontSize(n, fallback)`과 `normalizeSceneFontSizes(scene)` 헬퍼를 도입.
  - `floorFontSize`: 유한 수면 `Math.floor`, 아니면 `fallback`(기본 `DEFAULT_CENTER_FONT_SIZE`)으로 대체하고 최소 1 보장.
  - `normalizeSceneFontSizes`: 씬의 `centerFontSize`와 모든 `TextObject.fontSize`를 일괄 버림 처리.
- 적용 지점(TS):
  - `SceneStore.setCenterFontSize` / `SceneStore.addText`에서 진입값을 `floorFontSize`로 정리(기존 8~200 clamp 유지).
  - `InputHandler` 텍스트 리사이즈 드래그에서 `Math.floor(orig.fontSize * ratio)`로 갱신.
  - `UiBindings`의 글자 크기/중심 글자 크기 입력 핸들러에서 `Math.floor(parseFloat(...))` 적용.
  - `App.adoptScene` 진입 시 `normalizeSceneFontSizes(scene)` 호출 — DB에서 불러온 레거시 씬과 `newScene` 모두 커버.
  - `IndexedDBStore.importAll`에서 각 씬을 저장 전 `normalizeSceneFontSizes`로 보정(JSON 임포트 경로).
- 번들 동기화: `dist/bundle.js`에도 동일 로직 반영 — 헬퍼 추가, `setCenterFontSize`/`addText`/리사이즈/`importAll`/`_adoptScene`/UI 핸들러 갱신, `floorFontSize`·`normalizeSceneFontSizes`·`DEFAULT_CENTER_FONT_SIZE`를 `ArrowApp` 익스포트에 노출.
- 테스트: `test/test_arrow.js`에 5개 케이스 추가 — `setCenterFontSize` 버림, `addText` 버림, `floorFontSize`의 폴백 처리, `normalizeSceneFontSizes`의 레거시 씬 복구·결손 필드 처리. `node test/run_node.js` 40/40 통과.
- 빌드: `tsc --noEmit` 무에러, `./build.sh`로 `release/index.html` 93,625 bytes 재생성. release에서 `floorFontSize`/`normalizeSceneFontSizes` 10회 매칭 확인.

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
