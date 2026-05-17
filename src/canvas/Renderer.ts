import { Vec, MAX_CANVAS_SIZE } from '../utils/geometry.js';
import {
  ArrowObject,
  DEFAULT_CENTER_FONT_SIZE,
  HighlighterObject,
  HIGHLIGHTER_OPACITY,
  HIGHLIGHTER_WIDTH_MULT,
  NOTE_LINE_HEIGHT_FACTOR,
  NOTE_PADDING,
  NoteObject,
  SceneData,
  SceneObject,
  TextObject,
} from '../models/types.js';
import { estimateNoteBox } from '../models/SceneStore.js';
import { CanvasView } from './CanvasView.js';

export interface RenderOptions {
  selectedId: string | null;
  draftArrow: ArrowObject | null;             // arrow currently being drawn
  draftHighlighter: HighlighterObject | null; // highlighter stroke in progress
  showGrid: boolean;
}

export class Renderer {
  constructor(private ctx: CanvasRenderingContext2D, private view: CanvasView) {}

  // Draw the scene to a CanvasRenderingContext2D. The ctx is assumed to be set
  // up with the device pixel ratio transform applied by the caller.
  render(scene: SceneData, opts: RenderOptions): void {
    const { ctx, view } = this;
    ctx.save();
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(0, 0, view.width, view.height);

    // Canvas world boundary
    this.fillWorld();
    if (opts.showGrid) this.drawGrid();

    // Center topic indicator (visual anchor).
    this.drawCenter(scene);

    // Draw highlighter strokes first so arrows/text sit on top of the marker.
    for (const obj of scene.objects) {
      if (obj.type === 'highlighter') this.drawHighlighter(obj, obj.id === opts.selectedId, false);
    }
    if (opts.draftHighlighter) this.drawHighlighter(opts.draftHighlighter, false, true);
    for (const obj of scene.objects) {
      if (obj.type !== 'highlighter') this.drawObject(obj, obj.id === opts.selectedId);
    }
    if (opts.draftArrow) this.drawArrow(opts.draftArrow, false, true);

    ctx.restore();
  }

  // Render scene to a fresh offscreen canvas at full logical resolution. Used for PNG export.
  renderToImage(scene: SceneData, padding: number = 64): HTMLCanvasElement {
    const off = document.createElement('canvas');
    const w = MAX_CANVAS_SIZE;
    const h = MAX_CANVAS_SIZE;
    off.width = w;
    off.height = h;
    const ctx = off.getContext('2d');
    if (!ctx) return off;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);

    // Save and use an "identity" view so coordinates map 1:1 to logical pixels.
    const realCtx = this.ctx;
    const realView = this.view;
    const tmpView = new CanvasView();
    tmpView.resize(w, h, 1);
    tmpView.scale = 1;
    tmpView.offset = { x: 0, y: 0 };
    (this as any).ctx = ctx;
    (this as any).view = tmpView;

    // Center marker first, then objects (highlighter under everything else).
    this.drawCenter(scene);
    for (const obj of scene.objects) {
      if (obj.type === 'highlighter') this.drawHighlighter(obj, false, false);
    }
    for (const obj of scene.objects) {
      if (obj.type !== 'highlighter') this.drawObject(obj, false);
    }

    (this as any).ctx = realCtx;
    (this as any).view = realView;

