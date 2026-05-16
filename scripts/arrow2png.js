#!/usr/bin/env node
"use strict";
/*
 * arrow2png — convert an arrow-mindmap scene JSON to a single image file.
 *
 * Adapts the math from src/canvas/Renderer.ts (highlighter under everything,
 * arrow shaft + triangular head, text top-left, center label centered) so the
 * output matches what the app would export via "Export PNG".
 *
 * Output format is picked from the extension of the output path:
 *   - .png → rasterizes via node-canvas (`npm install canvas`). Required for
 *           true PNG bytes; the app itself stays dependency-free at runtime.
 *   - .svg → pure-JS SVG emitter, no native deps. Useful when canvas can't be
 *           built (e.g. PRoot/Termux) and for embedding in markdown where the
 *           renderer is the browser, so emojis render natively.
 *
 * Usage:
 *   tsc -p scripts/tsconfig.json
 *   node scripts/arrow2png.js <input.json> <output.{png,svg}>
 *     [--width N] [--height N] [--padding N] [--bg #fafafa]
 *
 * If --width / --height are omitted, the canvas auto-sizes to the content
 * bounding box (plus padding) so the export has no large empty margins.
 */
// Resolve Node built-ins lazily so we don't need module-resolution support
// for the bare specifiers 'fs' / 'path' (which would require @types/node).
const fs = require('fs');
const path = require('path');
const { readFileSync, writeFileSync } = fs;
const { resolve } = path;
// Must match src/models/types.ts.
const HIGHLIGHTER_OPACITY = 0.35;
const HIGHLIGHTER_WIDTH_MULT = 4;
const DEFAULT_CENTER_FONT_SIZE = 28;
function parseArgs(argv) {
    const args = argv.slice(2);
    const positional = [];
    let width = 0;
    let height = 0;
    let padding = 80;
    let bg = '#fafafa';
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === '--width')
            width = parseInt(args[++i], 10);
        else if (a === '--height')
            height = parseInt(args[++i], 10);
        else if (a === '--padding')
            padding = parseInt(args[++i], 10);
        else if (a === '--bg')
            bg = args[++i];
        else if (a === '-h' || a === '--help') {
            usage(0);
        }
        else if (a.startsWith('--')) {
            process.stderr.write('unknown flag: ' + a + '\n');
            usage(2);
        }
        else
            positional.push(a);
    }
    if (positional.length !== 2)
        usage(2);
    return { input: positional[0], output: positional[1], width, height, padding, bg };
}
function usage(code) {
    process.stderr.write('usage: arrow2png <input.json> <output.png> [--width N] [--height N] [--padding N] [--bg #fafafa]\n');
    process.exit(code);
    // Unreachable, but TypeScript needs the return type to terminate.
    throw new Error('unreachable');
}
function loadCanvas() {
    try {
        // require() resolved lazily so this file type-checks without canvas
        // installed. The error path tells the user exactly how to install.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        return require('canvas');
    }
    catch (e) {
        process.stderr.write('error: node-canvas not installed. Run: npm install canvas\n');
        process.exit(3);
        throw e;
    }
}
// Compute the content bounding box in logical coords, matching the in-browser
// Renderer.contentBounds shape (but without clamping to MAX_CANVAS_SIZE — the
// CLI export is unbounded by the editor's world boundary).
function contentBounds(scene, padding) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    // Reserve a small box around the synthetic "center" so the topic label sits
    // on the canvas even when there are no objects nearby. The center sits at
    // the geometric midpoint of the object bbox, computed after the first pass.
    let hasContent = false;
    for (const o of scene.objects) {
        hasContent = true;
        if (o.type === 'arrow') {
            minX = Math.min(minX, o.from.x, o.to.x);
            minY = Math.min(minY, o.from.y, o.to.y);
            maxX = Math.max(maxX, o.from.x, o.to.x);
            maxY = Math.max(maxY, o.from.y, o.to.y);
        }
        else if (o.type === 'highlighter') {
            const pad = o.thickness * HIGHLIGHTER_WIDTH_MULT * 0.5;
            for (const p of o.points) {
                minX = Math.min(minX, p.x - pad);
                minY = Math.min(minY, p.y - pad);
                maxX = Math.max(maxX, p.x + pad);
                maxY = Math.max(maxY, p.y + pad);
            }
        }
        else {
            // Same rough text-box estimate as in the in-browser code.
            minX = Math.min(minX, o.pos.x);
            minY = Math.min(minY, o.pos.y);
            maxX = Math.max(maxX, o.pos.x + o.fontSize * Math.max(2, o.text.length));
            maxY = Math.max(maxY, o.pos.y + o.fontSize * 1.4);
        }
    }
    if (!hasContent) {
        minX = -100;
        minY = -60;
        maxX = 100;
        maxY = 60;
    }
    // Center sits at the midpoint of the object cluster.
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    // Always include a box around the center so the topic label has room.
    const fs = scene.centerFontSize || DEFAULT_CENTER_FONT_SIZE;
    const centerHalfW = Math.max(120, fs * 8) / 2;
    const centerHalfH = fs * 1.6;
    minX = Math.min(minX, cx - centerHalfW);
    maxX = Math.max(maxX, cx + centerHalfW);
    minY = Math.min(minY, cy - centerHalfH);
    maxY = Math.max(maxY, cy + centerHalfH);
    return {
        x: minX - padding,
        y: minY - padding,
        w: (maxX - minX) + padding * 2,
        h: (maxY - minY) + padding * 2,
        cx,
        cy,
    };
}
function drawHighlighter(ctx, hl) {
    if (hl.points.length < 1)
        return;
    const width = Math.max(1, hl.thickness * HIGHLIGHTER_WIDTH_MULT);
    ctx.save();
    ctx.globalAlpha = HIGHLIGHTER_OPACITY;
    ctx.strokeStyle = hl.color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(hl.points[0].x, hl.points[0].y);
    if (hl.points.length === 1) {
        ctx.lineTo(hl.points[0].x, hl.points[0].y);
    }
    else {
        for (let i = 1; i < hl.points.length; i++)
            ctx.lineTo(hl.points[i].x, hl.points[i].y);
    }
    ctx.stroke();
    ctx.restore();
}
function drawArrow(ctx, arrow) {
    const from = arrow.from;
    const to = arrow.to;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    if (len < 1)
        return;
    const ux = dx / len;
    const uy = dy / len;
    const thick = Math.max(1, arrow.thickness);
    ctx.strokeStyle = arrow.color;
    ctx.fillStyle = arrow.color;
    ctx.lineWidth = thick;
    ctx.lineCap = 'round';
    // Shaft is shortened so the head doesn't overshoot the endpoint.
    const headLen = Math.min(len, 12 + arrow.thickness * 3);
    const shaftEndX = to.x - ux * headLen * 0.7;
    const shaftEndY = to.y - uy * headLen * 0.7;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(shaftEndX, shaftEndY);
    ctx.stroke();
    // Triangular arrowhead.
    const headHalf = headLen * 0.5;
    const px = -uy;
    const py = ux;
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - ux * headLen + px * headHalf, to.y - uy * headLen + py * headHalf);
    ctx.lineTo(to.x - ux * headLen - px * headHalf, to.y - uy * headLen - py * headHalf);
    ctx.closePath();
    ctx.fill();
}
function drawText(ctx, t) {
    ctx.font = t.fontSize + 'px sans-serif';
    ctx.fillStyle = t.color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(t.text || '...', t.pos.x, t.pos.y);
}
function drawCenter(ctx, scene, cx, cy) {
    const baseFontSize = scene.centerFontSize || DEFAULT_CENTER_FONT_SIZE;
    ctx.fillStyle = '#333';
    ctx.font = baseFontSize + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const label = scene.centerText || '주제 / Topic';
    const wrapWidth = Math.max(120, baseFontSize * 8);
    wrapText(ctx, label, cx, cy, wrapWidth, baseFontSize * 1.1);
}
function wrapText(ctx, text, cx, cy, maxWidth, lineHeight) {
    const words = text.split(/\s+/);
    const lines = [];
    let current = '';
    for (const w of words) {
        const test = current ? current + ' ' + w : w;
        if (ctx.measureText(test).width > maxWidth && current) {
            lines.push(current);
            current = w;
        }
        else {
            current = test;
        }
    }
    if (current)
        lines.push(current);
    const total = lines.length;
    const startY = cy - ((total - 1) * lineHeight) / 2;
    for (let i = 0; i < total; i++)
        ctx.fillText(lines[i], cx, startY + i * lineHeight);
}
// XML-escape a string for safe SVG embedding. Only the four characters that
// would prematurely close a tag / attribute need escaping; emojis pass
// through untouched and render via the viewer's font stack.
function xmlEscape(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
// Wrap centerText into multiple <tspan> rows using a measureText stand-in
// that matches the canvas branch's approximation. Returns an array of strings.
function wrapCenterLines(text, maxWidth, charWidth) {
    const words = text.split(/\s+/);
    const lines = [];
    let current = '';
    const measure = (s) => s.length * charWidth;
    for (const w of words) {
        const test = current ? current + ' ' + w : w;
        if (measure(test) > maxWidth && current) {
            lines.push(current);
            current = w;
        }
        else {
            current = test;
        }
    }
    if (current)
        lines.push(current);
    return lines;
}
function emitSvg(scene, opts) {
    const bounds = contentBounds(scene, opts.padding);
    const w = opts.width > 0 ? opts.width : Math.max(1, Math.ceil(bounds.w));
    const h = opts.height > 0 ? opts.height : Math.max(1, Math.ceil(bounds.h));
    // SVG viewBox translates content so its bbox top-left maps to (0, 0).
    // viewBox uses the same local coords the JSON does, then sizes to w/h px.
    const vbX = bounds.x;
    const vbY = bounds.y;
    const vbW = bounds.w;
    const vbH = bounds.h;
    const parts = [];
    parts.push('<?xml version="1.0" encoding="UTF-8"?>');
    parts.push('<svg xmlns="http://www.w3.org/2000/svg" ' +
        'width="' + w + '" height="' + h + '" ' +
        'viewBox="' + vbX + ' ' + vbY + ' ' + vbW + ' ' + vbH + '" ' +
        'font-family="sans-serif">');
    parts.push('<rect x="' + vbX + '" y="' + vbY + '" width="' + vbW + '" height="' + vbH + '" fill="' + opts.bg + '"/>');
    // Highlighters under everything else.
    for (const o of scene.objects) {
        if (o.type !== 'highlighter' || o.points.length < 1)
            continue;
        const pts = o.points.map((p) => p.x + ',' + p.y).join(' ');
        const sw = Math.max(1, o.thickness * HIGHLIGHTER_WIDTH_MULT);
        const tag = o.points.length === 1
            ? '<circle cx="' + o.points[0].x + '" cy="' + o.points[0].y + '" r="' + (sw / 2) + '" fill="' + o.color + '" opacity="' + HIGHLIGHTER_OPACITY + '"/>'
            : '<polyline points="' + pts + '" fill="none" stroke="' + o.color + '" stroke-width="' + sw + '" stroke-linecap="round" stroke-linejoin="round" opacity="' + HIGHLIGHTER_OPACITY + '"/>';
        parts.push(tag);
    }
    // Arrows: shaft + filled triangular head, mirroring the canvas math.
    for (const o of scene.objects) {
        if (o.type !== 'arrow')
            continue;
        const dx = o.to.x - o.from.x;
        const dy = o.to.y - o.from.y;
        const len = Math.hypot(dx, dy);
        if (len < 1)
            continue;
        const ux = dx / len, uy = dy / len;
        const thick = Math.max(1, o.thickness);
        const headLen = Math.min(len, 12 + o.thickness * 3);
        const shaftEndX = o.to.x - ux * headLen * 0.7;
        const shaftEndY = o.to.y - uy * headLen * 0.7;
        parts.push('<line x1="' + o.from.x + '" y1="' + o.from.y + '" x2="' + shaftEndX + '" y2="' + shaftEndY +
            '" stroke="' + o.color + '" stroke-width="' + thick + '" stroke-linecap="round"/>');
        const headHalf = headLen * 0.5;
        const px = -uy, py = ux;
        const ax = o.to.x;
        const ay = o.to.y;
        const bx = o.to.x - ux * headLen + px * headHalf;
        const by = o.to.y - uy * headLen + py * headHalf;
        const cx = o.to.x - ux * headLen - px * headHalf;
        const cy = o.to.y - uy * headLen - py * headHalf;
        parts.push('<polygon points="' + ax + ',' + ay + ' ' + bx + ',' + by + ' ' + cx + ',' + cy + '" fill="' + o.color + '"/>');
    }
    // Text labels on top.
    for (const o of scene.objects) {
        if (o.type !== 'text')
            continue;
        // SVG <text> baseline is alphabetic by default; the canvas path uses
        // textBaseline="top". Use dominant-baseline="text-before-edge" to match.
        parts.push('<text x="' + o.pos.x + '" y="' + o.pos.y + '" font-size="' + o.fontSize + '" fill="' + o.color +
            '" dominant-baseline="text-before-edge">' + xmlEscape(o.text || '...') + '</text>');
    }
    // Center label at cluster midpoint, after objects so it reads on top.
    const baseFontSize = scene.centerFontSize || DEFAULT_CENTER_FONT_SIZE;
    const wrapWidth = Math.max(120, baseFontSize * 8);
    // SVG has no measureText at emit time; approximate char width like the
    // canvas auto-bounds path does. 0.6 of fontSize is a typical sans-serif
    // average; slightly under-counts emojis which is fine for wrapping.
    const lines = wrapCenterLines(scene.centerText || '주제 / Topic', wrapWidth, baseFontSize * 0.6);
    const lineHeight = baseFontSize * 1.1;
    const startY = bounds.cy - ((lines.length - 1) * lineHeight) / 2;
    for (let i = 0; i < lines.length; i++) {
        parts.push('<text x="' + bounds.cx + '" y="' + (startY + i * lineHeight) +
            '" font-size="' + baseFontSize + '" fill="#333" text-anchor="middle" dominant-baseline="central">' +
            xmlEscape(lines[i]) + '</text>');
    }
    parts.push('</svg>');
    return parts.join('\n');
}
function emitPng(scene, opts) {
    const Canvas = loadCanvas();
    const bounds = contentBounds(scene, opts.padding);
    const w = opts.width > 0 ? opts.width : Math.max(1, Math.ceil(bounds.w));
    const h = opts.height > 0 ? opts.height : Math.max(1, Math.ceil(bounds.h));
    const canvas = Canvas.createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = opts.bg;
    ctx.fillRect(0, 0, w, h);
    // Translate so the bbox top-left aligns with the padding inset of the
    // canvas — fixed sizes leave the slack on the bottom-right.
    ctx.translate(-bounds.x, -bounds.y);
    for (const o of scene.objects)
        if (o.type === 'highlighter')
            drawHighlighter(ctx, o);
    for (const o of scene.objects)
        if (o.type === 'arrow')
            drawArrow(ctx, o);
    for (const o of scene.objects)
        if (o.type === 'text')
            drawText(ctx, o);
    drawCenter(ctx, scene, bounds.cx, bounds.cy);
    return canvas.toBuffer('image/png');
}
function main() {
    const opts = parseArgs(process.argv);
    const raw = readFileSync(resolve(opts.input), 'utf-8');
    const scene = JSON.parse(raw);
    if (!Array.isArray(scene.objects)) {
        process.stderr.write('error: input JSON does not look like a scene (missing `objects` array)\n');
        process.exit(4);
    }
    const ext = opts.output.toLowerCase().slice(opts.output.lastIndexOf('.'));
    if (ext === '.svg') {
        const svg = emitSvg(scene, opts);
        // SVG is text — write as UTF-8 string wrapped to a Buffer surface.
        writeFileSync(resolve(opts.output), Buffer.from(svg, 'utf-8'));
        process.stdout.write('wrote ' + opts.output + ' (' + svg.length + ' bytes, svg)\n');
    }
    else {
        const buf = emitPng(scene, opts);
        writeFileSync(resolve(opts.output), buf);
        process.stdout.write('wrote ' + opts.output + ' (' + buf.length + ' bytes, png)\n');
    }
}
main();
