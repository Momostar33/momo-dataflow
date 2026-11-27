import type { WorkspaceState } from "../state/workspace-state";
import {
  withDraftMutations,
  newStableId,
  trimName,
} from "../state/workspace-state";
import type { Step, StepKind } from "../contracts/business";

/**
 * Result of a step operation.
 * `ok:true` carries the new state and, for addStep, the generated stepId.
 * `ok:false` carries an error code/message.
 */
export type StepOperationResult =
  | { ok: true; state: WorkspaceState; stepId?: string }
  | { ok: false; error: { code: string; message: string } };

/**
 * Add a new step to a flow.
 *
 * @param state Current workspace state.
 * @param args  { flowId, name, note?, x?, y?, w?, h? }
 * @returns Operation result.
 */
export function addStep(
  state: WorkspaceState,
  args: {
    flowId: string;
    name: string;
    note?: string;
    kind?: StepKind;
    x?: number;
    y?: number;
    w?: number;
    h?: number;
  },
): StepOperationResult {
  const { flowId, name, note, x, y, w, h } = args;

  // Find target flow
  const flow = state.draft.business?.flows.find((f) => f.flowId === flowId);
  if (!flow) {
    return {
      ok: false,
      error: { code: "FLOW_NOT_FOUND", message: "Flow not found" },
    };
  }

  // Validate name
  const trimmedName = trimName(name);
  if (!trimmedName) {
    return {
      ok: false,
      error: { code: "INVALID_NAME", message: "Step name cannot be empty" },
    };
  }

  // Duplicate name check (case‑sensitive after trim)
  if (flow.steps.some((s) => trimName(s.name) === trimmedName)) {
    return {
      ok: false,
      error: {
        code: "DUPLICATE_STEP",
        message: "Step name already exists in this flow",
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

  // Validate size
  if (w !== undefined && (!Number.isFinite(w) || w <= 0)) {
    return {
      ok: false,
      error: {
        code: "INVALID_SIZE",
        message: "w must be a positive finite number",
      },
    };
  }
  if (h !== undefined && (!Number.isFinite(h) || h <= 0)) {
    return {
      ok: false,
      error: {
        code: "INVALID_SIZE",
        message: "h must be a positive finite number",
      },
    };
  }

  const stepId = newStableId();
  const newStep: Step = {
    stepId,
    ...(args.kind ? { kind: args.kind } : {}),
    name: trimmedName,
    note: note ?? "",
    x: x ?? 0,
    y: y ?? flow.steps.length * 650,
    w: w ?? 800,
    h: h ?? 600,
  };

  const next = withDraftMutations(state, (draft) => {
    const f = draft.business!.flows.find((ff) => ff.flowId === flowId)!;
    f.steps.push(newStep);
  });

  return { ok: true, state: next, stepId };
}

/**
 * Update an existing step.
 *
 * @param state Current workspace state.
 * @param args  { flowId, stepId, name?, note?, x?, y?, w?, h? }
 * @returns Operation result.
 */
export function updateStep(
  state: WorkspaceState,
  args: {
    flowId: string;
    stepId: string;
    name?: string;
    note?: string;
    x?: number;
    y?: number;
    w?: number;
    h?: number;
  },
): StepOperationResult {
  const { flowId, stepId, name, note, x, y, w, h } = args;

  // Find target flow
  const flow = state.draft.business?.flows.find((f) => f.flowId === flowId);
  if (!flow) {
    return {
      ok: false,
      error: { code: "FLOW_NOT_FOUND", message: "Flow not found" },
    };
  }

  // Find target step
  const step = flow.steps.find((s) => s.stepId === stepId);
  if (!step) {
    return {
      ok: false,
      error: { code: "STEP_NOT_FOUND", message: "Step not found" },
    };
  }

  // Validate name if provided
  if (name !== undefined) {
    const trimmedName = trimName(name);
    if (!trimmedName) {
      return {
        ok: false,
        error: { code: "INVALID_NAME", message: "Step name cannot be empty" },
      };
    }
    if (
      flow.steps.some(
        (s) => s.stepId !== stepId && trimName(s.name) === trimmedName,
      )
    ) {
      return {
        ok: false,
        error: {
          code: "DUPLICATE_STEP",
          message: "Step name already exists in this flow",
        },
      };
    }
  }

  // Validate coordinates if provided
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

  // Validate size if provided
  if (w !== undefined && (!Number.isFinite(w) || w <= 0)) {
    return {
      ok: false,
      error: {
        code: "INVALID_SIZE",
        message: "w must be a positive finite number",
      },
    };
  }
  if (h !== undefined && (!Number.isFinite(h) || h <= 0)) {
    return {
      ok: false,
      error: {
        code: "INVALID_SIZE",
        message: "h must be a positive finite number",
      },
    };
  }

  const next = withDraftMutations(state, (draft) => {
    const f = draft.business!.flows.find((ff) => ff.flowId === flowId)!;
    const s = f.steps.find((ss) => ss.stepId === stepId)!;
    if (name !== undefined) s.name = trimName(name);
    if (note !== undefined) s.note = note;
    if (x !== undefined) s.x = x;
    if (y !== undefined) s.y = y;
    if (w !== undefined) s.w = w;
    if (h !== undefined) s.h = h;
  });

  return { ok: true, state: next };
}

/**
 * Move a step within its flow to a new index.
 *
 * @param state Current workspace state.
 * @param args  { flowId, stepId, toIndex }
 * @returns Operation result.
 */
export function moveStep(
  state: WorkspaceState,
  args: { flowId: string; stepId: string; toIndex: number },
): StepOperationResult {
  const { flowId, stepId, toIndex } = args;

  const flow = state.draft.business?.flows.find((f) => f.flowId === flowId);
  if (!flow) {
    return {
      ok: false,
      error: { code: "FLOW_NOT_FOUND", message: "Flow not found" },
    };
  }

  const stepIndex = flow.steps.findIndex((s) => s.stepId === stepId);
  if (stepIndex === -1) {
    return {
      ok: false,
      error: { code: "STEP_NOT_FOUND", message: "Step not found" },
    };
  }

  if (
    !Number.isInteger(toIndex) ||
    toIndex < 0 ||
    toIndex >= flow.steps.length
  ) {
    return {
      ok: false,
      error: { code: "INVALID_INDEX", message: "Target index out of bounds" },
    };
  }

  if (stepIndex === toIndex) {
    // No change needed
    return { ok: true, state: state };
  }

  const next = withDraftMutations(state, (draft) => {
    const f = draft.business!.flows.find((ff) => ff.flowId === flowId)!;
    const [step] = f.steps.splice(stepIndex, 1);
    f.steps.splice(toIndex, 0, step);
  });

  return { ok: true, state: next };
}

/**
 * Delete a step from a flow, optionally removing associated refs and rules.
 *
 * @param state Current workspace state.
 * @param args  { flowId, stepId, confirmed }
 * @returns Operation result.
 */
export function deleteStep(
  state: WorkspaceState,
  args: { flowId: string; stepId: string; confirmed: boolean },
): StepOperationResult {
  const { flowId, stepId, confirmed } = args;

  if (!confirmed) {
    return {
      ok: false,
      error: {
        code: "CONFIRMATION_REQUIRED",
        message: "Deletion not confirmed",
      },
    };
  }

  const flow = state.draft.business?.flows.find((f) => f.flowId === flowId);
  if (!flow) {
    return {
      ok: false,
      error: { code: "FLOW_NOT_FOUND", message: "Flow not found" },
    };
  }

  const stepIndex = flow.steps.findIndex((s) => s.stepId === stepId);
  if (stepIndex === -1) {
    return {
      ok: false,
      error: { code: "STEP_NOT_FOUND", message: "Step not found" },
    };
  }

  // Collect refIds that belong to this step
  const refIds = state.draft
    .business!.refs.filter((r) => r.flowId === flowId && r.stepId === stepId)
    .map((r) => r.refId);

  const next = withDraftMutations(state, (draft) => {
    // Remove the step
    const f = draft.business!.flows.find((ff) => ff.flowId === flowId)!;
    f.steps.splice(stepIndex, 1);
    if (f.transitions)
      f.transitions = f.transitions.filter(
        (t) => t.sourceStepId !== stepId && t.targetStepId !== stepId,
      );

    // Remove refs belonging to this step
    draft.business!.refs = draft.business!.refs.filter(
      (r) => !(r.flowId === flowId && r.stepId === stepId),
    );

    // Remove rules that reference any of these refIds
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
      return !allRefs.some((id) => refIds.includes(id));
    });
  });

  return { ok: true, state: next };
}
