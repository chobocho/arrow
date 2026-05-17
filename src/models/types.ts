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

// Post-it style sticky note. Multi-line text with explicit \n breaks plus
// soft-wrapping by width. Hard-capped to NOTE_MAX_LENGTH characters so a
// runaway paste cannot fill the canvas.
export interface NoteObject {
  id: ObjectId;
  type: 'note';
  pos: Vec;          // top-left in logical coordinates
  text: string;      // \n for explicit line breaks; capped at NOTE_MAX_LENGTH
  width: number;     // box width in logical units; height auto from wrapped text
  fontSize: number;
  color: string;     // text color
  bgColor: string;   // sticky-note background color
}

export type SceneObject = ArrowObject | TextObject | HighlighterObject | NoteObject;

export const HIGHLIGHTER_OPACITY = 0.35;
export const HIGHLIGHTER_WIDTH_MULT = 4;

// Note (sticky) constants — kept here so renderer, store, and input agree.
export const NOTE_MAX_LENGTH = 255;
export const NOTE_DEFAULT_BG = '#FFF59D';   // post-it yellow
export const NOTE_DEFAULT_FONT_SIZE = 16;
export const NOTE_DEFAULT_WIDTH = 200;
export const NOTE_MIN_WIDTH = 80;
export const NOTE_MAX_WIDTH = 1200;
export const NOTE_PADDING = 10;             // inner padding in logical units
export const NOTE_LINE_HEIGHT_FACTOR = 1.3;

export function clampNoteText(text: unknown): string {
  const s = typeof text === 'string' ? text : '';
  return s.length > NOTE_MAX_LENGTH ? s.slice(0, NOTE_MAX_LENGTH) : s;
}

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
      } else if (obj && obj.type === 'note') {
        obj.fontSize = floorFontSize(obj.fontSize, NOTE_DEFAULT_FONT_SIZE);
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
