import { describe, it, expect } from "vitest";
import { fixture, rule } from "../../../tests/helpers/workspace-fixture";
import { withDraftMutations } from "../state/workspace-state";
import { deleteField } from "./catalog-fields";

describe("confirmed field deletion with dependent design metadata", () => {
  it("removes an entire affected composite index, FK and links without deleting other fields", () => {
    const x = fixture();
    const state = withDraftMutations(x.s, (d) => {
      d.catalog.indices.push({
        id: "idx",
        tableId: x.ta,
        name: "fee_description",
        unique: true,
        createdAt: null,
      });
      d.catalog.fieldIndices.push(
        { id: "fi1", fieldId: x.fa, indexId: "idx" },
        { id: "fi2", fieldId: x.ft, indexId: "idx" },
      );
      d.catalog.relationships.push({
        id: "fk",
        name: "fee_total",
        databaseId: x.db,
        sourceTableId: x.ta,
        targetTableId: x.tb,
        sourceFieldId: x.fa,
        targetFieldId: x.fb,
        cardinality: "many_to_one",
        onDelete: null,
        onUpdate: null,
        sourceAliasName: null,
        targetAliasName: null,
        createdAt: null,
      });
    });
    const before = JSON.stringify(state);
    expect(deleteField(state, { fieldId: x.fa }).ok).toBe(false);
    const request = { fieldId: x.fa, confirmed: true };
    const result = deleteField(state, request);
    expect(result.ok).toBe(true);
    if (!result.ok) throw Error(result.error.message);
    expect(result.state.draft.catalog.fields.map((f) => f.id)).toEqual([
      x.fb,
      x.ft,
    ]);
    expect(result.state.draft.catalog.indices).toHaveLength(0);
    expect(result.state.draft.catalog.fieldIndices).toHaveLength(0);
    expect(result.state.draft.catalog.relationships).toHaveLength(0);
    expect(JSON.stringify(state)).toBe(before);
  });
  it("removes entire affected rules to avoid silently weakening conditions, preserving independent rules", () => {
    const x = fixture();
    const state = withDraftMutations(x.s, (d) => {
      const r = rule(x);
      r.conditions = [
        {
          id: "unrelated",
          left: { refId: x.rb, fieldId: x.fb },
          right: { refId: x.rb, fieldId: x.fb },
        },
      ];
      const independent = rule(x);
      independent.ruleId = "independent";
      independent.mappings[0].expr = [{ kind: "num", value: "1" }];
      d.business!.rules.push(
        r,
        { ...rule(x), ruleId: "only-deleted" },
        independent,
      );
    });
    const result = deleteField(state, { fieldId: x.fa, confirmed: true });
    expect(result.ok).toBe(true);
    if (!result.ok) throw Error(result.error.message);
    expect(result.state.draft.business!.rules.map((r) => r.ruleId)).toEqual([
      "independent",
    ]);
    expect(result.state.draft.business!.flows).toEqual(
      state.draft.business!.flows,
    );
    expect(result.state.draft.business!.refs).toEqual(
      state.draft.business!.refs,
    );
  });
  it("removes display-name, template assignment and visible-field membership but keeps the shared template/ref", () => {
    const x = fixture();
    const state = withDraftMutations(x.s, (d) => {
      d.metadata.fieldDisplayNames[x.fa] = "费用";
      d.business!.templates.push({
        templateId: "money",
        name: "金额",
        kind: "money",
        note: "",
        versions: [
          {
            version: 1,
            createdAt: "2026-11-27",
            typeId: "money",
            precision: 18,
            scale: 2,
            maxLength: null,
          },
        ],
      });
      d.business!.assignments.push(
        { fieldId: x.fa, templateId: "money", appliedVersion: 1 },
        { fieldId: x.fb, templateId: "money", appliedVersion: 1 },
      );
      d.business!.refs[0].visibleFieldIds = [x.fa, x.ft];
    });
    const request = { fieldId: x.fa, confirmed: true };
    const r = deleteField(state, request);
    expect(r.ok).toBe(true);
    if (!r.ok) throw Error(r.error.message);
    expect(r.state.draft.metadata.fieldDisplayNames[x.fa]).toBeUndefined();
    expect(r.state.draft.business!.templates).toHaveLength(1);
    expect(r.state.draft.business!.assignments.map((a) => a.fieldId)).toEqual([
      x.fb,
    ]);
    expect(r.state.draft.business!.refs[0].visibleFieldIds).toEqual([x.ft]);
  });
});

