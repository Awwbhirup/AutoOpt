/**
 * Where to draw a control-flow graph: blocks stacked in program order, the
 * edge to the next block straight down, other forward jumps routed down the
 * right side and back edges (loops) up the left, each in its own lane so no
 * two lines run on top of each other.
 */

export interface LayoutBlock {
  id: number;
  lines: number;
}

export interface LayoutEdge {
  source: number;
  target: number;
  kind: "jump" | "true" | "false" | "fallthrough";
}

export interface PlacedBlock {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PlacedEdge extends LayoutEdge {
  /** SVG path data. */
  d: string;
  side: "down" | "right" | "left";
  lane: number;
  label: { x: number; y: number };
}

export interface CfgLayout {
  blocks: PlacedBlock[];
  edges: PlacedEdge[];
  width: number;
  height: number;
}

export const BLOCK_WIDTH = 240;
const HEADER = 26;
const LINE = 16;
const PAD = 10;
const GAP = 34;
const LANE = 14;
/** Instructions shown per block before "+n more". */
export const SHOWN_LINES = 5;

export function blockHeight(lines: number): number {
  const shown = Math.min(lines, SHOWN_LINES) + (lines > SHOWN_LINES ? 1 : 0);
  return HEADER + shown * LINE + PAD;
}

/**
 * Lanes for intervals of rows: the shortest spans get the innermost lanes, and
 * two edges share a lane only when their spans do not touch.
 */
export function assignLanes(spans: ReadonlyArray<[number, number]>): number[] {
  const order = spans
    .map((span, index) => ({ index, low: Math.min(...span), high: Math.max(...span) }))
    .sort((a, b) => a.high - a.low - (b.high - b.low) || a.low - b.low);
  const lanes: Array<Array<[number, number]>> = [];
  const result = new Array<number>(spans.length).fill(0);
  for (const span of order) {
    let lane = 0;
    while (lanes[lane]?.some(([low, high]) => span.low <= high && low <= span.high)) lane += 1;
    (lanes[lane] ??= []).push([span.low, span.high]);
    result[span.index] = lane;
  }
  return result;
}

export function layoutCfg(blocks: readonly LayoutBlock[], edges: readonly LayoutEdge[]): CfgLayout {
  const ordered = [...blocks].sort((a, b) => a.id - b.id);
  const row = new Map(ordered.map((block, index) => [block.id, index]));

  const sideOf = (edge: LayoutEdge): PlacedEdge["side"] => {
    const from = row.get(edge.source) ?? 0;
    const to = row.get(edge.target) ?? 0;
    if (to === from + 1) return "down";
    return to > from ? "right" : "left";
  };

  const right = edges.filter((edge) => sideOf(edge) === "right");
  const left = edges.filter((edge) => sideOf(edge) === "left");
  const span = (edge: LayoutEdge): [number, number] => [row.get(edge.source) ?? 0, row.get(edge.target) ?? 0];
  const rightLanes = assignLanes(right.map(span));
  const leftLanes = assignLanes(left.map(span));
  const leftRoom = (leftLanes.length === 0 ? 0 : Math.max(...leftLanes) + 1) * LANE + 18;
  const rightRoom = (rightLanes.length === 0 ? 0 : Math.max(...rightLanes) + 1) * LANE + 18;

  const placed: PlacedBlock[] = [];
  let y = 8;
  for (const block of ordered) {
    const height = blockHeight(block.lines);
    placed.push({ id: block.id, x: leftRoom, y, width: BLOCK_WIDTH, height });
    y += height + GAP;
  }
  const at = new Map(placed.map((block) => [block.id, block]));

  const placedEdges: PlacedEdge[] = edges.map((edge) => {
    const from = at.get(edge.source);
    const to = at.get(edge.target);
    const side = sideOf(edge);
    if (from === undefined || to === undefined) {
      return { ...edge, d: "", side, lane: 0, label: { x: 0, y: 0 } };
    }
    if (side === "down") {
      // A conditional's two exits both leave the bottom; nudge them apart.
      const nudge = edge.kind === "true" ? -18 : edge.kind === "false" ? 18 : 0;
      const x = from.x + from.width / 2 + nudge;
      const y1 = from.y + from.height;
      const y2 = to.y;
      return { ...edge, d: `M ${x} ${y1} L ${x} ${y2 - 4}`, side, lane: 0, label: { x: x + 6, y: (y1 + y2) / 2 } };
    }
    if (side === "right") {
      const lane = rightLanes[right.indexOf(edge)];
      const x0 = from.x + from.width;
      const xl = x0 + 14 + lane * LANE;
      const y1 = from.y + from.height - 12;
      const y2 = to.y + 14;
      return {
        ...edge,
        d: `M ${x0} ${y1} H ${xl} V ${y2} H ${to.x + to.width + 4}`,
        side,
        lane,
        label: { x: xl + 4, y: y1 + 12 },
      };
    }
    const lane = leftLanes[left.indexOf(edge)];
    const x0 = from.x;
    const xl = x0 - 14 - lane * LANE;
    const y1 = from.y + from.height - 12;
    const y2 = to.y + 14;
    return {
      ...edge,
      d: `M ${x0} ${y1} H ${xl} V ${y2} H ${to.x - 4}`,
      side,
      lane,
      label: { x: xl - 4, y: y1 - 4 },
    };
  });

  return {
    blocks: placed,
    edges: placedEdges,
    width: leftRoom + BLOCK_WIDTH + rightRoom,
    height: Math.max(y - GAP + 8, 40),
  };
}
