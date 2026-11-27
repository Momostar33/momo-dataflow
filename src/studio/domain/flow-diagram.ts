import { nextRelationName } from "./relation-names";
import type {
  WorkspaceState,
  WorkspaceSnapshot,
} from "../state/workspace-state";
import { withDraftMutations, newStableId } from "../state/workspace-state";
import type { FlowTransition } from "../contracts/business";
export function saveTransition(
  state: WorkspaceState,
  flowId: string,
  input: Omit<FlowTransition, "transitionId"> & { transitionId?: string },
) {
  const flow = state.draft.business?.flows.find((f) => f.flowId === flowId);
  if (!flow)
    return {
      ok: false as const,
      error: { code: "FLOW_NOT_FOUND", message: "流程不存在" },
    };
  const source = flow.steps.find((s) => s.stepId === input.sourceStepId),
    target = flow.steps.find((s) => s.stepId === input.targetStepId);
  if (!source || !target || source.stepId === target.stepId)
    return {
      ok: false as const,
      error: {
        code: "INVALID_ENDPOINT",
        message: "连线须连接同流程的两个不同节点",
      },
    };
  if (source.kind === "end" || target.kind === "start")
    return {
      ok: false as const,
      error: {
        code: "INVALID_DIRECTION",
        message: "结束节点不能发出连线，开始节点不能接收连线",
      },
    };
  if (
    input.transitionId &&
    !flow.transitions?.some((t) => t.transitionId === input.transitionId)
  )
    return {
      ok: false as const,
      error: { code: "EDGE_NOT_FOUND", message: "原连线不存在" },
    };
  const transitionId = input.transitionId ?? newStableId();
  return {
    ok: true as const,
    transitionId,
    state: withDraftMutations(state, (d) => {
      const f = d.business!.flows.find((f) => f.flowId === flowId)!;
      const value = { ...input, label: input.label.trim() || nextRelationName(state.draft.business, flowId), transitionId };
      const i =
        f.transitions?.findIndex((t) => t.transitionId === transitionId) ?? -1;
      if (!f.transitions) f.transitions = [];
      if (i < 0) f.transitions.push(value);
      else f.transitions[i] = value;
    }),
  };
}
export function removeTransition(
  state: WorkspaceState,
  flowId: string,
  transitionId: string,
) {
  const flow = state.draft.business?.flows.find((f) => f.flowId === flowId);
  if (!flow?.transitions?.some((t) => t.transitionId === transitionId))
    return {
      ok: false as const,
      error: { code: "EDGE_NOT_FOUND", message: "连线不存在" },
    };
  return {
    ok: true as const,
    state: withDraftMutations(state, (d) => {
      const f = d.business!.flows.find((f) => f.flowId === flowId)!;
      f.transitions = f.transitions!.filter(
        (t) => t.transitionId !== transitionId,
      );
    }),
  };
}
export interface FieldDiagramEdge {
  id: string;
  ruleId: string;
  source: string;
  target: string;
  sourceFieldId: string;
  targetFieldId: string;
  kind: "mapping" | "matching";
  label: string;
}
export function deriveFieldEdges(
  snapshot: WorkspaceSnapshot,
  flowId: string,
): FieldDiagramEdge[] {
  const b = snapshot.business;
  if (!b) return [];
  const refs = new Set(
    b.refs.filter((r) => r.flowId === flowId).map((r) => r.refId),
  );
  const edges: FieldDiagramEdge[] = [];
  const valid = (token: { refId: string; fieldId: string } | null) =>
    !!token &&
    refs.has(token.refId) &&
    snapshot.catalog.fields.some(
      (f) =>
        f.id === token.fieldId &&
        f.tableId === b.refs.find((r) => r.refId === token.refId)?.tableId,
    );
  for (const rule of b.rules.filter((r) => r.flowId === flowId)) {
    for (const c of rule.conditions)
      if (c.left && c.right && valid(c.left) && valid(c.right))
        edges.push({
          id: `${rule.ruleId}:condition:${c.id}`,
          ruleId: rule.ruleId,
          source: c.left.refId,
          target: c.right.refId,
          sourceFieldId: c.left.fieldId,
          targetFieldId: c.right.fieldId,
          kind: "matching",
          label: rule.name,
        });
    for (const m of rule.mappings)
      if (m.target && valid(m.target))
        m.expr.forEach((t, i) => {
          if (t.kind === "field" && valid(t))
            edges.push({
              id: `${rule.ruleId}:mapping:${m.id}:${i}`,
              ruleId: rule.ruleId,
              source: t.refId,
              target: m.target!.refId,
              sourceFieldId: t.fieldId,
              targetFieldId: m.target!.fieldId,
              kind: "mapping",
              label: rule.name + (m.expr.length > 1 ? " · 公式" : ""),
            });
        });
  }
  return edges;
}
