import type { Condition, Mapping } from "../contracts/business";
import type { CatalogSnapshot } from "../contracts/catalog";
import type {
  WorkspaceSnapshot,
  WorkspaceState,
} from "../state/workspace-state";
import { withDraftMutations } from "../state/workspace-state";

const usesCondition = (c: Condition, id: string) =>
  c.left?.fieldId === id || c.right?.fieldId === id;
const usesMapping = (m: Mapping, id: string) =>
  m.target?.fieldId === id ||
  m.expr.some((t) => t.kind === "field" && t.fieldId === id);

/** Read-only preview. No draft changes until the user confirms. */
export function fieldDeletionImpact(
  snapshot: WorkspaceSnapshot,
  fieldId: string,
) {
  const { catalog, business } = snapshot;
  const indexIds = new Set(
    catalog.fieldIndices
      .filter((f) => f.fieldId === fieldId)
      .map((f) => f.indexId),
  );
  return {
    relationships: catalog.relationships.filter(
      (r) => r.sourceFieldId === fieldId || r.targetFieldId === fieldId,
    ),
    indices: catalog.indices.filter((i) => indexIds.has(i.id)),
    rules: (business?.rules ?? []).filter(
      (r) =>
        r.conditions.some((c) => usesCondition(c, fieldId)) ||
        r.mappings.some((m) => usesMapping(m, fieldId)),
    ),
    assignments: (business?.assignments ?? []).filter(
      (a) => a.fieldId === fieldId,
    ),
    refs: (business?.refs ?? []).filter((r) =>
      r.visibleFieldIds?.includes(fieldId),
    ),
  };
}

/** Only indices actually removed alongside deleted fields may be written by this save path. */
export function deletedFieldIndexIds(
  saved: CatalogSnapshot,
  draft: CatalogSnapshot,
  deletedFields: string[],
) {
  const removed = new Set(deletedFields);
  const retained = new Set(draft.indices.map((i) => i.id));
  return [
    ...new Set(
      saved.fieldIndices
        .filter((f) => removed.has(f.fieldId) && !retained.has(f.indexId))
        .map((f) => f.indexId),
    ),
  ];
}

export function deleteConfirmedField(
  state: WorkspaceState,
  fieldId: string,
): WorkspaceState {
  const impact = fieldDeletionImpact(state.draft, fieldId);
  const indexIds = new Set(impact.indices.map((i) => i.id));
  const primaryMemberIds = new Set(
    state.draft.catalog.fieldIndices
      .filter(
        (f) =>
          indexIds.has(f.indexId) &&
          impact.indices.some(
            (i) => i.id === f.indexId && i.name.toUpperCase() === "PRIMARY",
          ),
      )
      .map((f) => f.fieldId),
  );
  const foreignSourceIds = new Set(
    impact.relationships.map((r) => r.sourceFieldId),
  );
  return withDraftMutations(state, (draft) => {
    const c = draft.catalog;
    c.fields = c.fields.filter((f) => f.id !== fieldId);
    c.relationships = c.relationships.filter(
      (r) => r.sourceFieldId !== fieldId && r.targetFieldId !== fieldId,
    );
    c.indices = c.indices.filter((i) => !indexIds.has(i.id));
    c.fieldIndices = c.fieldIndices.filter(
      (f) => f.fieldId !== fieldId && !indexIds.has(f.indexId),
    );
    for (const f of c.fields) {
      if (
        primaryMemberIds.has(f.id) &&
        !c.fieldIndices.some(
          (link) =>
            link.fieldId === f.id &&
            c.indices.some(
              (i) =>
                i.id === link.indexId && i.name.toUpperCase() === "PRIMARY",
            ),
        )
      )
        f.isPrimary = false;
      if (
        foreignSourceIds.has(f.id) &&
        !c.relationships.some((r) => r.sourceFieldId === f.id)
      )
        f.isForeign = false;
    }
    delete draft.metadata.fieldDisplayNames[fieldId];
    const b = draft.business;
    if (!b) return;
    const affectedRules = new Set(impact.rules.map((r) => r.ruleId));
    b.rules = b.rules.filter((r) => !affectedRules.has(r.ruleId));
    b.assignments = b.assignments.filter((a) => a.fieldId !== fieldId);
    for (const ref of b.refs)
      if (ref.visibleFieldIds)
        ref.visibleFieldIds = ref.visibleFieldIds.filter(
          (id) => id !== fieldId,
        );
  });
}
