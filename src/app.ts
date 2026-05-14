import { CanvasView } from './canvas/CanvasView.js';
import { Renderer } from './canvas/Renderer.js';
import { SceneStore } from './models/SceneStore.js';
import { ArrowObject, SceneData, emptyScene } from './models/types.js';
import { InputHandler, EditorMode } from './input/InputHandler.js';
import { IndexedDBStore, SceneSummary } from './storage/IndexedDBStore.js';
import { LangCode, getLang, setLang, t } from './i18n/lang.js';
import { MAX_CANVAS_SIZE, Vec, clampToCanvas } from './utils/geometry.js';
import { customPrompt } from './ui/CustomPrompt.js';

// Top-level controller that ties together the renderer, store, input handler,
// and DOM toolbar/panel. Exposed via window.startApp by the bundled HTML.
export class App {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private view = new CanvasView();
  private store = new SceneStore();
  private renderer: Renderer;
  private input!: InputHandler;
  private db = new IndexedDBStore();

  private mode: EditorMode = 'select';
  private color = '#222';
  private thickness = 4;
  private fontSize = 28;

  private selectedId: string | null = null;
  private draftArrow: ArrowObject | null = null;
  private dirty = false;
  private worksList: SceneSummary[] = [];

  constructor(root: HTMLElement) {
    this.canvas = root.querySelector('#mainCanvas') as HTMLCanvasElement;
    if (!this.canvas) throw new Error('canvas #mainCanvas not found');
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('2d context unavailable');
    this.ctx = ctx;
    this.renderer = new Renderer(this.ctx, this.view);
    this.input = new InputHandler(this.canvas, this.view, this.store, {
      getMode: () => this.mode,
      setMode: (m) => this.setMode(m),
      getColor: () => this.color,
      getThickness: () => this.thickness,
      getFontSize: () => this.fontSize,
      onChange: () => this.requestRender(),
      onSelect: (id) => { this.selectedId = id; this.updateSelectionUi(); },
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
    });

    this.store.subscribe(() => { this.dirty = true; this.requestRender(); });
    window.addEventListener('resize', () => { this.resize(); this.requestRender(); });
    // ResizeObserver catches container resizes that don't trigger window
    // resize (e.g. header wrapping on narrow widths). Keeps the canvas buffer
    // sized to the container so no gap appears below it.
    if (typeof ResizeObserver !== 'undefined') {
      const wrap = this.canvas.parentElement;
      if (wrap) new ResizeObserver(() => { this.resize(); this.requestRender(); }).observe(wrap);
    }
    window.addEventListener('keydown', (e) => this.onKey(e));
    this.resize();
    this.bindUi();
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
    await this.refreshWorks();
    this.requestRender();
  }

  private adoptScene(scene: SceneData): void {
    this.store.replace(scene);
    this.view.offset = { x: scene.viewOffsetX, y: scene.viewOffsetY };
    this.view.scale = scene.viewScale > 0 ? scene.viewScale : 1;
    this.selectedId = null;
    this.dirty = false;
    this.updateTitle();
    this.requestRender();
  }

