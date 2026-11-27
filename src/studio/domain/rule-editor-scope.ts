import { nextRelationName } from "./relation-names";
import type { Rule, FieldToken } from "../contracts/business";
import type { WorkspaceSnapshot } from "../state/workspace-state";

/** Freeze editor scope from the incoming connection/rule, never from later form edits. */
export function ruleReferenceIds(rule?: Rule): string[] {
  if (!rule) return [];
  const tokens: (FieldToken | null)[] = rule.conditions.flatMap((c) => [
    c.left,
    c.right,
  ]);
  for (const m of rule.mappings) {
    for (const t of m.expr) if (t.kind === "field") tokens.push(t);
    tokens.push(m.target);
  }
  return [
    ...new Set(tokens.filter((t): t is FieldToken => !!t).map((t) => t.refId)),
  ];
}

export function scopeRuleEditor(
  snapshot: WorkspaceSnapshot,
  flowId: string,
  refIds: readonly string[],
) {
  const b = snapshot.business;
  if (!b) throw Error("业务工作区不存在");
  const refs = refIds.map((id) =>
    b.refs.find((r) => r.refId === id && r.flowId === flowId),
  );
  if (refs.some((r) => !r)) throw Error("连线对象已失效，请重新选择");
  const chosen = refs.filter((r): r is NonNullable<typeof r> => !!r);
  const tableIds = new Set(chosen.map((r) => r.tableId));
  return {
    business: { ...b, refs: chosen },
    catalog: {
      ...snapshot.catalog,
      tables: snapshot.catalog.tables.filter((t) => tableIds.has(t.id)),
      fields: snapshot.catalog.fields.filter((f) => tableIds.has(f.tableId)),
    },
  };
}

export function ruleScopeLabel(snapshot: WorkspaceSnapshot, refId: string) {
  const ref = snapshot.business?.refs.find((r) => r.refId === refId);
  const table = snapshot.catalog.tables.find((t) => t.id === ref?.tableId);
  const step = snapshot.business?.flows
    .find((f) => f.flowId === ref?.flowId)
    ?.steps.find((s) => s.stepId === ref?.stepId);
  return table
    ? `${step?.name ?? "步骤"} / ${snapshot.metadata.tableDisplayNames[table.id] || table.name}`
    : "失效表引用";
}

export function prepareScopedRule(
  snapshot: WorkspaceSnapshot,
  rule: Rule,
  allowedRefIds: readonly string[],
): Rule {
  if (!allowedRefIds.length)
    throw Error("请先在画布连接字段，或选择这条关系的两张表");
  scopeRuleEditor(snapshot, rule.flowId, allowedRefIds);
  if (ruleReferenceIds(rule).some((id) => !allowedRefIds.includes(id)))
    throw Error("规则只能使用当前连线对象的字段");
  const next = structuredClone(rule);
  if (!next.name.trim()) {
    next.name = nextRelationName(snapshot.business, rule.flowId);
  } else next.name = next.name.trim();
  return next;
}