import { fieldDeletionImpact, deletedFieldIndexIds } from "./field-deletion";

describe("deletion preview and persistence scope", () => {
  it("preview is read-only and includes index and rule impact before confirmation", () => {
    const x = fixture(),
      s = withDraftMutations(x.s, (d) => {
        d.catalog.indices.push({
          id: "index",
          tableId: x.ta,
          name: "PRIMARY",
          unique: true,
          createdAt: null,
        });
        d.catalog.fieldIndices.push({
          id: "link",
          fieldId: x.fa,
          indexId: "index",
        });
        d.business!.rules.push(rule(x));
      });
    const before = JSON.stringify(s);
    expect(fieldDeletionImpact(s.draft, x.fa)).toMatchObject({
      indices: [{ id: "index" }],
      rules: [{ name: "金额映射" }],
    });
    expect(JSON.stringify(s)).toBe(before);
  });
  it("persists only removed indices attached to the deleted field, and clears remaining primary members", () => {
    const x = fixture(),
      s = withDraftMutations(x.s, (d) => {
        d.catalog.fields.find((f) => f.id === x.ft)!.isPrimary = true;
        d.catalog.indices.push(
          {
            id: "primary",
            tableId: x.ta,
            name: "PRIMARY",
            unique: true,
            createdAt: null,
          },
          {
            id: "keep",
            tableId: x.tb,
            name: "keep",
            unique: false,
            createdAt: null,
          },
        );
        d.catalog.fieldIndices.push(
          { id: "a", fieldId: x.fa, indexId: "primary" },
          { id: "b", fieldId: x.ft, indexId: "primary" },
          { id: "c", fieldId: x.fb, indexId: "keep" },
        );
      });
    const r = deleteField(s, { fieldId: x.fa, confirmed: true });
    if (!r.ok) throw Error(r.error.message);
    expect(
      deletedFieldIndexIds(s.draft.catalog, r.state.draft.catalog, [x.fa]),
    ).toEqual(["primary"]);
    expect(
      r.state.draft.catalog.fields.find((f) => f.id === x.ft)?.isPrimary,
    ).toBe(false);
    expect(r.state.draft.catalog.indices.map((i) => i.id)).toEqual(["keep"]);
    expect(r.state.draft.catalog.fieldIndices.map((i) => i.id)).toEqual(["c"]);
    expect(
      deletedFieldIndexIds(s.draft.catalog, s.draft.catalog, [x.fa]),
    ).toEqual([]);
  });
  it("removes rules using deleted condition endpoints or formula targets and preserves independent rules", () => {
    const x = fixture(),
      s = withDraftMutations(x.s, (d) => {
        const conditionOnly = rule(x);
        conditionOnly.ruleId = "condition";
        conditionOnly.mappings = [];
        conditionOnly.conditions = [
          {
            id: "c",
            left: { refId: x.ra, fieldId: x.ft },
            right: { refId: x.ra, fieldId: x.fa },
          },
        ];
        const target = rule(x);
        target.ruleId = "target";
        target.mappings[0].target = { refId: x.ra, fieldId: x.fa };
        target.mappings[0].expr = [{ kind: "num", value: "1" }];
        const independent = rule(x);
        independent.ruleId = "keep";
        independent.mappings[0].expr = [
          { kind: "field", refId: x.rb, fieldId: x.fb },
        ];
        d.business!.rules.push(conditionOnly, target, independent);
      });
    const r = deleteField(s, { fieldId: x.fa, confirmed: true });
    if (!r.ok) throw Error(r.error.message);
    expect(r.state.draft.business!.rules.map((r) => r.ruleId)).toEqual([
      "keep",
    ]);
  });
  it("does not mutate a missing-field request", () => {
    const x = fixture(),
      before = JSON.stringify(x.s);
    expect(
      deleteField(x.s, { fieldId: "missing", confirmed: true }),
    ).toMatchObject({ ok: false, error: { code: "FIELD_NOT_FOUND" } });
    expect(JSON.stringify(x.s)).toBe(before);
  });
});
