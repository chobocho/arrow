import { Vec } from '../utils/geometry.js';

export type ObjectId = string;

export interface ArrowObject {
  id: ObjectId;
  type: 'arrow';
  from: Vec;
  to: Vec;
  color: string;
  thickness: number;
}

export interface TextObject {
  id: ObjectId;
  type: 'text';
  pos: Vec;       // top-left in logical coordinates
  text: string;
  fontSize: number;
  color: string;
}

export interface HighlighterObject {
  id: ObjectId;
  type: 'highlighter';
  points: Vec[];     // polyline in logical coordinates (>= 2 points)
  color: string;
  thickness: number; // base thickness in logical units; renderer multiplies for marker width
}

export type SceneObject = ArrowObject | TextObject | HighlighterObject;

export const HIGHLIGHTER_OPACITY = 0.35;
export const HIGHLIGHTER_WIDTH_MULT = 4;

export interface SceneData {
  id: string;
  name: string;
  centerText: string;
  centerFontSize?: number;
  objects: SceneObject[];
  createdAt: number;
  updatedAt: number;
  // Camera state for resume.
  viewOffsetX: number;
  viewOffsetY: number;
  viewScale: number;
}

export const DEFAULT_CENTER_FONT_SIZE = 28;

// Font sizes are always stored as integers. Truncate (floor) so an input of
// 23.7 becomes 23, and a legacy decimal value loaded from DB/JSON is silently
// repaired instead of throwing or rendering off-by-a-fraction.
export function floorFontSize(n: unknown, fallback: number = DEFAULT_CENTER_FONT_SIZE): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : fallback;
  return Math.max(1, Math.floor(v));
}

// Walks a loaded scene and floors any decimal font sizes in place so legacy
// data from older builds (or hand-edited JSON) becomes integer-clean.
export function normalizeSceneFontSizes(scene: SceneData): void {
  if (scene.centerFontSize != null) {
    scene.centerFontSize = floorFontSize(scene.centerFontSize, DEFAULT_CENTER_FONT_SIZE);
  }
  if (Array.isArray(scene.objects)) {
    for (const obj of scene.objects) {
      if (obj && obj.type === 'text') {
        obj.fontSize = floorFontSize(obj.fontSize, DEFAULT_CENTER_FONT_SIZE);
      }
    }
  }
}

export function newId(prefix: string): ObjectId {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyScene(name: string): SceneData {
  const now = Date.now();
  return {
    id: newId('scene'),
    name,
    centerText: '',
    centerFontSize: DEFAULT_CENTER_FONT_SIZE,
    objects: [],
    createdAt: now,
    updatedAt: now,
    viewOffsetX: 0,
    viewOffsetY: 0,
    viewScale: 1,
  };
}
