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

  // ---- font size always integer ----
  test('SceneStore setCenterFontSize floors decimals', function () {
    var s = new A.SceneStore();
    s.setCenterFontSize(23.9);
    assert(s.get().centerFontSize === 23, 'floors 23.9, got ' + s.get().centerFontSize);
    s.setCenterFontSize(40.1);
    assert(s.get().centerFontSize === 40, 'floors 40.1, got ' + s.get().centerFontSize);
  });
  test('SceneStore addText floors decimal fontSize', function () {
    var s = new A.SceneStore();
    var t = s.addText({ x: 0, y: 0 }, 'hi', 24.7, '#000');
    assert(t.fontSize === 24, 'floors to 24, got ' + t.fontSize);
    assert(Number.isInteger(t.fontSize), 'is integer');
  });
  test('floorFontSize handles finite numbers and bad input', function () {
    assert(A.floorFontSize(28) === 28, '28 → 28');
    assert(A.floorFontSize(28.9) === 28, '28.9 → 28');
    assert(A.floorFontSize(0.5) === 1, 'sub-1 clamps to 1');
    assert(A.floorFontSize(NaN, 28) === 28, 'NaN falls back to 28');
    assert(A.floorFontSize('abc', 16) === 16, 'string falls back to 16');
    assert(A.floorFontSize(null, 12) === 12, 'null falls back to 12');
  });
  test('normalizeSceneFontSizes repairs legacy decimal scene data', function () {
    var scene = {
      id: 'x', name: 'x', centerText: '', centerFontSize: 33.7,
      objects: [
        { id: 't1', type: 'text', pos: { x: 0, y: 0 }, text: 'a', fontSize: 18.4, color: '#000' },
        { id: 'a1', type: 'arrow', from: { x: 0, y: 0 }, to: { x: 1, y: 1 }, color: '#000', thickness: 4 },
        { id: 't2', type: 'text', pos: { x: 0, y: 0 }, text: 'b', fontSize: 99.999, color: '#000' }
      ],
      createdAt: 0, updatedAt: 0, viewOffsetX: 0, viewOffsetY: 0, viewScale: 1
    };
    A.normalizeSceneFontSizes(scene);
    assert(scene.centerFontSize === 33, 'centerFontSize floored, got ' + scene.centerFontSize);
    assert(scene.objects[0].fontSize === 18, 'text fontSize floored, got ' + scene.objects[0].fontSize);
    assert(scene.objects[2].fontSize === 99, 'text fontSize floored, got ' + scene.objects[2].fontSize);
    // Arrow objects untouched.
    assert(scene.objects[1].thickness === 4, 'arrow thickness unchanged');
  });
  test('normalizeSceneFontSizes survives missing centerFontSize and bad fontSize', function () {
    var scene = {
      id: 'y', name: 'y', centerText: '', objects: [
        { id: 't', type: 'text', pos: { x: 0, y: 0 }, text: 'c', fontSize: 'oops', color: '#000' }
      ],
      createdAt: 0, updatedAt: 0, viewOffsetX: 0, viewOffsetY: 0, viewScale: 1
    };
    A.normalizeSceneFontSizes(scene);
    assert(scene.centerFontSize == null, 'leaves centerFontSize absent');
    assert(scene.objects[0].fontSize === A.DEFAULT_CENTER_FONT_SIZE,
      'bad fontSize falls back to default, got ' + scene.objects[0].fontSize);
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

  // ---- undo/redo (App methods, with stubbed DOM/IDB) ----
  // The App class needs a DOM for full construction. Exercise only the
  // history methods by handcrafting a partial instance that uses the real
  // prototype but minimal collaborators.
  test('App.pushHistory/undo/redo round-trip preserves objects', function () {
    if (!A.App) return; // skip when not exported
    var store = new A.SceneStore();
    var stub = {
      store: store,
      view: { offset: { x: 0, y: 0 }, scale: 1 },
      selectedId: null,
      input: { setSelected: function () {} },
      undoStack: [],
      redoStack: [],
      _updateUndoRedoUi: function () {},
    };
    // Use prototype methods.
    var P = A.App.prototype;
    var pushHistory = P.pushHistory, commit = P.commitHistorySnapshot;
    var undo = P.undo, redo = P.redo, applySnap = P._applyHistorySnapshot;
    var clone = P._cloneSceneData;
    stub._cloneSceneData = clone;
    stub.pushHistory = pushHistory;
    stub.commitHistorySnapshot = commit;
    stub.undo = undo;
    stub.redo = redo;
    stub._applyHistorySnapshot = applySnap;
    // Take a snapshot, mutate, undo, redo.
    stub.pushHistory();
    store.addArrow({ x: 0, y: 0 }, { x: 100, y: 0 }, '#000', 4);
    assert(store.get().objects.length === 1, 'after add: 1 obj, got ' + store.get().objects.length);
    stub.undo();
    assert(store.get().objects.length === 0, 'after undo: 0 obj, got ' + store.get().objects.length);
    stub.redo();
    assert(store.get().objects.length === 1, 'after redo: 1 obj, got ' + store.get().objects.length);
  });
  test('App.pushHistory caps at 8 entries (oldest dropped)', function () {
    if (!A.App) return;
    var store = new A.SceneStore();
    var stub = {
      store: store,
      view: { offset: { x: 0, y: 0 }, scale: 1 },
      selectedId: null,
      input: { setSelected: function () {} },
      undoStack: [],
      redoStack: [],
      _updateUndoRedoUi: function () {},
      _cloneSceneData: A.App.prototype._cloneSceneData,
    };
    stub.pushHistory = A.App.prototype.pushHistory;
    stub.commitHistorySnapshot = A.App.prototype.commitHistorySnapshot;
    for (var i = 0; i < 12; i++) stub.pushHistory();
    assert(stub.undoStack.length === 8, 'capped at 8, got ' + stub.undoStack.length);
  });
  test('App.commitHistorySnapshot clears redoStack', function () {
    if (!A.App) return;
    var stub = {
      store: new A.SceneStore(),
      undoStack: [],
      redoStack: [{ marker: 'old' }],
      _updateUndoRedoUi: function () {},
    };
    stub.commitHistorySnapshot = A.App.prototype.commitHistorySnapshot;
    stub.commitHistorySnapshot({ marker: 'new' });
    assert(stub.redoStack.length === 0, 'redo cleared on new commit');
    assert(stub.undoStack.length === 1, 'undo has 1');
  });

  // ---- .arrow file parser ----
  test('parseArrowFile parses the spec example into 10 texts + 9 arrows', function () {
    var content = [
      '# 주석 라인',
      'arrow',
      'Book',
      'Book -> 무협지 -> 김용',
      'Book -> 판타지 -> 뱀뱀이',
      'Book -> 잡지 -> PC 사랑 -> 2026.05',
      '할일 -> 이발 -> 13000'
    ].join('\n');
    var scene = A.parseArrowFile(content, 'spec');
    assert(scene !== null, 'parser returned null on valid file');
    assert(scene.centerText === 'Book', 'centerText is Book, got ' + scene.centerText);
    var texts = scene.objects.filter(function (o) { return o.type === 'text'; });
    var arrows = scene.objects.filter(function (o) { return o.type === 'arrow'; });
    // 10 unique non-topic labels: 무협지, 김용, 판타지, 뱀뱀이, 잡지, PC 사랑, 2026.05, 할일, 이발, 13000
    assert(texts.length === 10, 'expected 10 text objects, got ' + texts.length);
    // 9 edges: 3 from topic (Book→무협지/판타지/잡지) + 6 within chains
    // (할일 is a free root — NO topic→할일 arrow)
    assert(arrows.length === 9, 'expected 9 arrows, got ' + arrows.length);
    // All texts use the unified fontSize 24.
    for (var i = 0; i < texts.length; i++) {
      assert(texts[i].fontSize === 24, 'fontSize unified at 24, got ' + texts[i].fontSize);
    }
  });
  // Regression: new-root chains must NOT receive an implicit topic→root arrow.
  // Reproduces the user's bug report where 📚독서 was getting an arrow from
  // the topic 🎯 Arrow Map even though no chain mentioned it as a child.
  test('parseArrowFile does not add an arrow from topic to a free root', function () {
    var content = [
      'arrow',
      'Topic',
      'Standalone -> Leaf'
    ].join('\n');
    var scene = A.parseArrowFile(content, 'x');
    var arrows = scene.objects.filter(function (o) { return o.type === 'arrow'; });
    // Only one arrow: Standalone → Leaf. NO Topic → Standalone.
    assert(arrows.length === 1, 'expected exactly 1 arrow, got ' + arrows.length);
    // The Standalone text must exist (positioned somewhere) but no arrow
    // should originate near the canvas center pointing at it.
    var texts = scene.objects.filter(function (o) { return o.type === 'text'; });
    assert(texts.length === 2, 'expected 2 text nodes, got ' + texts.length);
  });
  test('parseArrowFile rejects files without arrow marker', function () {
    var bad = 'json\nBook\nA -> B';
    assert(A.parseArrowFile(bad, 'x') === null, 'should return null for missing marker');
    var empty = '';
    assert(A.parseArrowFile(empty, 'x') === null, 'should return null for empty input');
    var oneLine = 'arrow';
    assert(A.parseArrowFile(oneLine, 'x') === null, 'should return null when only marker present');
  });
  test('parseArrowFile dedupes repeated labels into a single node', function () {
    var content = [
      'arrow',
      'Hub',
      'Hub -> A -> B',
      'Hub -> A -> C',   // A reused — should not create a second "A"
      'Hub -> A -> B'    // duplicate edge A->B — should not create a second arrow
    ].join('\n');
    var scene = A.parseArrowFile(content, 'x');
    var texts = scene.objects.filter(function (o) { return o.type === 'text'; });
    // Unique non-topic labels: A, B, C
    assert(texts.length === 3, 'expected 3 unique labels, got ' + texts.length);
    var arrows = scene.objects.filter(function (o) { return o.type === 'arrow'; });
    // Edges should dedupe: Hub→A, A→B, A→C  →  3 arrows
    assert(arrows.length === 3, 'expected 3 unique edges, got ' + arrows.length);
  });
  test('parseArrowFile strips comments and ignores blanks', function () {
    var content = [
      '# top comment',
      '',
      'arrow # inline comment',
      'Topic',
      '',
      '# another',
      'Topic -> One',
      'Topic -> Two # trailing comment'
    ].join('\n');
    var scene = A.parseArrowFile(content, 'x');
    assert(scene !== null, 'parser returned null on commented file');
    assert(scene.centerText === 'Topic', 'centerText preserved, got ' + scene.centerText);
    var texts = scene.objects.filter(function (o) { return o.type === 'text'; });
    assert(texts.length === 2, 'comments stripped, got ' + texts.length + ' texts');
  });

  // Thickness resize via the toolbar input mutates the selected
  // arrow/highlighter's thickness — guard the underlying store.update path.
  test('SceneStore.update can resize arrow and highlighter thickness', function () {
    var s = new A.SceneStore();
    var arr = s.addArrow({ x: 0, y: 0 }, { x: 100, y: 0 }, '#000000', 4);
    var hl  = s.addHighlighter([{ x: 0, y: 0 }, { x: 50, y: 50 }], '#000000', 4);
    s.update(arr.id, function (o) {
      if (o.type === 'arrow' || o.type === 'highlighter') o.thickness = 12;
    });
    s.update(hl.id, function (o) {
      if (o.type === 'arrow' || o.type === 'highlighter') o.thickness = 20;
    });
    var objs = s.get().objects;
    var byId = {};
    for (var i = 0; i < objs.length; i++) byId[objs[i].id] = objs[i];
    assert(byId[arr.id].thickness === 12, 'arrow thickness updated, got ' + byId[arr.id].thickness);
    assert(byId[hl.id].thickness === 20, 'highlighter thickness updated, got ' + byId[hl.id].thickness);
  });

  // Color recolor relies on store.update(id, o => o.color = hex) working for
  // every object type. Guard against regressions by exercising each type.
  test('SceneStore.update can recolor arrow, text, and highlighter', function () {
    var s = new A.SceneStore();
    var arr = s.addArrow({ x: 0, y: 0 }, { x: 100, y: 0 }, '#000000', 4);
    var txt = s.addText({ x: 10, y: 10 }, 'hi', 16, '#000000');
    var hl  = s.addHighlighter([{ x: 0, y: 0 }, { x: 50, y: 50 }], '#000000', 4);
    s.update(arr.id, function (o) { o.color = '#ff0000'; });
    s.update(txt.id, function (o) { o.color = '#00ff00'; });
    s.update(hl.id,  function (o) { o.color = '#0000ff'; });
    var objs = s.get().objects;
    var byId = {};
    for (var i = 0; i < objs.length; i++) byId[objs[i].id] = objs[i];
    assert(byId[arr.id].color === '#ff0000', 'arrow recolored');
    assert(byId[txt.id].color === '#00ff00', 'text recolored');
    assert(byId[hl.id].color  === '#0000ff', 'highlighter recolored');
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
