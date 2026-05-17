import { CanvasView } from './canvas/CanvasView.js';
import { Renderer } from './canvas/Renderer.js';
import { SceneStore } from './models/SceneStore.js';
import {
  ArrowObject,
  DEFAULT_CENTER_FONT_SIZE,
  HighlighterObject,
  SceneData,
  SceneObject,
  normalizeSceneFontSizes,
} from './models/types.js';
import { EditorMode, InputHandler } from './input/InputHandler.js';
import { IndexedDBStore, SceneSummary } from './storage/IndexedDBStore.js';
import { t } from './i18n/lang.js';
import { customPrompt } from './ui/CustomPrompt.js';
import {
  bindUi,
  setMode,
  syncCenterFontInput,
  syncColorInputToSelection,
  syncFontInputToSelection,
  syncThicknessInputToSelection,
  updateSelectionUi,
  updateTitle,
} from './ui/UiBindings.js';
import { refreshWorks } from './ui/Modals.js';
import { onKey } from './app/KeyboardActions.js';

// Top-level controller: owns shared state, ties together the renderer, store,
// input handler, and DOM. Behavior is split across:
//   - ui/UiBindings.ts        toolbar wiring, mode/lang/title sync
//   - ui/Modals.ts            works / help modals
//   - app/FileActions.ts      save/load/import/export/new/delete/fit
//   - app/KeyboardActions.ts  keyboard shortcuts + insert/copy/paste helpers
// Fields below are App-internal — modified only from those modules and App's
// own methods. They are not marked `private` so the split modules can read
// and write them without going through accessor boilerplate.
export class App {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  view = new CanvasView();
  store = new SceneStore();
  renderer: Renderer;
  input!: InputHandler;
  db = new IndexedDBStore();

  mode: EditorMode = 'select';
  color = '#222222';
  thickness = 4;
  fontSize = 28;

  selectedId: string | null = null;
  draftArrow: ArrowObject | null = null;
  draftHighlighter: HighlighterObject | null = null;
  dirty = false;
  worksList: SceneSummary[] = [];
  // Internal clipboard for Ctrl+C / Ctrl+V cloning. Holds a deep snapshot so
  // edits to the original after Copy don't bleed into future Pastes.
  clipboard: SceneObject | null = null;

  worksModalEl: HTMLElement | null = null;
  worksModalCleanup: (() => void) | null = null;
  worksSortKey: 'name' | 'date' = 'date';
  helpModalEl: HTMLElement | null = null;
  helpModalCleanup: (() => void) | null = null;

  // Virtual Ctrl toggle (mobile): when true, the next pointer-drag on an
  // object body is treated as a clone-and-drag, same as physical Ctrl/⌘.
  modifierClone = false;

  private renderScheduled = false;
  // Autosave: first object change after a clean state arms a 120s timer; on
  // fire, the scene is silently persisted. Further changes within the window
  // do NOT reset the timer (bounded staleness), so even continuous editing
  // saves within two minutes of the first change.
  private autosaveTimer: number | null = null;
  private static readonly AUTOSAVE_DELAY_MS = 120_000;

  // Snapshot-based undo/redo. Each entry is a deep clone of SceneData captured
  // *before* a mutating user operation. Capped to UNDO_LIMIT — beyond that the
  // oldest entry is dropped. View (pan/zoom) is intentionally preserved across
  // undo so scrolling is not a step the user can accidentally undo.
  private static readonly UNDO_LIMIT = 8;
  undoStack: SceneData[] = [];
  redoStack: SceneData[] = [];

