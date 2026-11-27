import {
  fieldAliases,
  formatExpression,
  parseExpressionInput,
} from "./expression-input";
import { deriveOverview } from "../overview/derive-overview";
import { describe, it, expect } from "vitest";
import { fixture, rule, accepted } from "../../../tests/helpers/workspace-fixture";
import { withDraftMutations } from "../state/workspace-state";
import {
  saveTransition,
  removeTransition,
  deriveFieldEdges,
} from "./flow-diagram";
import { addStep, deleteStep } from "./steps";
import { addReference, updateReference } from "./references";
import {
  createTemplate,
  publishTemplateVersion,
  deleteTemplate,
} from "./templates";
import {
  serializeBusinessDocument,
  parseBusinessDocument,
} from "../persistence/local-workspace";
function diagram() {
  const x = fixture();
  return {
    ...x,
    s: withDraftMutations(x.s, (d) => {
      d.business!.flows[0].steps.push(
        {
          stepId: "start",
          kind: "start",
          name: "开始",
          note: "",
          x: -200,
          y: 0,
          w: 144,
          h: 64,
        },
        {
          stepId: "decision",
          kind: "decision",
          name: "判断",
          note: "",
          x: 800,
          y: 0,
          w: 200,
          h: 140,
        },
        {
          stepId: "end",
          kind: "end",
          name: "结束",
          note: "",
          x: 1100,
          y: 0,
          w: 144,
          h: 64,
        },
      );
    }),
  };
}
const input = (sourceStepId: string, targetStepId: string) => ({
  sourceStepId,
  targetStepId,
  kind: "trigger" as const,
  label: "审批通过",
  condition: "状态 = 已通过",
  note: "只记录、不执行",
});
describe("confirmed Lovable workbench and flow contracts", () => {
  it("keeps every condition, mapping and formula source visible, with stable edge identities", () => {
    const x = fixture(),
      r = rule(x);
    r.conditions = [
      {
        id: "c1",
        left: { refId: x.ra, fieldId: x.fa },
        right: { refId: x.rb, fieldId: x.fb },
      },
      {
        id: "c2",
        left: { refId: x.rb, fieldId: x.fb },
        right: { refId: x.ra, fieldId: x.fa },
      },
    ];
    r.mappings.push({
      ...r.mappings[0],
      id: "map2",
      expr: [
        { kind: "field", refId: x.ra, fieldId: x.fa },
        { kind: "op", value: "+" },
        { kind: "field", refId: x.rb, fieldId: x.fb },
      ],
    });
    const s = withDraftMutations(x.s, (d) => {
      d.business!.rules.push(r);
    });
    const edges = deriveFieldEdges(s.draft, x.flow);
    expect(edges).toHaveLength(5);
    expect(new Set(edges.map((e) => e.id)).size).toBe(5);
    expect(deriveFieldEdges(s.draft, x.flow)).toEqual(edges);
    expect(deriveFieldEdges(s.draft, "other")).toEqual([]);
  });
  it("does not draw cross-flow or wrong-table field endpoints", () => {
    const x = fixture(),
      r = rule(x);
    r.mappings[0].expr = [{ kind: "field", refId: x.ra, fieldId: x.fb }];
    const s = withDraftMutations(x.s, (d) => {
      d.business!.rules.push(r);
    });
    expect(deriveFieldEdges(s.draft, x.flow)).toEqual([]);
  });
  it("saves and reloads kinds, arrows, conditions and notes without a physical schema migration", () => {
    const x = diagram(),
      next = accepted(saveTransition(x.s, x.flow, input("start", x.step)));
    const parsed = parseBusinessDocument(serializeBusinessDocument(next.draft));
    expect(parsed.business).toEqual(next.draft.business);
    expect(x.s.draft.business!.flows[0].transitions).toBeUndefined();
    expect(
      parsed.business!.flows[0].steps.find((s) => s.stepId === "decision")
        ?.kind,
    ).toBe("decision");
  });
  it.each([
    ["start", "start"],
    ["end", "decision"],
    ["decision", "start"],
    ["unknown", "decision"],
  ])("rejects invalid arrow %s -> %s without changing the draft", (a, b) => {
    const x = diagram(),
      before = JSON.stringify(x.s);
    expect(saveTransition(x.s, x.flow, input(a, b)).ok).toBe(false);
    expect(JSON.stringify(x.s)).toBe(before);
  });
  it("updates and removes exactly one arrow while preserving its stable ID", () => {
    const x = diagram(),
      r = saveTransition(x.s, x.flow, input("start", x.step));
    if (!r.ok) throw Error("create");
    const next = accepted(
      saveTransition(r.state, x.flow, {
        ...input("start", "decision"),
        transitionId: r.transitionId,
      }),
    );
    expect(next.draft.business!.flows[0].transitions).toHaveLength(1);
    expect(next.draft.business!.flows[0].transitions![0].transitionId).toBe(
      r.transitionId,
    );
    expect(
      accepted(removeTransition(next, x.flow, r.transitionId)).draft.business!
        .flows[0].transitions,
    ).toEqual([]);
  });
  it("step deletion cleans only dependent arrows, references and rules; original catalog survives", () => {
    const x = diagram();
    let s = accepted(saveTransition(x.s, x.flow, input("start", x.step)));
    s = accepted(saveTransition(s, x.flow, input("decision", "end")));
    s = withDraftMutations(s, (d) => d.business!.rules.push(rule(x)));
    const next = accepted(
      deleteStep(s, { flowId: x.flow, stepId: x.step, confirmed: true }),
    );
    expect(next.draft.business!.refs).toEqual([]);
    expect(next.draft.business!.rules).toEqual([]);
    expect(next.draft.business!.flows[0].transitions).toHaveLength(1);
    expect(next.draft.catalog).toEqual(s.draft.catalog);
  });
  it("only ordinary steps can reference tables; new references show all fields by default", () => {
    const x = diagram();
    expect(
      addReference(x.s, { flowId: x.flow, stepId: "start", tableId: x.ta }).ok,
    ).toBe(false);
    const added = addStep(x.s, { flowId: x.flow, name: "审核", kind: "step" });
    const s = accepted(added);
    if (!added.ok || !added.stepId) throw Error("step");
    const r = addReference(s, {
      flowId: x.flow,
      stepId: added.stepId,
      tableId: x.ta,
    });
    const next = accepted(r);
    if (!r.ok) throw Error("ref");
    expect(
      next.draft.business!.refs.find((ref) => ref.refId === r.refId)
        ?.visibleFieldIds,
    ).toBeUndefined();
    const moved = accepted(
      updateReference(next, { refId: r.refId, x: 42, y: 68, collapsed: true }),
    );
    const restored = parseBusinessDocument(
      serializeBusinessDocument(moved.draft),
    );
    expect(
      restored.business!.refs.find((ref) => ref.refId === r.refId),
    ).toMatchObject({ x: 42, y: 68, collapsed: true });
    expect(moved.draft.catalog.tables).toEqual(x.s.draft.catalog.tables);
  });
  it("keeps legacy steps and documents readable without adding kinds or empty arrows", () => {
    const x = fixture();
    expect(
      parseBusinessDocument(serializeBusinessDocument(x.s.draft)).business,
    ).toEqual(x.s.draft.business);
    expect(x.s.draft.business!.flows[0].steps[0].kind).toBeUndefined();
  });
  it("money is DECIMAL with two decimals; publishing a valid new version never silently updates fields", () => {
    const x = fixture();
    expect(
      createTemplate(x.s, { name: "bad", kind: "money", typeId: "int" }).ok,
    ).toBe(false);
    expect(
      createTemplate(x.s, {
        name: "bad",
        kind: "money",
        typeId: "money",
        scale: 3,
      }).ok,
    ).toBe(false);
    const made = createTemplate(x.s, {
      name: "金额",
      kind: "money",
      typeId: "money",
    });
    const s = accepted(made);
    const id = s.draft.business!.templates[0].templateId;
    expect(
      publishTemplateVersion(s, { templateId: id, typeId: "money", scale: 3 })
        .ok,
    ).toBe(false);
    const next = accepted(
      publishTemplateVersion(s, {
        templateId: id,
        typeId: "money",
        precision: 20,
        scale: 2,
      }),
    );
    expect(next.draft.business!.templates[0].versions).toHaveLength(2);
    expect(next.draft.catalog.fields).toEqual(s.draft.catalog.fields);
    expect(deleteTemplate(next, id).ok).toBe(false);
  });
  it("cannot delete a custom template used by a field, including an older version", () => {
    const x = fixture();
    const s = accepted(
      createTemplate(x.s, { name: "整数", kind: "int", typeId: "int" }),
    );
    const id = s.draft.business!.templates[0].templateId;
    expect(deleteTemplate(s, id).ok).toBe(true);
    const assigned = withDraftMutations(s, (d) =>
      d.business!.assignments.push({
        fieldId: x.fa,
        templateId: id,
        appliedVersion: 1,
      }),
    );
    expect(deleteTemplate(assigned, id).ok).toBe(false);
  });
});

