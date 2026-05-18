import type { App } from '../app.js';
import { ArrowObject, SceneObject } from '../models/types.js';
import { Vec, clampToCanvas } from '../utils/geometry.js';
import { t } from '../i18n/lang.js';
import { customPrompt } from '../ui/CustomPrompt.js';
import { setMode } from '../ui/UiBindings.js';
import { openHelpModal, openWorksModal } from '../ui/Modals.js';
import { deleteSelected, newScene, save } from './FileActions.js';

export function onKey(app: App, e: KeyboardEvent): void {
  // Don't fire global shortcuts while the user is typing into a form field.
  // TEXTAREA covers the multiline note/text prompt — without this, Backspace
  // would trigger deleteSelected and Enter would open another text prompt.
  if (e.target) {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  }
  // Any custom modal (prompt, choice, confirm, works, help) is open: bail.
  // The modal owns its own keyboard handling.
  if (document.querySelector('.ap-overlay')) return;
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
  } else if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
    e.preventDefault();
    app.undo();
  } else if ((e.ctrlKey || e.metaKey) && ((e.key === 'y' || e.key === 'Y') || ((e.key === 'z' || e.key === 'Z') && e.shiftKey))) {
    e.preventDefault();
    app.redo();
  } else if (e.altKey && e.code === 'KeyL') {
    e.preventDefault();
    openWorksModal(app);
  } else if (e.altKey && e.code === 'KeyN') {
    e.preventDefault();
    void newScene(app);
  } else if (e.key === 'a') setMode(app, 'arrow');
  else if (e.key === 't') setMode(app, 'text');
  else if (e.key === 'n') setMode(app, 'note');
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
  app.pushHistory();
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

// Hard cap on chain length so a runaway paste doesn't fill the canvas.
// 10 is generous for the diagram style this UI targets (A -> B -> C ...).
export const CHAIN_MAX_SEGMENTS = 10;

// Top-left of an object's bounding box in logical coordinates. Used as a
// uniform "x, y of this object" so cascading insertions (e.g. chain anchored
// to the last-edited object) work the same regardless of object type.
function objectTopLeft(obj: SceneObject): Vec {
  if (obj.type === 'text' || obj.type === 'note') return { x: obj.pos.x, y: obj.pos.y };
  if (obj.type === 'arrow') {
    return { x: Math.min(obj.from.x, obj.to.x), y: Math.min(obj.from.y, obj.to.y) };
  }
  // highlighter
  let minX = Infinity, minY = Infinity;
  for (const p of obj.points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
  }
  return { x: minX, y: minY };
}

// Insert a text + arrow chain from a single line like
//   "A -> B -> C"
// Each segment becomes a text object; consecutive segments are joined by
// a horizontal arrow. The whole chain is laid out at the viewport center.
// Empty segments (e.g. trailing arrow) are skipped. Excess segments past
// CHAIN_MAX_SEGMENTS are silently dropped. Returns the number of text
// segments actually created so callers can flash status / decide.
export function insertChain(app: App, raw: string): number {
  // Accept both ASCII "->" and the unicode arrow "→" as separators so the
  // user can paste either form. Tolerate whitespace around the arrow.
  const all = raw
    .split(/->|→/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (all.length === 0) return 0;
  const parts = all.slice(0, CHAIN_MAX_SEGMENTS);

  const fontSize = app.fontSize;
  // Approximate text bounding box. The real renderer measures glyphs, but at
  // insert time we have no ctx; over-estimate slightly so arrows don't graze
  // the glyphs. 0.65 per char works reasonably for both Latin and Hangul.
  const charWidth = fontSize * 0.65;
  const textHeight = fontSize * 1.2;
  const widths = parts.map((p) => Math.max(charWidth, charWidth * p.length));
  // Arrow segment length scales with font so the chain still reads at any
  // text size, but keeps a sensible minimum on tiny fonts.
  const arrowLength = Math.max(60, fontSize * 2.5);
  const gap = Math.max(4, fontSize * 0.15);

  const totalWidth =
    widths.reduce((a, b) => a + b, 0) + (parts.length - 1) * arrowLength;
  // Anchor the chain on the last-edited (currently selected) object so
  // consecutive 🦀 inserts stack with a small offset instead of overlapping
  // at viewport center. Since each insert auto-selects the final text below,
  // the next insert naturally cascades. Fall back to viewport center when
  // nothing is selected (first-time or after deselect).
  const sel = app.getSelectedObject();
  let x: number;
  let y: number;
  if (sel) {
    const anchor = objectTopLeft(sel);
    x = anchor.x + 10;
    y = anchor.y + 10;
  } else {
    const viewCenter = app.view.screenToLogical({
      x: app.view.width / 2,
      y: app.view.height / 2,
    });
    x = viewCenter.x - totalWidth / 2;
    y = viewCenter.y - textHeight / 2;
  }
  const arrowY = y + textHeight / 2;

  app.pushHistory();
  let lastCreatedId: string | null = null;
  for (let i = 0; i < parts.length; i++) {
    const created = app.store.addText({ x, y }, parts[i], fontSize, app.color);
    lastCreatedId = created.id;
    const textRight = x + widths[i];
    if (i < parts.length - 1) {
      const arrowFromX = textRight + gap;
      const arrowToX = textRight + arrowLength - gap;
      app.store.addArrow(
        { x: arrowFromX, y: arrowY },
        { x: arrowToX, y: arrowY },
        app.color,
        app.thickness,
      );
      x = textRight + arrowLength;
    }
  }
  // Select the final text so the user can fine-tune it immediately.
  if (lastCreatedId) {
    app.selectedId = lastCreatedId;
    app.input.setSelected(lastCreatedId);
  }
  return parts.length;
}

// Opens the text-input modal and places the typed text at the current
// viewport center. Bound to Enter for keyboard-driven text entry.
export function insertTextAtViewportCenter(app: App): void {
  const center = app.view.screenToLogical({ x: app.view.width / 2, y: app.view.height / 2 });
  void customPrompt(t('promptText'), '').then((text) => {
    if (!text || !text.trim()) return;
    app.pushHistory();
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
  app.pushHistory();
  const created = app.store.addArrow(fromC, toC, app.color, app.thickness);
  app.selectedId = created.id;
  app.input.setSelected(created.id);
  setMode(app, 'select');
  app.flashStatus('+ arrow');
}
