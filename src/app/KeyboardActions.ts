import type { App } from '../app.js';
import { ArrowObject, SceneObject } from '../models/types.js';
import { Vec, clampToCanvas } from '../utils/geometry.js';
import { t } from '../i18n/lang.js';
import { customPrompt } from '../ui/CustomPrompt.js';
import { setMode } from '../ui/UiBindings.js';
import { openHelpModal, openWorksModal } from '../ui/Modals.js';
import { deleteSelected, newScene, save } from './FileActions.js';

export function onKey(app: App, e: KeyboardEvent): void {
  if (e.target && (e.target as HTMLElement).tagName === 'INPUT') return;
  if (app.worksModalEl) return;
  if (app.helpModalEl) {
    if (e.key === 'F1') e.preventDefault();
    return;
  }
  if (e.key === 'F1') {
    e.preventDefault();
    openHelpModal(app);
    return;
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (app.selectedId) {
      e.preventDefault();
      void deleteSelected(app);
    }
  } else if (e.key === 'Insert' || e.key === '+') {
    e.preventDefault();
    insertArrow(app);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    insertTextAtViewportCenter(app);
  } else if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    void save(app);
  } else if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
    if (copySelected(app)) e.preventDefault();
  } else if ((e.ctrlKey || e.metaKey) && (e.key === 'v' || e.key === 'V')) {
    if (pasteClone(app)) e.preventDefault();
  } else if (e.altKey && e.code === 'KeyL') {
    e.preventDefault();
    openWorksModal(app);
  } else if (e.altKey && e.code === 'KeyN') {
    e.preventDefault();
    void newScene(app);
  } else if (e.key === 'a') setMode(app, 'arrow');
  else if (e.key === 't') setMode(app, 'text');
  else if (e.key === 'g') setMode(app, 'highlighter');
  else if (e.key === 'v') setMode(app, 'select');
  else if (e.key === 'h') setMode(app, 'pan');
}

// Copy the currently selected object to the internal clipboard. Returns
// true if something was copied so callers can suppress the default
// browser copy (which would otherwise copy empty text selection).
export function copySelected(app: App): boolean {
  const sel = app.getSelectedObject();
  if (!sel) return false;
  app.clipboard = JSON.parse(JSON.stringify(sel));
  app.flashStatus('copy');
  return true;
}

// Paste the clipboard object as a new scene object, offset slightly so the
// user sees the clone. Subsequent pastes continue to offset from the last
// paste position so repeated Ctrl+V spreads copies out.
export function pasteClone(app: App): boolean {
  const clip = app.clipboard;
  if (!clip) return false;
  const offset = 20;
  let created: SceneObject;
  if (clip.type === 'arrow') {
    const from: Vec = { x: clip.from.x + offset, y: clip.from.y + offset };
    const to: Vec = { x: clip.to.x + offset, y: clip.to.y + offset };
    created = app.store.addArrow(from, to, clip.color, clip.thickness);
    clip.from = from;
    clip.to = to;
  } else if (clip.type === 'highlighter') {
    const shifted: Vec[] = clip.points.map((p) => ({ x: p.x + offset, y: p.y + offset }));
    created = app.store.addHighlighter(shifted, clip.color, clip.thickness);
    clip.points = shifted;
  } else {
    const pos: Vec = { x: clip.pos.x + offset, y: clip.pos.y + offset };
    created = app.store.addText(pos, clip.text, clip.fontSize, clip.color);
    clip.pos = pos;
  }
  app.selectedId = created.id;
  app.input.setSelected(created.id);
  app.flashStatus('paste');
  return true;
}

// Opens the text-input modal and places the typed text at the current
// viewport center. Bound to Enter for keyboard-driven text entry.
export function insertTextAtViewportCenter(app: App): void {
  const center = app.view.screenToLogical({ x: app.view.width / 2, y: app.view.height / 2 });
  void customPrompt(t('promptText'), '').then((text) => {
    if (!text || !text.trim()) return;
    const obj = app.store.addText(center, text.trim(), app.fontSize, app.color);
    app.selectedId = obj.id;
    app.input.setSelected(obj.id);
    setMode(app, 'select');
  });
}

// Adds a horizontal arrow positioned to the upper-right of any existing
// arrows so consecutive Insert presses stagger outward. When no arrows
// exist yet, fall back to the current viewport center.
export function insertArrow(app: App): void {
  const visibleLogicalW = app.view.width / app.view.scale;
  const gap = 5;
  const arrows = app.store.get().objects.filter((o) => o.type === 'arrow') as ArrowObject[];
  // Auto length: 1/3 of the previous default (viewport-based or avg of
  // existing arrows) so a quick + spam grows the diagram in finer steps.
  let lengthLogical: number;
  if (arrows.length === 0) {
    lengthLogical = Math.max(60, Math.min(400, visibleLogicalW * 0.25)) / 3;
  } else {
    let total = 0;
    for (const a of arrows) total += Math.hypot(a.to.x - a.from.x, a.to.y - a.from.y);
    lengthLogical = Math.max(30, total / arrows.length) / 3;
  }
  let from: Vec;
  if (arrows.length === 0) {
    const c = app.view.screenToLogical({ x: app.view.width / 2, y: app.view.height / 2 });
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
  const created = app.store.addArrow(fromC, toC, app.color, app.thickness);
  app.selectedId = created.id;
  app.input.setSelected(created.id);
  setMode(app, 'select');
  app.flashStatus('+ arrow');
}
