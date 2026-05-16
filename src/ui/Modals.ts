import type { App } from '../app.js';
import { SceneSummary } from '../storage/IndexedDBStore.js';
import { t } from '../i18n/lang.js';
import { customChoice, customConfirm, customPrompt, ensureModalStyles } from './CustomPrompt.js';
import { newScene, save } from '../app/FileActions.js';

export async function refreshWorks(app: App): Promise<void> {
  try {
    app.worksList = await app.db.listScenes();
  } catch {
    app.worksList = [];
  }
  renderWorks(app);
}

export function openHelpModal(app: App): void {
  if (app.helpModalEl) return;
  // The shared modal CSS is injected lazily by customPrompt/customConfirm.
  // Ensure it's mounted now so the help modal is visible on first open.
  ensureModalStyles();
  const overlay = document.createElement('div');
  overlay.className = 'ap-overlay';
  const card = document.createElement('div');
  card.className = 'ap-card ap-help-card';
  const header = document.createElement('div');
  header.className = 'ap-works-head';
  const title = document.createElement('div');
  title.className = 'ap-title';
  title.textContent = t('helpTitle');
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'ap-btn';
  closeBtn.textContent = t('close');
  header.append(title, closeBtn);

  const body = document.createElement('div');
  body.className = 'ap-help-body';
  const sections: Array<[string, string]> = [
    ['helpSecModes', 'helpModes'],
    ['helpSecKeys', 'helpKeys'],
    ['helpSecMouse', 'helpMouse'],
    ['helpSecMobile', 'helpMobile'],
  ];
  for (const [titleKey, bodyKey] of sections) {
    const sec = document.createElement('div');
    sec.className = 'sec';
    sec.textContent = '[' + t(titleKey) + ']';
    const txt = document.createElement('div');
    txt.textContent = t(bodyKey);
    body.append(sec, txt);
    const spacer = document.createElement('div');
    body.appendChild(spacer);
  }

  // Footer link to the source repository. Kept inline (no extra CSS file) so
  // the help card stays self-contained.
  const sourceWrap = document.createElement('div');
  sourceWrap.className = 'ap-help-source';
  sourceWrap.style.marginTop = '8px';
  sourceWrap.style.fontSize = '12px';
  sourceWrap.style.color = '#777';
  const sourceLink = document.createElement('a');
  sourceLink.href = 'https://github.com/chobocho/arrow';
  sourceLink.target = '_blank';
  sourceLink.rel = 'noopener noreferrer';
  sourceLink.textContent = 'github.com/chobocho/arrow';
  sourceLink.style.color = '#3a7afe';
  sourceLink.style.textDecoration = 'none';
  sourceWrap.appendChild(document.createTextNode('📦 '));
  sourceWrap.appendChild(sourceLink);
  body.appendChild(sourceWrap);

  card.append(header, body);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  app.helpModalEl = overlay;

  const onKey = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape' || ev.key === 'F1') {
      ev.preventDefault();
      ev.stopPropagation();
      closeHelpModal(app);
    }
  };
  document.addEventListener('keydown', onKey, true);
  app.helpModalCleanup = () => document.removeEventListener('keydown', onKey, true);
  closeBtn.addEventListener('click', () => closeHelpModal(app));
  overlay.addEventListener('mousedown', (ev) => { if (ev.target === overlay) closeHelpModal(app); });
}

export function closeHelpModal(app: App): void {
  if (!app.helpModalEl) return;
  if (app.helpModalCleanup) app.helpModalCleanup();
  app.helpModalEl.remove();
  app.helpModalEl = null;
  app.helpModalCleanup = null;
}

export function openWorksModal(app: App): void {
  if (app.worksModalEl) return;
  ensureModalStyles();
  void refreshWorks(app);
  const overlay = document.createElement('div');
  overlay.className = 'ap-overlay';
  const card = document.createElement('div');
  card.className = 'ap-card ap-works-card';
  const header = document.createElement('div');
  header.className = 'ap-works-head';
  const title = document.createElement('div');
  title.className = 'ap-title';
  title.textContent = t('works');
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'ap-btn';
  closeBtn.textContent = t('close');
  header.append(title, closeBtn);

  const sortBar = document.createElement('div');
  sortBar.className = 'ap-works-sort';
  const sortLabel = document.createElement('span');
  sortLabel.className = 'ap-sort-label';
  sortLabel.textContent = t('sortLabel') + ':';
  const makeSortBtn = (key: 'name' | 'date', label: string): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ap-btn ap-btn-sm ap-sort-btn' + (app.worksSortKey === key ? ' active' : '');
    b.textContent = label;
    b.dataset.sort = key;
    b.addEventListener('click', () => {
      app.worksSortKey = key;
      renderWorks(app);
    });
    return b;
  };
  sortBar.append(sortLabel, makeSortBtn('name', t('sortByName')), makeSortBtn('date', t('sortByDate')));

  const listEl = document.createElement('ul');
  listEl.className = 'ap-works-list';
  listEl.id = 'worksList';
  card.append(header, sortBar, listEl);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  app.worksModalEl = overlay;

  const onKey = (ev: KeyboardEvent): void => {
    if (ev.key === 'Escape') { ev.preventDefault(); closeWorksModal(app); }
  };
  document.addEventListener('keydown', onKey, true);
  app.worksModalCleanup = () => document.removeEventListener('keydown', onKey, true);
  closeBtn.addEventListener('click', () => closeWorksModal(app));
  overlay.addEventListener('mousedown', (ev) => { if (ev.target === overlay) closeWorksModal(app); });

  renderWorks(app);
}

