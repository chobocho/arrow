import { t } from '../i18n/lang.js';

// Lightweight modal replacement for window.prompt. Returns the typed string,
// or null when the user cancels (Esc / Cancel button / clicking the backdrop).
// Resolves on the same microtask as the user action so the call site stays
// drop-in compatible aside from being a Promise.

let stylesInjected = false;

// Exposed so other modal openers (e.g. the help modal in app.ts) can guarantee
// the shared .ap-overlay / .ap-card styles are present before mounting.
export function ensureModalStyles(): void {
  injectStyles();
}

function injectStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .ap-overlay {
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.42);
      display: flex; align-items: center; justify-content: center;
      z-index: 9999;
      animation: ap-fade 0.12s ease;
    }
    @keyframes ap-fade { from { opacity: 0; } to { opacity: 1; } }
    .ap-card {
      background: #fff;
      border-radius: 10px;
      box-shadow: 0 12px 40px rgba(0,0,0,0.22);
      padding: 18px 18px 14px;
      min-width: 300px;
      max-width: 92vw;
      font-family: inherit;
      color: #222;
    }
    .ap-title {
      font-size: 14px;
      color: #444;
      margin-bottom: 10px;
      word-break: keep-all;
    }
    .ap-input {
      width: 100%;
      box-sizing: border-box;
      font-size: 15px;
      padding: 8px 10px;
      border: 1px solid #d0d0d8;
      border-radius: 6px;
      outline: none;
      font-family: inherit;
    }
    .ap-input:focus { border-color: #3a7afe; box-shadow: 0 0 0 2px rgba(58,122,254,0.15); }
    .ap-actions {
      display: flex; justify-content: flex-end; gap: 8px;
      margin-top: 12px;
    }
    .ap-btn {
      appearance: none; border: 1px solid #d0d0d8; background: #fff;
      padding: 6px 14px; border-radius: 6px; cursor: pointer; font-size: 13px;
      color: #222;
    }
    .ap-btn:hover { background: #f0f3ff; }
    .ap-btn.primary { background: #3a7afe; border-color: #3a7afe; color: #fff; }
    .ap-btn.primary:hover { background: #2e6bf0; }
    .ap-btn-sm { padding: 4px 10px; font-size: 12px; }
    .ap-works-card { min-width: 380px; max-width: 92vw; max-height: 80vh; display: flex; flex-direction: column; }
    .ap-works-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; gap: 12px; }
    .ap-works-head .ap-title { margin-bottom: 0; font-weight: 600; font-size: 15px; }
    .ap-works-list { list-style: none; margin: 0; padding: 0; overflow-y: auto; flex: 1; }
    .ap-works-item { display: flex; align-items: center; gap: 6px; padding: 8px 6px; border-bottom: 1px solid #f1f1f5; font-size: 13px; }
    .ap-works-item.current { background: #f0f5ff; border-radius: 4px; }
    .ap-works-item .work-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .ap-works-empty { padding: 20px; text-align: center; color: #999; font-size: 13px; }
    .ap-works-sort { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; font-size: 12px; color: #666; }
    .ap-sort-label { color: #888; }
    .ap-sort-btn.active { background: #3a7afe; border-color: #3a7afe; color: #fff; }
  `;
  document.head.appendChild(style);
}

export interface PromptOptions {
  // Use a <textarea> instead of a single-line <input>. Enter inserts a newline;
  // submit happens via Ctrl/⌘+Enter or the OK button.
  multiline?: boolean;
  // Hard cap on text length. Live character counter is shown beneath the field
  // when set. Pasting past the cap is truncated.
  maxLength?: number;
}

export function customPrompt(
  message: string,
  defaultValue: string = '',
  placeholder: string = '',
  options: PromptOptions = {},
): Promise<string | null> {
  injectStyles();
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'ap-overlay';
    const card = document.createElement('div');
    card.className = 'ap-card';
    const title = document.createElement('div');
    title.className = 'ap-title';
    title.textContent = message;
    const multiline = !!options.multiline;
    const input: HTMLInputElement | HTMLTextAreaElement = multiline
      ? document.createElement('textarea')
      : document.createElement('input');
    if (!multiline) (input as HTMLInputElement).type = 'text';
    input.className = 'ap-input';
    input.value = defaultValue ?? '';
    if (placeholder) input.placeholder = placeholder;
    if (multiline) {
      (input as HTMLTextAreaElement).rows = 5;
      (input as HTMLTextAreaElement).style.resize = 'vertical';
      (input as HTMLTextAreaElement).style.minHeight = '96px';
    }
    if (options.maxLength && options.maxLength > 0) {
      input.maxLength = options.maxLength;
    }
    let counter: HTMLDivElement | null = null;
    if (options.maxLength && options.maxLength > 0) {
      counter = document.createElement('div');
      counter.className = 'ap-counter';
      counter.style.fontSize = '11px';
      counter.style.color = '#888';
      counter.style.textAlign = 'right';
      counter.style.marginTop = '4px';
      const updateCounter = (): void => {
        if (!counter) return;
        counter.textContent = input.value.length + ' / ' + options.maxLength;
      };
      input.addEventListener('input', updateCounter);
      updateCounter();
    }
    const actions = document.createElement('div');
    actions.className = 'ap-actions';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'ap-btn';
    cancelBtn.textContent = t('cancel');
    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'ap-btn primary';
    okBtn.textContent = t('ok');
    actions.appendChild(cancelBtn);
    actions.appendChild(okBtn);
    card.appendChild(title);
    card.appendChild(input);
    if (counter) card.appendChild(counter);
    card.appendChild(actions);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    let finished = false;
    const finish = (value: string | null): void => {
      if (finished) return;
      finished = true;
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      resolve(value);
    };
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key === 'Enter') {
        // Korean/Japanese IME fires an Enter to commit composition. Ignore that
        // first Enter so users don't accidentally submit while still composing.
        if (ev.isComposing || ev.keyCode === 229) return;
        if (multiline) {
          // Plain Enter inserts a newline (default textarea behavior). Submit
          // only on Ctrl/⌘+Enter so users can type multi-line notes freely.
          if (!(ev.ctrlKey || ev.metaKey)) return;
          ev.preventDefault();
          ev.stopPropagation();
          finish(input.value);
          return;
        }
        ev.preventDefault();
        ev.stopPropagation();
        finish(input.value);
      } else if (ev.key === 'Escape') {
        ev.preventDefault();
        ev.stopPropagation();
        finish(null);
      }
    };
    document.addEventListener('keydown', onKey, true);
    okBtn.addEventListener('click', () => finish(input.value));
    cancelBtn.addEventListener('click', () => finish(null));
    overlay.addEventListener('mousedown', (ev) => {
      if (ev.target === overlay) finish(null);
    });

    // Focus on next frame so the modal is mounted before focus moves.
    requestAnimationFrame(() => {
      input.focus();
      if (!multiline) (input as HTMLInputElement).select();
    });
  });
}

// Three-or-more-button choice dialog. Each button carries a `value` returned
// by the promise when clicked. Esc / backdrop / "Cancel" semantics: resolve
// with null. Enter focuses & activates the button marked `variant: 'primary'`
// (typically the last/safest non-destructive action — e.g. Save in a
// Save/Don't Save/Cancel triad).
export interface ChoiceButton {
  label: string;
  value: string;
  variant?: 'primary' | 'default';
}

export function customChoice(message: string, buttons: ChoiceButton[]): Promise<string | null> {
  injectStyles();
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'ap-overlay';
    const card = document.createElement('div');
    card.className = 'ap-card';
    const title = document.createElement('div');
    title.className = 'ap-title';
    title.textContent = message;
    const actions = document.createElement('div');
    actions.className = 'ap-actions';
    card.appendChild(title);
    card.appendChild(actions);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    let finished = false;
    const finish = (value: string | null): void => {
      if (finished) return;
      finished = true;
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      resolve(value);
    };

    let primaryBtn: HTMLButtonElement | null = null;
    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ap-btn' + (b.variant === 'primary' ? ' primary' : '');
      btn.textContent = b.label;
      btn.addEventListener('click', () => finish(b.value));
      actions.appendChild(btn);
      if (b.variant === 'primary') primaryBtn = btn;
    }

    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key === 'Enter') {
        if (ev.isComposing || ev.keyCode === 229) return;
        if (!primaryBtn) return;
        ev.preventDefault();
        ev.stopPropagation();
        primaryBtn.click();
      } else if (ev.key === 'Escape') {
        ev.preventDefault();
        ev.stopPropagation();
        finish(null);
      }
    };
    document.addEventListener('keydown', onKey, true);
    overlay.addEventListener('mousedown', (ev) => {
      if (ev.target === overlay) finish(null);
    });
    requestAnimationFrame(() => { (primaryBtn || actions.firstElementChild as HTMLButtonElement | null)?.focus(); });
  });
}

// Replacement for window.confirm — resolves true on OK, false on cancel/Esc/backdrop.
export function customConfirm(message: string): Promise<boolean> {
  injectStyles();
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'ap-overlay';
    const card = document.createElement('div');
    card.className = 'ap-card';
    const title = document.createElement('div');
    title.className = 'ap-title';
    title.textContent = message;
    const actions = document.createElement('div');
    actions.className = 'ap-actions';
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'ap-btn';
    cancelBtn.textContent = t('cancel');
    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'ap-btn primary';
    okBtn.textContent = t('ok');
    actions.appendChild(cancelBtn);
    actions.appendChild(okBtn);
    card.appendChild(title);
    card.appendChild(actions);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    let finished = false;
    const finish = (value: boolean): void => {
      if (finished) return;
      finished = true;
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      resolve(value);
    };
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key === 'Enter') {
        if (ev.isComposing || ev.keyCode === 229) return;
        ev.preventDefault(); ev.stopPropagation(); finish(true);
      } else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); finish(false); }
    };
    document.addEventListener('keydown', onKey, true);
    okBtn.addEventListener('click', () => finish(true));
    cancelBtn.addEventListener('click', () => finish(false));
    overlay.addEventListener('mousedown', (ev) => { if (ev.target === overlay) finish(false); });
    requestAnimationFrame(() => okBtn.focus());
  });
}
