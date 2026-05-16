import type { App } from '../app.js';
import { SceneData, emptyScene } from '../models/types.js';
import { MAX_CANVAS_SIZE, Vec } from '../utils/geometry.js';
import { t } from '../i18n/lang.js';
import { customChoice, customConfirm, customPrompt } from '../ui/CustomPrompt.js';
import { refreshWorks } from '../ui/Modals.js';
import { updateSelectionUi, updateTitle } from '../ui/UiBindings.js';
import { parseArrowFile, serializeArrowFile } from '../storage/ArrowFile.js';

export async function ensureName(app: App): Promise<string | null> {
  let name = app.store.get().name;
  // Bail to a name prompt when the current name is a placeholder — both the
  // current-language i18n values (t('newWork'), t('untitled')) and the legacy
  // literals that older builds / hardcoded SceneStore defaults emit. Without
  // the English 'New Work' entry, a fresh scene in English mode would silently
  // save with the placeholder as its real name.
  const placeholders = [
    t('newWork'), t('untitled'),
    '새 작업', '제목 없음', 'New Work', 'Untitled',
  ];
  if (!name || placeholders.indexOf(name) >= 0) {
    const input = await customPrompt(t('promptName'), '');
    if (input === null) return null;
    name = input.trim() || t('untitled');
    app.store.setName(name);
  }
  return name;
}

// Standard "Save / Don't Save / Cancel" gate before an action that would
// replace the current scene. Returns true when the caller should proceed.
// Reused by loadWork and .arrow import so the behavior stays identical
// regardless of where the new scene comes from.
export async function confirmUnsaved(app: App): Promise<boolean> {
  if (!app.dirty) return true;
  const choice = await customChoice(t('unsavedLoad'), [
    { value: 'cancel', label: t('cancel') },
    { value: 'discard', label: t('dontSave') },
    { value: 'save', label: t('save'), variant: 'primary' },
  ]);
  if (choice === null || choice === 'cancel') return false;
  if (choice === 'save') {
    await save(app);
    // save() may bail out if the user cancels the name prompt — detected
    // by the dirty flag still being set. In that case abort the action.
    if (app.dirty) return false;
  }
  return true;
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
  app.adoptScene(emptyScene(t('newWork')));
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

export function exportArrow(app: App): void {
  const scene = app.store.get();
  const text = serializeArrowFile(scene);
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (scene.name || 'arrow') + '.arrow';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
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
  // Dispatch by filename extension: .arrow → text-format scene parser
  // (replaces the current scene); anything else → JSON bulk DB import
  // (does not touch the live view).
  const name = file.name || '';
  const lower = name.toLowerCase();
  const isArrow = lower.endsWith('.arrow');
  try {
    const text = await file.text();
    if (isArrow) {
      // Strip extension for the scene name so a file called
      // "ideas.arrow" becomes scene "ideas" in the works list.
      const base = name.replace(/\.[^./\\]+$/, '') || 'arrow';
      const scene = parseArrowFile(text, base);
      if (!scene) {
        window.alert(t('invalidArrow'));
        return;
      }
      // Importing replaces the current view — go through the same Save /
      // Don't Save / Cancel gate as loadWork so unsaved edits aren't lost.
      if (!(await confirmUnsaved(app))) return;
      // Stamp fresh timestamps so the new entry sorts as "most recent" in
      // the works list; emptyScene already gave it a fresh id.
      const now = Date.now();
      scene.createdAt = now;
      scene.updatedAt = now;
      app.adoptScene(scene);
      await app.db.saveScene(scene);
      await app.db.setMeta('lastSceneId', scene.id);
      await refreshWorks(app);
      app.flashStatus(t('saved'));
      return;
    }
    const payload = JSON.parse(text);
    const count = await app.db.importAll(payload, true);
    await refreshWorks(app);
    app.flashStatus(count + t('importedCount'));
  } catch (err) {
    console.warn(err);
    window.alert(isArrow ? t('invalidArrow') : t('invalidJson'));
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