export function renderWorks(app: App): void {
  if (!app.worksModalEl) return;
  const ul = app.worksModalEl.querySelector('#worksList') as HTMLUListElement | null;
  if (!ul) return;
  // Sync sort-button active state.
  const sortBtns = app.worksModalEl.querySelectorAll('.ap-sort-btn');
  sortBtns.forEach((b) => {
    const el = b as HTMLElement;
    el.classList.toggle('active', el.dataset.sort === app.worksSortKey);
  });
  ul.innerHTML = '';
  const current = app.store.get().id;
  if (app.worksList.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'ap-works-empty';
    empty.textContent = t('noWorks');
    ul.appendChild(empty);
    return;
  }
  const sorted = app.worksList.slice().sort((a, b) => {
    if (app.worksSortKey === 'name') return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    return b.updatedAt - a.updatedAt;
  });
  for (const w of sorted) {
    const li = document.createElement('li');
    li.className = 'ap-works-item' + (w.id === current ? ' current' : '');
    const name = document.createElement('span');
    name.className = 'work-name';
    name.textContent = w.name;
    name.title = new Date(w.updatedAt).toLocaleString();
    const loadBtn = document.createElement('button');
    loadBtn.type = 'button';
    loadBtn.className = 'ap-btn ap-btn-sm';
    loadBtn.textContent = t('load');
    loadBtn.addEventListener('click', () => void loadWork(app, w.id));
    const renameBtn = document.createElement('button');
    renameBtn.type = 'button';
    renameBtn.className = 'ap-btn ap-btn-sm';
    renameBtn.textContent = t('rename');
    renameBtn.addEventListener('click', () => void renameWork(app, w));
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'ap-btn ap-btn-sm';
    delBtn.textContent = t('delete');
    delBtn.addEventListener('click', () => void deleteWork(app, w));
    li.append(name, loadBtn, renameBtn, delBtn);
    ul.appendChild(li);
  }
}

export async function loadWork(app: App, id: string): Promise<void> {
  // With unsaved work, give the user three options instead of a single
  // discard-or-cancel — saving first is the most common safe choice.
  if (app.dirty) {
    const choice = await customChoice(t('unsavedLoad'), [
      { value: 'cancel', label: t('cancel') },
      { value: 'discard', label: t('dontSave') },
      { value: 'save', label: t('save'), variant: 'primary' },
    ]);
    if (choice === null || choice === 'cancel') return;
    if (choice === 'save') {
      await save(app);
      // save() may bail out if the user cancels the name prompt — detected
      // by the dirty flag still being set. In that case abort the load too.
      if (app.dirty) return;
    }
  }
  const scene = await app.db.loadScene(id);
  if (!scene) return;
  app.adoptScene(scene);
  await app.db.setMeta('lastSceneId', id);
  closeWorksModal(app);
}

export function closeWorksModal(app: App): void {
  if (!app.worksModalEl) return;
  if (app.worksModalCleanup) app.worksModalCleanup();
  app.worksModalEl.remove();
  app.worksModalEl = null;
  app.worksModalCleanup = null;
}

export async function renameWork(app: App, w: SceneSummary): Promise<void> {
  const name = await customPrompt(t('promptRename'), w.name);
  if (name === null) return;
  await app.db.renameScene(w.id, name.trim() || t('untitled'));
  if (w.id === app.store.get().id) {
    app.store.setName(name.trim() || t('untitled'));
  }
  await refreshWorks(app);
}

export async function deleteWork(app: App, w: SceneSummary): Promise<void> {
  if (!(await customConfirm(t('confirmDelete')))) return;
  await app.db.deleteScene(w.id);
  if (w.id === app.store.get().id) {
    void newScene(app);
  }
  await refreshWorks(app);
}
