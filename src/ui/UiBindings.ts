import type { App } from '../app.js';
import type { EditorMode } from '../input/InputHandler.js';
import { DEFAULT_CENTER_FONT_SIZE } from '../models/types.js';
import { LangCode, getLang, setLang, t } from '../i18n/lang.js';
import { customPrompt } from './CustomPrompt.js';
import {
  deleteSelected,
  exportJson,
  exportPng,
  fitToScreen,
  handleImportFile,
  importJsonClick,
  newScene,
  save,
  saveAs,
} from '../app/FileActions.js';
import { openHelpModal, openWorksModal, renderWorks } from './Modals.js';

const PALETTE_16: readonly string[] = [
  '#000000', '#424242', '#9e9e9e', '#ffffff',
  '#f44336', '#ff9800', '#ffeb3b', '#4caf50',
  '#00bcd4', '#2196f3', '#3f51b5', '#9c27b0',
  '#e91e63', '#795548', '#009688', '#607d8b',
];

export function bindUi(app: App): void {
  const $ = (sel: string): HTMLElement => document.querySelector(sel) as HTMLElement;
  ($('#btnSelect')).addEventListener('click', () => setMode(app, 'select'));
  ($('#btnArrow')).addEventListener('click', () => setMode(app, 'arrow'));
  ($('#btnText')).addEventListener('click', () => setMode(app, 'text'));
  ($('#btnHighlighter')).addEventListener('click', () => setMode(app, 'highlighter'));
  ($('#btnPan')).addEventListener('click', () => setMode(app, 'pan'));
  ($('#btnSave')).addEventListener('click', () => void save(app));
  ($('#btnSaveAs')).addEventListener('click', () => void saveAs(app));
  ($('#btnNew')).addEventListener('click', () => void newScene(app));
  ($('#btnExportPng')).addEventListener('click', () => exportPng(app));
  ($('#btnExportJson')).addEventListener('click', () => void exportJson(app));
  ($('#btnImportJson')).addEventListener('click', () => importJsonClick());
  ($('#fileImport')).addEventListener('change', (e) => void handleImportFile(app, e));
  ($('#btnLang')).addEventListener('click', () => toggleLang(app));
  ($('#btnEditCenter')).addEventListener('click', () => {
    void customPrompt(t('promptCenter'), app.store.get().centerText).then((txt) => {
      if (txt !== null) app.store.setCenterText(txt);
    });
  });
  ($('#btnFit')).addEventListener('click', () => fitToScreen(app));
  ($('#btnZoomIn')).addEventListener('click', () => {
    app.view.zoomAt({ x: app.view.width / 2, y: app.view.height / 2 }, 1.2);
    app.requestRender();
  });
  ($('#btnZoomOut')).addEventListener('click', () => {
    app.view.zoomAt({ x: app.view.width / 2, y: app.view.height / 2 }, 1 / 1.2);
    app.requestRender();
  });
  ($('#btnDelete')).addEventListener('click', () => void deleteSelected(app));
  ($('#btnWorks')).addEventListener('click', () => openWorksModal(app));
  ($('#btnHelp')).addEventListener('click', () => openHelpModal(app));

  // Virtual Ctrl: sticky toggle that mirrors physical Ctrl/⌘ for drag-clone.
  // Tapping toggles; remains active until tapped again, so users can clone
  // several objects without re-tapping the button each time (TODO #15).
  const ctrlBtn = document.getElementById('btnVirtualCtrl');
  if (ctrlBtn) {
    ctrlBtn.addEventListener('click', () => {
      app.modifierClone = !app.modifierClone;
      ctrlBtn.classList.toggle('active', app.modifierClone);
    });
  }

  const colorEl = $('#inputColor') as HTMLInputElement;
  colorEl.value = app.color;
  const paletteEl = $('#colorPalette') as HTMLDivElement;
  const updatePaletteActive = (hex: string): void => {
    const target = hex.toLowerCase();
    paletteEl.querySelectorAll<HTMLButtonElement>('.swatch').forEach((b) => {
      b.classList.toggle('active', (b.dataset.color || '').toLowerCase() === target);
    });
  };
  for (const hex of PALETTE_16) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'swatch';
    btn.style.background = hex;
    btn.dataset.color = hex;
    btn.title = hex.toUpperCase();
    btn.addEventListener('click', () => {
      app.color = hex;
      colorEl.value = hex;
      updatePaletteActive(hex);
      // Return focus to body so keyboard shortcuts (+, Enter, Delete, ...) keep working.
      colorEl.blur();
      btn.blur();
    });
    paletteEl.appendChild(btn);
  }
  updatePaletteActive(app.color);
  colorEl.addEventListener('input', () => {
    app.color = colorEl.value;
    updatePaletteActive(colorEl.value);
  });
  // After the native color picker commits, hand focus back to the body so
  // keyboard shortcuts (+ to insert arrow, Enter, Delete, ...) work again.
  colorEl.addEventListener('change', () => { colorEl.blur(); });

  const thickEl = $('#inputThickness') as HTMLInputElement;
  thickEl.value = String(app.thickness);
  thickEl.addEventListener('input', () => { app.thickness = parseFloat(thickEl.value) || 4; });

  const fontEl = $('#inputFontSize') as HTMLInputElement;
  fontEl.value = String(app.fontSize);
  fontEl.addEventListener('input', () => {
    const raw = parseFloat(fontEl.value);
    if (!Number.isFinite(raw)) return;
    const n = Math.floor(raw);
    const sel = app.getSelectedObject();
    if (sel && sel.type === 'text') {
      // Resize the currently selected text instead of changing the default.
      app.store.update(sel.id, (o) => { if (o.type === 'text') o.fontSize = Math.max(8, Math.min(200, n)); });
    } else {
      app.fontSize = n || 28;
    }
  });
  // On commit (blur / Enter), snap the field to the actual clamped value
  // so an out-of-range entry like "5" visually corrects to "8".
  fontEl.addEventListener('change', () => {
    const sel = app.getSelectedObject();
    if (sel && sel.type === 'text') fontEl.value = String(sel.fontSize);
    else fontEl.value = String(app.fontSize);
  });
  // Enter in the font-size field hands focus back to the Select-mode button
  // so the user can immediately use keyboard shortcuts (V/A/T/G, Delete, ...)
  // — those are suppressed while focus is inside an INPUT.
  fontEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const sel = app.getSelectedObject();
    if (sel && sel.type === 'text') fontEl.value = String(sel.fontSize);
    else fontEl.value = String(app.fontSize);
    const btnSelect = document.getElementById('btnSelect');
    btnSelect?.focus();
  });

  const centerFontEl = $('#inputCenterFontSize') as HTMLInputElement;
  centerFontEl.value = String(app.store.get().centerFontSize ?? DEFAULT_CENTER_FONT_SIZE);
  centerFontEl.addEventListener('input', () => {
    const raw = parseFloat(centerFontEl.value);
    if (!Number.isFinite(raw)) return;
    app.store.setCenterFontSize(Math.floor(raw));
  });
  centerFontEl.addEventListener('change', () => {
    centerFontEl.value = String(app.store.get().centerFontSize ?? DEFAULT_CENTER_FONT_SIZE);
  });
  // Mirror of #inputFontSize: Enter commits the value and hands focus back to
  // the Select-mode button so keyboard shortcuts resume working.
  centerFontEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    centerFontEl.value = String(app.store.get().centerFontSize ?? DEFAULT_CENTER_FONT_SIZE);
    const btnSelect = document.getElementById('btnSelect');
    btnSelect?.focus();
  });

  applyLangToUi(app);
  updateModeUi(app);
  updateSelectionUi(app);
  updateTitle(app);
}

