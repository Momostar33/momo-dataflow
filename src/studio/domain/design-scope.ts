import type { WorkspaceSnapshot } from "../state/workspace-state";
/** Read-only projection: never let a selected design expose another design's graph. */
export function scopeDesignSnapshot(
  snapshot: WorkspaceSnapshot | null,
  databaseId: string,
): WorkspaceSnapshot | null {
  if (!snapshot || !databaseId) return snapshot;
  const c = snapshot.catalog,
    tables = c.tables.filter((t) => t.databaseId === databaseId),
    tableIds = new Set(tables.map((t) => t.id)),
    fields = c.fields.filter((f) => tableIds.has(f.tableId)),
    fieldIds = new Set(fields.map((f) => f.id)),
    indices = c.indices.filter((i) => tableIds.has(i.tableId)),
    indexIds = new Set(indices.map((i) => i.id));
  const b = snapshot.business,
    flows = b?.flows.filter((f) => f.databaseId === databaseId) ?? [],
    flowIds = new Set(flows.map((f) => f.flowId));
  return {
    ...snapshot,
    catalog: {
      ...c,
      databases: c.databases.filter((d) => d.id === databaseId),
      tables,
      fields,
      relationships: c.relationships.filter((r) => r.databaseId === databaseId),
      indices,
      fieldIndices: c.fieldIndices.filter(
        (i) => indexIds.has(i.indexId) && fieldIds.has(i.fieldId),
      ),
    },
    business: b
      ? {
          ...b,
          flows,
          refs: b.refs.filter((r) => flowIds.has(r.flowId)),
          rules: b.rules.filter((r) => flowIds.has(r.flowId)),
          assignments: b.assignments.filter((a) => fieldIds.has(a.fieldId)),
        }
      : undefined,
  };
}
