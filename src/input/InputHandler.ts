import { Vec, clampToCanvas, vecDist } from '../utils/geometry.js';
import { CanvasView } from '../canvas/CanvasView.js';
import { SceneStore, HitHandle, HitResult, estimateNoteBox } from '../models/SceneStore.js';
import {
  ArrowObject,
  HighlighterObject,
  NOTE_MAX_WIDTH,
  NOTE_MIN_WIDTH,
  NoteObject,
  SceneData,
  SceneObject,
  TextObject,
  clampNoteText,
} from '../models/types.js';
import { customPrompt } from '../ui/CustomPrompt.js';
import { t } from '../i18n/lang.js';

export type EditorMode = 'select' | 'arrow' | 'text' | 'pan' | 'highlighter' | 'note';

export interface InputCallbacks {
  getMode: () => EditorMode;
  setMode?: (mode: EditorMode) => void;
  getColor: () => string;
  getThickness: () => number;
  getFontSize: () => number;
  onChange: () => void;
  onSelect: (id: string | null) => void;
  onDoubleClickEmpty: (logical: Vec) => void;
  onDoubleClickText: (text: TextObject) => void;
  onDoubleClickNote: (note: NoteObject) => void;
  // Right-click on a pinned note → unpin it. Empty / non-pinned right-click
  // keeps its normal select-or-deselect behavior.
  onUnpinNote?: (note: NoteObject) => void;
  onDraftChange: (draft: ArrowObject | null) => void;
  onDraftHighlighter: (draft: HighlighterObject | null) => void;
  // Returns true when a "clone modifier" is active (mobile virtual Ctrl button).
  // The Ctrl/⌘ physical key already counts on desktop; this is the touch
  // equivalent so mobile users can also clone-by-drag (TODO #15/#16).
  getModifierClone?: () => boolean;
  // Push a pre-mutation scene snapshot onto the undo stack. Called from the
  // InputHandler at gesture/commit boundaries — see pendingHistorySnap below.
  commitHistorySnapshot?: (snap: SceneData) => void;
}

interface DragState {
  kind: 'pan' | 'draft-arrow' | 'draft-highlighter' | 'move-object' | 'resize-arrow' | 'resize-text' | 'resize-note' | 'none';
  objectId?: string;
  startLogical: Vec;
  startScreen: Vec;
  // For moving an object, remember the original anchor positions.
  origin?: any;
  lastScreen: Vec;
  // Pinned notes use screen-space deltas instead of logical ones for move/
  // resize. Set when the gesture begins on a pinned note.
  pinned?: boolean;
}

// Minimum distance between consecutive captured points in a highlighter
// stroke (screen pixels). Keeps the saved polyline lean without losing the
// shape of the gesture.
const HL_MIN_STEP_SCREEN = 2.5;

const TOUCH_TAP_TIME = 250;
const TOUCH_TAP_DIST = 8;
const DOUBLE_TAP_TIME = 320;

// Owns all DOM event listeners on the canvas and translates them into
// SceneStore mutations.
export class InputHandler {
  private dragging: DragState = { kind: 'none', startLogical: { x: 0, y: 0 }, startScreen: { x: 0, y: 0 }, lastScreen: { x: 0, y: 0 } };
  private selectedId: string | null = null;
  private lastTapTime = 0;
  private lastTapPos: Vec = { x: 0, y: 0 };
  private pinch: { startDist: number; startScale: number; startCenter: Vec; lastCenter: Vec } | null = null;
  // Pre-mutation scene snapshot captured at gesture start, committed to the
  // undo stack only when the gesture actually changes the scene. This avoids
  // polluting undo with no-op entries from click-without-drag.
  private pendingHistorySnap: SceneData | null = null;

  constructor(
    private canvas: HTMLCanvasElement,
    private view: CanvasView,
    private store: SceneStore,
    private cb: InputCallbacks,
  ) {
    this.attach();
  }

  getSelectedId(): string | null {
    return this.selectedId;
  }

