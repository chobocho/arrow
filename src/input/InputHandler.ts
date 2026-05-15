import { Vec, clampToCanvas, vecDist } from '../utils/geometry.js';
import { CanvasView } from '../canvas/CanvasView.js';
import { SceneStore, HitHandle } from '../models/SceneStore.js';
import { ArrowObject, SceneObject, TextObject } from '../models/types.js';
import { customPrompt } from '../ui/CustomPrompt.js';
import { t } from '../i18n/lang.js';

export type EditorMode = 'select' | 'arrow' | 'text' | 'pan';

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
  onDraftChange: (draft: ArrowObject | null) => void;
}

interface DragState {
  kind: 'pan' | 'draft-arrow' | 'move-object' | 'resize-arrow' | 'resize-text' | 'none';
  objectId?: string;
  startLogical: Vec;
  startScreen: Vec;
  // For moving an object, remember the original anchor positions.
  origin?: any;
  lastScreen: Vec;
}

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

  // --- Mouse handlers ---
  private onMouseDown = (e: MouseEvent): void => {
    e.preventDefault();
    const screen = this.getScreenFromEvent(e);
    const logical = this.view.screenToLogical(screen);
    if (e.button === 2 || e.button === 1 || this.cb.getMode() === 'pan' || e.shiftKey) {
      this.dragging = { kind: 'pan', startLogical: logical, startScreen: screen, lastScreen: screen };
      return;
    }
    this.beginPointer(screen, logical);
  };

  private onMouseMove = (e: MouseEvent): void => {
    const screen = this.getScreenFromEvent(e);
    this.movePointer(screen);
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
    this.handleDoubleTap(logical);
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
        this.handleDoubleTap(logical);
        this.lastTapTime = 0;
        return;
      }
      this.lastTapTime = now;
      this.lastTapPos = screen;
      this.beginPointer(screen, logical);
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
      this.movePointer(screen);
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
  private beginPointer(screen: Vec, logical: Vec): void {
    const mode = this.cb.getMode();
    const tol = this.toleranceLogical();
    const hit = this.store.hitTest(logical, tol);

    if (hit.object) {
      this.selectedId = hit.object.id;
      this.cb.onSelect(this.selectedId);
      const handle: HitHandle = hit.handle;
      if (handle === 'arrow-from' || handle === 'arrow-to') {
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
      if (handle === 'text-resize') {
        const t = hit.object as TextObject;
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
      this.dragging = {
        kind: 'move-object',
        objectId: hit.object.id,
        startLogical: logical,
        startScreen: screen,
        lastScreen: screen,
        origin: this.snapshotObject(hit.object),
      };
      this.cb.onChange();
      return;
    }

    // Empty space behavior depends on mode.
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
          const obj = this.store.addText(logical, text.trim(), this.cb.getFontSize(), this.cb.getColor());
          this.selectedId = obj.id;
          this.cb.onSelect(obj.id);
          this.cb.onChange();
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

  private movePointer(screen: Vec): void {
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
    if (drag.kind === 'resize-arrow' && drag.objectId) {
      const end = drag.origin?.end as 'arrow-from' | 'arrow-to';
      this.store.update(drag.objectId, (o) => {
        if (o.type !== 'arrow') return;
        if (end === 'arrow-from') o.from = clampToCanvas(logical);
        else o.to = clampToCanvas(logical);
      });
      return;
    }
    if (drag.kind === 'move-object' && drag.objectId && drag.origin) {
      const startLogical = drag.startLogical;
      const dxLog = logical.x - startLogical.x;
      const dyLog = logical.y - startLogical.y;
      this.store.update(drag.objectId, (o) => {
        if (o.type === 'arrow') {
          const orig = drag.origin as { from: Vec; to: Vec };
          o.from = clampToCanvas({ x: orig.from.x + dxLog, y: orig.from.y + dyLog });
          o.to = clampToCanvas({ x: orig.to.x + dxLog, y: orig.to.y + dyLog });
        } else {
          const orig = drag.origin as { pos: Vec };
          o.pos = clampToCanvas({ x: orig.pos.x + dxLog, y: orig.pos.y + dyLog });
        }
      });
      return;
    }
    if (drag.kind === 'resize-text' && drag.objectId && drag.origin) {
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
        o.fontSize = Math.max(8, Math.min(160, orig.fontSize * ratio));
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
        const created = this.store.addArrow(draft.from, draft.to, draft.color, draft.thickness);
        this.selectedId = created.id;
        this.cb.onSelect(created.id);
      }
      this.cb.onDraftChange(null);
      // Stay in arrow mode so users can chain multiple arrows without
      // re-selecting the tool each time.
    }
    this.dragging = { kind: 'none', startLogical: { x: 0, y: 0 }, startScreen: { x: 0, y: 0 }, lastScreen: { x: 0, y: 0 } };
    this.cb.onChange();
  }

  private handleDoubleTap(logical: Vec): void {
    const tol = this.toleranceLogical();
    const hit = this.store.hitTest(logical, tol);
    if (hit.object && hit.object.type === 'text') {
      this.cb.onDoubleClickText(hit.object);
      return;
    }
    if (!hit.object) {
      this.cb.onDoubleClickEmpty(logical);
    }
  }

  private snapshotObject(obj: SceneObject): any {
    if (obj.type === 'arrow') return { from: { ...obj.from }, to: { ...obj.to } };
    return { pos: { ...obj.pos } };
  }
}
