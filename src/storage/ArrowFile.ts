import {
  ArrowObject,
  SceneData,
  SceneObject,
  TextObject,
  emptyScene,
  newId,
} from '../models/types.js';
import { MAX_CANVAS_SIZE, Vec } from '../utils/geometry.js';

// .arrow text-format importer.
//
// Format:
//   1st non-blank line : the literal "arrow" — file marker.
//   2nd non-blank line : the topic (centerText).
//   3rd+ non-blank line : a chain "A -> B -> C" (or "→") that becomes
//                         arrows A→B, B→C between the named text nodes.
//   "#" begins a comment to end of line.
//
// Chain semantics: if the first word of a chain already names a node in the
// scene (the topic itself, or a node introduced by an earlier chain), the
// chain extends from that existing node. Otherwise the first word becomes a
// new root and is hung off the topic just like any other top-level branch.
//
// Layout: topic sits at canvas center. Direct children fan around it with
// angle step = 360°/N starting at 12 o'clock and going clockwise. Deeper
// levels reuse the parent's outward angle as the starting angle and fan
// with the same 360°/N rule — for single-child chains that means each link
// continues straight outward, matching the spec literally.

export const ARROW_FILE_FONT_SIZE = 24;
const ARROW_FILE_COLOR = '#222222';
const ARROW_FILE_THICKNESS = 4;
const ARROW_FILE_RING_RADIUS = 240;
const ARROW_FILE_RADIUS_FACTOR = 0.85;
const ARROW_FILE_NODE_PAD = 14;

interface TreeNode {
  label: string;
  children: TreeNode[];
  pos: Vec | null;
}

interface ParsedArrowFile {
  topic: string;
  chains: string[][];
}

