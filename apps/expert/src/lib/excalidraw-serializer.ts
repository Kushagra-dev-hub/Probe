/**
 * Serialize Excalidraw elements into a structured text description so an LLM can
 * understand the diagram topology: what components exist, what connects to what,
 * and with what labels. Ported from practers (apps/web/src/lib/excalidraw-serializer.ts).
 */

interface ExcalidrawElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  label?: { text?: string };
  containerId?: string | null;
  startBinding?: { elementId: string } | null;
  endBinding?: { elementId: string } | null;
  frameId?: string | null;
  name?: string;
}

interface Node {
  id: string;
  label: string;
  shapeType: string;
}
interface Edge {
  id: string;
  from: string | null;
  to: string | null;
  label: string;
}

function normalizeShapeType(type: string): string {
  switch (type) {
    case "rectangle": return "box";
    case "ellipse": return "circle";
    case "diamond": return "decision";
    case "triangle": return "triangle";
    case "cylinder": return "database";
    default: return type;
  }
}

function getNodeLabel(el: ExcalidrawElement, all: ExcalidrawElement[]): string {
  const bound = all.find((e) => e.type === "text" && e.containerId === el.id && e.text?.trim());
  if (bound?.text?.trim()) return bound.text.trim();
  if (el.label?.text?.trim()) return el.label.text.trim();
  if (el.text?.trim()) return el.text.trim();
  return `(unlabeled ${normalizeShapeType(el.type)})`;
}

function getEdgeLabel(arrow: ExcalidrawElement, all: ExcalidrawElement[]): string {
  const bound = all.find((e) => e.type === "text" && e.containerId === arrow.id && e.text?.trim());
  if (bound?.text?.trim()) return bound.text.trim();
  if (arrow.label?.text?.trim()) return arrow.label.text.trim();
  if (arrow.text?.trim()) return arrow.text.trim();
  return "";
}

function findNearestShape(x: number, y: number, shapes: ExcalidrawElement[], threshold = 80): ExcalidrawElement | null {
  let best: ExcalidrawElement | null = null;
  let bestDist = threshold;
  for (const s of shapes) {
    const cx = s.x + (s.width || 0) / 2;
    const cy = s.y + (s.height || 0) / 2;
    const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
    if (dist < bestDist) { bestDist = dist; best = s; }
  }
  return best;
}

export function serializeExcalidrawForLLM(elements: unknown[]): string {
  if (!Array.isArray(elements) || elements.length === 0) {
    return "(No diagram drawn — the candidate left the whiteboard empty.)";
  }
  const els = elements as ExcalidrawElement[];
  const shapeTypes = new Set(["rectangle", "ellipse", "diamond", "triangle", "cylinder", "image"]);
  const shapes = els.filter((e) => shapeTypes.has(e.type));
  const arrows = els.filter((e) => e.type === "arrow" || e.type === "line");
  const frames = els.filter((e) => e.type === "frame");
  const standaloneText = els.filter((e) => e.type === "text" && !e.containerId && e.text?.trim());

  const nodeMap = new Map<string, Node>();
  for (const s of shapes) nodeMap.set(s.id, { id: s.id, label: getNodeLabel(s, els), shapeType: normalizeShapeType(s.type) });

  const edges: Edge[] = [];
  for (const arrow of arrows) {
    const edgeLabel = getEdgeLabel(arrow, els);
    let fromLabel: string | null = arrow.startBinding?.elementId ? nodeMap.get(arrow.startBinding.elementId)?.label ?? null : null;
    let toLabel: string | null = arrow.endBinding?.elementId ? nodeMap.get(arrow.endBinding.elementId)?.label ?? null : null;
    if (!fromLabel) { const n = findNearestShape(arrow.x, arrow.y, shapes); if (n) fromLabel = nodeMap.get(n.id)?.label ?? null; }
    if (!toLabel) { const n = findNearestShape(arrow.x + (arrow.width || 0), arrow.y + (arrow.height || 0), shapes); if (n) toLabel = nodeMap.get(n.id)?.label ?? null; }
    if (fromLabel || toLabel) edges.push({ id: arrow.id, from: fromLabel, to: toLabel, label: edgeLabel });
  }

  const frameMap = new Map<string, string>();
  for (const f of frames) frameMap.set(f.id, f.name || f.text || `Frame ${frameMap.size + 1}`);
  const frameContents = new Map<string, string[]>();
  for (const s of shapes) {
    if (s.frameId && frameMap.has(s.frameId)) {
      const fname = frameMap.get(s.frameId)!;
      const node = nodeMap.get(s.id);
      if (node) { if (!frameContents.has(fname)) frameContents.set(fname, []); frameContents.get(fname)!.push(node.label); }
    }
  }

  const connectedIds = new Set<string>();
  for (const e of edges) for (const [id, node] of nodeMap) if (node.label === e.from || node.label === e.to) connectedIds.add(id);
  const unconnected = shapes.filter((s) => !connectedIds.has(s.id));

  const lines: string[] = [];
  const componentList = Array.from(nodeMap.values()).map((n) => `${n.label} (${n.shapeType})`).join(", ");
  lines.push(`COMPONENTS: ${componentList || "(none)"}`, "");
  if (edges.length > 0) {
    lines.push("CONNECTIONS:");
    for (const e of edges) lines.push(`  - ${e.from ?? "?"} -> ${e.to ?? "?"}${e.label ? ` [${e.label}]` : ""}`);
  } else {
    lines.push("CONNECTIONS: (none — no arrows drawn or arrows not connected to shapes)");
  }
  if (frameContents.size > 0) {
    lines.push("", "ZONES / LAYERS:");
    for (const [fname, members] of frameContents) lines.push(`  - [${fname}]: ${members.join(", ")}`);
  }
  if (unconnected.length > 0) lines.push("", `ISOLATED COMPONENTS (drawn but not connected): ${unconnected.map((s) => nodeMap.get(s.id)?.label ?? "?").join(", ")}`);
  if (standaloneText.length > 0) lines.push("", `ANNOTATIONS / LABELS: ${standaloneText.map((t) => `"${t.text!.trim()}"`).join(", ")}`);
  lines.push("", `TOTAL ELEMENTS: ${els.length} (${shapes.length} shapes, ${arrows.length} arrows, ${frames.length} frames, ${standaloneText.length} text annotations)`);
  return lines.join("\n");
}

/** Convert a synced design scene (`{elements, fr, nfr}`) to LLM text. */
export function describeDesignScene(code: string): string {
  try {
    const parsed = JSON.parse(code || "{}") as { elements?: unknown[]; fr?: string; nfr?: string };
    const diagram = serializeExcalidrawForLLM(parsed.elements ?? []);
    const parts = [diagram];
    if (parsed.fr?.trim()) parts.push(`\nCANDIDATE'S FUNCTIONAL REQUIREMENTS:\n${parsed.fr.trim()}`);
    if (parsed.nfr?.trim()) parts.push(`\nCANDIDATE'S NON-FUNCTIONAL REQUIREMENTS:\n${parsed.nfr.trim()}`);
    return parts.join("\n");
  } catch {
    return "(No diagram drawn.)";
  }
}
