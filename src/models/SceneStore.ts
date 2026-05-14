import {
  ArrowObject,
  SceneData,
  SceneObject,
  TextObject,
  emptyScene,
  newId,
} from './types.js';
import { clampToCanvas, pointToSegmentDistance, Vec, vecDist } from '../utils/geometry.js';

export type Listener = () => void;

// Single source of truth for the editing session. Mutates in place but emits
// change events so the renderer/UI can refresh.
export class SceneStore {
  private scene: SceneData;
  private listeners: Listener[] = [];

  constructor(initial?: SceneData) {
    this.scene = initial ?? emptyScene('새 작업');
  }

  get(): SceneData {
    return this.scene;
  }

  replace(next: SceneData): void {
    this.scene = next;
    this.emit();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.push(fn);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== fn);
    };
  }

  private touch(): void {
    this.scene.updatedAt = Date.now();
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }

  setCenterText(text: string): void {
    this.scene.centerText = text;
    this.touch();
    this.emit();
  }

  setCenterFontSize(size: number): void {
    this.scene.centerFontSize = Math.max(8, Math.min(200, size));
    this.touch();
    this.emit();
  }

  setName(name: string): void {
    this.scene.name = name;
    this.touch();
    this.emit();
  }

  setView(offset: Vec, scale: number): void {
    this.scene.viewOffsetX = offset.x;
    this.scene.viewOffsetY = offset.y;
    this.scene.viewScale = scale;
    // No emit — view changes already trigger renders elsewhere.
  }

  addArrow(from: Vec, to: Vec, color: string, thickness: number): ArrowObject {
    const arrow: ArrowObject = {
      id: newId('arrow'),
      type: 'arrow',
      from: clampToCanvas(from),
      to: clampToCanvas(to),
      color,
      thickness,
    };
    this.scene.objects.push(arrow);
    this.touch();
    this.emit();
    return arrow;
  }

  addText(pos: Vec, text: string, fontSize: number, color: string): TextObject {
    const obj: TextObject = {
      id: newId('text'),
      type: 'text',
      pos: clampToCanvas(pos),
      text,
      fontSize,
      color,
    };
    this.scene.objects.push(obj);
    this.touch();
    this.emit();
    return obj;
  }

  update(id: string, mutator: (obj: SceneObject) => void): void {
    const obj = this.scene.objects.find((o) => o.id === id);
    if (!obj) return;
    mutator(obj);
    this.touch();
    this.emit();
  }

  remove(id: string): void {
    const next = this.scene.objects.filter((o) => o.id !== id);
    if (next.length === this.scene.objects.length) return;
    this.scene.objects = next;
    this.touch();
    this.emit();
  }

  // Hit test in logical coordinates. Returns the topmost (latest drawn) object
  // and which handle was hit, if any.
  hitTest(point: Vec, tolerance: number): HitResult {
    for (let i = this.scene.objects.length - 1; i >= 0; i--) {
      const obj = this.scene.objects[i];
      const hit = this.hitObject(obj, point, tolerance);
      if (hit.handle !== 'none') return { object: obj, handle: hit.handle };
    }
    return { object: null, handle: 'none' };
  }

  private hitObject(obj: SceneObject, point: Vec, tolerance: number): { handle: HitHandle } {
    if (obj.type === 'arrow') {
      if (vecDist(point, obj.from) <= tolerance) return { handle: 'arrow-from' };
      if (vecDist(point, obj.to) <= tolerance) return { handle: 'arrow-to' };
      const mid = { x: (obj.from.x + obj.to.x) / 2, y: (obj.from.y + obj.to.y) / 2 };
      if (vecDist(point, mid) <= tolerance) return { handle: 'arrow-mid' };
      const d = pointToSegmentDistance(point, obj.from, obj.to);
      if (d <= Math.max(tolerance, obj.thickness)) return { handle: 'arrow-body' };
    } else {
      // Rough bounding box; renderer measures width but we don't have ctx here.
      const charWidth = obj.fontSize * 0.6;
      const w = Math.max(charWidth, (obj.text.length || 3) * charWidth);
      const h = obj.fontSize * 1.2;
      const inside =
        point.x >= obj.pos.x - 4 &&
        point.x <= obj.pos.x + w + 4 &&
        point.y >= obj.pos.y - 4 &&
        point.y <= obj.pos.y + h + 4;
      const resize =
        Math.abs(point.x - (obj.pos.x + w + 4)) <= tolerance &&
        Math.abs(point.y - (obj.pos.y + h + 4)) <= tolerance;
      if (resize) return { handle: 'text-resize' };
      if (inside) return { handle: 'text-body' };
    }
    return { handle: 'none' };
  }
}

export type HitHandle =
  | 'none'
  | 'arrow-from'
  | 'arrow-to'
  | 'arrow-mid'
  | 'arrow-body'
  | 'text-body'
  | 'text-resize';

export interface HitResult {
  object: SceneObject | null;
  handle: HitHandle;
}
