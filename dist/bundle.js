// Arrow Mind Map — bundled runtime (compiled from src/*.ts).
// No external dependencies. Wrap everything in one IIFE.
(function () {
  'use strict';

  // ---------- utils/geometry ----------
  var MAX_CANVAS_SIZE = 4096;
  function vec(x, y) { return { x: x, y: y }; }
  function vecDist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function pointToSegmentDistance(p, a, b) {
    var abx = b.x - a.x, aby = b.y - a.y;
    var len2 = abx * abx + aby * aby;
    if (len2 === 0) return vecDist(p, a);
    var t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2));
    return vecDist(p, { x: a.x + abx * t, y: a.y + aby * t });
  }
  function clampToCanvas(p) {
    return {
      x: Math.max(0, Math.min(MAX_CANVAS_SIZE, p.x)),
      y: Math.max(0, Math.min(MAX_CANVAS_SIZE, p.y))
    };
  }

  // ---------- models/types ----------
  function newId(prefix) {
    return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }
  function emptyScene(name) {
    var now = Date.now();
    return {
      id: newId('scene'),
      name: name,
      centerText: '',
      objects: [],
      createdAt: now,
      updatedAt: now,
      viewOffsetX: 0,
      viewOffsetY: 0,
      viewScale: 1
    };
  }

  // ---------- i18n ----------
  var STRINGS = {
    ko: {
      appTitle: '화살표 마인드맵',
      modeSelect: '선택', modeArrow: '화살표', modeText: '글자', modePan: '이동',
      save: '저장', saveAs: '새이름저장', newWork: '새 작업',
      delete: '삭제', rename: '이름변경',
      exportPng: 'PNG 내보내기', exportJson: 'JSON 내보내기', importJson: 'JSON 가져오기',
      language: 'EN', works: '작업 목록',
      editCenter: '주제 편집',
      promptCenter: '가운데 주제를 입력하세요',
      promptName: '작업 이름', promptRename: '새 이름',
      promptText: '글자를 입력하세요',
      confirmDelete: '정말 삭제할까요?', confirmDeleteSelected: '선택한 객체를 삭제할까요?',
      zoomIn: '확대', zoomOut: '축소', fit: '맞춤',
      selectColor: '색상', thickness: '굵기', fontSize: '글자크기',
      saved: '저장됨', importedCount: '개 가져왔습니다',
      invalidJson: '잘못된 JSON 형식입니다',
      untitled: '제목 없음',
      unsavedNew: '변경사항이 있습니다. 새로 만들까요?',
      unsavedLoad: '변경사항이 있습니다. 불러올까요?',
      placeholderTopic: '주제 / Topic',
      ok: '확인', cancel: '취소',
      load: '불러오기', close: '닫기', noWorks: '저장된 작업이 없습니다',
      sortLabel: '정렬', sortByName: '이름순', sortByDate: '최근수정순'
    },
    en: {
      appTitle: 'Arrow Mind Map',
      modeSelect: 'Select', modeArrow: 'Arrow', modeText: 'Text', modePan: 'Pan',
      save: 'Save', saveAs: 'Save As', newWork: 'New',
      delete: 'Delete', rename: 'Rename',
      exportPng: 'Export PNG', exportJson: 'Export JSON', importJson: 'Import JSON',
      language: '한', works: 'Works',
      editCenter: 'Edit Topic',
      promptCenter: 'Enter the center topic',
      promptName: 'Work name', promptRename: 'New name',
      promptText: 'Enter text',
      confirmDelete: 'Delete this work?', confirmDeleteSelected: 'Delete the selected object?',
      zoomIn: 'Zoom In', zoomOut: 'Zoom Out', fit: 'Fit',
      selectColor: 'Color', thickness: 'Thickness', fontSize: 'Font Size',
      saved: 'Saved', importedCount: ' imported',
      invalidJson: 'Invalid JSON',
      untitled: 'Untitled',
      unsavedNew: 'Unsaved changes. New work?',
      unsavedLoad: 'Unsaved changes. Discard?',
      placeholderTopic: 'Topic / 주제',
      ok: 'OK', cancel: 'Cancel',
      load: 'Load', close: 'Close', noWorks: 'No saved works',
      sortLabel: 'Sort', sortByName: 'Name', sortByDate: 'Recent'
    }
  };
  var currentLang = 'ko';
  function t(key) {
    return (STRINGS[currentLang] && STRINGS[currentLang][key]) || STRINGS.en[key] || key;
  }

  // ---------- ui/CustomPrompt ----------
  // Modal replacement for window.prompt. Returns a Promise resolving to the
  // entered string or null when the user cancels (Esc / Cancel / backdrop).
  var customPromptStylesInjected = false;
  function injectCustomPromptStyles() {
    if (customPromptStylesInjected) return;
    customPromptStylesInjected = true;
    var style = document.createElement('style');
    style.textContent =
      '.ap-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.42);' +
      'display:flex;align-items:center;justify-content:center;z-index:9999;' +
      'animation:ap-fade 0.12s ease;}' +
      '@keyframes ap-fade{from{opacity:0;}to{opacity:1;}}' +
      '.ap-card{background:#fff;border-radius:10px;box-shadow:0 12px 40px rgba(0,0,0,0.22);' +
      'padding:18px 18px 14px;min-width:300px;max-width:92vw;font-family:inherit;color:#222;}' +
      '.ap-title{font-size:14px;color:#444;margin-bottom:10px;word-break:keep-all;}' +
      '.ap-input{width:100%;box-sizing:border-box;font-size:15px;padding:8px 10px;' +
      'border:1px solid #d0d0d8;border-radius:6px;outline:none;font-family:inherit;}' +
      '.ap-input:focus{border-color:#3a7afe;box-shadow:0 0 0 2px rgba(58,122,254,0.15);}' +
      '.ap-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:12px;}' +
      '.ap-btn{appearance:none;border:1px solid #d0d0d8;background:#fff;padding:6px 14px;' +
      'border-radius:6px;cursor:pointer;font-size:13px;color:#222;}' +
      '.ap-btn:hover{background:#f0f3ff;}' +
      '.ap-btn.primary{background:#3a7afe;border-color:#3a7afe;color:#fff;}' +
      '.ap-btn.primary:hover{background:#2e6bf0;}' +
      '.ap-btn-sm{padding:4px 10px;font-size:12px;}' +
      '.ap-works-card{min-width:380px;max-width:92vw;max-height:80vh;display:flex;flex-direction:column;}' +
      '.ap-works-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;gap:12px;}' +
      '.ap-works-head .ap-title{margin-bottom:0;font-weight:600;font-size:15px;}' +
      '.ap-works-list{list-style:none;margin:0;padding:0;overflow-y:auto;flex:1;}' +
      '.ap-works-item{display:flex;align-items:center;gap:6px;padding:8px 6px;border-bottom:1px solid #f1f1f5;font-size:13px;}' +
      '.ap-works-item.current{background:#f0f5ff;border-radius:4px;}' +
      '.ap-works-item .work-name{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
      '.ap-works-empty{padding:20px;text-align:center;color:#999;font-size:13px;}' +
      '.ap-works-sort{display:flex;align-items:center;gap:6px;margin-bottom:8px;font-size:12px;color:#666;}' +
      '.ap-sort-label{color:#888;}' +
      '.ap-sort-btn.active{background:#3a7afe;border-color:#3a7afe;color:#fff;}';
    document.head.appendChild(style);
  }
  function customPrompt(message, defaultValue) {
    injectCustomPromptStyles();
    return new Promise(function (resolve) {
      var overlay = document.createElement('div');
      overlay.className = 'ap-overlay';
      var card = document.createElement('div');
      card.className = 'ap-card';
      var title = document.createElement('div');
      title.className = 'ap-title';
      title.textContent = message;
      var input = document.createElement('input');
      input.type = 'text';
      input.className = 'ap-input';
      input.value = defaultValue == null ? '' : defaultValue;
      var actions = document.createElement('div');
      actions.className = 'ap-actions';
      var cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'ap-btn';
      cancelBtn.textContent = t('cancel');
      var okBtn = document.createElement('button');
      okBtn.type = 'button';
      okBtn.className = 'ap-btn primary';
      okBtn.textContent = t('ok');
      actions.appendChild(cancelBtn);
      actions.appendChild(okBtn);
      card.appendChild(title);
      card.appendChild(input);
      card.appendChild(actions);
      overlay.appendChild(card);
      document.body.appendChild(overlay);

      var finished = false;
      function finish(value) {
        if (finished) return;
        finished = true;
        document.removeEventListener('keydown', onKey, true);
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        resolve(value);
      }
      function onKey(ev) {
        if (ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); finish(input.value); }
        else if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); finish(null); }
      }
      document.addEventListener('keydown', onKey, true);
      okBtn.addEventListener('click', function () { finish(input.value); });
      cancelBtn.addEventListener('click', function () { finish(null); });
      overlay.addEventListener('mousedown', function (ev) {
        if (ev.target === overlay) finish(null);
      });
      requestAnimationFrame(function () { input.focus(); input.select(); });
    });
  }

  // ---------- CanvasView ----------
  function CanvasView() {
    this.offset = { x: 0, y: 0 };
    this.scale = 1;
    this.minScale = 0.1;
    this.maxScale = 4;
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
  }
  CanvasView.prototype.resize = function (w, h, dpr) {
    this.width = w; this.height = h; this.dpr = dpr;
  };
  CanvasView.prototype.screenToLogical = function (p) {
    return { x: this.offset.x + p.x / this.scale, y: this.offset.y + p.y / this.scale };
  };
  CanvasView.prototype.logicalToScreen = function (p) {
    return { x: (p.x - this.offset.x) * this.scale, y: (p.y - this.offset.y) * this.scale };
  };
  CanvasView.prototype.zoomAt = function (anchor, factor) {
    var before = this.screenToLogical(anchor);
    this.scale = Math.max(this.minScale, Math.min(this.maxScale, this.scale * factor));
    var after = this.screenToLogical(anchor);
    this.offset.x += before.x - after.x;
    this.offset.y += before.y - after.y;
    this._clamp();
  };
  CanvasView.prototype.panBy = function (dx, dy) {
    this.offset.x -= dx / this.scale;
    this.offset.y -= dy / this.scale;
    this._clamp();
  };
  CanvasView.prototype.centerOn = function (point) {
    this.offset.x = point.x - this.width / (2 * this.scale);
    this.offset.y = point.y - this.height / (2 * this.scale);
    this._clamp();
  };
  CanvasView.prototype._clamp = function () {
    var margin = 200;
    var visibleW = this.width / this.scale;
    var visibleH = this.height / this.scale;
    this.offset.x = Math.max(-margin, Math.min(MAX_CANVAS_SIZE + margin - visibleW, this.offset.x));
    this.offset.y = Math.max(-margin, Math.min(MAX_CANVAS_SIZE + margin - visibleH, this.offset.y));
  };

  // ---------- Renderer ----------
  function Renderer(ctx, view) {
    this.ctx = ctx; this.view = view;
  }
  Renderer.prototype.render = function (scene, opts) {
    var ctx = this.ctx, view = this.view;
    ctx.save();
    ctx.fillStyle = '#fafafa';
    ctx.fillRect(0, 0, view.width, view.height);
    this._fillWorld();
    if (opts.showGrid) this._drawGrid();
    this._drawCenter(scene);
    for (var i = 0; i < scene.objects.length; i++) {
      this._drawObject(scene.objects[i], scene.objects[i].id === opts.selectedId, false);
    }
    if (opts.draftArrow) this._drawArrow(opts.draftArrow, false, true);
    ctx.restore();
  };
  Renderer.prototype.renderToImage = function (scene, padding) {
    if (padding == null) padding = 64;
    var off = document.createElement('canvas');
    var W = MAX_CANVAS_SIZE, H = MAX_CANVAS_SIZE;
    off.width = W; off.height = H;
    var ctx = off.getContext('2d');
    if (!ctx) return off;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    var realCtx = this.ctx, realView = this.view;
    var tmpView = new CanvasView();
    tmpView.resize(W, H, 1);
    tmpView.scale = 1;
    tmpView.offset = { x: 0, y: 0 };
    this.ctx = ctx; this.view = tmpView;
    this._drawCenter(scene);
    for (var i = 0; i < scene.objects.length; i++) this._drawObject(scene.objects[i], false, false);
    this.ctx = realCtx; this.view = realView;

    var b = this._contentBounds(scene, padding);
    var cropped = document.createElement('canvas');
    cropped.width = Math.max(1, Math.round(b.w));
    cropped.height = Math.max(1, Math.round(b.h));
    var c2 = cropped.getContext('2d');
    if (c2) {
      c2.fillStyle = '#ffffff';
      c2.fillRect(0, 0, cropped.width, cropped.height);
      c2.drawImage(off, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h);
    }
    return cropped;
  };
  Renderer.prototype._contentBounds = function (scene, padding) {
    var minX = MAX_CANVAS_SIZE / 2 - 120, minY = MAX_CANVAS_SIZE / 2 - 120;
    var maxX = MAX_CANVAS_SIZE / 2 + 120, maxY = MAX_CANVAS_SIZE / 2 + 120;
    for (var i = 0; i < scene.objects.length; i++) {
      var o = scene.objects[i];
      if (o.type === 'arrow') {
        minX = Math.min(minX, o.from.x, o.to.x);
        minY = Math.min(minY, o.from.y, o.to.y);
        maxX = Math.max(maxX, o.from.x, o.to.x);
        maxY = Math.max(maxY, o.from.y, o.to.y);
      } else {
        minX = Math.min(minX, o.pos.x);
        minY = Math.min(minY, o.pos.y);
        maxX = Math.max(maxX, o.pos.x + o.fontSize * Math.max(2, o.text.length));
        maxY = Math.max(maxY, o.pos.y + o.fontSize * 1.4);
      }
    }
    minX = Math.max(0, minX - padding);
    minY = Math.max(0, minY - padding);
    maxX = Math.min(MAX_CANVAS_SIZE, maxX + padding);
    maxY = Math.min(MAX_CANVAS_SIZE, maxY + padding);
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  };
  Renderer.prototype._fillWorld = function () {
    var ctx = this.ctx, view = this.view;
    var tl = view.logicalToScreen({ x: 0, y: 0 });
    var br = view.logicalToScreen({ x: MAX_CANVAS_SIZE, y: MAX_CANVAS_SIZE });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
    ctx.strokeStyle = '#d6d6df';
    ctx.lineWidth = 1;
    ctx.strokeRect(tl.x + 0.5, tl.y + 0.5, br.x - tl.x, br.y - tl.y);
  };
  Renderer.prototype._drawGrid = function () {
    var ctx = this.ctx, view = this.view;
    var step = 100;
    ctx.strokeStyle = '#eef0f5';
    ctx.lineWidth = 1;
    var startX = Math.floor(view.offset.x / step) * step;
    var endX = view.offset.x + view.width / view.scale;
    for (var x = startX; x <= endX; x += step) {
      var sx = (x - view.offset.x) * view.scale;
      ctx.beginPath(); ctx.moveTo(sx + 0.5, 0); ctx.lineTo(sx + 0.5, view.height); ctx.stroke();
    }
    var startY = Math.floor(view.offset.y / step) * step;
    var endY = view.offset.y + view.height / view.scale;
    for (var y = startY; y <= endY; y += step) {
      var sy = (y - view.offset.y) * view.scale;
      ctx.beginPath(); ctx.moveTo(0, sy + 0.5); ctx.lineTo(view.width, sy + 0.5); ctx.stroke();
    }
  };
  Renderer.prototype._drawCenter = function (scene) {
    var ctx = this.ctx, view = this.view;
    var center = { x: MAX_CANVAS_SIZE / 2, y: MAX_CANVAS_SIZE / 2 };
    var screen = view.logicalToScreen(center);
    var r = 80 * view.scale;
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#fff7d6'; ctx.fill();
    ctx.strokeStyle = '#c9a227'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#333';
    var fs = Math.max(10, 22 * view.scale);
    ctx.font = fs + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var label = scene.centerText || t('placeholderTopic');
    this._wrapText(label, screen.x, screen.y, r * 1.7, fs * 1.1);
  };
  Renderer.prototype._wrapText = function (text, cx, cy, maxWidth, lineHeight) {
    var ctx = this.ctx;
    var words = text.split(/\s+/);
    var lines = [], current = '';
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      var test = current ? current + ' ' + w : w;
      if (ctx.measureText(test).width > maxWidth && current) {
        lines.push(current); current = w;
      } else current = test;
    }
    if (current) lines.push(current);
    var startY = cy - ((lines.length - 1) * lineHeight) / 2;
    for (var j = 0; j < lines.length; j++) ctx.fillText(lines[j], cx, startY + j * lineHeight);
  };
  Renderer.prototype._drawObject = function (obj, selected, _isDraft) {
    if (obj.type === 'arrow') this._drawArrow(obj, selected, false);
    else this._drawText(obj, selected);
  };
  Renderer.prototype._drawArrow = function (a, selected, isDraft) {
    var ctx = this.ctx, view = this.view;
    var from = view.logicalToScreen(a.from);
    var to = view.logicalToScreen(a.to);
    var dx = to.x - from.x, dy = to.y - from.y;
    var len = Math.hypot(dx, dy);
    if (len < 1) {
      ctx.fillStyle = a.color;
      ctx.beginPath(); ctx.arc(from.x, from.y, 3, 0, Math.PI * 2); ctx.fill();
      return;
    }
    var ux = dx / len, uy = dy / len;
    var thick = Math.max(1, a.thickness * view.scale);
    ctx.strokeStyle = isDraft ? 'rgba(0,0,0,0.4)' : a.color;
    ctx.fillStyle = isDraft ? 'rgba(0,0,0,0.4)' : a.color;
    ctx.lineWidth = thick;
    ctx.lineCap = 'round';
    var headLen = Math.min(len * 0.6, (12 + a.thickness * 3) * view.scale);
    var shaftEndX = to.x - ux * headLen * 0.7;
    var shaftEndY = to.y - uy * headLen * 0.7;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(shaftEndX, shaftEndY);
    ctx.stroke();
    var headHalf = headLen * 0.5;
    var px = -uy, py = ux;
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - ux * headLen + px * headHalf, to.y - uy * headLen + py * headHalf);
    ctx.lineTo(to.x - ux * headLen - px * headHalf, to.y - uy * headLen - py * headHalf);
    ctx.closePath();
    ctx.fill();
    if (selected) {
      this._drawHandle(from.x, from.y, false);
      this._drawHandle(to.x, to.y, false);
      this._drawHandle((from.x + to.x) / 2, (from.y + to.y) / 2, true);
    }
  };
  Renderer.prototype._drawText = function (t, selected) {
    var ctx = this.ctx, view = this.view;
    var pos = view.logicalToScreen(t.pos);
    var fs = Math.max(8, t.fontSize * view.scale);
    ctx.font = fs + 'px sans-serif';
    ctx.fillStyle = t.color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    var shown = t.text || '...';
    ctx.fillText(shown, pos.x, pos.y);
    if (selected) {
      var w = ctx.measureText(shown).width;
      var h = fs * 1.2;
      ctx.strokeStyle = '#3a7afe';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(pos.x - 4, pos.y - 4, w + 8, h + 8);
      ctx.setLineDash([]);
      this._drawHandle(pos.x + w + 4, pos.y + h + 4, false);
    }
  };
  Renderer.prototype._drawHandle = function (x, y, secondary) {
    var ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fillStyle = secondary ? '#ffd166' : '#3a7afe';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.fill(); ctx.stroke();
  };

  // ---------- SceneStore ----------
  function SceneStore(initial) {
    this.scene = initial || emptyScene('새 작업');
    this.listeners = [];
  }
  SceneStore.prototype.get = function () { return this.scene; };
  SceneStore.prototype.replace = function (next) { this.scene = next; this._emit(); };
  SceneStore.prototype.subscribe = function (fn) {
    this.listeners.push(fn);
    var self = this;
    return function () { self.listeners = self.listeners.filter(function (l) { return l !== fn; }); };
  };
  SceneStore.prototype._touch = function () { this.scene.updatedAt = Date.now(); };
  SceneStore.prototype._emit = function () { for (var i = 0; i < this.listeners.length; i++) this.listeners[i](); };
  SceneStore.prototype.setCenterText = function (text) { this.scene.centerText = text; this._touch(); this._emit(); };
  SceneStore.prototype.setName = function (name) { this.scene.name = name; this._touch(); this._emit(); };
  SceneStore.prototype.addArrow = function (from, to, color, thickness) {
    var arrow = { id: newId('arrow'), type: 'arrow', from: clampToCanvas(from), to: clampToCanvas(to), color: color, thickness: thickness };
    this.scene.objects.push(arrow); this._touch(); this._emit();
    return arrow;
  };
  SceneStore.prototype.addText = function (pos, text, fontSize, color) {
    var o = { id: newId('text'), type: 'text', pos: clampToCanvas(pos), text: text, fontSize: fontSize, color: color };
    this.scene.objects.push(o); this._touch(); this._emit();
    return o;
  };
  SceneStore.prototype.update = function (id, mutator) {
    var obj = null;
    for (var i = 0; i < this.scene.objects.length; i++) if (this.scene.objects[i].id === id) { obj = this.scene.objects[i]; break; }
    if (!obj) return;
    mutator(obj); this._touch(); this._emit();
  };
  SceneStore.prototype.remove = function (id) {
    var next = this.scene.objects.filter(function (o) { return o.id !== id; });
    if (next.length === this.scene.objects.length) return;
    this.scene.objects = next; this._touch(); this._emit();
  };
  SceneStore.prototype.hitTest = function (point, tolerance) {
    for (var i = this.scene.objects.length - 1; i >= 0; i--) {
      var obj = this.scene.objects[i];
      var handle = this._hitObject(obj, point, tolerance);
      if (handle !== 'none') return { object: obj, handle: handle };
    }
    return { object: null, handle: 'none' };
  };
  SceneStore.prototype._hitObject = function (obj, p, tol) {
    if (obj.type === 'arrow') {
      if (vecDist(p, obj.from) <= tol) return 'arrow-from';
      if (vecDist(p, obj.to) <= tol) return 'arrow-to';
      var mid = { x: (obj.from.x + obj.to.x) / 2, y: (obj.from.y + obj.to.y) / 2 };
      if (vecDist(p, mid) <= tol) return 'arrow-mid';
      if (pointToSegmentDistance(p, obj.from, obj.to) <= Math.max(tol, obj.thickness)) return 'arrow-body';
    } else {
      var charW = obj.fontSize * 0.6;
      var w = Math.max(charW, (obj.text.length || 3) * charW);
      var h = obj.fontSize * 1.2;
      var resize = Math.abs(p.x - (obj.pos.x + w + 4)) <= tol && Math.abs(p.y - (obj.pos.y + h + 4)) <= tol;
      if (resize) return 'text-resize';
      var inside = p.x >= obj.pos.x - 4 && p.x <= obj.pos.x + w + 4 && p.y >= obj.pos.y - 4 && p.y <= obj.pos.y + h + 4;
      if (inside) return 'text-body';
    }
    return 'none';
  };

  // ---------- IndexedDBStore ----------
  var DB_NAME = 'arrow-mindmap';
  var DB_VERSION = 1;
  var SCENES_STORE = 'scenes';
  var META_STORE = 'meta';
  function IndexedDBStore() { this.dbPromise = null; }
  IndexedDBStore.prototype._open = function () {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise(function (resolve, reject) {
      try {
        var req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = function () {
          var db = req.result;
          if (!db.objectStoreNames.contains(SCENES_STORE)) db.createObjectStore(SCENES_STORE, { keyPath: 'id' });
          if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE);
        };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error || new Error('open failed')); };
      } catch (e) { reject(e); }
    });
    return this.dbPromise;
  };
  IndexedDBStore.prototype._tx = function (stores, mode, fn) {
    return this._open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx;
        try { tx = db.transaction(stores, mode); } catch (e) { reject(e); return; }
        var result;
        tx.oncomplete = function () { resolve(result); };
        tx.onerror = function () { reject(tx.error); };
        tx.onabort = function () { reject(tx.error || new Error('aborted')); };
        Promise.resolve(fn(tx)).then(function (r) { result = r; }).catch(reject);
      });
    });
  };
  IndexedDBStore.prototype.saveScene = function (scene) {
    return this._tx(SCENES_STORE, 'readwrite', function (tx) { tx.objectStore(SCENES_STORE).put(scene); });
  };
  IndexedDBStore.prototype.loadScene = function (id) {
    return this._tx(SCENES_STORE, 'readonly', function (tx) {
      return new Promise(function (resolve, reject) {
        var req = tx.objectStore(SCENES_STORE).get(id);
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
    });
  };
  IndexedDBStore.prototype.listScenes = function () {
    return this._tx(SCENES_STORE, 'readonly', function (tx) {
      return new Promise(function (resolve, reject) {
        var req = tx.objectStore(SCENES_STORE).getAll();
        req.onsuccess = function () {
          var all = req.result || [];
          all.sort(function (a, b) { return b.updatedAt - a.updatedAt; });
          resolve(all.map(function (s) { return { id: s.id, name: s.name, updatedAt: s.updatedAt }; }));
        };
        req.onerror = function () { reject(req.error); };
      });
    });
  };
  IndexedDBStore.prototype.deleteScene = function (id) {
    return this._tx(SCENES_STORE, 'readwrite', function (tx) { tx.objectStore(SCENES_STORE).delete(id); });
  };
  IndexedDBStore.prototype.renameScene = function (id, name) {
    var self = this;
    return self.loadScene(id).then(function (existing) {
      if (!existing) return;
      existing.name = name;
      existing.updatedAt = Date.now();
      return self.saveScene(existing);
    });
  };
  IndexedDBStore.prototype.setMeta = function (key, value) {
    return this._tx(META_STORE, 'readwrite', function (tx) { tx.objectStore(META_STORE).put(value, key); });
  };
  IndexedDBStore.prototype.getMeta = function (key) {
    return this._tx(META_STORE, 'readonly', function (tx) {
      return new Promise(function (resolve, reject) {
        var req = tx.objectStore(META_STORE).get(key);
        req.onsuccess = function () { resolve(req.result == null ? null : req.result); };
        req.onerror = function () { reject(req.error); };
      });
    });
  };
  IndexedDBStore.prototype.exportAll = function () {
    return this._tx(SCENES_STORE, 'readonly', function (tx) {
      return new Promise(function (resolve, reject) {
        var req = tx.objectStore(SCENES_STORE).getAll();
        req.onsuccess = function () { resolve({ scenes: req.result || [], version: DB_VERSION }); };
        req.onerror = function () { reject(req.error); };
      });
    });
  };
  IndexedDBStore.prototype.importAll = function (payload, merge) {
    if (!payload || !Array.isArray(payload.scenes)) return Promise.reject(new Error('Invalid'));
    return this._tx(SCENES_STORE, 'readwrite', function (tx) {
      var store = tx.objectStore(SCENES_STORE);
      if (!merge) store.clear();
      var count = 0;
      for (var i = 0; i < payload.scenes.length; i++) {
        var s = payload.scenes[i];
        if (s && typeof s.id === 'string') { store.put(s); count++; }
      }
      return count;
    });
  };

  // ---------- InputHandler ----------
  var DOUBLE_TAP_TIME = 320;
  function InputHandler(canvas, view, store, cb) {
    this.canvas = canvas; this.view = view; this.store = store; this.cb = cb;
    this.drag = { kind: 'none' };
    this.selectedId = null;
    this.lastTapTime = 0;
    this.lastTapPos = { x: 0, y: 0 };
    this.pinch = null;
    this._attach();
  }
  InputHandler.prototype.setSelected = function (id) {
    this.selectedId = id;
    this.cb.onSelect(id);
    this.cb.onChange();
  };
  InputHandler.prototype._attach = function () {
    var self = this;
    var c = this.canvas;
    c.addEventListener('mousedown', function (e) { self._onMouseDown(e); });
    c.addEventListener('mousemove', function (e) { self._onMouseMove(e); });
    window.addEventListener('mouseup', function (e) { self._onMouseUp(e); });
    c.addEventListener('wheel', function (e) { self._onWheel(e); }, { passive: false });
    c.addEventListener('dblclick', function (e) { self._onDblClick(e); });
    c.addEventListener('touchstart', function (e) { self._onTouchStart(e); }, { passive: false });
    c.addEventListener('touchmove', function (e) { self._onTouchMove(e); }, { passive: false });
    c.addEventListener('touchend', function (e) { self._onTouchEnd(e); }, { passive: false });
    c.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  };
  InputHandler.prototype._screenFromEvent = function (ev) {
    var rect = this.canvas.getBoundingClientRect();
    return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  };
  InputHandler.prototype._tolLogical = function () { return 12 / this.view.scale; };
  InputHandler.prototype._onMouseDown = function (e) {
    e.preventDefault();
    var screen = this._screenFromEvent(e);
    var logical = this.view.screenToLogical(screen);
    if (e.button === 2 || e.button === 1 || this.cb.getMode() === 'pan' || e.shiftKey) {
      this.drag = { kind: 'pan', startLogical: logical, lastScreen: screen };
      return;
    }
    this._begin(screen, logical);
  };
  InputHandler.prototype._onMouseMove = function (e) {
    var screen = this._screenFromEvent(e);
    this._move(screen);
  };
  InputHandler.prototype._onMouseUp = function () { this._end(); };
  InputHandler.prototype._onWheel = function (e) {
    e.preventDefault();
    var screen = this._screenFromEvent(e);
    var factor = e.deltaY > 0 ? 0.9 : 1.1;
    this.view.zoomAt(screen, factor);
    this.cb.onChange();
  };
  InputHandler.prototype._onDblClick = function (e) {
    e.preventDefault();
    var logical = this.view.screenToLogical(this._screenFromEvent(e));
    this._handleDoubleTap(logical);
  };
  InputHandler.prototype._onTouchStart = function (e) {
    e.preventDefault();
    if (e.touches.length === 1) {
      var screen = this._screenFromEvent(e.touches[0]);
      var logical = this.view.screenToLogical(screen);
      var now = performance.now();
      if (now - this.lastTapTime < DOUBLE_TAP_TIME && vecDist(screen, this.lastTapPos) < 16) {
        this._handleDoubleTap(logical);
        this.lastTapTime = 0;
        return;
      }
      this.lastTapTime = now;
      this.lastTapPos = screen;
      this._begin(screen, logical);
    } else if (e.touches.length === 2) {
      this.drag = { kind: 'none' };
      var a = this._screenFromEvent(e.touches[0]);
      var b = this._screenFromEvent(e.touches[1]);
      var center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      this.pinch = { startDist: vecDist(a, b), startScale: this.view.scale, startCenter: center, lastCenter: center };
    }
  };
  InputHandler.prototype._onTouchMove = function (e) {
    e.preventDefault();
    if (e.touches.length === 1 && !this.pinch) {
      this._move(this._screenFromEvent(e.touches[0]));
    } else if (e.touches.length === 2 && this.pinch) {
      var a = this._screenFromEvent(e.touches[0]);
      var b = this._screenFromEvent(e.touches[1]);
      var dist = Math.max(1, vecDist(a, b));
      var center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      var factor = (dist / this.pinch.startDist) * (this.pinch.startScale / this.view.scale);
      this.view.zoomAt(center, factor);
      this.view.panBy(center.x - this.pinch.lastCenter.x, center.y - this.pinch.lastCenter.y);
      this.pinch.lastCenter = center;
      this.cb.onChange();
    }
  };
  InputHandler.prototype._onTouchEnd = function (e) {
    e.preventDefault();
    if (e.touches.length === 0) {
      this.pinch = null;
      this._end();
    } else if (e.touches.length < 2) {
      this.pinch = null;
    }
  };
  InputHandler.prototype._begin = function (screen, logical) {
    var mode = this.cb.getMode();
    var tol = this._tolLogical();
    var hit = this.store.hitTest(logical, tol);
    if (hit.object) {
      this.selectedId = hit.object.id;
      this.cb.onSelect(this.selectedId);
      var handle = hit.handle;
      if (handle === 'arrow-from' || handle === 'arrow-to') {
        this.drag = { kind: 'resize-arrow', objectId: hit.object.id, end: handle, lastScreen: screen };
        return;
      }
      if (handle === 'text-resize') {
        this.drag = {
          kind: 'resize-text',
          objectId: hit.object.id,
          origin: { fontSize: hit.object.fontSize, pos: { x: hit.object.pos.x, y: hit.object.pos.y } },
          lastScreen: screen
        };
        return;
      }
      this.drag = {
        kind: 'move-object',
        objectId: hit.object.id,
        startLogical: logical,
        origin: this._snap(hit.object),
        lastScreen: screen
      };
      this.cb.onChange();
      return;
    }
    if (mode === 'arrow') {
      var draft = {
        id: 'draft', type: 'arrow',
        from: logical, to: logical,
        color: this.cb.getColor(), thickness: this.cb.getThickness()
      };
      this.cb.onDraftChange(draft);
      this.drag = { kind: 'draft-arrow', draft: draft, lastScreen: screen };
      this.selectedId = null;
      this.cb.onSelect(null);
      this.cb.onChange();
      return;
    }
    if (mode === 'text') {
      this.drag = { kind: 'none' };
      var self = this;
      customPrompt(t('promptText'), '').then(function (txt) {
        if (txt && txt.trim()) {
          var created = self.store.addText(logical, txt.trim(), self.cb.getFontSize(), self.cb.getColor());
          self.selectedId = created.id;
          self.cb.onSelect(created.id);
          self.cb.onChange();
        }
      });
      return;
    }
    // select or default
    this.selectedId = null;
    this.cb.onSelect(null);
    this.drag = { kind: 'pan', lastScreen: screen };
    this.cb.onChange();
  };
  InputHandler.prototype._move = function (screen) {
    var d = this.drag;
    if (d.kind === 'none') return;
    var logical = this.view.screenToLogical(screen);
    var dx = screen.x - d.lastScreen.x;
    var dy = screen.y - d.lastScreen.y;
    d.lastScreen = screen;
    if (d.kind === 'pan') {
      this.view.panBy(dx, dy);
      this.cb.onChange();
      return;
    }
    if (d.kind === 'draft-arrow') {
      d.draft.to = clampToCanvas(logical);
      this.cb.onDraftChange(d.draft);
      this.cb.onChange();
      return;
    }
    if (d.kind === 'resize-arrow') {
      var which = d.end;
      this.store.update(d.objectId, function (o) {
        if (o.type !== 'arrow') return;
        if (which === 'arrow-from') o.from = clampToCanvas(logical);
        else o.to = clampToCanvas(logical);
      });
      return;
    }
    if (d.kind === 'move-object') {
      var dxLog = logical.x - d.startLogical.x;
      var dyLog = logical.y - d.startLogical.y;
      var origin = d.origin;
      this.store.update(d.objectId, function (o) {
        if (o.type === 'arrow') {
          o.from = clampToCanvas({ x: origin.from.x + dxLog, y: origin.from.y + dyLog });
          o.to = clampToCanvas({ x: origin.to.x + dxLog, y: origin.to.y + dyLog });
        } else {
          o.pos = clampToCanvas({ x: origin.pos.x + dxLog, y: origin.pos.y + dyLog });
        }
      });
      return;
    }
    if (d.kind === 'resize-text') {
      var orig = d.origin;
      var ratio = Math.max(0.3, Math.min(6, (logical.x - orig.pos.x) / Math.max(20, orig.fontSize * 4)));
      this.store.update(d.objectId, function (o) {
        if (o.type !== 'text') return;
        o.fontSize = Math.max(8, Math.min(160, orig.fontSize * ratio));
      });
      return;
    }
  };
  InputHandler.prototype._end = function () {
    var d = this.drag;
    if (d.kind === 'draft-arrow') {
      var draft = d.draft;
      if (vecDist(draft.from, draft.to) > 4 / this.view.scale) {
        var created = this.store.addArrow(draft.from, draft.to, draft.color, draft.thickness);
        this.selectedId = created.id;
        this.cb.onSelect(created.id);
      }
      this.cb.onDraftChange(null);
      if (this.cb.setMode) this.cb.setMode('select');
    }
    this.drag = { kind: 'none' };
    this.cb.onChange();
  };
  InputHandler.prototype._handleDoubleTap = function (logical) {
    var tol = this._tolLogical();
    var hit = this.store.hitTest(logical, tol);
    if (hit.object && hit.object.type === 'text') {
      this.cb.onDoubleClickText(hit.object);
      return;
    }
    if (!hit.object) this.cb.onDoubleClickEmpty(logical);
  };
  InputHandler.prototype._snap = function (obj) {
    if (obj.type === 'arrow') return { from: { x: obj.from.x, y: obj.from.y }, to: { x: obj.to.x, y: obj.to.y } };
    return { pos: { x: obj.pos.x, y: obj.pos.y } };
  };

  // ---------- App controller ----------
  function App(root) {
    var self = this;
    this.canvas = root.querySelector('#mainCanvas');
    if (!this.canvas) throw new Error('Canvas missing');
    this.ctx = this.canvas.getContext('2d');
    if (!this.ctx) throw new Error('2D context unavailable');
    this.view = new CanvasView();
    this.store = new SceneStore();
    this.renderer = new Renderer(this.ctx, this.view);
    this.db = new IndexedDBStore();
    this.mode = 'select';
    this.color = '#222';
    this.thickness = 4;
    this.fontSize = 28;
    this.selectedId = null;
    this.draftArrow = null;
    this.dirty = false;
    this.worksList = [];
    this.worksSortKey = 'date';
    this.renderScheduled = false;

    this.input = new InputHandler(this.canvas, this.view, this.store, {
      getMode: function () { return self.mode; },
      setMode: function (m) { self.setMode(m); },
      getColor: function () { return self.color; },
      getThickness: function () { return self.thickness; },
      getFontSize: function () { return self.fontSize; },
      onChange: function () { self._requestRender(); },
      onSelect: function (id) { self.selectedId = id; self._updateSelectionUi(); },
      onDoubleClickEmpty: function () {
        customPrompt(t('promptCenter'), self.store.get().centerText).then(function (txt) {
          if (txt !== null) self.store.setCenterText(txt);
        });
      },
      onDoubleClickText: function (obj) {
        customPrompt(t('promptText'), obj.text).then(function (txt) {
          if (txt !== null) self.store.update(obj.id, function (o) { if (o.type === 'text') o.text = txt; });
        });
      },
      onDraftChange: function (d) { self.draftArrow = d; }
    });

    this.store.subscribe(function () { self.dirty = true; self._requestRender(); });
    window.addEventListener('resize', function () { self._resize(); self._requestRender(); });
    if (typeof ResizeObserver !== 'undefined') {
      var wrap = this.canvas.parentElement;
      if (wrap) new ResizeObserver(function () { self._resize(); self._requestRender(); }).observe(wrap);
    }
    window.addEventListener('keydown', function (e) { self._onKey(e); });
    this._resize();
    this._bindUi();
    this._requestRender();
    this._bootstrap();
  }
  App.prototype._bootstrap = function () {
    var self = this;
    Promise.resolve()
      .then(function () { return self.db.getMeta('lastSceneId'); })
      .then(function (lastId) { if (lastId) return self.db.loadScene(lastId); return null; })
      .then(function (scene) { if (scene) self._adoptScene(scene); })
      .catch(function (e) { console.warn('Restore failed', e); })
      .then(function () { return self._refreshWorks(); })
      .then(function () { self._requestRender(); });
  };
  App.prototype._adoptScene = function (scene) {
    this.store.replace(scene);
    this.view.offset = { x: scene.viewOffsetX || 0, y: scene.viewOffsetY || 0 };
    this.view.scale = scene.viewScale > 0 ? scene.viewScale : 1;
    this.selectedId = null;
    this.dirty = false;
    this._updateTitle();
    this._updateSelectionUi();
    this._requestRender();
  };
  App.prototype._requestRender = function () {
    if (this.renderScheduled) return;
    this.renderScheduled = true;
    var self = this;
    requestAnimationFrame(function () { self.renderScheduled = false; self._draw(); });
  };
  App.prototype._draw = function () {
    this.renderer.render(this.store.get(), {
      selectedId: this.selectedId,
      draftArrow: this.draftArrow,
      showGrid: true
    });
  };
  App.prototype._resize = function () {
    var dpr = window.devicePixelRatio || 1;
    var wrap = this.canvas.parentElement;
    var rect = wrap.getBoundingClientRect();
    var w = Math.max(1, Math.round(rect.width * dpr));
    var h = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.view.resize(rect.width, rect.height, dpr);
    if (this.view.scale === 1 && this.view.offset.x === 0 && this.view.offset.y === 0) {
      this.view.centerOn({ x: MAX_CANVAS_SIZE / 2, y: MAX_CANVAS_SIZE / 2 });
    }
  };
  App.prototype._bindUi = function () {
    var self = this;
    var byId = function (id) { return document.getElementById(id); };
    byId('btnSelect').addEventListener('click', function () { self.setMode('select'); });
    byId('btnArrow').addEventListener('click', function () { self.setMode('arrow'); });
    byId('btnText').addEventListener('click', function () { self.setMode('text'); });
    byId('btnPan').addEventListener('click', function () { self.setMode('pan'); });
    byId('btnSave').addEventListener('click', function () { self._save(); });
    byId('btnSaveAs').addEventListener('click', function () { self._saveAs(); });
    byId('btnNew').addEventListener('click', function () { self._newScene(); });
    byId('btnExportPng').addEventListener('click', function () { self._exportPng(); });
    byId('btnExportJson').addEventListener('click', function () { self._exportJson(); });
    byId('btnImportJson').addEventListener('click', function () { self._importJsonClick(); });
    byId('fileImport').addEventListener('change', function (e) { self._handleImportFile(e); });
    byId('btnLang').addEventListener('click', function () { self._toggleLang(); });
    byId('btnEditCenter').addEventListener('click', function () {
      customPrompt(t('promptCenter'), self.store.get().centerText).then(function (txt) {
        if (txt !== null) self.store.setCenterText(txt);
      });
    });
    byId('btnFit').addEventListener('click', function () { self._fitToScreen(); });
    byId('btnZoomIn').addEventListener('click', function () {
      self.view.zoomAt({ x: self.view.width / 2, y: self.view.height / 2 }, 1.2);
      self._requestRender();
    });
    byId('btnZoomOut').addEventListener('click', function () {
      self.view.zoomAt({ x: self.view.width / 2, y: self.view.height / 2 }, 1 / 1.2);
      self._requestRender();
    });
    byId('btnDelete').addEventListener('click', function () { self._deleteSelected(); });
    byId('btnWorks').addEventListener('click', function () { self._openWorksModal(); });
    var colorEl = byId('inputColor');
    colorEl.value = this.color;
    colorEl.addEventListener('input', function () { self.color = colorEl.value; });
    var thickEl = byId('inputThickness');
    thickEl.value = String(this.thickness);
    thickEl.addEventListener('input', function () { self.thickness = parseFloat(thickEl.value) || 4; });
    var fontEl = byId('inputFontSize');
    fontEl.value = String(this.fontSize);
    fontEl.addEventListener('input', function () { self.fontSize = parseFloat(fontEl.value) || 28; });
    this._applyLangToUi();
    this._updateModeUi();
    this._updateSelectionUi();
    this._updateTitle();
  };
  App.prototype.setMode = function (m) { this.mode = m; this._updateModeUi(); };
  App.prototype._updateModeUi = function () {
    var map = { select: 'btnSelect', arrow: 'btnArrow', text: 'btnText', pan: 'btnPan' };
    for (var k in map) {
      var el = document.getElementById(map[k]);
      if (!el) continue;
      el.classList.toggle('active', k === this.mode);
    }
    document.body.dataset.mode = this.mode;
  };
  App.prototype._updateSelectionUi = function () {
    var btn = document.getElementById('btnDelete');
    if (btn) {
      if (this.selectedId) btn.removeAttribute('disabled');
      else btn.setAttribute('disabled', '');
    }
  };
  App.prototype._updateTitle = function () {
    var el = document.getElementById('titleName');
    if (el) el.textContent = this.store.get().name || t('untitled');
  };
  App.prototype._applyLangToUi = function () {
    var setText = function (id, key) {
      var el = document.getElementById(id);
      if (el) el.textContent = t(key);
    };
    var setTip = function (id, key) {
      var el = document.getElementById(id);
      if (el) el.title = t(key);
    };
    setTip('btnSelect', 'modeSelect');
    setTip('btnArrow', 'modeArrow');
    setTip('btnText', 'modeText');
    setTip('btnPan', 'modePan');
    setTip('btnSave', 'save');
    setTip('btnSaveAs', 'saveAs');
    setTip('btnNew', 'newWork');
    setTip('btnExportPng', 'exportPng');
    setTip('btnExportJson', 'exportJson');
    setTip('btnImportJson', 'importJson');
    setTip('btnEditCenter', 'editCenter');
    setTip('btnFit', 'fit');
    setTip('btnZoomIn', 'zoomIn');
    setTip('btnZoomOut', 'zoomOut');
    setTip('btnDelete', 'delete');
    setTip('btnWorks', 'works');
    var langEl = document.getElementById('btnLang');
    if (langEl) langEl.title = currentLang === 'ko' ? 'Switch to English' : '한국어로 전환';
    setText('labelColor', 'selectColor');
    setText('labelThickness', 'thickness');
    setText('labelFontSize', 'fontSize');
    document.title = t('appTitle');
    this._updateTitle();
    this._renderWorks();
  };
  App.prototype._toggleLang = function () {
    currentLang = currentLang === 'ko' ? 'en' : 'ko';
    this._applyLangToUi();
    this._requestRender();
  };
  App.prototype._ensureName = function () {
    var name = this.store.get().name;
    if (!name || name === '새 작업' || name === 'Untitled' || name === t('untitled')) {
      var self = this;
      return customPrompt(t('promptName'), '').then(function (input) {
        if (input === null) return null;
        var trimmed = input.trim() || t('untitled');
        self.store.setName(trimmed);
        return trimmed;
      });
    }
    return Promise.resolve(name);
  };
  App.prototype._save = function () {
    var self = this;
    this._ensureName().then(function (name) {
      if (name === null) return;
      var scene = self.store.get();
      scene.viewOffsetX = self.view.offset.x;
      scene.viewOffsetY = self.view.offset.y;
      scene.viewScale = self.view.scale;
      return self.db.saveScene(scene)
        .then(function () { return self.db.setMeta('lastSceneId', scene.id); })
        .then(function () { self.dirty = false; return self._refreshWorks(); })
        .then(function () { self._flashStatus(t('saved')); })
        .catch(function (e) { console.error('save failed', e); window.alert('저장 실패 / Save failed'); });
    });
  };
  App.prototype._saveAs = function () {
    var self = this;
    customPrompt(t('promptName'), this.store.get().name).then(function (input) {
      if (input === null) return;
      var next = JSON.parse(JSON.stringify(self.store.get()));
      next.id = newId('scene');
      next.name = input.trim() || t('untitled');
      next.createdAt = Date.now();
      next.updatedAt = Date.now();
      self.store.replace(next);
      self.db.saveScene(next)
        .then(function () { return self.db.setMeta('lastSceneId', next.id); })
        .then(function () { return self._refreshWorks(); })
        .then(function () { self._updateTitle(); self._flashStatus(t('saved')); });
    });
  };
  App.prototype._newScene = function () {
    if (this.dirty && !window.confirm(t('unsavedNew'))) return;
    this._adoptScene(emptyScene(t('untitled')));
    this.view.scale = 1;
    this.view.centerOn({ x: MAX_CANVAS_SIZE / 2, y: MAX_CANVAS_SIZE / 2 });
    this._requestRender();
  };
  App.prototype._deleteSelected = function () {
    if (!this.selectedId) return;
    if (!window.confirm(t('confirmDeleteSelected'))) return;
    this.store.remove(this.selectedId);
    this.selectedId = null;
    this._updateSelectionUi();
  };
  App.prototype._exportPng = function () {
    var cropped = this.renderer.renderToImage(this.store.get());
    var url = cropped.toDataURL('image/png');
    var a = document.createElement('a');
    a.href = url;
    a.download = (this.store.get().name || 'arrow') + '.png';
    a.click();
  };
  App.prototype._exportJson = function () {
    var self = this;
    this.db.exportAll().then(function (all) {
      var blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'arrow-mindmap-export.json';
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    });
  };
  App.prototype._importJsonClick = function () {
    var inp = document.getElementById('fileImport');
    inp.value = '';
    inp.click();
  };
  App.prototype._handleImportFile = function (e) {
    var self = this;
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var payload = JSON.parse(String(reader.result));
        self.db.importAll(payload, true).then(function (count) {
          self._refreshWorks().then(function () { self._flashStatus(count + t('importedCount')); });
        }).catch(function () { window.alert(t('invalidJson')); });
      } catch (err) {
        console.warn(err);
        window.alert(t('invalidJson'));
      }
    };
    reader.onerror = function () { window.alert(t('invalidJson')); };
    reader.readAsText(file);
  };
  App.prototype._refreshWorks = function () {
    var self = this;
    return this.db.listScenes().then(function (list) {
      self.worksList = list;
      self._renderWorks();
    }).catch(function () { self.worksList = []; self._renderWorks(); });
  };
  App.prototype._openWorksModal = function () {
    if (this._worksModalEl) return;
    var self = this;
    this._refreshWorks();
    var overlay = document.createElement('div');
    overlay.className = 'ap-overlay';
    var card = document.createElement('div');
    card.className = 'ap-card ap-works-card';
    var head = document.createElement('div');
    head.className = 'ap-works-head';
    var title = document.createElement('div');
    title.className = 'ap-title';
    title.textContent = t('works');
    var closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'ap-btn';
    closeBtn.textContent = t('close');
    head.appendChild(title);
    head.appendChild(closeBtn);

    var sortBar = document.createElement('div');
    sortBar.className = 'ap-works-sort';
    var sortLabel = document.createElement('span');
    sortLabel.className = 'ap-sort-label';
    sortLabel.textContent = t('sortLabel') + ':';
    sortBar.appendChild(sortLabel);
    var makeSortBtn = function (key, label) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'ap-btn ap-btn-sm ap-sort-btn' + (self.worksSortKey === key ? ' active' : '');
      b.textContent = label;
      b.dataset.sort = key;
      b.addEventListener('click', function () {
        self.worksSortKey = key;
        self._renderWorks();
      });
      return b;
    };
    sortBar.appendChild(makeSortBtn('name', t('sortByName')));
    sortBar.appendChild(makeSortBtn('date', t('sortByDate')));

    var listEl = document.createElement('ul');
    listEl.className = 'ap-works-list';
    listEl.id = 'worksList';
    card.appendChild(head);
    card.appendChild(sortBar);
    card.appendChild(listEl);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    this._worksModalEl = overlay;
    var onKey = function (ev) {
      if (ev.key === 'Escape') { ev.preventDefault(); self._closeWorksModal(); }
    };
    document.addEventListener('keydown', onKey, true);
    this._worksModalCleanup = function () { document.removeEventListener('keydown', onKey, true); };
    closeBtn.addEventListener('click', function () { self._closeWorksModal(); });
    overlay.addEventListener('mousedown', function (ev) { if (ev.target === overlay) self._closeWorksModal(); });
    this._renderWorks();
  };
  App.prototype._closeWorksModal = function () {
    if (!this._worksModalEl) return;
    if (this._worksModalCleanup) this._worksModalCleanup();
    if (this._worksModalEl.parentNode) this._worksModalEl.parentNode.removeChild(this._worksModalEl);
    this._worksModalEl = null;
    this._worksModalCleanup = null;
  };
  App.prototype._renderWorks = function () {
    if (!this._worksModalEl) return;
    var ul = this._worksModalEl.querySelector('#worksList');
    if (!ul) return;
    var sortBtns = this._worksModalEl.querySelectorAll('.ap-sort-btn');
    for (var k = 0; k < sortBtns.length; k++) {
      var b = sortBtns[k];
      if (b.dataset.sort === this.worksSortKey) b.classList.add('active');
      else b.classList.remove('active');
    }
    ul.innerHTML = '';
    var current = this.store.get().id;
    var self = this;
    if (this.worksList.length === 0) {
      var empty = document.createElement('li');
      empty.className = 'ap-works-empty';
      empty.textContent = t('noWorks');
      ul.appendChild(empty);
      return;
    }
    var sorted = this.worksList.slice();
    var sortKey = this.worksSortKey;
    sorted.sort(function (a, b) {
      if (sortKey === 'name') return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      return b.updatedAt - a.updatedAt;
    });
    for (var i = 0; i < sorted.length; i++) {
      (function (w) {
        var li = document.createElement('li');
        li.className = 'ap-works-item' + (w.id === current ? ' current' : '');
        var name = document.createElement('span');
        name.className = 'work-name';
        name.textContent = w.name;
        name.title = new Date(w.updatedAt).toLocaleString();
        var loadBtn = document.createElement('button');
        loadBtn.type = 'button';
        loadBtn.className = 'ap-btn ap-btn-sm';
        loadBtn.textContent = t('load');
        loadBtn.addEventListener('click', function () { self._loadWork(w.id); });
        var renameBtn = document.createElement('button');
        renameBtn.type = 'button';
        renameBtn.className = 'ap-btn ap-btn-sm';
        renameBtn.textContent = t('rename');
        renameBtn.addEventListener('click', function () { self._renameWork(w); });
        var delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'ap-btn ap-btn-sm';
        delBtn.textContent = t('delete');
        delBtn.addEventListener('click', function () { self._deleteWork(w); });
        li.appendChild(name);
        li.appendChild(loadBtn);
        li.appendChild(renameBtn);
        li.appendChild(delBtn);
        ul.appendChild(li);
      })(sorted[i]);
    }
  };
  App.prototype._loadWork = function (id) {
    if (this.dirty && !window.confirm(t('unsavedLoad'))) return;
    var self = this;
    this.db.loadScene(id).then(function (scene) {
      if (!scene) return;
      self._adoptScene(scene);
      self.db.setMeta('lastSceneId', id);
      self._closeWorksModal();
    });
  };
  App.prototype._renameWork = function (w) {
    var self = this;
    customPrompt(t('promptRename'), w.name).then(function (name) {
      if (name === null) return;
      var trimmed = name.trim() || t('untitled');
      self.db.renameScene(w.id, trimmed).then(function () {
        if (w.id === self.store.get().id) self.store.setName(trimmed);
        self._refreshWorks();
      });
    });
  };
  App.prototype._deleteWork = function (w) {
    if (!window.confirm(t('confirmDelete'))) return;
    var self = this;
    this.db.deleteScene(w.id).then(function () {
      if (w.id === self.store.get().id) self._newScene();
      self._refreshWorks();
    });
  };
  App.prototype._fitToScreen = function () {
    var scene = this.store.get();
    if (scene.objects.length === 0) {
      this.view.scale = 1;
      this.view.centerOn({ x: MAX_CANVAS_SIZE / 2, y: MAX_CANVAS_SIZE / 2 });
      this._requestRender();
      return;
    }
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (var i = 0; i < scene.objects.length; i++) {
      var o = scene.objects[i];
      if (o.type === 'arrow') {
        minX = Math.min(minX, o.from.x, o.to.x);
        minY = Math.min(minY, o.from.y, o.to.y);
        maxX = Math.max(maxX, o.from.x, o.to.x);
        maxY = Math.max(maxY, o.from.y, o.to.y);
      } else {
        minX = Math.min(minX, o.pos.x);
        minY = Math.min(minY, o.pos.y);
        maxX = Math.max(maxX, o.pos.x + o.fontSize * Math.max(2, o.text.length));
        maxY = Math.max(maxY, o.pos.y + o.fontSize * 1.4);
      }
    }
    // Always include the center marker in fit.
    minX = Math.min(minX, MAX_CANVAS_SIZE / 2 - 100);
    minY = Math.min(minY, MAX_CANVAS_SIZE / 2 - 100);
    maxX = Math.max(maxX, MAX_CANVAS_SIZE / 2 + 100);
    maxY = Math.max(maxY, MAX_CANVAS_SIZE / 2 + 100);
    var padding = 80;
    var w = maxX - minX + padding * 2;
    var h = maxY - minY + padding * 2;
    var scale = Math.max(0.1, Math.min(2, Math.min(this.view.width / w, this.view.height / h)));
    this.view.scale = scale;
    this.view.centerOn({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 });
    this._requestRender();
  };
  App.prototype._onKey = function (e) {
    var target = e.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    if (this._worksModalEl) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (this.selectedId) { e.preventDefault(); this._deleteSelected(); }
    } else if (e.key === 'Insert') {
      e.preventDefault();
      this._insertArrow();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      this._insertTextAtViewportCenter();
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      this._save();
    } else if (e.key === 'a' || e.key === 'A') this.setMode('arrow');
    else if (e.key === 't' || e.key === 'T') this.setMode('text');
    else if (e.key === 'v' || e.key === 'V') this.setMode('select');
    else if (e.key === 'h' || e.key === 'H') this.setMode('pan');
  };
  // Opens the text-input modal and places the typed text at the current
  // viewport center. Bound to Enter for keyboard-driven text entry.
  App.prototype._insertTextAtViewportCenter = function () {
    var self = this;
    var center = this.view.screenToLogical({ x: this.view.width / 2, y: this.view.height / 2 });
    customPrompt(t('promptText'), '').then(function (text) {
      if (!text || !text.trim()) return;
      var obj = self.store.addText(center, text.trim(), self.fontSize, self.color);
      self.selectedId = obj.id;
      self.input.setSelected(obj.id);
      self.setMode('select');
    });
  };
  // Adds a horizontal arrow positioned to the upper-right of any existing
  // arrows so consecutive Insert presses stagger outward. When no arrows
  // exist yet, fall back to the current viewport center.
  App.prototype._insertArrow = function () {
    var view = this.view;
    var visibleLogicalW = view.width / view.scale;
    var lengthLogical = Math.max(60, Math.min(400, visibleLogicalW * 0.25));
    var gap = Math.max(20, lengthLogical * 0.2);
    var objects = this.store.get().objects;
    var arrows = [];
    for (var i = 0; i < objects.length; i++) {
      if (objects[i].type === 'arrow') arrows.push(objects[i]);
    }
    var from;
    if (arrows.length === 0) {
      var c = view.screenToLogical({ x: view.width / 2, y: view.height / 2 });
      from = { x: c.x - lengthLogical / 2, y: c.y };
    } else {
      var maxX = -Infinity, minY = Infinity;
      for (var j = 0; j < arrows.length; j++) {
        var a = arrows[j];
        if (a.from.x > maxX) maxX = a.from.x;
        if (a.to.x > maxX) maxX = a.to.x;
        if (a.from.y < minY) minY = a.from.y;
        if (a.to.y < minY) minY = a.to.y;
      }
      from = { x: maxX + gap, y: minY - gap };
    }
    var to = { x: from.x + lengthLogical, y: from.y };
    var fromC = clampToCanvas(from);
    var toC = { x: clampToCanvas(to).x, y: fromC.y };
    var created = this.store.addArrow(fromC, toC, this.color, this.thickness);
    this.selectedId = created.id;
    this.input.setSelected(created.id);
    this.setMode('select');
    this._flashStatus('+ arrow');
  };
  App.prototype._flashStatus = function (msg) {
    var el = document.getElementById('statusBar');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('visible');
    setTimeout(function () { el.classList.remove('visible'); }, 1400);
  };

  // ---------- expose for tests ----------
  var ArrowApp = {
    MAX_CANVAS_SIZE: MAX_CANVAS_SIZE,
    vecDist: vecDist,
    pointToSegmentDistance: pointToSegmentDistance,
    clampToCanvas: clampToCanvas,
    newId: newId,
    emptyScene: emptyScene,
    CanvasView: CanvasView,
    Renderer: Renderer,
    SceneStore: SceneStore,
    IndexedDBStore: IndexedDBStore,
    InputHandler: InputHandler,
    App: App,
    setLang: function (l) { currentLang = l; },
    getLang: function () { return currentLang; },
    t: t
  };
  if (typeof window !== 'undefined') window.ArrowApp = ArrowApp;
  if (typeof module !== 'undefined' && module.exports) module.exports = ArrowApp;

  // ---------- Boot ----------
  function boot() {
    var root = document.getElementById('app');
    if (!root) { console.error('#app missing'); return; }
    window.__arrowApp = new App(root);
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
})();
