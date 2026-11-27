import type { WorkspaceState } from "../state/workspace-state";
import { withDraftMutations, newStableId } from "../state/workspace-state";

/**
 * Result of a reference operation.
 * `ok:true` carries the new state and the affected refId.
 * `ok:false` carries an error with code/message.
 */
export type ReferenceOperationResult =
  | { ok: true; state: WorkspaceState; refId: string }
  | { ok: false; error: { code: string; message: string } };

/**
 * Add a reference from a step to a table.
 *
 * @param state Current workspace state.
 * @param args  { flowId, stepId, tableId, x?, y? }
 * @returns Operation result.
 */
export function addReference(
  state: WorkspaceState,
  args: {
    flowId: string;
    stepId: string;
    tableId: string;
    x?: number;
    y?: number;
  },
): ReferenceOperationResult {
  const { flowId, stepId, tableId, x, y } = args;

  // Validate flow
  const flow = state.draft.business?.flows.find((f) => f.flowId === flowId);
  if (!flow) {
    return {
      ok: false,
      error: { code: "FLOW_NOT_FOUND", message: "Flow not found" },
    };
  }

  // Validate step
  const step = flow.steps.find((s) => s.stepId === stepId);
  if (!step) {
    return {
      ok: false,
      error: { code: "STEP_NOT_FOUND", message: "Step not found" },
    };
  }

  if (step.kind && step.kind !== "step")
    return {
      ok: false,
      error: {
        code: "NOT_A_TABLE_GROUP",
        message: "开始、结束和判断节点不容纳表，请选择业务步骤。",
      },
    };

  // Validate table
  const table = state.draft.catalog.tables.find((t) => t.id === tableId);
  if (!table) {
    return {
      ok: false,
      error: { code: "TABLE_NOT_FOUND", message: "Table not found" },
    };
  }

  // Validate table belongs to flow's database
  if (table.databaseId !== flow.databaseId) {
    return {
      ok: false,
      error: {
        code: "TABLE_NOT_IN_FLOW_DB",
        message: "Table does not belong to flow's database",
      },
    };
  }

  // Validate coordinates
  if (x !== undefined && !Number.isFinite(x)) {
    return {
      ok: false,
      error: {
        code: "INVALID_COORDINATE",
        message: "x must be a finite number",
      },
    };
  }
  if (y !== undefined && !Number.isFinite(y)) {
    return {
      ok: false,
      error: {
        code: "INVALID_COORDINATE",
        message: "y must be a finite number",
      },
    };
  }

  // Check for existing reference on same step/table
  const existing = state.draft.business?.refs.find(
    (r) => r.flowId === flowId && r.stepId === stepId && r.tableId === tableId,
  );
  if (existing) {
    return { ok: true, refId: existing.refId, state };
  }

  // Create new reference
  const refId = newStableId();
  const newRef = {
    refId,
    flowId,
    stepId,
    tableId,
    x: x ?? 0,
    y: y ?? 0,
    collapsed: false,
  };

  const next = withDraftMutations(state, (draft) => {
    draft.business!.refs.push(newRef);
  });

  return { ok: true, refId, state: next };
}

/**
 * Remove a reference.
 *
 * @param state Current workspace state.
 * @param args  { refId, confirmed }
 * @returns Operation result.
 */
export function removeReference(
  state: WorkspaceState,
  args: { refId: string; confirmed: boolean },
): ReferenceOperationResult {
  const { refId, confirmed } = args;

  const refIndex = state.draft.business?.refs.findIndex(
    (r) => r.refId === refId,
  );
  if (refIndex === undefined || refIndex === -1) {
    return {
      ok: false,
      error: { code: "REF_NOT_FOUND", message: "Reference not found" },
    };
  }

  if (!confirmed) {
    return {
      ok: false,
      error: {
        code: "CONFIRMATION_REQUIRED",
        message: "Deletion not confirmed",
      },
    };
  }

  const next = withDraftMutations(state, (draft) => {
    // Remove the reference
    draft.business!.refs.splice(refIndex, 1);

    // Remove rules that reference this ref
    draft.business!.rules = draft.business!.rules.filter((rule) => {
      // Conditions
      const condRefs = rule.conditions.flatMap((c) => [
        c.left?.refId,
        c.right?.refId,
      ]);
      // Mappings
      const mapRefs = rule.mappings.flatMap((m) => [
        m.target?.refId,
        ...m.expr.filter((t) => t.kind === "field").map((t) => t.refId),
      ]);
      const allRefs = [...condRefs, ...mapRefs].filter(Boolean) as string[];
      return !allRefs.includes(refId);
    });
  });

  return { ok: true, refId, state: next };
}

/**
 * Update a reference's layout or visibility.
 *
 * @param state Current workspace state.
 * @param args  { refId, x?, y?, collapsed?, visibleFieldIds? }
 * @returns Operation result.
 */
export function updateReference(
  state: WorkspaceState,
  args: {
    refId: string;
    x?: number;
    y?: number;
    collapsed?: boolean;
    visibleFieldIds?: string[];
  },
): ReferenceOperationResult {
  const { refId, x, y, collapsed, visibleFieldIds } = args;

  const refIndex = state.draft.business?.refs.findIndex(
    (r) => r.refId === refId,
  );
  if (refIndex === undefined || refIndex === -1) {
    return {
      ok: false,
      error: { code: "REF_NOT_FOUND", message: "Reference not found" },
    };
  }

  // Validate coordinates
  if (x !== undefined && !Number.isFinite(x)) {
    return {
      ok: false,
      error: {
        code: "INVALID_COORDINATE",
        message: "x must be a finite number",
      },
    };
  }
  if (y !== undefined && !Number.isFinite(y)) {
    return {
      ok: false,
      error: {
        code: "INVALID_COORDINATE",
        message: "y must be a finite number",
      },
    };
  }

  // Validate visibleFieldIds belong to the referenced table
  if (visibleFieldIds !== undefined) {
    const ref = state.draft.business!.refs[refIndex];
    const tableId = ref.tableId;
    const validFieldIds = new Set(
      state.draft.catalog.fields
        .filter((f) => f.tableId === tableId)
        .map((f) => f.id),
    );
    for (const fid of visibleFieldIds) {
      if (!validFieldIds.has(fid)) {
        return {
          ok: false,
          error: {
            code: "INVALID_VISIBLE_FIELD",
            message: `Field ${fid} does not belong to referenced table`,
          },
        };
      }
    }
  }

  const next = withDraftMutations(state, (draft) => {
    const ref = draft.business!.refs[refIndex];
    if (x !== undefined) ref.x = x;
    if (y !== undefined) ref.y = y;
    if (collapsed !== undefined) ref.collapsed = collapsed;
    if (visibleFieldIds !== undefined) ref.visibleFieldIds = visibleFieldIds;
  });

  return { ok: true, refId, state: next };
}