    // Crop to content bounding box (with padding) for a tidy export.
    const bounds = this.contentBounds(scene, padding);
    const cropped = document.createElement('canvas');
    cropped.width = Math.max(1, bounds.w);
    cropped.height = Math.max(1, bounds.h);
    const c2 = cropped.getContext('2d');
    if (c2) {
      c2.fillStyle = '#ffffff';
      c2.fillRect(0, 0, cropped.width, cropped.height);
      c2.drawImage(off, bounds.x, bounds.y, bounds.w, bounds.h, 0, 0, bounds.w, bounds.h);
    }
    return cropped;
  }

  private contentBounds(scene: SceneData, padding: number) {
    let minX = MAX_CANVAS_SIZE / 2 - 100;
    let minY = MAX_CANVAS_SIZE / 2 - 100;
    let maxX = MAX_CANVAS_SIZE / 2 + 100;
    let maxY = MAX_CANVAS_SIZE / 2 + 100;
    for (const o of scene.objects) {
      if (o.type === 'arrow') {
        minX = Math.min(minX, o.from.x, o.to.x);
        minY = Math.min(minY, o.from.y, o.to.y);
        maxX = Math.max(maxX, o.from.x, o.to.x);
        maxY = Math.max(maxY, o.from.y, o.to.y);
      } else if (o.type === 'highlighter') {
        const pad = o.thickness * HIGHLIGHTER_WIDTH_MULT * 0.5;
        for (const p of o.points) {
          minX = Math.min(minX, p.x - pad);
          minY = Math.min(minY, p.y - pad);
          maxX = Math.max(maxX, p.x + pad);
          maxY = Math.max(maxY, p.y + pad);
        }
      } else if (o.type === 'note') {
        const box = estimateNoteBox(o);
        minX = Math.min(minX, o.pos.x);
        minY = Math.min(minY, o.pos.y);
        maxX = Math.max(maxX, o.pos.x + box.w);
        maxY = Math.max(maxY, o.pos.y + box.h);
      } else {
        minX = Math.min(minX, o.pos.x);
        minY = Math.min(minY, o.pos.y);
        maxX = Math.max(maxX, o.pos.x + o.fontSize * Math.max(2, o.text.length));
        maxY = Math.max(maxY, o.pos.y + o.fontSize * 1.4);
      }
    }
    minX = Math.max(0, minX - padding);
    minY = Math.max(0, minY - padding);
    maxX = Math.min(MAX_CANVAS_SIZE, maxX + padding);
    maxY = Math.min(MAX_CANVAS_SIZE, maxY + padding);
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  private fillWorld(): void {
    const { ctx, view } = this;
    const tl = view.logicalToScreen({ x: 0, y: 0 });
    const br = view.logicalToScreen({ x: MAX_CANVAS_SIZE, y: MAX_CANVAS_SIZE });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
    ctx.strokeStyle = '#d0d0d0';
    ctx.lineWidth = 1;
    ctx.strokeRect(tl.x + 0.5, tl.y + 0.5, br.x - tl.x, br.y - tl.y);
  }

  private drawGrid(): void {
    const { ctx, view } = this;
    const step = 100; // logical units
    ctx.strokeStyle = '#eee';
    ctx.lineWidth = 1;
    const startX = Math.floor(view.offset.x / step) * step;
    const endX = view.offset.x + view.width / view.scale;
    for (let x = startX; x <= endX; x += step) {
      const sx = (x - view.offset.x) * view.scale;
      ctx.beginPath();
      ctx.moveTo(sx + 0.5, 0);
      ctx.lineTo(sx + 0.5, view.height);
      ctx.stroke();
    }
    const startY = Math.floor(view.offset.y / step) * step;
    const endY = view.offset.y + view.height / view.scale;
    for (let y = startY; y <= endY; y += step) {
      const sy = (y - view.offset.y) * view.scale;
      ctx.beginPath();
      ctx.moveTo(0, sy + 0.5);
      ctx.lineTo(view.width, sy + 0.5);
      ctx.stroke();
    }
  }

  private drawCenter(scene: SceneData): void {
    const { ctx, view } = this;
    const center = { x: MAX_CANVAS_SIZE / 2, y: MAX_CANVAS_SIZE / 2 };
    const screen = view.logicalToScreen(center);
    const baseFontSize = scene.centerFontSize || DEFAULT_CENTER_FONT_SIZE;
    ctx.fillStyle = '#333';
    const fontSize = Math.max(10, baseFontSize * view.scale);
    ctx.font = `${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = scene.centerText || '주제 / Topic';
    // wrap to a generous box proportional to font size.
    const wrapWidth = Math.max(120, baseFontSize * 8) * view.scale;
    this.wrapText(label, screen.x, screen.y, wrapWidth, fontSize * 1.1);
  }

  private wrapText(text: string, cx: number, cy: number, maxWidth: number, lineHeight: number): void {
    const ctx = this.ctx;
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let current = '';
    for (const w of words) {
      const test = current ? current + ' ' + w : w;
      if (ctx.measureText(test).width > maxWidth && current) {
        lines.push(current);
        current = w;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    const total = lines.length;
    const startY = cy - ((total - 1) * lineHeight) / 2;
    for (let i = 0; i < total; i++) {
      ctx.fillText(lines[i], cx, startY + i * lineHeight);
    }
  }

  private drawObject(obj: SceneObject, selected: boolean): void {
    if (obj.type === 'arrow') this.drawArrow(obj, selected, false);
    else if (obj.type === 'highlighter') this.drawHighlighter(obj, selected, false);
    else if (obj.type === 'note') this.drawNote(obj, selected);
    else this.drawText(obj, selected);
  }

  // Lay out a note's text into wrapped lines using the live 2D context. Honors
  // explicit \n and soft-wraps long words mid-string (no whitespace assumed —
  // matches Korean/CJK behavior). Returns the rendered lines and the final
  // box height in logical units.
  private layoutNoteText(text: string, innerWidth: number, fontSize: number): { lines: string[]; height: number } {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = `${fontSize}px sans-serif`;
    const lines: string[] = [];
    const segments = (text || '').split('\n');
    for (const seg of segments) {
      if (seg.length === 0) { lines.push(''); continue; }
      let current = '';
      for (const ch of seg) {
        const test = current + ch;
        if (ctx.measureText(test).width > innerWidth && current.length > 0) {
          lines.push(current);
          current = ch;
        } else {
          current = test;
        }
      }
      if (current.length > 0) lines.push(current);
    }
    ctx.restore();
    const lineHeight = fontSize * NOTE_LINE_HEIGHT_FACTOR;
    const height = Math.max(1, lines.length) * lineHeight + NOTE_PADDING * 2;
    return { lines, height };
  }

  private drawNote(n: NoteObject, selected: boolean): void {
    const { ctx, view } = this;
    const pos = view.logicalToScreen(n.pos);
    const wScreen = n.width * view.scale;
    const fsScreen = Math.max(8, n.fontSize * view.scale);
    const padScreen = NOTE_PADDING * view.scale;
    const innerW = Math.max(1, wScreen - padScreen * 2);
    const { lines, height } = this.layoutNoteText(n.text, innerW, fsScreen);
    const hScreen = height;

    // Subtle drop shadow — keeps post-it feel without obscuring siblings.
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.18)';
    ctx.shadowBlur = 6 * view.scale;
    ctx.shadowOffsetX = 1 * view.scale;
    ctx.shadowOffsetY = 2 * view.scale;
    ctx.fillStyle = n.bgColor;
    ctx.fillRect(pos.x, pos.y, wScreen, hScreen);
    ctx.restore();

    // Text — top-left within the inner padded area.
    ctx.save();
    ctx.fillStyle = n.color;
    ctx.font = `${fsScreen}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const lineHeight = fsScreen * NOTE_LINE_HEIGHT_FACTOR;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], pos.x + padScreen, pos.y + padScreen + i * lineHeight);
    }
    ctx.restore();

    // Persist the measured height back to the model so the SceneStore's cheap
    // estimate stays close to the rendered truth between frames. (Read-only on
    // its own — moving / resizing still owns the source of truth.)
    (n as { _renderedHeight?: number })._renderedHeight = hScreen / view.scale;

    if (selected) {
      ctx.save();
      ctx.strokeStyle = '#3a7afe';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(pos.x - 2, pos.y - 2, wScreen + 4, hScreen + 4);
      ctx.setLineDash([]);
      ctx.restore();
      // Resize handle at the bottom-right corner — drag to change box width.
      this.drawHandle(pos.x + wScreen, pos.y + hScreen);
    }
  }

  private drawHighlighter(hl: HighlighterObject, selected: boolean, isDraft: boolean): void {
    const { ctx, view } = this;
    if (hl.points.length < 1) return;
    const width = Math.max(1, hl.thickness * HIGHLIGHTER_WIDTH_MULT * view.scale);
    ctx.save();
    ctx.globalAlpha = isDraft ? HIGHLIGHTER_OPACITY * 0.7 : HIGHLIGHTER_OPACITY;
    ctx.strokeStyle = hl.color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const first = view.logicalToScreen(hl.points[0]);
    ctx.moveTo(first.x, first.y);
    if (hl.points.length === 1) {
      // Single tap — render a round dot by closing a 0-length segment.
      ctx.lineTo(first.x, first.y);
    } else {
      for (let i = 1; i < hl.points.length; i++) {
        const p = view.logicalToScreen(hl.points[i]);
        ctx.lineTo(p.x, p.y);
      }
    }
    ctx.stroke();
    ctx.restore();

    if (selected) {
      // Dashed bounding box around the stroke so users can see the selection
      // without obscuring the translucent stroke itself.
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of hl.points) {
        const s = view.logicalToScreen(p);
        if (s.x < minX) minX = s.x;
        if (s.y < minY) minY = s.y;
        if (s.x > maxX) maxX = s.x;
        if (s.y > maxY) maxY = s.y;
      }
      const pad = width * 0.5 + 4;
      ctx.save();
      ctx.strokeStyle = '#3a7afe';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(minX - pad, minY - pad, (maxX - minX) + pad * 2, (maxY - minY) + pad * 2);
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  private drawArrow(arrow: ArrowObject, selected: boolean, isDraft: boolean): void {
    const { ctx, view } = this;
    const from = view.logicalToScreen(arrow.from);
    const to = view.logicalToScreen(arrow.to);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) return;
    const ux = dx / len;
    const uy = dy / len;

    const thick = Math.max(1, arrow.thickness * view.scale);
    ctx.strokeStyle = isDraft ? 'rgba(0,0,0,0.4)' : arrow.color;
    ctx.fillStyle = isDraft ? 'rgba(0,0,0,0.4)' : arrow.color;
    ctx.lineWidth = thick;
    ctx.lineCap = 'round';

    // Shaft: shorten so the arrowhead doesn't overshoot.
    const headLen = Math.min(len, 12 + arrow.thickness * 3) * view.scale;
    const shaftEndX = to.x - ux * headLen * 0.7;
    const shaftEndY = to.y - uy * headLen * 0.7;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(shaftEndX, shaftEndY);
    ctx.stroke();

    // Arrowhead triangle
    const headHalf = headLen * 0.5;
    const px = -uy;
    const py = ux;
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - ux * headLen + px * headHalf, to.y - uy * headLen + py * headHalf);
    ctx.lineTo(to.x - ux * headLen - px * headHalf, to.y - uy * headLen - py * headHalf);
    ctx.closePath();
    ctx.fill();

    if (selected) {
      // Endpoint handles
      this.drawHandle(from.x, from.y);
      this.drawHandle(to.x, to.y);
      // Mid handle for moving the entire arrow
      this.drawHandle((from.x + to.x) / 2, (from.y + to.y) / 2, true);
    }
  }

  private drawText(t: TextObject, selected: boolean): void {
    const { ctx, view } = this;
    const pos = view.logicalToScreen(t.pos);
    const fs = Math.max(8, t.fontSize * view.scale);
    ctx.font = `${fs}px sans-serif`;
    ctx.fillStyle = t.color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(t.text || '...', pos.x, pos.y);

    if (selected) {
      const w = ctx.measureText(t.text || '...').width;
      const h = fs * 1.2;
      ctx.strokeStyle = '#3a7afe';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(pos.x - 4, pos.y - 4, w + 8, h + 8);
      ctx.setLineDash([]);
      // Resize handle bottom-right
      this.drawHandle(pos.x + w + 4, pos.y + h + 4);
    }
  }

  private drawHandle(x: number, y: number, secondary: boolean = false): void {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fillStyle = secondary ? '#ffd166' : '#3a7afe';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
  }
}
