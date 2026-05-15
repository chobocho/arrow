import type { App } from '../app.js';
import { SceneData, emptyScene } from '../models/types.js';
import { MAX_CANVAS_SIZE, Vec } from '../utils/geometry.js';
import { t } from '../i18n/lang.js';
import { customConfirm, customPrompt } from '../ui/CustomPrompt.js';
import { refreshWorks } from '../ui/Modals.js';
import { updateSelectionUi, updateTitle } from '../ui/UiBindings.js';

export async function ensureName(app: App): Promise<string | null> {
  let name = app.store.get().name;
  if (!name || name === '새 작업' || name === 'Untitled') {
    const input = await customPrompt(t('promptName'), '');
    if (input === null) return null;
    name = input.trim() || t('untitled');
    app.store.setName(name);
  }
  return name;
}

export async function save(app: App): Promise<void> {
  const name = await ensureName(app);
  if (name === null) return;
  const scene = app.store.get();
  scene.viewOffsetX = app.view.offset.x;
  scene.viewOffsetY = app.view.offset.y;
  scene.viewScale = app.view.scale;
  await app.db.saveScene(scene);
  await app.db.setMeta('lastSceneId', scene.id);
  app.dirty = false;
  app.cancelAutosave();
  await refreshWorks(app);
  app.flashStatus(t('saved'));
}

export async function saveAs(app: App): Promise<void> {
  const input = await customPrompt(t('promptName'), app.store.get().name);
  if (input === null) return;
  const next: SceneData = JSON.parse(JSON.stringify(app.store.get()));
  next.id = 'scene_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  next.name = input.trim() || t('untitled');
  next.createdAt = Date.now();
  next.updatedAt = Date.now();
  app.store.replace(next);
  await app.db.saveScene(next);
  await app.db.setMeta('lastSceneId', next.id);
  app.dirty = false;
  app.cancelAutosave();
  await refreshWorks(app);
  updateTitle(app);
  app.flashStatus(t('saved'));
}

export async function newScene(app: App): Promise<void> {
  if (app.dirty && !(await customConfirm(t('unsavedNew')))) {
    return;
  }
  app.adoptScene(emptyScene(t('untitled')));
  app.view.scale = 1;
  app.view.offset = { x: MAX_CANVAS_SIZE / 2 - app.view.width / 2, y: MAX_CANVAS_SIZE / 2 - app.view.height / 2 };
  app.requestRender();
}

export async function deleteSelected(app: App): Promise<void> {
  if (!app.selectedId) return;
  if (!(await customConfirm(t('confirmDeleteSelected')))) return;
  app.pushHistory();
  app.store.remove(app.selectedId);
  app.selectedId = null;
  updateSelectionUi(app);
}

export function exportPng(app: App): void {
  const cropped = app.renderer.renderToImage(app.store.get());
  const url = cropped.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = (app.store.get().name || 'arrow') + '.png';
  a.click();
}

export async function exportJson(app: App): Promise<void> {
  const all = await app.db.exportAll();
  const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'arrow-mindmap-export.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function importJsonClick(): void {
  const inp = document.getElementById('fileImport') as HTMLInputElement;
  inp.value = '';
  inp.click();
}

export async function handleImportFile(app: App, e: Event): Promise<void> {
  const inp = e.target as HTMLInputElement;
  const file = inp.files && inp.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    const count = await app.db.importAll(payload, true);
    await refreshWorks(app);
    app.flashStatus(count + t('importedCount'));
  } catch (err) {
    console.warn(err);
    window.alert(t('invalidJson'));
  }
}

export function fitToScreen(app: App): void {
  const scene = app.store.get();
  if (scene.objects.length === 0) {
    const center: Vec = { x: MAX_CANVAS_SIZE / 2, y: MAX_CANVAS_SIZE / 2 };
    app.view.scale = 1;
    app.view.centerOn(center);
    app.requestRender();
    return;
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const o of scene.objects) {
    if (o.type === 'arrow') {
      minX = Math.min(minX, o.from.x, o.to.x);
      minY = Math.min(minY, o.from.y, o.to.y);
      maxX = Math.max(maxX, o.from.x, o.to.x);
      maxY = Math.max(maxY, o.from.y, o.to.y);
    } else if (o.type === 'highlighter') {
      for (const p of o.points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
    } else {
      minX = Math.min(minX, o.pos.x);
      minY = Math.min(minY, o.pos.y);
      maxX = Math.max(maxX, o.pos.x + o.fontSize * Math.max(2, o.text.length));
      maxY = Math.max(maxY, o.pos.y + o.fontSize * 1.4);
    }
  }
  const padding = 80;
  const w = maxX - minX + padding * 2;
  const h = maxY - minY + padding * 2;
  const scale = Math.max(0.1, Math.min(2, Math.min(app.view.width / w, app.view.height / h)));
  app.view.scale = scale;
  app.view.centerOn({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 });
  app.requestRender();
}