  // --- Rendering ---
  private renderScheduled = false;
  private requestRender(): void {
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

  // --- UI wiring ---
  private bindUi(): void {
    const $ = (sel: string) => document.querySelector(sel) as HTMLElement;
    ($('#btnSelect')).addEventListener('click', () => this.setMode('select'));
    ($('#btnArrow')).addEventListener('click', () => this.setMode('arrow'));
    ($('#btnText')).addEventListener('click', () => this.setMode('text'));
    ($('#btnPan')).addEventListener('click', () => this.setMode('pan'));
    ($('#btnSave')).addEventListener('click', () => void this.save());
    ($('#btnSaveAs')).addEventListener('click', () => void this.saveAs());
    ($('#btnNew')).addEventListener('click', () => this.newScene());
    ($('#btnExportPng')).addEventListener('click', () => this.exportPng());
    ($('#btnExportJson')).addEventListener('click', () => void this.exportJson());
    ($('#btnImportJson')).addEventListener('click', () => this.importJsonClick());
    ($('#fileImport')).addEventListener('change', (e) => this.handleImportFile(e));
    ($('#btnLang')).addEventListener('click', () => this.toggleLang());
    ($('#btnEditCenter')).addEventListener('click', () => {
      void customPrompt(t('promptCenter'), this.store.get().centerText).then((txt) => {
        if (txt !== null) this.store.setCenterText(txt);
      });
    });
    ($('#btnFit')).addEventListener('click', () => this.fitToScreen());
    ($('#btnZoomIn')).addEventListener('click', () => {
      this.view.zoomAt({ x: this.view.width / 2, y: this.view.height / 2 }, 1.2);
      this.requestRender();
    });
    ($('#btnZoomOut')).addEventListener('click', () => {
      this.view.zoomAt({ x: this.view.width / 2, y: this.view.height / 2 }, 1 / 1.2);
      this.requestRender();
    });
    ($('#btnDelete')).addEventListener('click', () => this.deleteSelected());
    ($('#btnWorks')).addEventListener('click', () => this.openWorksModal());

    const colorEl = $('#inputColor') as HTMLInputElement;
    colorEl.value = this.color;
    colorEl.addEventListener('input', () => { this.color = colorEl.value; });
    const thickEl = $('#inputThickness') as HTMLInputElement;
    thickEl.value = String(this.thickness);
    thickEl.addEventListener('input', () => { this.thickness = parseFloat(thickEl.value) || 4; });
    const fontEl = $('#inputFontSize') as HTMLInputElement;
    fontEl.value = String(this.fontSize);
    fontEl.addEventListener('input', () => { this.fontSize = parseFloat(fontEl.value) || 28; });

    this.applyLangToUi();
    this.updateModeUi();
    this.updateSelectionUi();
    this.updateTitle();
  }

  private setMode(m: EditorMode): void {
    this.mode = m;
    this.updateModeUi();
  }

  private updateModeUi(): void {
    const map: Record<EditorMode, string> = {
      select: 'btnSelect',
      arrow: 'btnArrow',
      text: 'btnText',
      pan: 'btnPan',
    };
    for (const k of Object.keys(map) as EditorMode[]) {
      const el = document.getElementById(map[k]);
      if (!el) continue;
      el.classList.toggle('active', k === this.mode);
    }
    document.body.dataset.mode = this.mode;
  }

  private updateSelectionUi(): void {
    const btn = document.getElementById('btnDelete');
    if (btn) btn.toggleAttribute('disabled', !this.selectedId);
  }

  private updateTitle(): void {
    const el = document.getElementById('titleName');
    if (el) el.textContent = this.store.get().name || t('untitled');
  }

  private applyLangToUi(): void {
    const setText = (id: string, key: string) => {
      const el = document.getElementById(id);
      if (el) el.textContent = t(key);
    };
    // Icon buttons keep their emoji and use title for the i18n tooltip.
    const setTip = (id: string, key: string) => {
      const el = document.getElementById(id);
      if (el) el.title = t(key);
    };
    setTip('btnSelect', 'modeSelect');
    setTip('btnArrow', 'modeArrow');
    setTip('btnText', 'modeText');
    setTip('btnPan', 'modePan');
    setTip('btnSave', 'save');
    setTip('btnSaveAs', 'saveAs');
    setTip('btnNew', 'newWork');
    setTip('btnExportPng', 'exportPng');
    setTip('btnExportJson', 'exportJson');
    setTip('btnImportJson', 'importJson');
    setTip('btnEditCenter', 'editCenter');
    setTip('btnFit', 'fit');
    setTip('btnZoomIn', 'zoomIn');
    setTip('btnZoomOut', 'zoomOut');
    setTip('btnDelete', 'delete');
    setTip('btnWorks', 'works');
    // Language toggle: tooltip describes the target language.
    const langEl = document.getElementById('btnLang');
    if (langEl) langEl.title = getLang() === 'ko' ? 'Switch to English' : '한국어로 전환';
    setText('labelColor', 'selectColor');
    setText('labelThickness', 'thickness');
    setText('labelFontSize', 'fontSize');
    document.title = t('appTitle');
    this.updateTitle();
    this.renderWorks();
  }

  private toggleLang(): void {
    const next: LangCode = getLang() === 'ko' ? 'en' : 'ko';
    setLang(next);
    this.applyLangToUi();
  }

  // --- File / DB actions ---
  private async ensureName(): Promise<string | null> {
    let name = this.store.get().name;
    if (!name || name === '새 작업' || name === 'Untitled') {
      const input = await customPrompt(t('promptName'), '');
      if (input === null) return null;
      name = input.trim() || t('untitled');
      this.store.setName(name);
    }
    return name;
  }

  private async save(): Promise<void> {
    const name = await this.ensureName();
    if (name === null) return;
    const scene = this.store.get();
    scene.viewOffsetX = this.view.offset.x;
    scene.viewOffsetY = this.view.offset.y;
    scene.viewScale = this.view.scale;
    await this.db.saveScene(scene);
    await this.db.setMeta('lastSceneId', scene.id);
    this.dirty = false;
    await this.refreshWorks();
    this.flashStatus(t('saved'));
  }

  private async saveAs(): Promise<void> {
    const input = await customPrompt(t('promptName'), this.store.get().name);
    if (input === null) return;
    const next: SceneData = JSON.parse(JSON.stringify(this.store.get()));
    next.id = 'scene_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    next.name = input.trim() || t('untitled');
    next.createdAt = Date.now();
    next.updatedAt = Date.now();
    this.store.replace(next);
    await this.db.saveScene(next);
    await this.db.setMeta('lastSceneId', next.id);
    await this.refreshWorks();
    this.updateTitle();
    this.flashStatus(t('saved'));
  }

  private newScene(): void {
    if (this.dirty && !window.confirm('변경사항이 있습니다. 새로 만들까요? / Unsaved changes. New work?')) {
      return;
    }
    this.adoptScene(emptyScene(t('untitled')));
    this.view.scale = 1;
    this.view.offset = { x: MAX_CANVAS_SIZE / 2 - this.view.width / 2, y: MAX_CANVAS_SIZE / 2 - this.view.height / 2 };
    this.requestRender();
  }

  private deleteSelected(): void {
    if (!this.selectedId) return;
    if (!window.confirm(t('confirmDeleteSelected'))) return;
    this.store.remove(this.selectedId);
    this.selectedId = null;
    this.updateSelectionUi();
  }

  private exportPng(): void {
    const cropped = this.renderer.renderToImage(this.store.get());
    const url = cropped.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = (this.store.get().name || 'arrow') + '.png';
    a.click();
  }

  private async exportJson(): Promise<void> {
    const all = await this.db.exportAll();
    const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'arrow-mindmap-export.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private importJsonClick(): void {
    const inp = document.getElementById('fileImport') as HTMLInputElement;
    inp.value = '';
    inp.click();
  }

  private async handleImportFile(e: Event): Promise<void> {
    const inp = e.target as HTMLInputElement;
    const file = inp.files && inp.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const count = await this.db.importAll(payload, true);
      await this.refreshWorks();
      this.flashStatus(count + t('importedCount'));
    } catch (err) {
      console.warn(err);
      window.alert(t('invalidJson'));
    }
  }

