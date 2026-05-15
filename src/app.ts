import { CanvasView } from './canvas/CanvasView.js';
import { Renderer } from './canvas/Renderer.js';
import { SceneStore } from './models/SceneStore.js';
import {
  ArrowObject,
  DEFAULT_CENTER_FONT_SIZE,
  HighlighterObject,
  SceneData,
  SceneObject,
} from './models/types.js';
import { EditorMode, InputHandler } from './input/InputHandler.js';
import { IndexedDBStore, SceneSummary } from './storage/IndexedDBStore.js';
import { t } from './i18n/lang.js';
import { customPrompt } from './ui/CustomPrompt.js';
import {
  bindUi,
  setMode,
  syncCenterFontInput,
  syncFontInputToSelection,
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

  private renderScheduled = false;

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
      },
      onDoubleClickEmpty: () => {
        void customPrompt(t('promptCenter'), this.store.get().centerText).then((txt) => {
          if (txt !== null) this.store.setCenterText(txt);
        });
      },
      onDoubleClickText: (obj) => {
        void customPrompt(t('promptText'), obj.text).then((txt) => {
          if (txt !== null) this.store.update(obj.id, (o) => { if (o.type === 'text') o.text = txt; });
        });
      },
      onDraftChange: (draft) => { this.draftArrow = draft; },
      onDraftHighlighter: (draft) => { this.draftHighlighter = draft; },
    });

    this.store.subscribe(() => {
      this.dirty = true;
      syncFontInputToSelection(this);
      this.requestRender();
    });
    window.addEventListener('resize', () => { this.resize(); this.requestRender(); });
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
    this.store.replace(scene);
    this.view.offset = { x: scene.viewOffsetX, y: scene.viewOffsetY };
    this.view.scale = scene.viewScale > 0 ? scene.viewScale : 1;
    this.selectedId = null;
    this.dirty = false;
    updateTitle(this);
    syncCenterFontInput(this);
    this.requestRender();
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
