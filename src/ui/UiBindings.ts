import type { App } from '../app.js';
import type { EditorMode } from '../input/InputHandler.js';
import { DEFAULT_CENTER_FONT_SIZE, pickReadableTextColor } from '../models/types.js';
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
import { insertChain } from '../app/KeyboardActions.js';
import { openHelpModal, openWorksModal, renderWorks } from './Modals.js';
import { createDropdownMenu, DropdownItem } from './Dropdown.js';

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
  const btnNote = document.getElementById('btnNote');
  if (btnNote) btnNote.addEventListener('click', () => setMode(app, 'note'));
  ($('#btnPan')).addEventListener('click', () => setMode(app, 'pan'));
  ($('#btnSave')).addEventListener('click', () => void save(app));
  ($('#fileImport')).addEventListener('change', (e) => void handleImportFile(app, e));
  bindFileMenu(app);
  bindEditMenu(app);
  bindHelpMenu(app);
  const btnUndo = document.getElementById('btnUndo');
  if (btnUndo) btnUndo.addEventListener('click', () => app.undo());
  const btnRedo = document.getElementById('btnRedo');
  if (btnRedo) btnRedo.addEventListener('click', () => app.redo());
  ($('#btnFit')).addEventListener('click', () => fitToScreen(app));
  ($('#btnDelete')).addEventListener('click', () => void deleteSelected(app));
  const btnPin = document.getElementById('btnPinNote');
  if (btnPin) btnPin.addEventListener('click', () => {
    app.togglePinSelectedNote();
    updateSelectionUi(app);
  });

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
  // Apply a chosen color. When an object is selected, recolor it in place;
  // otherwise update the default color used for newly created objects. Notes
  // are special-cased: the color picker drives the sticky-note **background**
  // and the text color is auto-chosen for contrast — one control, no fighting
  // unreadable yellow-on-yellow.
  const applyColor = (hex: string): void => {
    const sel = app.getSelectedObject();
    if (sel && sel.type === 'note') {
      const textColor = pickReadableTextColor(hex);
      app.store.update(sel.id, (o) => {
        if (o.type !== 'note') return;
        o.bgColor = hex;
        o.color = textColor;
      });
    } else if (sel) {
      app.store.update(sel.id, (o) => { o.color = hex; });
    } else {
      app.color = hex;
    }
    colorEl.value = hex;
    updatePaletteActive(hex);
  };
  for (const hex of PALETTE_16) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'swatch';
    btn.style.background = hex;
    btn.dataset.color = hex;
    btn.title = hex.toUpperCase();
    btn.addEventListener('click', () => {
      if (app.selectedId) app.pushHistory();
      applyColor(hex);
      // Return focus to body so keyboard shortcuts (+, Enter, Delete, ...) keep working.
      colorEl.blur();
      btn.blur();
    });
    paletteEl.appendChild(btn);
  }
  updatePaletteActive(app.color);
  // One undo snapshot per picker session: the first `input` event after focus
  // captures the pre-edit scene; subsequent inputs in the same drag don't pile
  // up history entries. Reset on focus so the next session captures fresh.
  let pickerHistoryPushed = false;
  colorEl.addEventListener('focus', () => { pickerHistoryPushed = false; });
  colorEl.addEventListener('input', () => {
    if (!pickerHistoryPushed && app.selectedId) {
      app.pushHistory();
      pickerHistoryPushed = true;
    }
    applyColor(colorEl.value);
  });
  // After the native color picker commits, hand focus to the Select-mode
  // button so keyboard shortcuts (+ / Enter / Delete / V·A·T·G·H) resume —
  // same destination as the size / thickness inputs.
  colorEl.addEventListener('change', () => {
    const btnSelect = document.getElementById('btnSelect');
    btnSelect?.focus();
  });
  // Some browsers also let users commit the color with Enter while the input
  // itself has focus (without opening the picker). Mirror the same handoff.
  colorEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const btnSelect = document.getElementById('btnSelect');
    btnSelect?.focus();
  });

  const thickEl = $('#inputThickness') as HTMLInputElement;
  thickEl.value = String(app.thickness);
  // One undo snapshot per editing session: the first `input` event after focus
  // captures the pre-edit scene; subsequent edits in the same focused session
  // don't pile up history entries. Reset on focus so the next session captures.
  let thickHistoryPushed = false;
  thickEl.addEventListener('focus', () => { thickHistoryPushed = false; });
  thickEl.addEventListener('input', () => {
    const raw = parseFloat(thickEl.value);
    if (!Number.isFinite(raw)) return;
    const sel = app.getSelectedObject();
    if (sel && (sel.type === 'arrow' || sel.type === 'highlighter')) {
      if (!thickHistoryPushed) {
        app.pushHistory();
        thickHistoryPushed = true;
      }
      const clamped = Math.max(1, Math.min(40, raw));
      app.store.update(sel.id, (o) => {
        if (o.type === 'arrow' || o.type === 'highlighter') o.thickness = clamped;
      });
    } else {
      app.thickness = raw || 4;
    }
  });
  // On commit (blur / Enter), snap the field to the actual clamped value so
  // an out-of-range entry like "100" visually corrects to "40".
  thickEl.addEventListener('change', () => {
    const sel = app.getSelectedObject();
    if (sel && (sel.type === 'arrow' || sel.type === 'highlighter')) {
      thickEl.value = String(sel.thickness);
    } else {
      thickEl.value = String(app.thickness);
    }
  });
  // Mirror of #inputFontSize: Enter commits and hands focus back to the
  // Select-mode button so keyboard shortcuts resume working.
  thickEl.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const sel = app.getSelectedObject();
    if (sel && (sel.type === 'arrow' || sel.type === 'highlighter')) {
      thickEl.value = String(sel.thickness);
    } else {
      thickEl.value = String(app.thickness);
    }
    const btnSelect = document.getElementById('btnSelect');
    btnSelect?.focus();
  });

  const fontEl = $('#inputFontSize') as HTMLInputElement;
  fontEl.value = String(app.fontSize);
  // One undo snapshot per editing session: the first `input` event after
  // focus captures the pre-edit scene; subsequent edits in the same focused
  // session don't pile up history entries. Reset on focus.
  let fontHistoryPushed = false;
  fontEl.addEventListener('focus', () => { fontHistoryPushed = false; });
  fontEl.addEventListener('input', () => {
    const raw = parseFloat(fontEl.value);
    if (!Number.isFinite(raw)) return;
    const n = Math.floor(raw);
    const sel = app.getSelectedObject();
    if (sel && sel.type === 'text') {
      if (!fontHistoryPushed) {
        app.pushHistory();
        fontHistoryPushed = true;
      }
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

  applyLangToUi(app);
  updateModeUi(app);
  updateSelectionUi(app);
  updateTitle(app);
}

// File menu — content + persistence actions consolidated under one trigger
// so the mobile toolbar stays compact. The same menu is used on desktop for
// visual consistency (option B in the design discussion). 💾 Save remains a
// top-level toolbar button because it is the most frequent action.
function bindFileMenu(app: App): void {
  const trigger = document.getElementById('btnFile') as HTMLButtonElement | null;
  if (!trigger) return;
  const items: DropdownItem[] = [
    {
      emoji: '🎯',
      label: () => t('editCenter'),
      onSelect: () => {
        void customPrompt(t('promptCenter'), app.store.get().centerText).then((txt) => {
          if (txt !== null) {
            app.pushHistory();
            app.store.setCenterText(txt);
          }
        });
      },
      separatorAfter: true,
    },
    { emoji: '🆕', label: () => t('newWork'), onSelect: () => void newScene(app) },
    { emoji: '📝', label: () => t('saveAs'), onSelect: () => void saveAs(app) },
    { emoji: '📋', label: () => t('works'), onSelect: () => openWorksModal(app), separatorAfter: true },
    { emoji: '🖼️', label: () => t('exportPng'), onSelect: () => exportPng(app) },
    { emoji: '📤', label: () => t('exportJson'), onSelect: () => void exportJson(app) },
    { emoji: '📥', label: () => t('importJson'), onSelect: () => importJsonClick() },
  ];
  createDropdownMenu(trigger, items);
}

// Edit menu — actions that need a typed value (topic font size) or a small
// free-form prompt (chain insert). Hosting these in a menu keeps the toolbar
// uncluttered while leaving the operations one tap away.
function bindEditMenu(app: App): void {
  const trigger = document.getElementById('btnEdit') as HTMLButtonElement | null;
  if (!trigger) return;
  const zoomAtCenter = (factor: number): void => {
    app.view.zoomAt({ x: app.view.width / 2, y: app.view.height / 2 }, factor);
    app.requestRender();
  };
  const items: DropdownItem[] = [
    {
      emoji: '🔠',
      label: () => t('centerFontSize'),
      onSelect: () => {
        const current = String(app.store.get().centerFontSize ?? DEFAULT_CENTER_FONT_SIZE);
        void customPrompt(t('promptCenterFontSize'), current).then((raw) => {
          if (raw === null) return;
          const n = parseInt(raw.trim(), 10);
          // Silently ignore non-numeric input — the store clamps the value
          // to 8..200 for us once a finite number is provided.
          if (!Number.isFinite(n)) return;
          app.store.setCenterFontSize(n);
        });
      },
    },
    {
      emoji: '🦀',
      label: () => t('chainInsert'),
      onSelect: () => {
        void customPrompt(t('chainInsert'), '', t('chainPlaceholder')).then((raw) => {
          if (raw === null) return;
          const n = insertChain(app, raw);
          if (n > 0) app.flashStatus('+ chain (' + n + ')');
        });
      },
      separatorAfter: true,
    },
    { emoji: '➕', label: () => t('zoomIn'), onSelect: () => zoomAtCenter(1.2) },
    { emoji: '➖', label: () => t('zoomOut'), onSelect: () => zoomAtCenter(1 / 1.2) },
  ];
  createDropdownMenu(trigger, items);
}

// Help menu — language toggle and the help modal live here. The language
// label flips with the current language so users always see the *target*
// language (the one the click will switch to).
function bindHelpMenu(app: App): void {
  const trigger = document.getElementById('btnHelpMenu') as HTMLButtonElement | null;
  if (!trigger) return;
  const items: DropdownItem[] = [
    {
      emoji: '🌐',
      label: () => (getLang() === 'ko' ? t('switchToEnglish') : t('switchToKorean')),
      onSelect: () => toggleLang(app),
    },
    { emoji: '❓', label: () => t('help'), onSelect: () => openHelpModal(app) },
  ];
  createDropdownMenu(trigger, items);
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
    note: 'btnNote',
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
  // Pin button: only active for note selections. Reflects current pin state
  // with the .active class so the user can see whether the toggle will pin
  // or unpin on the next click.
  const pinBtn = document.getElementById('btnPinNote');
  if (pinBtn) {
    const sel = app.getSelectedObject();
    const isNote = !!sel && sel.type === 'note';
    pinBtn.toggleAttribute('disabled', !isNote);
    pinBtn.classList.toggle('active', isNote && !!(sel as { pinned?: boolean }).pinned);
  }
}

// Header title follows the center topic when it has content; otherwise it
// falls back to the saved scene name, and finally to the i18n "untitled"
// placeholder. Trim so whitespace-only topics don't shadow the real name.
export function updateTitle(app: App): void {
  const el = document.getElementById('titleName');
  if (!el) return;
  const scene = app.store.get();
  const topic = (scene.centerText || '').trim();
  el.textContent = topic || scene.name || t('untitled');
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
  setTip('btnNote', 'modeNote');
  setTip('btnPan', 'modePan');
  setTip('btnSave', 'save');
  setTip('btnUndo', 'undo');
  setTip('btnRedo', 'redo');
  setTip('btnFit', 'fit');
  setTip('btnDelete', 'delete');
  setTip('btnPinNote', 'pinNote');
  setTip('btnFile', 'menuFile');
  setTip('btnEdit', 'menuEdit');
  setTip('btnHelpMenu', 'menuHelp');
  setTip('btnVirtualCtrl', 'cloneToggle');
  setText('labelColor', 'selectColor');
  setText('labelThickness', 'thickness');
  setText('labelFontSize', 'fontSize');
  document.title = t('appTitle');
  updateTitle(app);
  renderWorks(app);
}

export function toggleLang(app: App): void {
  const next: LangCode = getLang() === 'ko' ? 'en' : 'ko';
  setLang(next);
  applyLangToUi(app);
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

// Mirror the thickness input to the selected arrow/highlighter's thickness
// so the user sees the current value and edits it in place. For text or no
// selection, fall back to the default used for new arrows/highlighters.
export function syncThicknessInputToSelection(app: App): void {
  const el = document.getElementById('inputThickness') as HTMLInputElement | null;
  if (!el) return;
  // Don't clobber in-progress typing: the clamp on commit would jump the
  // value while the user is still editing.
  if (document.activeElement === el) return;
  const sel = app.getSelectedObject();
  if (sel && (sel.type === 'arrow' || sel.type === 'highlighter')) {
    el.value = String(sel.thickness);
  } else {
    el.value = String(app.thickness);
  }
}

// Mirror the color input + palette swatch to the selected object's color so
// the toolbar reflects the recolor target. Falls back to the default color
// used for new objects when nothing is selected.
export function syncColorInputToSelection(app: App): void {
  const el = document.getElementById('inputColor') as HTMLInputElement | null;
  if (!el) return;
  // Skip while the native picker is open — overwriting its value mid-drag
  // would yank the picker's cursor back.
  if (document.activeElement === el) return;
  const sel = app.getSelectedObject();
  // For notes, the picker drives the background color (the post-it identity)
  // — mirror that so the swatches highlight the right value.
  const hex = sel && sel.type === 'note' ? sel.bgColor : sel ? sel.color : app.color;
  el.value = hex;
  const palette = document.getElementById('colorPalette');
  if (palette) {
    const target = hex.toLowerCase();
    palette.querySelectorAll<HTMLButtonElement>('.swatch').forEach((b) => {
      b.classList.toggle('active', (b.dataset.color || '').toLowerCase() === target);
    });
  }
}
