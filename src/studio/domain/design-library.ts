import type { WorkspaceState } from "../state/workspace-state";
import { cloneSnapshot, hasUnsavedChanges } from "../state/workspace-state";

/** Plan only: cancellation never mutates either the draft or persisted data. */
export function planDesignLibraryDeletion(
  state: WorkspaceState,
  databaseId: string,
) {
  if (hasUnsavedChanges(state)) throw Error("请先保存当前工作区，再删除设计库");
  const snapshot = cloneSnapshot(state.draft);
  const c = snapshot.catalog;
  const database = c.databases.find((d) => d.id === databaseId);
  if (!database) throw Error("设计库不存在，请重新选择");
  const tables = c.tables.filter((t) => t.databaseId === databaseId);
  const tableIds = new Set(tables.map((t) => t.id));
  const fields = c.fields.filter((f) => tableIds.has(f.tableId));
  const fieldIds = new Set(fields.map((f) => f.id));
  const indices = c.indices.filter((i) => tableIds.has(i.tableId));
  const indexIds = new Set(indices.map((i) => i.id));
  const relationships = c.relationships.filter(
    (r) =>
      r.databaseId === databaseId ||
      tableIds.has(r.sourceTableId) ||
      tableIds.has(r.targetTableId) ||
      fieldIds.has(r.sourceFieldId) ||
      fieldIds.has(r.targetFieldId),
  );
  const relationshipIds = new Set(relationships.map((r) => r.id));
  const links = c.fieldIndices.filter(
    (f) => fieldIds.has(f.fieldId) || indexIds.has(f.indexId),
  );
  const linkIds = new Set(links.map((f) => f.id));
  const b = snapshot.business;
  const flows = b?.flows.filter((f) => f.databaseId === databaseId) ?? [];
  const flowIds = new Set(flows.map((f) => f.flowId));
  const refs =
    b?.refs.filter((r) => flowIds.has(r.flowId) || tableIds.has(r.tableId)) ??
    [];
  const refIds = new Set(refs.map((r) => r.refId));
  const usesToken = (t: { refId: string; fieldId: string } | null) =>
    !!t && (refIds.has(t.refId) || fieldIds.has(t.fieldId));
  const rules =
    b?.rules.filter(
      (r) =>
        flowIds.has(r.flowId) ||
        r.conditions.some((c) => usesToken(c.left) || usesToken(c.right)) ||
        r.mappings.some(
          (m) =>
            usesToken(m.target) ||
            m.expr.some((t) => t.kind === "field" && usesToken(t)),
        ),
    ) ?? [];
  const ruleIds = new Set(rules.map((r) => r.ruleId));
  c.databases = c.databases.filter((d) => d.id !== databaseId);
  c.tables = c.tables.filter((t) => !tableIds.has(t.id));
  c.fields = c.fields.filter((f) => !fieldIds.has(f.id));
  c.indices = c.indices.filter((i) => !indexIds.has(i.id));
  c.fieldIndices = c.fieldIndices.filter((f) => !linkIds.has(f.id));
  c.relationships = c.relationships.filter((r) => !relationshipIds.has(r.id));
  const affectedSources = new Set(relationships.map((r) => r.sourceFieldId));
  for (const field of c.fields)
    if (
      affectedSources.has(field.id) &&
      !c.relationships.some((r) => r.sourceFieldId === field.id)
    )
      field.isForeign = false;
  for (const id of tableIds) delete snapshot.metadata.tableDisplayNames[id];
  for (const id of fieldIds) delete snapshot.metadata.fieldDisplayNames[id];
  if (b) {
    b.flows = b.flows.filter((f) => !flowIds.has(f.flowId));
    b.refs = b.refs.filter((r) => !refIds.has(r.refId));
    b.rules = b.rules.filter((r) => !ruleIds.has(r.ruleId));
    b.assignments = b.assignments.filter((a) => !fieldIds.has(a.fieldId));
  }
  return {
    snapshot,
    removed: {
      databases: [databaseId],
      tables: [...tableIds],
      fields: [...fieldIds],
      indices: [...indexIds],
      fieldIndices: [...linkIds],
      relationships: [...relationshipIds],
    },
    summary: {
      name: database.name,
      tables: tables.length,
      fields: fields.length,
      flows: flows.length,
      refs: refs.length,
      rules: rules.length,
      indices: indices.length,
      relationships: relationships.length,
    },
  };
}
