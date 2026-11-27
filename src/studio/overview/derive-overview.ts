import { deriveFieldEdges } from "../domain/flow-diagram";
import type { WorkspaceSnapshot } from "../state/workspace-state";

/**
 * Node representing a table in the overview graph.
 */
export interface OverviewNode {
  /** The table's unique id. */
  tableId: string;
  /** The table's original name. */
  name: string;
  /** The display name (may be overridden by metadata). */
  displayName: string;
  /** The table's note. */
  note: string;
}

/**
 * Edge representing a relationship between two tables.
 *
 * `kind` is either `'mapping'` (directed, from source to target) or
 * `'matching'` (undirected, canonical pair).  For this implementation only
 * mapping edges are produced from rules; matching edges are left empty.
 *
 * `flowIds` and `flowNames` are the flows that reference this edge.
 */
export interface OverviewEdge {
  /** Unique identifier for the edge. */
  id: string;
  /** Source table id. */
  sourceTableId: string;
  /** Target table id. */
  targetTableId: string;
  /** Edge kind. */
  kind: "mapping" | "matching";
  /** Flow ids that reference this edge. */
  flowIds: string[];
  /** Flow names that reference this edge. */
  flowNames: string[];
}

/**
 * Derive a read‑only overview graph from a snapshot.
 *
 * @param snapshot The workspace snapshot to derive from.  If `null` or
 *                 missing business data, an empty graph is returned.
 * @returns An object containing `nodes` and `edges` arrays.
 */
export function deriveOverview(snapshot: WorkspaceSnapshot | null): {
  nodes: OverviewNode[];
  edges: OverviewEdge[];
} {
  if (!snapshot || !snapshot.business) {
    return { nodes: [], edges: [] };
  }

  const { catalog, metadata, business } = snapshot;
  const { refs, flows } = business;

  /* ---------- Build nodes ---------- */
  const nodeMap = new Map<string, OverviewNode>();

  for (const ref of refs) {
    const table = catalog.tables.find((t) => t.id === ref.tableId);
    if (!table) continue; // skip missing tables

    const displayName = metadata.tableDisplayNames[ref.tableId] ?? table.name;

    nodeMap.set(ref.tableId, {
      tableId: ref.tableId,
      name: table.name,
      displayName,
      note: table.note ?? "",
    });
  }

  const nodes = Array.from(nodeMap.values());

  const edges: OverviewEdge[] = [];
  const edgeSet = new Set<string>();
  for (const flow of flows)
    for (const item of deriveFieldEdges(snapshot, flow.flowId)) {
      let sourceTableId = refs.find((r) => r.refId === item.source)!.tableId;
      let targetTableId = refs.find((r) => r.refId === item.target)!.tableId;
      if (item.kind === "matching" && sourceTableId > targetTableId)
        [sourceTableId, targetTableId] = [targetTableId, sourceTableId];
      const id = `${sourceTableId}|${targetTableId}|${item.kind}|${flow.flowId}`;
      if (edgeSet.has(id)) continue;
      edgeSet.add(id);
      edges.push({
        id,
        sourceTableId,
        targetTableId,
        kind: item.kind,
        flowIds: [flow.flowId],
        flowNames: [flow.name],
      });
    }
  return { nodes, edges };
}
