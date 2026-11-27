import { describe, it, expect } from "vitest";
import { fixture, rule } from "../../../tests/helpers/workspace-fixture";
import { withDraftMutations } from "../state/workspace-state";
import { nextRelationName } from "./relation-names";
import {
  fieldAliases,
  parseExpressionInput,
  formatExpression,
} from "./expression-input";
import { decodeDraggedField, insertFieldAtSelection } from "./field-insertion";
import {
  connectionToRuleCandidate,
  encodeFieldHandle,
} from "../canvas/rule-connections";
import { saveTransition } from "./flow-diagram";

describe("simple shared relationship numbering", () => {
  it("shares numbering between field rules and module lines within one flow", () => {
    const x = fixture(),
      s = withDraftMutations(x.s, (d) => {
        d.business!.rules.push(
          { ...rule(x), name: "关系1" },
          {
            ...rule(x),
            ruleId: "unrelated",
            flowId: "elsewhere",
            name: "关系99",
          },
        );
        d.business!.flows[0].transitions = [
          {
            transitionId: "t",
            sourceStepId: "a",
            targetStepId: "b",
            kind: "sequence",
            label: "关系3",
            condition: "",
            note: "",
          },
        ];
      });
    expect(nextRelationName(x.s.draft.business, x.flow)).toBe("关系1");
    expect(nextRelationName(s.draft.business, x.flow)).toBe("关系4");
  });
  it("gives a newly connected candidate a name before opening its form", () => {
    const x = fixture();
    const r = connectionToRuleCandidate(
      {
        flowId: x.flow,
        kind: "mapping",
        sourceHandle: encodeFieldHandle({ refId: x.ra, fieldId: x.fa }),
        targetHandle: encodeFieldHandle({ refId: x.rb, fieldId: x.fb }),
      },
      x.s.draft.business!,
      x.s.draft.catalog,
    );
    expect(r?.name).toBe("关系1");
  });
  it("does not rename existing or customized transitions", () => {
    const x = fixture(),
      s = withDraftMutations(x.s, (d) => {
        d.business!.flows[0].steps.push({
          ...d.business!.flows[0].steps[0],
          stepId: "next",
        });
      });
    const r = saveTransition(s, x.flow, {
      sourceStepId: x.step,
      targetStepId: "next",
      kind: "sequence",
      label: "自定义",
      condition: "",
      note: "",
    });
    if (!r.ok) throw Error(r.error.message);
    expect(r.state.draft.business!.flows[0].transitions![0].label).toBe(
      "自定义",
    );
  });
});
describe("field insertion at formula selection", () => {
  it("preserves manually typed operators and round trips the inserted field to stable IDs", () => {
    const x = fixture(),
      aliases = fieldAliases(x.s.draft.business!, x.s.draft.catalog),
      token = { refId: x.ra, fieldId: x.fa };
    const r = insertFieldAtSelection("2 * ", token, aliases);
    expect(r.value.startsWith("2 * ")).toBe(true);
    expect(parseExpressionInput(r.value, aliases).tokens.at(-1)).toMatchObject({
      kind: "field",
      ...token,
    });
    expect(r.caret).toBe(r.value.length);
  });
  it("replaces selected text and preserves both surrounding operators", () => {
    const x = fixture(),
      aliases = fieldAliases(x.s.draft.business!, x.s.draft.catalog);
    const r = insertFieldAtSelection(
      "2 * old + 3",
      { refId: x.ra, fieldId: x.fa },
      aliases,
      4,
      7,
    );
    expect(r.value).toMatch(/^2 \* \[.*\] \+ 3$/);
    expect(r.value).not.toContain("old");
  });
  it("rejects unrelated fields instead of inserting broken or out-of-scope references", () => {
    const x = fixture(),
      aliases = fieldAliases(x.s.draft.business!, x.s.draft.catalog);
    expect(() =>
      insertFieldAtSelection(
        "1 + ",
        { refId: "other", fieldId: "unknown" },
        aliases,
      ),
    ).toThrow(/当前关系/);
  });
  it("accepts only a well shaped field drag payload", () => {
    expect(
      decodeDraggedField('{"refId":"r","fieldId":"f","ignored":true}'),
    ).toEqual({ refId: "r", fieldId: "f" });
    for (const raw of ["x", "null", "{}", '{"refId":1,"fieldId":"f"}'])
      expect(decodeDraggedField(raw)).toBeNull();
  });
  it("keeps escaped field labels usable during drag/click insertion", () => {
    const x = fixture(),
      aliases = fieldAliases(x.s.draft.business!, x.s.draft.catalog).map(
        (a) => ({ ...a, label: a.label + "]x" }),
      );
    const t = { refId: x.ra, fieldId: x.fa },
      r = insertFieldAtSelection("", t, aliases);
    expect(r.value).toBe(formatExpression([{ kind: "field", ...t }], aliases));
    expect(parseExpressionInput(r.value, aliases).error).toBeUndefined();
  });
});