  private async refreshWorks(): Promise<void> {
    try {
      this.worksList = await this.db.listScenes();
    } catch {
      this.worksList = [];
    }
    this.renderWorks();
  }

  private worksModalEl: HTMLElement | null = null;
  private worksModalCleanup: (() => void) | null = null;
  private worksSortKey: 'name' | 'date' = 'date';

  private openWorksModal(): void {
    if (this.worksModalEl) return;
    void this.refreshWorks();
    const overlay = document.createElement('div');
    overlay.className = 'ap-overlay';
    const card = document.createElement('div');
    card.className = 'ap-card ap-works-card';
    const header = document.createElement('div');
    header.className = 'ap-works-head';
    const title = document.createElement('div');
    title.className = 'ap-title';
    title.textContent = t('works');
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'ap-btn';
    closeBtn.textContent = t('close');
    header.append(title, closeBtn);

    const sortBar = document.createElement('div');
    sortBar.className = 'ap-works-sort';
    const sortLabel = document.createElement('span');
    sortLabel.className = 'ap-sort-label';
    sortLabel.textContent = t('sortLabel') + ':';
    const makeSortBtn = (key: 'name' | 'date', label: string): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ap-btn ap-btn-sm ap-sort-btn' + (this.worksSortKey === key ? ' active' : '');
      b.textContent = label;
      b.dataset.sort = key;
      b.addEventListener('click', () => {
        this.worksSortKey = key;
        this.renderWorks();
      });
      return b;
    };
    sortBar.append(sortLabel, makeSortBtn('name', t('sortByName')), makeSortBtn('date', t('sortByDate')));

