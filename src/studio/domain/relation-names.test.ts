import { describe, expect, it } from "vitest";
import { fixture, rule } from "../../../tests/helpers/workspace-fixture";
import { withDraftMutations } from "../state/workspace-state";
import { nextRelationName } from "./relation-names";

describe("relationship numbering across interface languages", () => {
  it("shares one sequence and never renames existing business data", () => {
    const x = fixture();
    const state = withDraftMutations(x.s, (d) => {
      d.business!.rules.push(
        { ...rule(x), ruleId: crypto.randomUUID(), name: "关系2" },
        { ...rule(x), ruleId: crypto.randomUUID(), name: "Relation 4" },
      );
    });
    const before = JSON.stringify(state);
    expect(nextRelationName(state.draft.business, x.flow, "Relation ")).toBe(
      "Relation 5",
    );
    expect(nextRelationName(state.draft.business, x.flow)).toBe("关系5");
    expect(JSON.stringify(state)).toBe(before);
  });
});
