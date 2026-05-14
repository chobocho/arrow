import { App } from './app.js';

function boot(): void {
  const root = document.getElementById('app');
  if (!root) {
    console.error('Root element #app not found');
    return;
  }
  // Expose for debugging only.
  (window as any).__arrowApp = new App(root);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
