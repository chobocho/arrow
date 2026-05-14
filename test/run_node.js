#!/usr/bin/env node
// Headless Node runner for the test suite. Stubs the DOM/IndexedDB just enough
// for the geometry / SceneStore / i18n tests to execute. Browser tests still
// exercise the renderer and input handling in test/test_runner.html.

global.window = {};
global.document = undefined;
global.indexedDB = undefined;
global.performance = { now: function () { return Date.now(); } };

require('./test_arrow.js');