describe("readable expression editing", () => {
  it("round-trips readable field labels to stable IDs with arithmetic and parentheses", () => {
    const x = fixture(),
      a = fieldAliases(x.s.draft.business!, x.s.draft.catalog),
      expr = rule(x).mappings[0].expr;
    const text = formatExpression(expr, a) + " * (2 + .5)";
    const result = parseExpressionInput(text, a);
    expect(result.error).toBeUndefined();
    expect(result.tokens[0]).toEqual(expr[0]);
    expect(
      result.tokens.slice(1).map((t) => ("value" in t ? t.value : "")),
    ).toEqual(["*", "(", "2", "+", ".5", ")"]);
  });
  it("rejects unknown functions, incomplete and missing field references without guessing", () => {
    const x = fixture(),
      a = fieldAliases(x.s.draft.business!, x.s.draft.catalog);
    for (const text of ["SUM(1)", "[missing]", "[下单/orders.fee", "abc"]) {
      const r = parseExpressionInput(text, a);
      expect(r.error).toBeTruthy();
      expect(r.tokens).toEqual([]);
    }
  });
  it("retains step names containing brackets or backslashes", () => {
    const a = [
        {
          refId: "r",
          fieldId: "f",
          label: "步骤]和" + String.fromCharCode(92) + "斜线/table.fee",
        },
      ],
      tokens = [{ kind: "field" as const, refId: "r", fieldId: "f" }];
    expect(parseExpressionInput(formatExpression(tokens, a), a)).toEqual({
      tokens,
    });
  });
  it("global overview includes every formula source and matching condition", () => {
    const x = fixture(),
      r = rule(x);
    r.conditions = [
      {
        id: "c",
        left: { refId: x.ra, fieldId: x.ft },
        right: { refId: x.ra, fieldId: x.ft },
      },
    ];
    r.mappings[0].expr.push(
      { kind: "op", value: "+" },
      { kind: "field", refId: x.rb, fieldId: x.fb },
    );
    const s = withDraftMutations(x.s, (d) => d.business!.rules.push(r));
    const graph = deriveOverview(s.draft);
    expect(graph.edges.filter((e) => e.kind === "mapping")).toHaveLength(2);
    expect(graph.edges.filter((e) => e.kind === "matching")).toHaveLength(1);
  });
});
