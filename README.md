# 화살표 마인드맵 (Arrow Mind Map)

HTML5 Canvas + TypeScript 기반의 변형 마인드맵 웹앱입니다.
**오직 화살표와 글자만** 사용하여 가운데 주제로부터 생각을 펼칠 수 있습니다.

> "Arrow" only mind map — a Canvas-based mind mapping tool that supports only
> arrows and text objects radiating from a single center topic.

## 주요 기능

- 🎯 **가운데 주제**: 캔버스 중앙에 주제 텍스트를 두고 자유롭게 편집
- ➡️ **화살표 그리기**: 빈 곳을 클릭/드래그하여 화살표 추가
  - 끝점 핸들로 방향과 길이 조절
  - 가운데 핸들로 통째 이동
- 🔤 **글자 객체**: 단어/문장 입력 후 이동 및 크기 조절 가능
- 🔍 **확대/축소**:
  - 마우스 휠 또는 ＋/－ 버튼
  - 모바일에서 두 손가락 핀치 줌
- 📐 **고정 4096×4096 캔버스** + 자유 패닝(Shift+드래그, 가운데 버튼, 또는 "이동" 모드)
- 💾 **IndexedDB 자동 저장**: 작업물 여러 개를 이름으로 관리, 이어하기 지원
  - 작업 이름 변경 / 삭제 / 불러오기
  - 전체 작업물을 JSON으로 내보내기 / 가져오기
- 🖼️ **PNG 내보내기**: 현재 작업을 고해상도 PNG로 저장
- 🌐 **한국어 / 영어 인터페이스 토글**
- 📱 **PC + 모바일 터치 UI 지원**
- 🚫 **외부 라이브러리 없음** — `python -m http.server`로 바로 실행 가능

## 실행 방법

### 1. 개발 모드

```sh
python -m http.server 8001
```

이후 브라우저에서 [http://localhost:8001](http://localhost:8001) 열기.

### 2. 단일 파일 릴리즈 빌드

`release/index.html` 한 파일로 묶어 모든 외부 참조를 인라인합니다.

- macOS / Linux:
  ```sh
  ./build.sh
  ```
- Windows (한글 깨짐 방지를 위해 cp949 사용):
  ```bat
  build.bat
  ```

빌드 결과는 `release/index.html` 하나로 떨어지며, 더블 클릭만으로 열 수 있습니다.

## 디렉토리 구조

```
arrow/
├─ index.html              # 개발용 진입점 (dist/bundle.js 참조)
├─ dist/bundle.js          # 빌드된 단일 JS 번들
├─ src/                    # TypeScript 소스 (모듈별 분리)
│  ├─ main.ts
│  ├─ app.ts
│  ├─ canvas/CanvasView.ts, Renderer.ts
│  ├─ models/types.ts, SceneStore.ts
│  ├─ input/InputHandler.ts
│  ├─ storage/IndexedDBStore.ts
│  ├─ i18n/lang.ts
│  └─ utils/geometry.ts
├─ test/                   # 단위 테스트 (브라우저 + Node)
│  ├─ test_runner.html
│  ├─ test_arrow.js
│  └─ run_node.js
├─ scripts/inline_build.py # release 빌드 헬퍼
├─ build.sh / build.bat
├─ history.md              # 작업 이력
└─ release/index.html      # 빌드 산출물
```

## 사용 안내

1. 상단의 **"화살표"** 버튼을 누른 뒤 캔버스 빈 곳을 드래그하면 화살표가 만들어집니다.
2. **"글자"** 모드에서 캔버스를 클릭하면 입력창이 열립니다.
3. 객체를 클릭하면 핸들이 나타납니다.
   - 화살표 끝점(파랑) — 방향/길이 조절
   - 화살표 중점(노랑) — 통째 이동
   - 글자 우하단 핸들 — 글자 크기 조절
4. 객체를 더블 클릭하면 글자 내용을 다시 입력할 수 있습니다.
5. 빈 곳을 더블 클릭하면 **가운데 주제 텍스트**를 편집합니다.
6. **저장** 버튼을 누르면 IndexedDB에 저장됩니다. 다음 방문 시 마지막 작업이 자동으로 복원됩니다.
7. 우측 패널의 작업물 목록에서 다른 작업을 불러오거나 삭제/이름변경할 수 있습니다.

## 키보드 단축키

- `V` — 선택 모드
- `A` — 화살표 모드
- `T` — 글자 모드
- `H` — 이동 모드
- `Insert` — 현재 화면 중앙에 가로 화살표 즉시 추가
- `Delete` / `Backspace` — 선택 객체 삭제
- `Ctrl/⌘ + S` — 저장

## 테스트

```sh
# Node (geometry, SceneStore, i18n)
node test/run_node.js

# 브라우저 (전체 모듈)
python -m http.server 8001
# 이후 http://localhost:8001/test/test_runner.html 열기
```

## 라이선스

본 저장소의 `LICENSE` 파일을 따릅니다.

## 작업 이력

`history.md` 참고.