  setSelected(id: string | null): void {
    this.selectedId = id;
    this.cb.onSelect(id);
    this.cb.onChange();
  }

  private attach(): void {
    const c = this.canvas;
    c.addEventListener('mousedown', this.onMouseDown);
    c.addEventListener('mousemove', this.onMouseMove);
    window.addEventListener('mouseup', this.onMouseUp);
    c.addEventListener('wheel', this.onWheel, { passive: false });
    c.addEventListener('dblclick', this.onDblClick);
    c.addEventListener('touchstart', this.onTouchStart, { passive: false });
    c.addEventListener('touchmove', this.onTouchMove, { passive: false });
    c.addEventListener('touchend', this.onTouchEnd, { passive: false });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private getScreenFromEvent(ev: MouseEvent | Touch): Vec {
    const rect = this.canvas.getBoundingClientRect();
    return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  }

  private toleranceLogical(): number {
    return 12 / this.view.scale;
  }

  // Screen-space hit test that ONLY considers pinned notes. Called before the
  // logical store.hitTest so pinned-note clicks short-circuit the canvas-
  // coordinate path. 12 px tolerance matches the visible handle radius.
  private hitPinnedNote(screen: Vec): HitResult | null {
    const tol = 12;
    const objs = this.store.get().objects;
    for (let i = objs.length - 1; i >= 0; i--) {
      const o = objs[i];
      if (o.type !== 'note' || !o.pinned) continue;
      const box = estimateNoteBox(o);
      if (
        Math.abs(screen.x - (o.pos.x + box.w)) <= tol &&
        Math.abs(screen.y - (o.pos.y + box.h)) <= tol
      ) {
        return { object: o, handle: 'note-resize' };
      }
      if (
        screen.x >= o.pos.x - 2 && screen.x <= o.pos.x + box.w + 2 &&
        screen.y >= o.pos.y - 2 && screen.y <= o.pos.y + box.h + 2
      ) {
        return { object: o, handle: 'note-body' };
      }
    }
    return null;
  }

  // Deep-clone the current scene into a snapshot suitable for undo. Cheap
  // enough at typical scene sizes; correctness > micro-optimization.
  private snapshotScene(): SceneData {
    return JSON.parse(JSON.stringify(this.store.get())) as SceneData;
  }

  // Push the pending snapshot to undo iff one was stashed at gesture start.
  // Called from movePointer the moment a mutating drag first changes the
  // scene, and from endPointer right before draft commits.
  private flushPendingHistory(): void {
    if (this.pendingHistorySnap && this.cb.commitHistorySnapshot) {
      this.cb.commitHistorySnapshot(this.pendingHistorySnap);
    }
    this.pendingHistorySnap = null;
  }

  // --- Mouse handlers ---
  private onMouseDown = (e: MouseEvent): void => {
    e.preventDefault();
    const screen = this.getScreenFromEvent(e);
    const logical = this.view.screenToLogical(screen);
    if (e.button === 2) {
      // Right-click: pinned-note hit → select + unpin. Otherwise fall through
      // to the normal logical hit-test (select or deselect on empty).
      const pinned = this.hitPinnedNote(screen);
      if (pinned && pinned.object && pinned.object.type === 'note') {
        this.selectedId = pinned.object.id;
        this.cb.onSelect(this.selectedId);
        if (this.cb.onUnpinNote) this.cb.onUnpinNote(pinned.object);
        this.dragging = { kind: 'none', startLogical: logical, startScreen: screen, lastScreen: screen };
        this.cb.onChange();
        return;
      }
      const tol = this.toleranceLogical();
      const hit = this.store.hitTest(logical, tol);
      this.selectedId = hit.object ? hit.object.id : null;
      this.cb.onSelect(this.selectedId);
      this.dragging = { kind: 'none', startLogical: logical, startScreen: screen, lastScreen: screen };
      this.cb.onChange();
      return;
    }
    if (e.button === 1 || this.cb.getMode() === 'pan' || e.shiftKey) {
      this.dragging = { kind: 'pan', startLogical: logical, startScreen: screen, lastScreen: screen };
      return;
    }
    const wantsClone = e.ctrlKey || e.metaKey || !!this.cb.getModifierClone?.();
    this.beginPointer(screen, logical, wantsClone);
  };

  private onMouseMove = (e: MouseEvent): void => {
    const screen = this.getScreenFromEvent(e);
    // Ctrl/⌘ — or the mobile virtual-Ctrl toggle — constrains the highlighter
    // to a single straight segment from where the stroke began.
    const straight = e.ctrlKey || e.metaKey || !!this.cb.getModifierClone?.();
    this.movePointer(screen, straight);
  };

  private onMouseUp = (e: MouseEvent): void => {
    const screen = this.getScreenFromEvent(e);
    this.endPointer(screen);
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const screen = this.getScreenFromEvent(e);
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    this.view.zoomAt(screen, factor);
    this.cb.onChange();
  };

  private onDblClick = (e: MouseEvent): void => {
    e.preventDefault();
    const screen = this.getScreenFromEvent(e);
    const logical = this.view.screenToLogical(screen);
    this.handleDoubleTap(logical, screen);
  };

  // --- Touch handlers ---
  private onTouchStart = (e: TouchEvent): void => {
    e.preventDefault();
    if (e.touches.length === 1) {
      const screen = this.getScreenFromEvent(e.touches[0]);
      const logical = this.view.screenToLogical(screen);
      const now = performance.now();
      if (
        now - this.lastTapTime < DOUBLE_TAP_TIME &&
        vecDist(screen, this.lastTapPos) < TOUCH_TAP_DIST * 2
      ) {
        this.handleDoubleTap(logical, screen);
        this.lastTapTime = 0;
        return;
      }
      this.lastTapTime = now;
      this.lastTapPos = screen;
      const wantsClone = !!this.cb.getModifierClone?.();
      this.beginPointer(screen, logical, wantsClone);
    } else if (e.touches.length === 2) {
      this.dragging.kind = 'none';
      const a = this.getScreenFromEvent(e.touches[0]);
      const b = this.getScreenFromEvent(e.touches[1]);
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      this.pinch = {
        startDist: vecDist(a, b),
        startScale: this.view.scale,
        startCenter: center,
        lastCenter: center,
      };
    }
  };

  private onTouchMove = (e: TouchEvent): void => {
    e.preventDefault();
    if (e.touches.length === 1 && !this.pinch) {
      const screen = this.getScreenFromEvent(e.touches[0]);
      // Touch has no physical Ctrl; the virtual-Ctrl toggle doubles as the
      // straight-line modifier for highlighter strokes.
      const straight = !!this.cb.getModifierClone?.();
      this.movePointer(screen, straight);
    } else if (e.touches.length === 2 && this.pinch) {
      const a = this.getScreenFromEvent(e.touches[0]);
      const b = this.getScreenFromEvent(e.touches[1]);
      const dist = Math.max(1, vecDist(a, b));
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const factor = (dist / this.pinch.startDist) * (this.pinch.startScale / this.view.scale);
      this.view.zoomAt(center, factor);
      const dx = center.x - this.pinch.lastCenter.x;
      const dy = center.y - this.pinch.lastCenter.y;
      this.view.panBy(dx, dy);
      this.pinch.lastCenter = center;
      this.cb.onChange();
    }
  };

  private onTouchEnd = (e: TouchEvent): void => {
    e.preventDefault();
    if (e.touches.length === 0) {
      this.pinch = null;
      const t = e.changedTouches[0];
      if (t) {
        const screen = this.getScreenFromEvent(t);
        this.endPointer(screen);
      } else {
        this.dragging.kind = 'none';
      }
    } else if (e.touches.length < 2) {
      this.pinch = null;
    }
  };

  // --- Shared pointer flow ---
  private beginPointer(screen: Vec, logical: Vec, wantsClone = false): void {
    const mode = this.cb.getMode();

    // Highlighter mode owns the entire gesture: pressing on an existing
    // object must NOT select/move it, because the user's intent is to lay
    // down a stroke across whatever is under the pointer. (Previously a
    // highlighter started on text grabbed the text and dragged it instead.)
    if (mode === 'highlighter') {
      const draft: HighlighterObject = {
        id: 'draft',
        type: 'highlighter',
        points: [logical],
        color: this.cb.getColor(),
        thickness: this.cb.getThickness(),
      };
      this.cb.onDraftHighlighter(draft);
      this.dragging = {
        kind: 'draft-highlighter',
        startLogical: logical,
        startScreen: screen,
        lastScreen: screen,
        origin: { draft },
      };
      this.selectedId = null;
      this.cb.onSelect(null);
      this.cb.onChange();
      return;
    }

    // Pinned notes live in screen space — check them first against the raw
    // screen point so a click that visually lands on a pinned note never
    // falls through to whatever is "below" it in logical coords.
    const pinned = this.hitPinnedNote(screen);
    if (pinned && pinned.object && pinned.object.type === 'note') {
      const note = pinned.object;
      this.selectedId = note.id;
      this.cb.onSelect(note.id);
      this.pendingHistorySnap = this.snapshotScene();
      if (pinned.handle === 'note-resize') {
        this.dragging = {
          kind: 'resize-note',
          objectId: note.id,
          startLogical: logical,
          startScreen: screen,
          lastScreen: screen,
          origin: { width: note.width, pos: { ...note.pos } },
          pinned: true,
        };
      } else {
        this.dragging = {
          kind: 'move-object',
          objectId: note.id,
          startLogical: logical,
          startScreen: screen,
          lastScreen: screen,
          origin: { pos: { ...note.pos } },
          pinned: true,
        };
      }
      this.cb.onChange();
      return;
    }

    const tol = this.toleranceLogical();
    const hit = this.store.hitTest(logical, tol);

    if (hit.object) {
      this.selectedId = hit.object.id;
      this.cb.onSelect(this.selectedId);
      const handle: HitHandle = hit.handle;
      if (handle === 'arrow-from' || handle === 'arrow-to') {
        // Stash snapshot for resize-arrow; flushed on first mutating move.
        this.pendingHistorySnap = this.snapshotScene();
        this.dragging = {
          kind: 'resize-arrow',
          objectId: hit.object.id,
          startLogical: logical,
          startScreen: screen,
          lastScreen: screen,
          origin: { end: handle },
        };
        return;
      }
      if (handle === 'note-resize') {
        const note = hit.object as NoteObject;
        // Stash snapshot for resize-note; flushed on first mutating move.
        this.pendingHistorySnap = this.snapshotScene();
        this.dragging = {
          kind: 'resize-note',
          objectId: hit.object.id,
          startLogical: logical,
          startScreen: screen,
          lastScreen: screen,
          origin: { width: note.width, pos: { ...note.pos } },
        };
        return;
      }
      if (handle === 'text-resize') {
        const t = hit.object as TextObject;
        // Stash snapshot for resize-text; flushed on first mutating move.
        this.pendingHistorySnap = this.snapshotScene();
        this.dragging = {
          kind: 'resize-text',
          objectId: hit.object.id,
          startLogical: logical,
          startScreen: screen,
          lastScreen: screen,
          origin: { fontSize: t.fontSize, pos: { ...t.pos } },
        };
        return;
      }
      // Ctrl/⌘ + drag on a body handle clones the object first, then the move
      // operates on the new clone — leaving the original in place (TODO #16).
      // Resize handles above are skipped so reshaping doesn't accidentally
      // duplicate.
      if (wantsClone) {
        // Cloning IS a mutation. Push undo immediately (snapshot is the
        // pre-clone scene). The subsequent move on the clone is treated as
        // part of the same undo step — undoing removes the clone entirely.
        if (this.cb.commitHistorySnapshot) this.cb.commitHistorySnapshot(this.snapshotScene());
      } else {
        // Move-only: stash, flush on first mutating move.
        this.pendingHistorySnap = this.snapshotScene();
      }
      const target = wantsClone ? this.cloneForDrag(hit.object) : hit.object;
      if (wantsClone) {
        this.selectedId = target.id;
        this.cb.onSelect(target.id);
      }
      this.dragging = {
        kind: 'move-object',
        objectId: target.id,
        startLogical: logical,
        startScreen: screen,
        lastScreen: screen,
        origin: this.snapshotObject(target),
      };
      this.cb.onChange();
      return;
    }

    // Empty space behavior depends on mode. (Highlighter is handled at the
    // top of this method so it can short-circuit object hits.)
    if (mode === 'arrow') {
      const draft: ArrowObject = {
        id: 'draft',
        type: 'arrow',
        from: logical,
        to: logical,
        color: this.cb.getColor(),
        thickness: this.cb.getThickness(),
      };
      this.cb.onDraftChange(draft);
      this.dragging = {
        kind: 'draft-arrow',
        startLogical: logical,
        startScreen: screen,
        lastScreen: screen,
        origin: { draft },
      };
      this.selectedId = null;
      this.cb.onSelect(null);
      this.cb.onChange();
      return;
    }
    if (mode === 'text') {
      this.dragging = { kind: 'none', startLogical: logical, startScreen: screen, lastScreen: screen };
      void customPrompt(t('promptText'), '').then((text) => {
        if (text && text.trim()) {
          if (this.cb.commitHistorySnapshot) this.cb.commitHistorySnapshot(this.snapshotScene());
          const obj = this.store.addText(logical, text.trim(), this.cb.getFontSize(), this.cb.getColor());
          this.selectedId = obj.id;
          this.cb.onSelect(obj.id);
          this.cb.onChange();
          // After commit, drop back to Select so the just-typed text can be
          // moved / resized immediately — matches the keyboard-driven Enter
          // path in KeyboardActions.insertTextAtViewportCenter.
          if (this.cb.setMode) this.cb.setMode('select');
        }
      });
      return;
    }
    if (mode === 'note') {
      this.dragging = { kind: 'none', startLogical: logical, startScreen: screen, lastScreen: screen };
      void customPrompt(t('promptNote'), '', '', { multiline: true, maxLength: 255 }).then((text) => {
        if (text != null && text.length > 0) {
          if (this.cb.commitHistorySnapshot) this.cb.commitHistorySnapshot(this.snapshotScene());
          const obj = this.store.addNote(logical, clampNoteText(text), { color: this.cb.getColor() });
          this.selectedId = obj.id;
          this.cb.onSelect(obj.id);
          this.cb.onChange();
          // Matches the text-mode commit flow: switch back to Select so the
          // brand-new note is immediately moveable / resizable.
          if (this.cb.setMode) this.cb.setMode('select');
        }
      });
      return;
    }
    // select / pan default: deselect + start a pan
    this.selectedId = null;
    this.cb.onSelect(null);
    this.dragging = { kind: 'pan', startLogical: logical, startScreen: screen, lastScreen: screen };
    this.cb.onChange();
  }

  private movePointer(screen: Vec, wantsStraight = false): void {
    const drag = this.dragging;
    if (drag.kind === 'none') return;
    const logical = this.view.screenToLogical(screen);
    const dxScreen = screen.x - drag.lastScreen.x;
    const dyScreen = screen.y - drag.lastScreen.y;
    drag.lastScreen = screen;

    if (drag.kind === 'pan') {
      this.view.panBy(dxScreen, dyScreen);
      this.cb.onChange();
      return;
    }
    if (drag.kind === 'draft-arrow' && drag.origin?.draft) {
      const draft: ArrowObject = drag.origin.draft;
      draft.to = clampToCanvas(logical);
      this.cb.onDraftChange(draft);
      this.cb.onChange();
      return;
    }
    if (drag.kind === 'draft-highlighter' && drag.origin?.draft) {
      const draft: HighlighterObject = drag.origin.draft;
      if (wantsStraight) {
        // Collapse any freehand trail collected so far into a single segment
        // from the stroke origin to the current pointer. Toggling Ctrl mid-
        // stroke therefore snaps the existing trail to a straight line.
        draft.points = [drag.startLogical, clampToCanvas(logical)];
        this.cb.onDraftHighlighter(draft);
        this.cb.onChange();
        return;
      }
      const last = draft.points[draft.points.length - 1];
      const lastScreen = this.view.logicalToScreen(last);
      if (vecDist(lastScreen, screen) >= HL_MIN_STEP_SCREEN) {
        draft.points.push(clampToCanvas(logical));
        this.cb.onDraftHighlighter(draft);
        this.cb.onChange();
      }
      return;
    }
    if (drag.kind === 'resize-arrow' && drag.objectId) {
      this.flushPendingHistory();
      const end = drag.origin?.end as 'arrow-from' | 'arrow-to';
      this.store.update(drag.objectId, (o) => {
        if (o.type !== 'arrow') return;
        if (end === 'arrow-from') o.from = clampToCanvas(logical);
        else o.to = clampToCanvas(logical);
      });
      return;
    }
    if (drag.kind === 'move-object' && drag.objectId && drag.origin) {
      this.flushPendingHistory();
      if (drag.pinned) {
        // Pinned-note drag: screen-space delta applied to the screen-space pos.
        const dxS = screen.x - drag.startScreen.x;
        const dyS = screen.y - drag.startScreen.y;
        const orig = drag.origin as { pos: Vec };
        this.store.update(drag.objectId, (o) => {
          if (o.type !== 'note') return;
          o.pos = { x: orig.pos.x + dxS, y: orig.pos.y + dyS };
        });
        return;
      }
      const startLogical = drag.startLogical;
      const dxLog = logical.x - startLogical.x;
      const dyLog = logical.y - startLogical.y;
      this.store.update(drag.objectId, (o) => {
        if (o.type === 'arrow') {
          const orig = drag.origin as { from: Vec; to: Vec };
          o.from = clampToCanvas({ x: orig.from.x + dxLog, y: orig.from.y + dyLog });
          o.to = clampToCanvas({ x: orig.to.x + dxLog, y: orig.to.y + dyLog });
        } else if (o.type === 'highlighter') {
          const orig = drag.origin as { points: Vec[] };
          o.points = orig.points.map((p) => clampToCanvas({ x: p.x + dxLog, y: p.y + dyLog }));
        } else {
          // text and note both anchor on pos.
          const orig = drag.origin as { pos: Vec };
          o.pos = clampToCanvas({ x: orig.pos.x + dxLog, y: orig.pos.y + dyLog });
        }
      });
      return;
    }
    if (drag.kind === 'resize-note' && drag.objectId && drag.origin) {
      this.flushPendingHistory();
      const orig = drag.origin as { width: number; pos: Vec };
      // Use screen-space delta for pinned notes (their width is in screen
      // pixels); logical otherwise.
      const refX = drag.pinned ? screen.x : logical.x;
      const nextWidth = Math.max(
        NOTE_MIN_WIDTH,
        Math.min(NOTE_MAX_WIDTH, refX - orig.pos.x),
      );
      this.store.update(drag.objectId, (o) => {
        if (o.type !== 'note') return;
        o.width = nextWidth;
      });
      return;
    }
    if (drag.kind === 'resize-text' && drag.objectId && drag.origin) {
      this.flushPendingHistory();
      const orig = drag.origin as { fontSize: number; pos: Vec };
      const ratio = Math.max(
        0.3,
        Math.min(
          6,
          (logical.x - orig.pos.x) / Math.max(20, orig.fontSize * 4),
        ),
      );
      this.store.update(drag.objectId, (o) => {
        if (o.type !== 'text') return;
        o.fontSize = Math.max(8, Math.min(160, Math.floor(orig.fontSize * ratio)));
      });
      return;
    }
  }

  private endPointer(_screen: Vec): void {
    const drag = this.dragging;
    if (drag.kind === 'draft-arrow' && drag.origin?.draft) {
      const draft: ArrowObject = drag.origin.draft;
      const len = vecDist(draft.from, draft.to);
      if (len > 4 / this.view.scale) {
        if (this.cb.commitHistorySnapshot) this.cb.commitHistorySnapshot(this.snapshotScene());
        const created = this.store.addArrow(draft.from, draft.to, draft.color, draft.thickness);
        this.selectedId = created.id;
        this.cb.onSelect(created.id);
        // After a successful commit, drop back to Select so the just-drawn
        // arrow is immediately moveable / resizable — matches the text/note
        // flow. (Earlier builds stayed in arrow mode for chained drawing; the
        // user reversed that preference — see history 2026-05-17.)
        if (this.cb.setMode) this.cb.setMode('select');
      }
      this.cb.onDraftChange(null);
    } else if (drag.kind === 'draft-highlighter' && drag.origin?.draft) {
      const draft: HighlighterObject = drag.origin.draft;
      // Single tap (one point) still commits as a dot; multi-point strokes
      // commit when total path length passes a tiny threshold so accidental
      // micro-drags don't pollute the scene.
      let total = 0;
      for (let i = 1; i < draft.points.length; i++) total += vecDist(draft.points[i - 1], draft.points[i]);
      if (draft.points.length === 1 || total > 4 / this.view.scale) {
        if (this.cb.commitHistorySnapshot) this.cb.commitHistorySnapshot(this.snapshotScene());
        const created = this.store.addHighlighter(draft.points, draft.color, draft.thickness);
        this.selectedId = created.id;
        this.cb.onSelect(created.id);
      }
      this.cb.onDraftHighlighter(null);
      // Stay in highlighter mode for consecutive strokes.
    }
    // Pending snapshot belonged to a click-without-drag (or a drag that didn't
    // mutate the scene). Discard it — no undo entry needed.
    this.pendingHistorySnap = null;
    this.dragging = { kind: 'none', startLogical: { x: 0, y: 0 }, startScreen: { x: 0, y: 0 }, lastScreen: { x: 0, y: 0 } };
    this.cb.onChange();
  }

  private handleDoubleTap(logical: Vec, screen?: Vec): void {
    // Pinned notes live in screen space — check them first so a dbl-click
    // visually on a pinned note edits its text (instead of falling through
    // to whatever sits in logical coords below).
    if (screen) {
      const pinned = this.hitPinnedNote(screen);
      if (pinned && pinned.object && pinned.object.type === 'note') {
        this.cb.onDoubleClickNote(pinned.object);
        return;
      }
    }
    const tol = this.toleranceLogical();
    const hit = this.store.hitTest(logical, tol);
    if (hit.object && hit.object.type === 'text') {
      this.cb.onDoubleClickText(hit.object);
      return;
    }
    if (hit.object && hit.object.type === 'note') {
      this.cb.onDoubleClickNote(hit.object);
      return;
    }
    if (!hit.object) {
      this.cb.onDoubleClickEmpty(logical);
    }
  }

  private snapshotObject(obj: SceneObject): any {
    if (obj.type === 'arrow') return { from: { ...obj.from }, to: { ...obj.to } };
    if (obj.type === 'highlighter') return { points: obj.points.map((p) => ({ ...p })) };
    return { pos: { ...obj.pos } };
  }

  // Create a duplicate of `obj` at the same position so a Ctrl+drag can grab
  // the duplicate and translate it while the original stays put.
  private cloneForDrag(obj: SceneObject): SceneObject {
    if (obj.type === 'arrow') {
      return this.store.addArrow({ ...obj.from }, { ...obj.to }, obj.color, obj.thickness);
    }
    if (obj.type === 'highlighter') {
      return this.store.addHighlighter(obj.points.map((p) => ({ ...p })), obj.color, obj.thickness);
    }
    if (obj.type === 'note') {
      return this.store.addNote({ ...obj.pos }, obj.text, {
        width: obj.width, fontSize: obj.fontSize, color: obj.color, bgColor: obj.bgColor,
      });
    }
    return this.store.addText({ ...obj.pos }, obj.text, obj.fontSize, obj.color);
  }
}
