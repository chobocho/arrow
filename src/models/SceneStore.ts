import {
  ArrowObject,
  HighlighterObject,
  NoteObject,
  NOTE_DEFAULT_BG,
  NOTE_DEFAULT_FONT_SIZE,
  NOTE_DEFAULT_WIDTH,
  NOTE_LINE_HEIGHT_FACTOR,
  NOTE_MAX_WIDTH,
  NOTE_MIN_WIDTH,
  NOTE_PADDING,
  SceneData,
  SceneObject,
  TextObject,
  clampNoteText,
  emptyScene,
  floorFontSize,
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
    this.scene.centerFontSize = Math.max(8, Math.min(200, floorFontSize(size)));
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

  addHighlighter(points: Vec[], color: string, thickness: number): HighlighterObject {
    const clamped = points.map((p) => clampToCanvas(p));
    const obj: HighlighterObject = {
      id: newId('hl'),
      type: 'highlighter',
      points: clamped,
      color,
      thickness,
    };
    this.scene.objects.push(obj);
    this.touch();
    this.emit();
    return obj;
  }

  addNote(
    pos: Vec,
    text: string,
    options?: { width?: number; fontSize?: number; color?: string; bgColor?: string },
  ): NoteObject {
    const opt = options || {};
    const width = Math.max(NOTE_MIN_WIDTH, Math.min(NOTE_MAX_WIDTH, opt.width ?? NOTE_DEFAULT_WIDTH));
    const fontSize = floorFontSize(opt.fontSize ?? NOTE_DEFAULT_FONT_SIZE, NOTE_DEFAULT_FONT_SIZE);
    const obj: NoteObject = {
      id: newId('note'),
      type: 'note',
      pos: clampToCanvas(pos),
      text: clampNoteText(text),
      width,
      fontSize,
      color: opt.color ?? '#222222',
      bgColor: opt.bgColor ?? NOTE_DEFAULT_BG,
    };
    this.scene.objects.push(obj);
    this.touch();
    this.emit();
    return obj;
  }

  addText(pos: Vec, text: string, fontSize: number, color: string): TextObject {
    const obj: TextObject = {
      id: newId('text'),
      type: 'text',
      pos: clampToCanvas(pos),
      text,
      fontSize: floorFontSize(fontSize),
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
    } else if (obj.type === 'note') {
      const { w, h } = estimateNoteBox(obj);
      const cornerHit =
        Math.abs(point.x - (obj.pos.x + w)) <= tolerance &&
        Math.abs(point.y - (obj.pos.y + h)) <= tolerance;
      if (cornerHit) return { handle: 'note-resize' };
      const inside =
        point.x >= obj.pos.x - 2 &&
        point.x <= obj.pos.x + w + 2 &&
        point.y >= obj.pos.y - 2 &&
        point.y <= obj.pos.y + h + 2;
      if (inside) return { handle: 'note-body' };
    } else if (obj.type === 'highlighter') {
      const margin = Math.max(tolerance, obj.thickness * 2);
      if (obj.points.length === 1) {
        if (vecDist(point, obj.points[0]) <= margin) return { handle: 'highlighter-body' };
      } else {
        for (let i = 0; i + 1 < obj.points.length; i++) {
          const d = pointToSegmentDistance(point, obj.points[i], obj.points[i + 1]);
          if (d <= margin) return { handle: 'highlighter-body' };
        }
      }
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
  | 'text-resize'
  | 'note-body'
  | 'note-resize'
  | 'highlighter-body';

// Cheap, ctx-free estimate of a note's bounding box. Splits on explicit \n,
// then soft-wraps each segment by an average char-width heuristic. The
// renderer uses its own ctx.measureText pass for pixel-accurate wrapping, but
// hit-testing and fit-to-screen run without a 2D context.
export function estimateNoteBox(note: NoteObject): { w: number; h: number; lines: number } {
  const padding = NOTE_PADDING;
  const lineHeight = note.fontSize * NOTE_LINE_HEIGHT_FACTOR;
  const innerW = Math.max(1, note.width - padding * 2);
  const avgCharW = Math.max(1, note.fontSize * 0.55);
  const charsPerLine = Math.max(1, Math.floor(innerW / avgCharW));
  const segments = (note.text || '').split('\n');
  let lines = 0;
  for (const s of segments) {
    lines += Math.max(1, Math.ceil(s.length / charsPerLine));
  }
  if (lines === 0) lines = 1;
  const h = lines * lineHeight + padding * 2;
  return { w: note.width, h, lines };
}

export interface HitResult {
  object: SceneObject | null;
  handle: HitHandle;
}
