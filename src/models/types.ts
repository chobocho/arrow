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

export type SceneObject = ArrowObject | TextObject;

export interface SceneData {
  id: string;
  name: string;
  centerText: string;
  objects: SceneObject[];
  createdAt: number;
  updatedAt: number;
  // Camera state for resume.
  viewOffsetX: number;
  viewOffsetY: number;
  viewScale: number;
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
    objects: [],
    createdAt: now,
    updatedAt: now,
    viewOffsetX: 0,
    viewOffsetY: 0,
    viewScale: 1,
  };
}
