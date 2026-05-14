// Minimal hand-rolled test framework for the arrow mind map.
// Runs in a browser via test_runner.html and in Node via test/run_node.js.
(function () {
  'use strict';

  var results = [];
  var failed = 0;

  function out(line, cls) {
    if (typeof document !== 'undefined') {
      var pre = document.getElementById('results');
      var span = document.createElement('span');
      if (cls) span.className = cls;
      span.textContent = line + '\n';
      pre.appendChild(span);
    } else {
      var prefix = cls === 'test-fail' ? 'FAIL ' : cls === 'test-pass' ? 'PASS ' : '';
      console.log(prefix + line);
    }
  }

  function test(name, fn) {
    try {
      fn();
      results.push({ name: name, ok: true });
      out('PASS: ' + name, 'test-pass');
    } catch (e) {
      failed++;
      results.push({ name: name, ok: false, err: e });
      out('FAIL: ' + name + ' -- ' + (e && e.message ? e.message : e), 'test-fail');
    }
  }

  function assert(cond, msg) {
    if (!cond) throw new Error(msg || 'assertion failed');
  }
  function approx(a, b, eps) {
    eps = eps || 1e-6;
    if (Math.abs(a - b) > eps) throw new Error('approx ' + a + ' != ' + b);
  }

  var A = (typeof window !== 'undefined' && window.ArrowApp) || require('../dist/bundle.js');

  // ---- geometry ----
  test('vecDist between (0,0)-(3,4) is 5', function () {
    approx(A.vecDist({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
  });
  test('pointToSegmentDistance on the segment is 0', function () {
    approx(A.pointToSegmentDistance({ x: 5, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }), 0);
  });
  test('pointToSegmentDistance perpendicular is correct', function () {
    approx(A.pointToSegmentDistance({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 }), 3);
  });
  test('clampToCanvas keeps points in 0..MAX', function () {
    var p = A.clampToCanvas({ x: -10, y: 99999 });
    assert(p.x === 0, 'x clamps low');
    assert(p.y === A.MAX_CANVAS_SIZE, 'y clamps high');
  });

  // ---- CanvasView ----
  test('CanvasView screen<->logical roundtrip', function () {
    var v = new A.CanvasView();
    v.resize(800, 600, 1);
    v.scale = 2; v.offset = { x: 100, y: 50 };
    var p = { x: 200, y: 150 };
    var logical = v.screenToLogical(p);
    var screen = v.logicalToScreen(logical);
    approx(screen.x, p.x, 1e-6);
    approx(screen.y, p.y, 1e-6);
  });
  test('CanvasView zoomAt keeps anchor point fixed', function () {
    var v = new A.CanvasView();
    v.resize(800, 600, 1);
    v.scale = 1; v.offset = { x: 0, y: 0 };
    var anchor = { x: 400, y: 300 };
    var beforeLogical = v.screenToLogical(anchor);
    v.zoomAt(anchor, 1.5);
    var afterLogical = v.screenToLogical(anchor);
    approx(beforeLogical.x, afterLogical.x, 1e-6);
    approx(beforeLogical.y, afterLogical.y, 1e-6);
  });

  // ---- SceneStore ----
  test('SceneStore addArrow / hitTest endpoint', function () {
    var s = new A.SceneStore();
    var arrow = s.addArrow({ x: 100, y: 100 }, { x: 300, y: 100 }, '#000', 4);
    var hit = s.hitTest({ x: 100, y: 102 }, 5);
    assert(hit.object && hit.object.id === arrow.id, 'finds the arrow');
    assert(hit.handle === 'arrow-from', 'hits the from handle, got ' + hit.handle);
  });
  test('SceneStore addArrow / hitTest body', function () {
    var s = new A.SceneStore();
    var arrow = s.addArrow({ x: 100, y: 100 }, { x: 300, y: 100 }, '#000', 4);
    var hit = s.hitTest({ x: 200, y: 102 }, 5);
    assert(hit.object && hit.object.id === arrow.id, 'finds the arrow');
    assert(hit.handle === 'arrow-mid' || hit.handle === 'arrow-body', 'hits mid or body');
  });
  test('SceneStore remove and update', function () {
    var s = new A.SceneStore();
    var arrow = s.addArrow({ x: 0, y: 0 }, { x: 100, y: 0 }, '#000', 4);
    s.update(arrow.id, function (o) { if (o.type === 'arrow') o.to = { x: 50, y: 0 }; });
    assert(s.get().objects[0].to.x === 50, 'updated');
    s.remove(arrow.id);
    assert(s.get().objects.length === 0, 'removed');
  });
  test('SceneStore addText hitTest hits inside', function () {
    var s = new A.SceneStore();
    var txt = s.addText({ x: 100, y: 100 }, 'hello', 24, '#000');
    var hit = s.hitTest({ x: 120, y: 110 }, 5);
    assert(hit.object && hit.object.id === txt.id, 'finds the text');
  });

  // ---- i18n ----
  test('i18n falls back across languages', function () {
    A.setLang('ko');
    var ko = A.t('save');
    A.setLang('en');
    var en = A.t('save');
    assert(ko === '저장' && en === 'Save', 'translation works ko=' + ko + ' en=' + en);
  });

  // ---- emptyScene ----
  test('emptyScene returns sane defaults', function () {
    var s = A.emptyScene('x');
    assert(s.name === 'x', 'name set');
    assert(Array.isArray(s.objects) && s.objects.length === 0, 'objects empty');
    assert(typeof s.id === 'string' && s.id.length > 0, 'id present');
  });

  // ---- summary ----
  var ok = results.length - failed;
  var msg = 'TOTAL ' + results.length + ' / PASS ' + ok + ' / FAIL ' + failed;
  out(msg, failed === 0 ? 'test-pass' : 'test-fail');
  if (typeof document !== 'undefined') {
    var pre = document.createElement('div');
    pre.className = 'summary ' + (failed === 0 ? 'ok' : 'bad');
    pre.textContent = msg;
    document.body.appendChild(pre);
  }
  if (typeof process !== 'undefined' && process.exit) {
    process.exitCode = failed === 0 ? 0 : 1;
  }
})();
