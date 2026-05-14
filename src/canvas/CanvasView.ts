import { Vec, MAX_CANVAS_SIZE } from '../utils/geometry.js';

// Handles the mapping between screen (CSS) pixels and logical canvas coordinates,
// plus pan/zoom state. The renderer uses these helpers to position primitives.
export class CanvasView {
  offset: Vec = { x: 0, y: 0 };  // logical-space top-left visible at screen (0,0)
  scale: number = 1;             // logical -> screen factor
  minScale = 0.1;
  maxScale = 4;
  width = 0;                     // CSS pixel size of the canvas element
  height = 0;
  dpr = 1;

  resize(cssWidth: number, cssHeight: number, dpr: number): void {
    this.width = cssWidth;
    this.height = cssHeight;
    this.dpr = dpr;
  }

  screenToLogical(p: Vec): Vec {
    return {
      x: this.offset.x + p.x / this.scale,
      y: this.offset.y + p.y / this.scale,
    };
  }

  logicalToScreen(p: Vec): Vec {
    return {
      x: (p.x - this.offset.x) * this.scale,
      y: (p.y - this.offset.y) * this.scale,
    };
  }

  // Zoom while keeping the anchor (screen-space) point fixed.
  zoomAt(anchor: Vec, factor: number): void {
    const beforeLogical = this.screenToLogical(anchor);
    const next = Math.max(this.minScale, Math.min(this.maxScale, this.scale * factor));
    this.scale = next;
    const afterLogical = this.screenToLogical(anchor);
    this.offset.x += beforeLogical.x - afterLogical.x;
    this.offset.y += beforeLogical.y - afterLogical.y;
    this.clampOffset();
  }

  panBy(dxScreen: number, dyScreen: number): void {
    this.offset.x -= dxScreen / this.scale;
    this.offset.y -= dyScreen / this.scale;
    this.clampOffset();
  }

  // Keep the visible area overlapping the canvas region.
  private clampOffset(): void {
    const margin = 200;
    const visibleW = this.width / this.scale;
    const visibleH = this.height / this.scale;
    this.offset.x = Math.max(-margin, Math.min(MAX_CANVAS_SIZE + margin - visibleW, this.offset.x));
    this.offset.y = Math.max(-margin, Math.min(MAX_CANVAS_SIZE + margin - visibleH, this.offset.y));
  }

  centerOn(point: Vec): void {
    this.offset.x = point.x - this.width / (2 * this.scale);
    this.offset.y = point.y - this.height / (2 * this.scale);
    this.clampOffset();
  }
}