export function setMode(app: App, m: EditorMode): void {
  app.mode = m;
  updateModeUi(app);
}

export function updateModeUi(app: App): void {
  const map: Record<EditorMode, string> = {
    select: 'btnSelect',
    arrow: 'btnArrow',
    text: 'btnText',
    highlighter: 'btnHighlighter',
    pan: 'btnPan',
  };
  for (const k of Object.keys(map) as EditorMode[]) {
    const el = document.getElementById(map[k]);
    if (!el) continue;
    el.classList.toggle('active', k === app.mode);
  }
  document.body.dataset.mode = app.mode;
}

export function updateSelectionUi(app: App): void {
  const btn = document.getElementById('btnDelete');
  if (btn) btn.toggleAttribute('disabled', !app.selectedId);
}

export function updateTitle(app: App): void {
  const el = document.getElementById('titleName');
  if (el) el.textContent = app.store.get().name || t('untitled');
}

export function applyLangToUi(app: App): void {
  const setText = (id: string, key: string): void => {
    const el = document.getElementById(id);
    if (el) el.textContent = t(key);
  };
  // Icon buttons keep their emoji and use title for the i18n tooltip.
  const setTip = (id: string, key: string): void => {
    const el = document.getElementById(id);
    if (el) el.title = t(key);
  };
  setTip('btnSelect', 'modeSelect');
  setTip('btnArrow', 'modeArrow');
  setTip('btnText', 'modeText');
  setTip('btnHighlighter', 'modeHighlighter');
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
  setTip('btnHelp', 'help');
  setTip('btnVirtualCtrl', 'cloneToggle');
  // Language toggle: tooltip describes the target language.
  const langEl = document.getElementById('btnLang');
  if (langEl) langEl.title = getLang() === 'ko' ? 'Switch to English' : '한국어로 전환';
  setText('labelColor', 'selectColor');
  setText('labelThickness', 'thickness');
  setText('labelFontSize', 'fontSize');
  setText('labelCenterFontSize', 'centerFontSize');
  document.title = t('appTitle');
  updateTitle(app);
  renderWorks(app);
}

export function toggleLang(app: App): void {
  const next: LangCode = getLang() === 'ko' ? 'en' : 'ko';
  setLang(next);
  applyLangToUi(app);
}

export function syncCenterFontInput(app: App): void {
  const el = document.getElementById('inputCenterFontSize') as HTMLInputElement | null;
  if (el) el.value = String(app.store.get().centerFontSize ?? DEFAULT_CENTER_FONT_SIZE);
}

// When the selection changes, mirror the font-size input to the selected
// text's size so the user sees the current value and edits it in place.
// For non-text selections, fall back to the default for new text.
export function syncFontInputToSelection(app: App): void {
  const el = document.getElementById('inputFontSize') as HTMLInputElement | null;
  if (!el) return;
  // Don't clobber the user's in-progress typing. The clamp on commit would
  // otherwise jump "1" → "8" mid-typing and prevent ever reaching "12".
  if (document.activeElement === el) return;
  const sel = app.getSelectedObject();
  if (sel && sel.type === 'text') el.value = String(sel.fontSize);
  else el.value = String(app.fontSize);
}
