#!/usr/bin/env node
// Build pipeline:
//   1. esbuild bundles src/index.ts → dist/bundle.js (IIFE, global ArrowApp)
//   2. Append a CJS-compat footer so Node `require()` returns ArrowApp
//   3. (unless --no-inline) inline the bundle into release/index.html
//
// The CJS footer is plain JS appended after esbuild's IIFE; it touches
// `module.exports` only when `module` is defined (Node CJS wrapper), so it
// stays a no-op in the browser.

import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SRC_ENTRY = join(ROOT, 'src', 'index.ts');
const OUT_BUNDLE = join(ROOT, 'dist', 'bundle.js');
const SRC_HTML = join(ROOT, 'index.html');
const RELEASE_DIR = join(ROOT, 'release');
const OUT_HTML = join(RELEASE_DIR, 'index.html');

const args = new Set(process.argv.slice(2));
const minify = args.has('--minify');
const noInline = args.has('--no-inline');

// Pick the best available esbuild flavor. Native is preferred (faster, tiny
// install), but it ships a platform-specific binary — on environments like
// Termux on Android the native install picks the wrong arch and crashes at
// runtime. esbuild-wasm is pure JS, slower but universal. We probe native
// with a tiny no-op transform and only fall back on failure, so most users
// stay on the fast path.
async function loadEsbuild() {
  try {
    const mod = await import('esbuild');
    await mod.transform('0', { loader: 'js' }); // surfaces binary mismatch
    return mod;
  } catch (err) {
    console.warn(
      'native esbuild unavailable (' + (err?.message?.split('\n')[0] || err) + ')\n' +
      ' → falling back to esbuild-wasm'
    );
    const wasm = await import('esbuild-wasm');
    // Some versions need explicit initialize; ignore if already done.
    if (typeof wasm.initialize === 'function') {
      try { await wasm.initialize({}); } catch { /* idempotent */ }
    }
    return wasm;
  }
}
const { build } = await loadEsbuild();

// 1. Bundle ----------------------------------------------------------------
await build({
  entryPoints: [SRC_ENTRY],
  outfile: OUT_BUNDLE,
  bundle: true,
  format: 'iife',
  target: 'es2019',
  legalComments: 'none',
  minify,
  // index.ts installs `globalThis.ArrowApp` as a side effect during the
  // IIFE run. The footer then copies that to `module.exports` so the same
  // artifact serves the Node test runner via `require(bundle)`. In a
  // browser, `module` is undefined and the guard short-circuits.
  footer: {
    js: 'typeof module !== "undefined" && (module.exports = globalThis.ArrowApp);',
  },
});

// 2. Optional: inline into release/index.html ------------------------------
if (!noInline) {
  if (!existsSync(SRC_HTML)) {
    console.error(`index.html missing at ${SRC_HTML}`);
    process.exit(1);
  }
  await rm(RELEASE_DIR, { recursive: true, force: true });
  await mkdir(RELEASE_DIR, { recursive: true });
  const html = await readFile(SRC_HTML, 'utf8');
  const js = await readFile(OUT_BUNDLE, 'utf8');
  const tag = /<script src="dist\/bundle\.js"><\/script>/;
  if (!tag.test(html)) {
    console.error('Could not find <script src="dist/bundle.js"> in index.html');
    process.exit(1);
  }
  // Replace the entire closing sequence within the embedded JS so the
  // inlined block doesn't accidentally terminate the outer <script>.
  const safeJs = js.replace(/<\/script>/g, '<\\/script>');
  const out = html.replace(tag, '<script>\n' + safeJs + '\n</script>');
  await writeFile(OUT_HTML, out, 'utf8');
  console.log(`wrote ${OUT_HTML} (${out.length} bytes)`);
} else {
  console.log(`wrote ${OUT_BUNDLE} (bundle only)`);
}
