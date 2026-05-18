// Single bundle entry point. esbuild rolls this and its dependency graph into
// dist/bundle.js as an IIFE. The IIFE exposes ArrowApp on `window` (for the
// browser app + browser test runner) and on `module.exports` (for the Node
// test runner) so the same artifact serves both paths.
//
// Keep this file as a thin re-export surface. Logic belongs in the modules.

import { MAX_CANVAS_SIZE, vecDist, pointToSegmentDistance, clampToCanvas } from './utils/geometry.js';
import { App } from './app.js';
import { CanvasView } from './canvas/CanvasView.js';
import { Renderer } from './canvas/Renderer.js';
import { SceneStore, estimateNoteBox, measureNoteBox } from './models/SceneStore.js';
import { InputHandler } from './input/InputHandler.js';
import { IndexedDBStore } from './storage/IndexedDBStore.js';
import { parseArrowFile } from './storage/ArrowFile.js';
import {
  DEFAULT_CENTER_FONT_SIZE,
  NOTE_DEFAULT_BG,
  NOTE_DEFAULT_FONT_SIZE,
  NOTE_DEFAULT_WIDTH,
  NOTE_MAX_LENGTH,
  NOTE_MAX_WIDTH,
  NOTE_MIN_WIDTH,
  clampNoteText,
  emptyScene,
  floorFontSize,
  migrateSceneWorld,
  newId,
  normalizeSceneFontSizes,
  pickReadableTextColor,
} from './models/types.js';
import { getLang, setLang, t } from './i18n/lang.js';
import { createDropdownMenu } from './ui/Dropdown.js';

// The shape every test expects. Keep additions paired with test-file updates.
const ArrowApp = {  // eslint-disable-line @typescript-eslint/no-redeclare
  MAX_CANVAS_SIZE,
  vecDist,
  pointToSegmentDistance,
  clampToCanvas,
  newId,
  emptyScene,
  parseArrowFile,
  floorFontSize,
  normalizeSceneFontSizes,
  migrateSceneWorld,
  clampNoteText,
  estimateNoteBox,
  measureNoteBox,
  pickReadableTextColor,
  NOTE_MAX_LENGTH,
  NOTE_DEFAULT_BG,
  NOTE_DEFAULT_FONT_SIZE,
  NOTE_DEFAULT_WIDTH,
  NOTE_MIN_WIDTH,
  NOTE_MAX_WIDTH,
  DEFAULT_CENTER_FONT_SIZE,
  CanvasView,
  Renderer,
  SceneStore,
  IndexedDBStore,
  InputHandler,
  App,
  setLang,
  getLang,
  t,
  createDropdownMenu,
};

// Expose the ArrowApp surface on the global object. In browsers
// `globalThis === window`, so `window.ArrowApp` is hit too. In Node the
// test runner pre-installs a `global.window = {}` shim — relying on that
// alone misses `globalThis.ArrowApp`, which the build-time CJS footer
// (scripts/build.mjs) reads to set `module.exports`. So go straight to
// globalThis and both code paths line up.
(globalThis as unknown as { ArrowApp: typeof ArrowApp }).ArrowApp = ArrowApp;

// Boot the app when running in a browser with a DOM. The Node test runner
// has neither `document` nor `#app`, so it short-circuits here without
// touching the App constructor.
function boot(): void {
  const root = document.getElementById('app');
  if (!root) {
    console.error('Root element #app not found');
    return;
  }
  // Exposed under a separate global so tests can poke at the live instance
  // when debugging in a browser; never relied on by the test suite itself.
  (window as unknown as { __arrowApp: App }).__arrowApp = new App(root);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
}