  constructor(root: HTMLElement) {
    this.canvas = root.querySelector('#mainCanvas') as HTMLCanvasElement;
    if (!this.canvas) throw new Error('canvas #mainCanvas not found');
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    this.ctx = ctx;
    this.renderer = new Renderer(this.ctx, this.view);
    this.input = new InputHandler(this.canvas, this.view, this.store, {
      getMode: () => this.mode,
      setMode: (m) => setMode(this, m),
      getColor: () => this.color,
      getThickness: () => this.thickness,
      getFontSize: () => this.fontSize,
      onChange: () => this.requestRender(),
      onSelect: (id) => {
        this.selectedId = id;
        updateSelectionUi(this);
        syncFontInputToSelection(this);
        syncColorInputToSelection(this);
        syncThicknessInputToSelection(this);
      },
      onDoubleClickEmpty: () => {
        void customPrompt(t('promptCenter'), this.store.get().centerText).then((txt) => {
          if (txt !== null) {
            this.pushHistory();
            this.store.setCenterText(txt);
          }
        });
      },
      onDoubleClickText: (obj) => {
        void customPrompt(t('promptText'), obj.text).then((txt) => {
          if (txt !== null) {
            this.pushHistory();
            this.store.update(obj.id, (o) => { if (o.type === 'text') o.text = txt; });
          }
        });
      },
      onDoubleClickNote: (obj) => {
        void customPrompt(t('promptNote'), obj.text, '', { multiline: true, maxLength: 255 }).then((txt) => {
          if (txt !== null) {
            this.pushHistory();
            this.store.update(obj.id, (o) => {
              if (o.type === 'note') o.text = txt.length > 255 ? txt.slice(0, 255) : txt;
            });
          }
        });
      },
      onDraftChange: (draft) => { this.draftArrow = draft; },
      onDraftHighlighter: (draft) => { this.draftHighlighter = draft; },
      getModifierClone: () => this.modifierClone,
      commitHistorySnapshot: (snap) => { this.commitHistorySnapshot(snap); },
    });

    this.store.subscribe(() => {
      this.dirty = true;
      this.armAutosave();
      syncFontInputToSelection(this);
      syncColorInputToSelection(this);
      syncThicknessInputToSelection(this);
      updateTitle(this);
      this.requestRender();
    });
    window.addEventListener('resize', () => { this.resize(); this.requestRender(); });
    // Best-effort flush before the tab goes away. beforeunload handles desktop
    // close/refresh; pagehide + visibilitychange catch mobile/iOS bfcache cases
    // where beforeunload does not fire. We kick off the async IDB write — most
    // browsers let in-flight transactions commit during teardown.
    const flush = (): void => { this.cancelAutosave(); if (this.dirty) void this.autosaveNow(); };
    window.addEventListener('beforeunload', flush);
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
    // ResizeObserver catches container resizes that don't trigger window
    // resize (e.g. header wrapping on narrow widths). Keeps the canvas buffer
    // sized to the container so no gap appears below it.
    if (typeof ResizeObserver !== 'undefined') {
      const wrap = this.canvas.parentElement;
      if (wrap) new ResizeObserver(() => { this.resize(); this.requestRender(); }).observe(wrap);
    }
    window.addEventListener('keydown', (e) => onKey(this, e));
    this.resize();
    bindUi(this);
    this.requestRender();
    void this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    try {
      const lastId = await this.db.getMeta<string>('lastSceneId');
      if (lastId) {
        const scene = await this.db.loadScene(lastId);
        if (scene) {
          this.adoptScene(scene);
        }
      }
    } catch (e) {
      // Storage may be unavailable (private mode, corrupted state). Continue with empty scene.
      console.warn('Could not restore last scene:', e);
    }
    await refreshWorks(this);
    this.requestRender();
  }

  adoptScene(scene: SceneData): void {
    if (scene.centerFontSize == null) scene.centerFontSize = DEFAULT_CENTER_FONT_SIZE;
    // Legacy scenes (DB or imported JSON) may carry decimal font sizes from
    // pre-integer builds. Coerce to integers on entry so the rest of the app
    // can assume integer math.
    normalizeSceneFontSizes(scene);
    this.cancelAutosave();
    // Different scene = different timeline. Drop any in-memory undo history so
    // pressing Undo right after Load doesn't restore the previous scene's state.
    this.undoStack = [];
    this.redoStack = [];
    this.store.replace(scene);
    this.view.offset = { x: scene.viewOffsetX, y: scene.viewOffsetY };
    this.view.scale = scene.viewScale > 0 ? scene.viewScale : 1;
    this.selectedId = null;
    this.dirty = false;
    updateTitle(this);
    syncCenterFontInput(this);
    this.updateUndoRedoUi();
    this.requestRender();
  }

  // Capture the current scene state and push it onto the undo stack. Use this
  // *immediately before* a synchronous mutation so the snapshot represents the
  // pre-change state. For drags, prefer commitHistorySnapshot() which lets the
  // InputHandler stash a snapshot at gesture start and only commit it once a
  // real mutation occurs (avoids no-op undo entries from click-without-drag).
  pushHistory(): void {
    this.commitHistorySnapshot(this.cloneSceneData());
  }