    const listEl = document.createElement('ul');
    listEl.className = 'ap-works-list';
    listEl.id = 'worksList';
    card.append(header, sortBar, listEl);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    this.worksModalEl = overlay;

    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape') { ev.preventDefault(); this.closeWorksModal(); }
    };
    document.addEventListener('keydown', onKey, true);
    this.worksModalCleanup = () => document.removeEventListener('keydown', onKey, true);
    closeBtn.addEventListener('click', () => this.closeWorksModal());
    overlay.addEventListener('mousedown', (ev) => { if (ev.target === overlay) this.closeWorksModal(); });

    this.renderWorks();
  }

  private renderWorks(): void {
    if (!this.worksModalEl) return;
    const ul = this.worksModalEl.querySelector('#worksList') as HTMLUListElement | null;
    if (!ul) return;
    // Sync sort-button active state.
    const sortBtns = this.worksModalEl.querySelectorAll('.ap-sort-btn');
    sortBtns.forEach((b) => {
      const el = b as HTMLElement;
      el.classList.toggle('active', el.dataset.sort === this.worksSortKey);
    });
    ul.innerHTML = '';
    const current = this.store.get().id;
    if (this.worksList.length === 0) {
      const empty = document.createElement('li');
      empty.className = 'ap-works-empty';
      empty.textContent = t('noWorks');
      ul.appendChild(empty);
      return;
    }
    const sorted = this.worksList.slice().sort((a, b) => {
      if (this.worksSortKey === 'name') return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      return b.updatedAt - a.updatedAt;
    });
    for (const w of sorted) {
      const li = document.createElement('li');
      li.className = 'ap-works-item' + (w.id === current ? ' current' : '');
      const name = document.createElement('span');
      name.className = 'work-name';
      name.textContent = w.name;
      name.title = new Date(w.updatedAt).toLocaleString();
      const loadBtn = document.createElement('button');
      loadBtn.type = 'button';
      loadBtn.className = 'ap-btn ap-btn-sm';
      loadBtn.textContent = t('load');
      loadBtn.addEventListener('click', () => void this.loadWork(w.id));
      const renameBtn = document.createElement('button');
      renameBtn.type = 'button';
      renameBtn.className = 'ap-btn ap-btn-sm';
      renameBtn.textContent = t('rename');
      renameBtn.addEventListener('click', () => void this.renameWork(w));
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'ap-btn ap-btn-sm';
      delBtn.textContent = t('delete');
      delBtn.addEventListener('click', () => void this.deleteWork(w));
      li.append(name, loadBtn, renameBtn, delBtn);
      ul.appendChild(li);
    }
  }

  private async loadWork(id: string): Promise<void> {
    if (this.dirty && !window.confirm('변경사항이 있습니다. 불러올까요? / Discard changes?')) return;
    const scene = await this.db.loadScene(id);
    if (!scene) return;
    this.adoptScene(scene);
    await this.db.setMeta('lastSceneId', id);
    this.closeWorksModal();
  }

  private closeWorksModal(): void {
    if (!this.worksModalEl) return;
    if (this.worksModalCleanup) this.worksModalCleanup();
    this.worksModalEl.remove();
    this.worksModalEl = null;
    this.worksModalCleanup = null;
  }

  private async renameWork(w: SceneSummary): Promise<void> {
    const name = await customPrompt(t('promptRename'), w.name);
    if (name === null) return;
    await this.db.renameScene(w.id, name.trim() || t('untitled'));
    if (w.id === this.store.get().id) {
      this.store.setName(name.trim() || t('untitled'));
    }
    await this.refreshWorks();
  }

  private async deleteWork(w: SceneSummary): Promise<void> {
    if (!window.confirm(t('confirmDelete'))) return;
    await this.db.deleteScene(w.id);
    if (w.id === this.store.get().id) {
      this.newScene();
    }
    await this.refreshWorks();
  }

  private fitToScreen(): void {
    const scene = this.store.get();
    if (scene.objects.length === 0) {
      const center: Vec = { x: MAX_CANVAS_SIZE / 2, y: MAX_CANVAS_SIZE / 2 };
      this.view.scale = 1;
      this.view.centerOn(center);
      this.requestRender();
      return;
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const o of scene.objects) {
      if (o.type === 'arrow') {
        minX = Math.min(minX, o.from.x, o.to.x);
        minY = Math.min(minY, o.from.y, o.to.y);
        maxX = Math.max(maxX, o.from.x, o.to.x);
        maxY = Math.max(maxY, o.from.y, o.to.y);
      } else {
        minX = Math.min(minX, o.pos.x);
        minY = Math.min(minY, o.pos.y);
        maxX = Math.max(maxX, o.pos.x + o.fontSize * Math.max(2, o.text.length));
        maxY = Math.max(maxY, o.pos.y + o.fontSize * 1.4);
      }
    }
    const padding = 80;
    const w = maxX - minX + padding * 2;
    const h = maxY - minY + padding * 2;
    const scale = Math.max(0.1, Math.min(2, Math.min(this.view.width / w, this.view.height / h)));
    this.view.scale = scale;
    this.view.centerOn({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 });
    this.requestRender();
  }

  private onKey(e: KeyboardEvent): void {
    if (e.target && (e.target as HTMLElement).tagName === 'INPUT') return;
    if (this.worksModalEl) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (this.selectedId) {
        e.preventDefault();
        this.deleteSelected();
      }
    } else if (e.key === 'Insert') {
      e.preventDefault();
      this.insertArrow();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      this.insertTextAtViewportCenter();
    } else if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void this.save();
    } else if (e.key === 'a') this.setMode('arrow');
    else if (e.key === 't') this.setMode('text');
    else if (e.key === 'v') this.setMode('select');
    else if (e.key === 'h') this.setMode('pan');
  }

  // Opens the text-input modal and places the typed text at the current
  // viewport center. Bound to Enter for keyboard-driven text entry.
  private insertTextAtViewportCenter(): void {
    const center = this.view.screenToLogical({ x: this.view.width / 2, y: this.view.height / 2 });
    void customPrompt(t('promptText'), '').then((text) => {
      if (!text || !text.trim()) return;
      const obj = this.store.addText(center, text.trim(), this.fontSize, this.color);
      this.selectedId = obj.id;
      this.input.setSelected(obj.id);
      this.setMode('select');
    });
  }

  // Adds a horizontal arrow positioned to the upper-right of any existing
  // arrows so consecutive Insert presses stagger outward. When no arrows
  // exist yet, fall back to the current viewport center.
  private insertArrow(): void {
    const visibleLogicalW = this.view.width / this.view.scale;
    const lengthLogical = Math.max(60, Math.min(400, visibleLogicalW * 0.25));
    const gap = Math.max(20, lengthLogical * 0.2);

    const arrows = this.store.get().objects.filter((o) => o.type === 'arrow') as ArrowObject[];
    let from: Vec;
    if (arrows.length === 0) {
      const c = this.view.screenToLogical({ x: this.view.width / 2, y: this.view.height / 2 });
      from = { x: c.x - lengthLogical / 2, y: c.y };
    } else {
      let maxX = -Infinity, minY = Infinity;
      for (const a of arrows) {
        maxX = Math.max(maxX, a.from.x, a.to.x);
        minY = Math.min(minY, a.from.y, a.to.y);
      }
      from = { x: maxX + gap, y: minY - gap };
    }
    const to: Vec = { x: from.x + lengthLogical, y: from.y };
    const fromC = clampToCanvas(from);
    const toC: Vec = { x: clampToCanvas(to).x, y: fromC.y };
    const created = this.store.addArrow(fromC, toC, this.color, this.thickness);
    this.selectedId = created.id;
    this.input.setSelected(created.id);
    this.setMode('select');
    this.flashStatus('+ arrow');
  }

  private flashStatus(msg: string): void {
    const el = document.getElementById('statusBar');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('visible');
    setTimeout(() => el.classList.remove('visible'), 1400);
  }
}
