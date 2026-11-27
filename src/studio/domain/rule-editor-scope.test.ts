import { describe, it, expect } from "vitest";
import { fixture, rule } from "../../../tests/helpers/workspace-fixture";
import { withDraftMutations } from "../state/workspace-state";
import {
  ruleReferenceIds,
  scopeRuleEditor,
  prepareScopedRule,
} from "./rule-editor-scope";
import { saveTransition } from "./flow-diagram";
import {
  connectionToRuleCandidate,
  encodeFieldHandle,
} from "../canvas/rule-connections";
import { fieldAliases, parseExpressionInput } from "./expression-input";

describe("connection-bound rule editors", () => {
  it("keeps canvas field endpoints and limits refs, fields and expression aliases to the connected tables", () => {
    const x = fixture(),
      s = withDraftMutations(x.s, (d) => {
        d.catalog.tables.push({
          ...d.catalog.tables[0],
          id: "third",
          name: "unrelated",
        });
        d.catalog.fields.push({
          ...d.catalog.fields[0],
          id: "third-field",
          tableId: "third",
        });
        d.business!.refs.push({
          ...d.business!.refs[0],
          refId: "third-ref",
          tableId: "third",
        });
      });
    const c = connectionToRuleCandidate(
      {
        flowId: x.flow,
        sourceHandle: encodeFieldHandle({ refId: x.ra, fieldId: x.fa }),
        targetHandle: encodeFieldHandle({ refId: x.rb, fieldId: x.fb }),
        kind: "matching",
      },
      s.draft.business!,
      s.draft.catalog,
    )!;
    expect(c.conditions[0]).toMatchObject({
      left: { refId: x.ra, fieldId: x.fa },
      right: { refId: x.rb, fieldId: x.fb },
    });
    const ids = ruleReferenceIds(c),
      scope = scopeRuleEditor(s.draft, x.flow, ids);
    expect(ids).toEqual([x.ra, x.rb]);
    expect(scope.business.refs.map((r) => r.refId)).toEqual(ids);
    expect(scope.catalog.fields.map((f) => f.id)).not.toContain("third-field");
    const aliases = fieldAliases(scope.business, scope.catalog);
    expect(aliases.some((a) => a.refId === "third-ref")).toBe(false);
    expect(
      parseExpressionInput("[下单/unrelated.fee]", aliases).error,
    ).toBeTruthy();
  });
  it("includes both references in a mapping and generates names without mutating source", () => {
    const x = fixture(),
      r = rule(x);
    r.name = "";
    const before = JSON.stringify(r);
    expect(ruleReferenceIds(r)).toEqual([x.ra, x.rb]);
    const named = prepareScopedRule(x.s.draft, r, [x.ra, x.rb]);
    expect(named.name).toBe("关系1");
    expect(named.mappings).toEqual(r.mappings);
    expect(JSON.stringify(r)).toBe(before);
  });
  it("enforces the frozen pair even when fields are edited or conditions appended", () => {
    const x = fixture(),
      r = rule(x);
    r.mappings[0].target = { refId: "other-ref", fieldId: "other-field" };
    expect(() => prepareScopedRule(x.s.draft, r, [x.ra, x.rb])).toThrow(
      /当前连线/,
    );
    expect(() => prepareScopedRule(x.s.draft, r, [])).toThrow(/两张表/);
    expect(() =>
      scopeRuleEditor(x.s.draft, "wrong-flow", [x.ra, x.rb]),
    ).toThrow(/失效/);
  });
  it("keeps historical multi-table rules scoped to their original refs and preserves their data", () => {
    const x = fixture(),
      s = withDraftMutations(x.s, (d) => {
        d.business!.refs.push({ ...d.business!.refs[0], refId: "third" });
      });
    const r = rule(x);
    r.mappings[0].expr.push(
      { kind: "op", value: "+" },
      { kind: "field", refId: "third", fieldId: x.ft },
    );
    const ids = ruleReferenceIds(r),
      p = prepareScopedRule(s.draft, r, ids);
    expect(ids).toHaveLength(3);
    expect(p.mappings).toEqual(r.mappings);
  });
  it("uses unique automatic names while preserving a user provided name", () => {
    const x = fixture(),
      r = rule(x);
    r.name = "";
    const named = prepareScopedRule(x.s.draft, r, [x.ra, x.rb]);
    const s = withDraftMutations(x.s, (d) => {
      d.business!.rules.push({ ...named, ruleId: "existing" });
    });
    expect(prepareScopedRule(s.draft, r, [x.ra, x.rb]).name).toBe(
      "关系2",
    );
    r.name = " 自定义 ";
    expect(prepareScopedRule(s.draft, r, [x.ra, x.rb]).name).toBe("自定义");
  });
  it("generates transition names from endpoints and preserves existing descriptions", () => {
    const x = fixture(),
      s = withDraftMutations(x.s, (d) => {
        d.business!.flows[0].steps.push({
          ...d.business!.flows[0].steps[0],
          stepId: "next",
          name: "收货",
        });
      });
    const r = saveTransition(s, x.flow, {
      sourceStepId: x.step,
      targetStepId: "next",
      kind: "trigger",
      label: "  ",
      condition: "审核通过",
      note: "原说明",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.draft.business!.flows[0].transitions![0]).toMatchObject({
      label: "关系1",
      condition: "审核通过",
      note: "原说明",
      sourceStepId: x.step,
      targetStepId: "next",
    });
  });
});
