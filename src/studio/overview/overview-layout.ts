import ELK from "elkjs/lib/elk.bundled.js";
import type { OverviewNode, OverviewEdge } from "./derive-overview";

export const OVERVIEW_TABLE_WIDTH = 240;
export const OVERVIEW_TABLE_HEIGHT = 72;
export type OverviewPositions = Record<string, { x: number; y: number }>;
const elk = new ELK();

/** Layout projection only: never writes the business document or catalog coordinates. */
export async function layoutOverview(
  nodes: readonly OverviewNode[],
  edges: readonly OverviewEdge[],
): Promise<OverviewPositions> {
  if (!nodes.length) return {};
  const ids = new Set(nodes.map((n) => n.tableId));
  const links = new Map<string, { source: string; target: string }>();
  const pairKey = (source: string, target: string) =>
    JSON.stringify([source, target]);
  const validEdges = edges.filter(
    (e) => ids.has(e.sourceTableId) && ids.has(e.targetTableId),
  );
  // Matching is undirected: never let its arbitrary ID ordering oppose a directed mapping.
  for (const e of validEdges.filter((e) => e.kind === "mapping")) {
    links.set(pairKey(e.sourceTableId, e.targetTableId), {
      source: e.sourceTableId,
      target: e.targetTableId,
    });
  }
  for (const e of validEdges.filter((e) => e.kind === "matching")) {
    if (
      links.has(pairKey(e.sourceTableId, e.targetTableId)) ||
      links.has(pairKey(e.targetTableId, e.sourceTableId))
    )
      continue;
    const [source, target] = [e.sourceTableId, e.targetTableId].sort();
    links.set(pairKey(source, target), { source, target });
  }
  const result = await elk.layout({
    id: "overview",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.layered.spacing.nodeNodeBetweenLayers": "140",
      "elk.spacing.nodeNode": "70",
      "elk.spacing.componentComponent": "100",
      "elk.separateConnectedComponents": "true",
      "elk.randomSeed": "1",
    },
    children: [...ids].sort().map((id) => ({
      id,
      width: OVERVIEW_TABLE_WIDTH,
      height: OVERVIEW_TABLE_HEIGHT,
    })),
    edges: [...links]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, e], i) => ({
        id: `layout-${i}`,
        sources: [e.source],
        targets: [e.target],
      })),
  });
  return Object.fromEntries(
    nodes.map((n) => {
      const placed = result.children?.find((p) => p.id === n.tableId);
      if (!placed || !Number.isFinite(placed.x) || !Number.isFinite(placed.y))
        throw Error("自动排布返回了无效位置");
      return [n.tableId, { x: placed.x!, y: placed.y! }];
    }),
  );
}
