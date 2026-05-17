// Lightweight dropdown menu used by the File / Help toolbar buttons.
// The toolbar carries one trigger button per menu; clicking it opens a panel
// below the button with one row per action. The panel closes on outside
// click, Esc, or after a menu item runs.
//
// No CSS file — styles are injected once on first open so the artifact stays
// a single index.html + dist/bundle.js (no extra fetches).

export interface DropdownItem {
  emoji: string;
  // Label and tooltip are resolved at render time so language switches reflect
  // on the next open without re-wiring callbacks.
  label: () => string;
  title?: () => string;
  onSelect: () => void;
  disabled?: () => boolean;
  separatorAfter?: boolean;
}

export interface DropdownHandle {
  trigger: HTMLButtonElement;
  open: () => void;
  close: () => void;
  isOpen: () => boolean;
}

let stylesInjected = false;

function injectStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .ap-menu-wrap { position: relative; display: inline-block; }
    .ap-menu-panel {
      position: absolute;
      top: 100%;
      right: 0;
      margin-top: 4px;
      min-width: 180px;
      background: #fff;
      border: 1px solid #e2e2ea;
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.14);
      padding: 4px 0;
      z-index: 9000;
      animation: ap-menu-pop 0.08s ease;
    }
    @keyframes ap-menu-pop {
      from { opacity: 0; transform: translateY(-2px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .ap-menu-item {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 8px 14px;
      border: none;
      background: transparent;
      cursor: pointer;
      font: inherit;
      font-size: 13px;
      color: #222;
      text-align: left;
      white-space: nowrap;
    }
    .ap-menu-item:hover:not([disabled]) { background: #f0f3ff; }
    .ap-menu-item[disabled] { opacity: 0.45; cursor: not-allowed; }
    .ap-menu-item .icon { width: 18px; text-align: center; }
    .ap-menu-sep { height: 1px; background: #eef0f4; margin: 4px 0; }
    @media (max-width: 720px) {
      .ap-menu-panel { min-width: 200px; }
      .ap-menu-item { padding: 10px 14px; font-size: 14px; }
    }
  `;
  document.head.appendChild(style);
}

// Wrap an existing trigger button in a positioned container so the menu
// panel can sit directly under it. Returns the wrapper so the caller can
// reuse it if needed (e.g. when restyling the trigger).
function wrapTrigger(trigger: HTMLButtonElement): HTMLElement {
  const parent = trigger.parentElement;
  if (parent && parent.classList.contains('ap-menu-wrap')) return parent;
  const wrap = document.createElement('div');
  wrap.className = 'ap-menu-wrap';
  if (parent) parent.insertBefore(wrap, trigger);
  wrap.appendChild(trigger);
  return wrap;
}

export function createDropdownMenu(
  trigger: HTMLButtonElement,
  items: DropdownItem[],
): DropdownHandle {
  injectStyles();
  const wrap = wrapTrigger(trigger);
  let panel: HTMLDivElement | null = null;
  let onDocPointerDown: ((ev: Event) => void) | null = null;
  let onDocKeyDown: ((ev: KeyboardEvent) => void) | null = null;

  function close(): void {
    if (!panel) return;
    panel.remove();
    panel = null;
    if (onDocPointerDown) {
      document.removeEventListener('pointerdown', onDocPointerDown, true);
      onDocPointerDown = null;
    }
    if (onDocKeyDown) {
      document.removeEventListener('keydown', onDocKeyDown, true);
      onDocKeyDown = null;
    }
  }

  function render(): HTMLDivElement {
    const p = document.createElement('div');
    p.className = 'ap-menu-panel';
    p.setAttribute('role', 'menu');
    for (const item of items) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ap-menu-item';
      btn.setAttribute('role', 'menuitem');
      const isDisabled = item.disabled ? item.disabled() : false;
      if (isDisabled) btn.setAttribute('disabled', '');
      if (item.title) btn.title = item.title();
      const iconSpan = document.createElement('span');
      iconSpan.className = 'icon';
      iconSpan.textContent = item.emoji;
      const labelSpan = document.createElement('span');
      labelSpan.className = 'label';
      labelSpan.textContent = item.label();
      btn.append(iconSpan, labelSpan);
      btn.addEventListener('click', () => {
        if (item.disabled && item.disabled()) return;
        close();
        item.onSelect();
      });
      p.appendChild(btn);
      if (item.separatorAfter) {
        const sep = document.createElement('div');
        sep.className = 'ap-menu-sep';
        p.appendChild(sep);
      }
    }
    return p;
  }

  function open(): void {
    if (panel) return;
    panel = render();
    wrap.appendChild(panel);
    onDocPointerDown = (ev: Event): void => {
      const target = ev.target as Node | null;
      if (!target) return;
      if (panel && panel.contains(target)) return;
      if (trigger.contains(target)) return;
      close();
    };
    onDocKeyDown = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        ev.stopPropagation();
        close();
        trigger.focus();
      }
    };
    document.addEventListener('pointerdown', onDocPointerDown, true);
    document.addEventListener('keydown', onDocKeyDown, true);
  }

  trigger.addEventListener('click', (ev) => {
    ev.preventDefault();
    if (panel) close();
    else open();
  });

  return {
    trigger,
    open,
    close,
    isOpen: () => panel !== null,
  };
}