// Tokenize the file: drop comments (# to EOL), trim, drop blank lines.
// Returns null if the marker line is missing or wrong.
function tokenize(content: string): ParsedArrowFile | null {
  const cleaned: string[] = [];
  for (let raw of content.split(/\r?\n/)) {
    const hashIdx = raw.indexOf('#');
    if (hashIdx >= 0) raw = raw.substring(0, hashIdx);
    const trimmed = raw.trim();
    if (trimmed) cleaned.push(trimmed);
  }
  if (cleaned.length < 2) return null;
  // Marker comparison is case-insensitive — small forgiveness for hand-typed files.
  if (cleaned[0].toLowerCase() !== 'arrow') return null;
  const topic = cleaned[1];
  const chains: string[][] = [];
  for (let i = 2; i < cleaned.length; i++) {
    const parts = cleaned[i]
      .split(/->|→/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (parts.length > 0) chains.push(parts);
  }
  return { topic, chains };
}

// Build a tree of unique-label nodes plus a list of parent→child edges.
// Reused labels collapse into the same node (so two chains naming "Book"
// share one centerText anchor, and a label that appears as a target in
// one chain and a source in another links into the same graph node).
function buildTree(parsed: ParsedArrowFile): { topicNode: TreeNode; nodes: Map<string, TreeNode>; edges: Array<[TreeNode, TreeNode]> } {
  const topicNode: TreeNode = { label: parsed.topic, children: [], pos: { x: 0, y: 0 } };
  const nodes = new Map<string, TreeNode>();
  nodes.set(parsed.topic, topicNode);
  const edges: Array<[TreeNode, TreeNode]> = [];
  // Set-based dedupe for edges so a label repeated across chains doesn't
  // emit duplicate arrows.
  const seenEdges = new Set<string>();
  const linkParentChild = (parent: TreeNode, child: TreeNode): void => {
    const key = parent.label + '\u0000' + child.label;
    if (seenEdges.has(key)) return;
    seenEdges.add(key);
    if (!parent.children.includes(child)) parent.children.push(child);
    edges.push([parent, child]);
  };
  for (const chain of parsed.chains) {
    if (chain.length === 0) continue;
    let parent: TreeNode;
    const first = chain[0];
    if (nodes.has(first)) {
      parent = nodes.get(first) as TreeNode;
    } else {
      // New root: hang off the topic as a top-level branch.
      const newRoot: TreeNode = { label: first, children: [], pos: null };
      nodes.set(first, newRoot);
      linkParentChild(topicNode, newRoot);
      parent = newRoot;
    }
    for (let i = 1; i < chain.length; i++) {
      const word = chain[i];
      let child = nodes.get(word);
      if (!child) {
        child = { label: word, children: [], pos: null };
        nodes.set(word, child);
      }
      linkParentChild(parent, child);
      parent = child;
    }
  }
  return { topicNode, nodes, edges };
}

// Place every node by walking the tree breadth-first. Topic is at (0, 0);
// direct children fan around it at radius R starting at 12 o'clock (math
// angle -π/2). At every deeper level the start angle becomes the parent's
// outward angle so chains visually extend away from the center.
function layoutTree(topicNode: TreeNode): void {
  const recurse = (parent: TreeNode, radius: number, startAngle: number): void => {
    const kids = parent.children;
    if (kids.length === 0) return;
    const step = (2 * Math.PI) / kids.length;
    for (let i = 0; i < kids.length; i++) {
      const angle = startAngle + i * step;
      const px = (parent.pos as Vec).x + radius * Math.cos(angle);
      const py = (parent.pos as Vec).y + radius * Math.sin(angle);
      kids[i].pos = { x: px, y: py };
      // Pass `angle` as the next start so a single-child chain continues
      // straight outward (360°/1 = full turn, so it's exactly `angle`).
      recurse(kids[i], radius * ARROW_FILE_RADIUS_FACTOR, angle);
    }
  };
  // Topic's first-level fan starts at the top and goes clockwise — matches
  // how most hand-drawn mindmaps read.
  recurse(topicNode, ARROW_FILE_RING_RADIUS, -Math.PI / 2);
}

// Construct text + arrow objects from the placed tree. Text nodes are
// positioned with their CENTER on the computed point (the renderer expects
// top-left, so we subtract half-bbox). Arrows are trimmed on both ends by an
// approximate half-bbox-along-direction so the arrow line doesn't pierce
// the text glyphs.
function buildObjects(
  topicNode: TreeNode,
  nodes: Map<string, TreeNode>,
  edges: Array<[TreeNode, TreeNode]>,
): SceneObject[] {
  const out: SceneObject[] = [];
  const charW = ARROW_FILE_FONT_SIZE * 0.65;
  const textHeight = ARROW_FILE_FONT_SIZE;
  // Cache estimated half-widths per node so trim is consistent.
  const halfWidths = new Map<TreeNode, number>();
  const computeHalfWidth = (n: TreeNode): number => {
    const cached = halfWidths.get(n);
    if (cached !== undefined) return cached;
    const w = Math.max(charW, charW * n.label.length) / 2;
    halfWidths.set(n, w);
    return w;
  };
  // Text objects (skip topic — it lives as centerText).
  for (const node of nodes.values()) {
    if (node === topicNode) continue;
    if (!node.pos) continue;
    const hw = computeHalfWidth(node);
    const tx: TextObject = {
      id: newId('text'),
      type: 'text',
      pos: { x: node.pos.x - hw, y: node.pos.y - textHeight / 2 },
      text: node.label,
      fontSize: ARROW_FILE_FONT_SIZE,
      color: ARROW_FILE_COLOR,
    };
    out.push(tx);
  }
  // Arrows from edges; trim by half-bbox on both ends.
  for (const [from, to] of edges) {
    if (!from.pos || !to.pos) continue;
    const dx = to.pos.x - from.pos.x;
    const dy = to.pos.y - from.pos.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) continue;
    const ux = dx / len;
    const uy = dy / len;
    // Source gap: when the source is the topic we use a larger radius
    // because the centerText is bigger than ordinary text labels.
    const fromGap = from === topicNode
      ? ARROW_FILE_FONT_SIZE * 2.5 + ARROW_FILE_NODE_PAD
      : computeHalfWidth(from) + ARROW_FILE_NODE_PAD;
    const toGap = computeHalfWidth(to) + ARROW_FILE_NODE_PAD;
    if (fromGap + toGap >= len) continue; // too close — skip the arrow
    const sx = from.pos.x + ux * fromGap;
    const sy = from.pos.y + uy * fromGap;
    const ex = to.pos.x - ux * toGap;
    const ey = to.pos.y - uy * toGap;
    const ar: ArrowObject = {
      id: newId('arrow'),
      type: 'arrow',
      from: { x: sx, y: sy },
      to: { x: ex, y: ey },
      color: ARROW_FILE_COLOR,
      thickness: ARROW_FILE_THICKNESS,
    };
    out.push(ar);
  }
  return out;
}

// Translate all coordinates so the topic-at-origin layout sits at the
// canvas center (MAX/2, MAX/2). This puts the diagram inside the editor's
// world boundary and lines up the centerText with the canvas anchor.
function recenterToCanvas(objects: SceneObject[]): void {
  const shift = MAX_CANVAS_SIZE / 2;
  for (const o of objects) {
    if (o.type === 'text') {
      o.pos.x += shift;
      o.pos.y += shift;
    } else if (o.type === 'arrow') {
      o.from.x += shift;
      o.from.y += shift;
      o.to.x += shift;
      o.to.y += shift;
    } else {
      // highlighter — .arrow files never emit these, but be safe.
      for (const p of o.points) {
        p.x += shift;
        p.y += shift;
      }
    }
  }
}

// Public entry point: parse .arrow text into a fresh SceneData. Returns
// null when the marker line is missing — caller surfaces that as an
// invalid-file error.
export function parseArrowFile(content: string, sceneName: string): SceneData | null {
  const parsed = tokenize(content);
  if (!parsed) return null;
  const { topicNode, nodes, edges } = buildTree(parsed);
  layoutTree(topicNode);
  const objects = buildObjects(topicNode, nodes, edges);
  recenterToCanvas(objects);
  const scene = emptyScene(sceneName || parsed.topic || 'arrow');
  scene.centerText = parsed.topic;
  scene.objects = objects;
  return scene;
}