  commitHistorySnapshot(snap: SceneData): void {
    this.undoStack.push(snap);
    if (this.undoStack.length > App.UNDO_LIMIT) this.undoStack.shift();
    // New action invalidates the redo branch — standard editor semantics.
    this.redoStack = [];
    this.updateUndoRedoUi();
  }

  undo(): void {
    if (this.undoStack.length === 0) return;
    const current = this.cloneSceneData();
    this.redoStack.push(current);
    if (this.redoStack.length > App.UNDO_LIMIT) this.redoStack.shift();
    const prev = this.undoStack.pop() as SceneData;
    this.applyHistorySnapshot(prev);
    this.updateUndoRedoUi();
  }

  redo(): void {
    if (this.redoStack.length === 0) return;
    const current = this.cloneSceneData();
    this.undoStack.push(current);
    if (this.undoStack.length > App.UNDO_LIMIT) this.undoStack.shift();
    const next = this.redoStack.pop() as SceneData;
    this.applyHistorySnapshot(next);
    this.updateUndoRedoUi();
  }

  private cloneSceneData(): SceneData {
    return JSON.parse(JSON.stringify(this.store.get())) as SceneData;
  }

  // Replace the scene with a historical snapshot. Pan/zoom is intentionally
  // kept at its current value so undo doesn't scroll the canvas. If the
  // selected object no longer exists in the restored scene, clear selection.
  private applyHistorySnapshot(scene: SceneData): void {
    scene.viewOffsetX = this.view.offset.x;
    scene.viewOffsetY = this.view.offset.y;
    scene.viewScale = this.view.scale;
    this.store.replace(scene);
    if (this.selectedId && !scene.objects.find((o) => o.id === this.selectedId)) {
      this.selectedId = null;
      this.input.setSelected(null);
    }
  }

  updateUndoRedoUi(): void {
    const u = document.getElementById('btnUndo');
    const r = document.getElementById('btnRedo');
    if (u) u.toggleAttribute('disabled', this.undoStack.length === 0);
    if (r) r.toggleAttribute('disabled', this.redoStack.length === 0);
  }

  armAutosave(): void {
    if (this.autosaveTimer != null) return;
    this.autosaveTimer = window.setTimeout(() => {
      this.autosaveTimer = null;
      void this.autosaveNow();
    }, App.AUTOSAVE_DELAY_MS);
  }

  cancelAutosave(): void {
    if (this.autosaveTimer != null) {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
    }
  }

  // Silent persist of the current scene. Skips the name prompt so the timer
  // and unload paths never block on user input. Failures are swallowed (logged
  // only) because a failed autosave should not break the editor.
  async autosaveNow(): Promise<void> {
    if (!this.dirty) return;
    const scene = this.store.get();
    scene.viewOffsetX = this.view.offset.x;
    scene.viewOffsetY = this.view.offset.y;
    scene.viewScale = this.view.scale;
    try {
      await this.db.saveScene(scene);
      await this.db.setMeta('lastSceneId', scene.id);
      this.dirty = false;
    } catch (e) {
      console.warn('autosave failed', e);
    }
  }

  getSelectedObject(): SceneObject | null {
    if (!this.selectedId) return null;
    return this.store.get().objects.find((o) => o.id === this.selectedId) || null;
  }

  requestRender(): void {
    if (this.renderScheduled) return;
    this.renderScheduled = true;
    requestAnimationFrame(() => {
      this.renderScheduled = false;
      this.draw();
    });
  }

  private draw(): void {
    this.renderer.render(this.store.get(), {
      selectedId: this.selectedId,
      draftArrow: this.draftArrow,
      draftHighlighter: this.draftHighlighter,
      showGrid: true,
    });
  }

  private resize(): void {
    const dpr = window.devicePixelRatio || 1;
    const wrap = this.canvas.parentElement as HTMLElement;
    const rect = wrap.getBoundingClientRect();
    // CSS keeps the canvas display size at 100% of the wrap (inset:0 in
    // index.html), so we only need to size the bitmap buffer here.
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.view.resize(rect.width, rect.height, dpr);
  }

  flashStatus(msg: string): void {
    const el = document.getElementById('statusBar');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('visible');
    setTimeout(() => el.classList.remove('visible'), 1400);
  }
}
