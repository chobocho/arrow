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

  // ---- SceneStore: arrow extras ----
  test('SceneStore hitTest finds arrow-to endpoint', function () {
    var s = new A.SceneStore();
    var arrow = s.addArrow({ x: 100, y: 100 }, { x: 300, y: 100 }, '#000', 4);
    var hit = s.hitTest({ x: 301, y: 99 }, 5);
    assert(hit.object && hit.object.id === arrow.id, 'finds the arrow');
    assert(hit.handle === 'arrow-to', 'hits the to handle, got ' + hit.handle);
  });
  test('SceneStore hitTest misses arrow when point is far', function () {
    var s = new A.SceneStore();
    s.addArrow({ x: 100, y: 100 }, { x: 300, y: 100 }, '#000', 4);
    var hit = s.hitTest({ x: 200, y: 500 }, 5);
    assert(hit.object === null, 'no hit, got ' + (hit.object && hit.object.id));
    assert(hit.handle === 'none', 'handle is none, got ' + hit.handle);
  });

  // ---- SceneStore: text extras ----
  test('SceneStore hitTest text-resize at bottom-right corner', function () {
    var s = new A.SceneStore();
    var txt = s.addText({ x: 100, y: 100 }, 'hello', 24, '#000');
    // Bbox approx: width = 'hello'.length(5) * 24*0.6 = 72, height = 24*1.2 = 28.8.
    // Resize corner is (pos.x + w + 4, pos.y + h + 4) = (176, 132.8).
    var hit = s.hitTest({ x: 176, y: 133 }, 5);
    assert(hit.object && hit.object.id === txt.id, 'finds the text');
    assert(hit.handle === 'text-resize', 'hits resize handle, got ' + hit.handle);
  });
  test('SceneStore hitTest misses text far outside bbox', function () {
    var s = new A.SceneStore();
    s.addText({ x: 100, y: 100 }, 'hi', 20, '#000');
    var hit = s.hitTest({ x: 1000, y: 1000 }, 5);
    assert(hit.handle === 'none', 'no hit');
  });

  // ---- SceneStore: z-order ----
  test('SceneStore hitTest returns topmost object on overlap', function () {
    var s = new A.SceneStore();
    var bottom = s.addText({ x: 100, y: 100 }, 'AAAA', 24, '#000');
    var top = s.addText({ x: 100, y: 100 }, 'BBBB', 24, '#000');
    var hit = s.hitTest({ x: 110, y: 110 }, 5);
    assert(hit.object && hit.object.id === top.id, 'topmost wins, got ' + (hit.object && hit.object.id));
    assert(bottom.id !== top.id, 'sanity: different ids');
  });

  // ---- SceneStore: highlighter ----
  test('SceneStore single-point highlighter is hittable (regression)', function () {
    var s = new A.SceneStore();
    var hl = s.addHighlighter([{ x: 200, y: 200 }], '#ff0', 6);
    var hit = s.hitTest({ x: 205, y: 205 }, 5);
    assert(hit.object && hit.object.id === hl.id, 'single-point highlighter found');
    assert(hit.handle === 'highlighter-body', 'hits body, got ' + hit.handle);
  });
  test('SceneStore multi-point highlighter hits along segment', function () {
    var s = new A.SceneStore();
    var hl = s.addHighlighter(
      [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 50 }],
      '#ff0',
      4
    );
    var hit = s.hitTest({ x: 50, y: 4 }, 3);
    assert(hit.object && hit.object.id === hl.id, 'found on first segment');
    assert(hit.handle === 'highlighter-body', 'hits body');
  });
  test('SceneStore highlighter misses outside margin', function () {
    var s = new A.SceneStore();
    s.addHighlighter([{ x: 0, y: 0 }, { x: 100, y: 0 }], '#ff0', 4);
    var hit = s.hitTest({ x: 50, y: 500 }, 3);
    assert(hit.handle === 'none', 'no hit far away');
  });

  // ---- SceneStore: clampToCanvas integration ----
  test('SceneStore addArrow clamps out-of-bounds endpoints', function () {
    var s = new A.SceneStore();
    var arrow = s.addArrow({ x: -50, y: -50 }, { x: 99999, y: 99999 }, '#000', 4);
    assert(arrow.from.x === 0 && arrow.from.y === 0, 'from clamps to min, got ' + arrow.from.x + ',' + arrow.from.y);
    assert(arrow.to.x === A.MAX_CANVAS_SIZE && arrow.to.y === A.MAX_CANVAS_SIZE, 'to clamps to max');
  });
  test('SceneStore addText clamps negative position', function () {
    var s = new A.SceneStore();
    var txt = s.addText({ x: -10, y: -20 }, 'x', 20, '#000');
    assert(txt.pos.x === 0 && txt.pos.y === 0, 'pos clamps to (0,0)');
  });

  // ---- SceneStore: mutators / events ----
  test('SceneStore subscribe fires on add and unsubscribe stops it', function () {
    var s = new A.SceneStore();
    var calls = 0;
    var off = s.subscribe(function () { calls++; });
    s.addArrow({ x: 0, y: 0 }, { x: 10, y: 0 }, '#000', 4);
    s.addArrow({ x: 0, y: 0 }, { x: 20, y: 0 }, '#000', 4);
    assert(calls === 2, 'fired twice, got ' + calls);
    off();
    s.addArrow({ x: 0, y: 0 }, { x: 30, y: 0 }, '#000', 4);
    assert(calls === 2, 'no more fires after unsubscribe, got ' + calls);
  });
  test('SceneStore setCenterFontSize clamps to 8..200', function () {
    var s = new A.SceneStore();
    s.setCenterFontSize(1);
    assert(s.get().centerFontSize === 8, 'lower clamp, got ' + s.get().centerFontSize);
    s.setCenterFontSize(9999);
    assert(s.get().centerFontSize === 200, 'upper clamp, got ' + s.get().centerFontSize);
    s.setCenterFontSize(42);
    assert(s.get().centerFontSize === 42, 'in-range passthrough');
  });
  test('SceneStore setCenterText and setName fire listener and update fields', function () {
    var s = new A.SceneStore();
    var calls = 0;
    s.subscribe(function () { calls++; });
    s.setCenterText('hi');
    s.setName('proj');
    assert(s.get().centerText === 'hi', 'centerText updated');
    assert(s.get().name === 'proj', 'name updated');
    assert(calls === 2, 'two emits, got ' + calls);
  });
  test('SceneStore remove of unknown id is a no-op (no emit)', function () {
    var s = new A.SceneStore();
    var calls = 0;
    s.subscribe(function () { calls++; });
    s.remove('does-not-exist');
    assert(calls === 0, 'no emit on no-op, got ' + calls);
    assert(s.get().objects.length === 0, 'nothing changed');
  });

  // ---- CanvasView extras ----
  test('CanvasView panBy shifts logical offset by dx/scale', function () {
    var v = new A.CanvasView();
    v.resize(800, 600, 1);
    v.scale = 2; v.offset = { x: 100, y: 100 };
    v.panBy(20, 40); // screen px
    // offset.x -= 20/2 = 10, offset.y -= 40/2 = 20
    approx(v.offset.x, 90);
    approx(v.offset.y, 80);
  });
  test('CanvasView centerOn places logical point at screen center', function () {
    var v = new A.CanvasView();
    v.resize(800, 600, 1);
    v.scale = 1;
    v.centerOn({ x: 2000, y: 2000 });
    var screenOfPoint = v.logicalToScreen({ x: 2000, y: 2000 });
    approx(screenOfPoint.x, 400, 1e-6);
    approx(screenOfPoint.y, 300, 1e-6);
  });
  test('CanvasView zoomAt clamps to minScale and maxScale', function () {
    var v = new A.CanvasView();
    v.resize(800, 600, 1);
    v.scale = 1;
    v.zoomAt({ x: 400, y: 300 }, 1000);
    assert(v.scale === v.maxScale, 'clamps to max, got ' + v.scale);
    v.zoomAt({ x: 400, y: 300 }, 0.00001);
    assert(v.scale === v.minScale, 'clamps to min, got ' + v.scale);
  });

  // ---- geometry edge cases ----
  test('pointToSegmentDistance with degenerate segment returns distance to point', function () {
    var d = A.pointToSegmentDistance({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 });
    approx(d, 5);
  });
  test('clampToCanvas leaves in-bounds points unchanged', function () {
    var p = A.clampToCanvas({ x: 100, y: 200 });
    assert(p.x === 100 && p.y === 200, 'unchanged');
  });

  // ---- i18n ----
  test('i18n falls back across languages', function () {
    A.setLang('ko');
    var ko = A.t('save');
    A.setLang('en');
    var en = A.t('save');
    assert(ko === '저장' && en === 'Save', 'translation works ko=' + ko + ' en=' + en);
  });
  test('i18n unknown key returns the key itself', function () {
    A.setLang('ko');
    var v = A.t('definitelyNotAKey__xyz');
    assert(v === 'definitelyNotAKey__xyz', 'fallback to key, got ' + v);
  });
  test('i18n getLang reflects setLang', function () {
    A.setLang('en');
    assert(A.getLang() === 'en', 'getLang is en');
    A.setLang('ko');
    assert(A.getLang() === 'ko', 'getLang is ko');
  });

  // ---- emptyScene ----
  test('emptyScene returns sane defaults', function () {
    var s = A.emptyScene('x');
    assert(s.name === 'x', 'name set');
    assert(Array.isArray(s.objects) && s.objects.length === 0, 'objects empty');
    assert(typeof s.id === 'string' && s.id.length > 0, 'id present');
  });
  test('emptyScene has zero view offset and unit scale', function () {
    var s = A.emptyScene('y');
    assert(s.viewOffsetX === 0 && s.viewOffsetY === 0, 'offset (0,0)');
    assert(s.viewScale === 1, 'scale 1');
    assert(typeof s.createdAt === 'number' && typeof s.updatedAt === 'number', 'timestamps');
  });
  test('newId yields unique ids with the requested prefix', function () {
    var a = A.newId('foo');
    var b = A.newId('foo');
    assert(a !== b, 'ids differ');
    assert(a.indexOf('foo_') === 0, 'prefix applied, got ' + a);
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
