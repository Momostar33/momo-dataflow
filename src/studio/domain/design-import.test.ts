import { scopeDesignSnapshot } from "./design-scope";
import { describe, it, expect } from "vitest";
import { fixture } from "../../../tests/helpers/workspace-fixture";
import { planDesignImport, type DesignPackage } from "./design-import";
import { withDraftMutations } from "../state/workspace-state";
function sample(): DesignPackage {
  const db = crypto.randomUUID(),
    table = crypto.randomUUID(),
    a = crypto.randomUUID(),
    b = crypto.randomUUID(),
    flow = crypto.randomUUID(),
    step = crypto.randomUUID(),
    ra = crypto.randomUUID(),
    rb = crypto.randomUUID();
  return {
    format: "stackrender-design-package",
    version: 1,
    packageId: "test-only",
    name: "结构",
    capturedAt: "2026-11-18",
    note: "来源：历史结构，不是实时",
    database: { id: db, name: "单独设计库", dialect: "mysql" },
    tables: [
      {
        id: table,
        name: "raw_db.orders",
        label: "订单",
        note: "元数据",
        columns: [
          {
            id: a,
            name: "id",
            type: "DECIMAL",
            note: "SQL类型 DECIMAL",
            primary: true,
            nullable: false,
            defaultValue: null,
            precision: 18,
            scale: 2,
            maxLength: null,
          },
          {
            id: b,
            name: "amount",
            type: "DECIMAL",
            note: "金额",
            primary: false,
            nullable: true,
            defaultValue: null,
            precision: 18,
            scale: 2,
            maxLength: null,
          },
        ],
      },
    ],
    flows: [
      {
        flowId: flow,
        databaseId: db,
        name: "采购",
        note: "导航分组",
        steps: [
          {
            stepId: step,
            name: "Raw",
            note: "结构",
            x: 0,
            y: 0,
            w: 640,
            h: 360,
          },
        ],
      },
    ],
    refs: [
      {
        refId: ra,
        flowId: flow,
        stepId: step,
        tableId: table,
        x: 10,
        y: 50,
        collapsed: true,
      },
      {
        refId: rb,
        flowId: flow,
        stepId: step,
        tableId: table,
        x: 300,
        y: 50,
        collapsed: true,
      },
    ],
    rules: [
      {
        ruleId: crypto.randomUUID(),
        flowId: flow,
        name: "静态SQL连接",
        note: "source.py:10，未验收",
        logic: "ALL",
        conditions: [
          {
            id: crypto.randomUUID(),
            left: { refId: ra, fieldId: a },
            right: { refId: rb, fieldId: b },
          },
        ],
        mappings: [],
      },
    ],
    relationships: [],
    indexes: [
      {
        id: crypto.randomUUID(),
        tableId: table,
        name: "PRIMARY",
        unique: true,
        fieldIds: [a],
      },
    ],
  };
}
describe("additive design package import", () => {
  it("preserves all existing catalog, templates, settings and drawings; appends in a private plan", () => {
    const x = fixture(),
      p = sample(),
      before = JSON.stringify(x.s),
      inputBefore = JSON.stringify(p);
    const plan = planDesignImport(x.s, p);
    expect(plan.summary).toMatchObject({
      tables: 1,
      fields: 2,
      modules: 1,
      rules: 1,
      indexes: 1,
    });
    expect(
      plan.snapshot.catalog.tables.slice(0, x.s.draft.catalog.tables.length),
    ).toEqual(x.s.draft.catalog.tables);
    expect(plan.snapshot.business!.flows[0]).toEqual(
      x.s.draft.business!.flows[0],
    );
    expect(plan.snapshot.business!.settings).toEqual(
      x.s.draft.business!.settings,
    );
    expect(plan.snapshot.catalog.fieldIndices).toHaveLength(1);
    expect(JSON.stringify(x.s)).toBe(before);
    expect(JSON.stringify(p)).toBe(inputBefore);
  });
  it("blocks duplicate import rather than overwriting edited imported data", () => {
    const x = fixture(),
      p = sample();
    const first = planDesignImport(x.s, p);
    const state = withDraftMutations(x.s, (d) => {
      d.catalog = first.snapshot.catalog;
      d.business = first.snapshot.business;
    });
    state.savedEditVersion = state.editVersion;
    state.lastSavedSnapshot = structuredClone(state.draft);
    expect(() => planDesignImport(state, p)).toThrow(/已存在/);
  });
  it("requires current drawings to be saved first", () => {
    const x = fixture(),
      dirty = withDraftMutations(
        x.s,
        (d) => (d.business!.settings.autosaveMinutes = 10),
      );
    expect(() => planDesignImport(dirty, sample())).toThrow(/先保存/);
  });
  it("rejects ID collisions with existing steps, not just tables", () => {
    const x = fixture(),
      p = sample();
    p.tables[0].id = x.step;
    expect(() => planDesignImport(x.s, p)).toThrow();
  });
  it.each(["source", "field", "flow"])(
    "rejects dangling %s endpoints before any write",
    (kind) => {
      const x = fixture(),
        p = sample();
      if (kind === "source") p.refs[0].tableId = crypto.randomUUID();
      if (kind === "field")
        p.rules[0].conditions[0].left!.fieldId = crypto.randomUUID();
      if (kind === "flow") p.flows[0].databaseId = x.db;
      expect(() => planDesignImport(x.s, p)).toThrow();
    },
  );
  it("keeps unrecognized SQL types in notes without inventing a replacement", () => {
    const x = fixture(),
      p = sample();
    p.tables[0].columns.push({
      ...p.tables[0].columns[1],
      id: crypto.randomUUID(),
      name: "geometry",
      type: "unrecognized_custom",
    });
    const result = planDesignImport(x.s, p);
    expect(result.summary.unknownTypes).toEqual(["unrecognized_custom"]);
    expect(result.additions.fields[2]).toMatchObject({ typeId: null });
    expect(result.additions.fields[2].note).toContain("unrecognized_custom");
  });
  it("rejects malformed packages and speculative executable mappings", () => {
    const x = fixture();
    expect(() => planDesignImport(x.s, { format: "other" })).toThrow();
    const p = sample();
    p.rules[0].mappings = [
      { id: crypto.randomUUID(), target: null, expr: [], note: "" },
    ];
    expect(() => planDesignImport(x.s, p)).toThrow(/计算公式/);
    const q = sample();
    q.tables[0].columns[0].scale = 30;
    expect(() => planDesignImport(x.s, q)).toThrow(/小数位/);
  });
});

it("uses explicitly seeded SQL synonyms such as int -> integer, without guessing categories", () => {
  const x = fixture();
  const state = withDraftMutations(x.s, (d) => {
    d.catalog.dataTypes = d.catalog.dataTypes.filter((t) => t.id !== "int");
    d.catalog.dataTypes.push({
      id: "integer-id",
      name: "integer",
      dialect: "mysql",
      type: "integer",
      synonyms: '["int"]',
      modifiers: null,
    });
  });
  state.savedEditVersion = state.editVersion;
  state.lastSavedSnapshot = structuredClone(state.draft);
  const p = sample();
  p.tables[0].columns[0].type = "int";
  const result = planDesignImport(state, p);
  expect(result.additions.fields[0].typeId).toBe("integer-id");
  expect(result.summary.unknownTypes).toEqual([]);
});

it("scopes overview and dependent entities to the selected database without mutating old drawings", () => {
  const x = fixture(),
    p = sample(),
    plan = planDesignImport(x.s, p),
    before = JSON.stringify(plan.snapshot);
  const scoped = scopeDesignSnapshot(plan.snapshot, p.database.id)!;
  expect(scoped.catalog.tables).toHaveLength(1);
  expect(scoped.catalog.fields).toHaveLength(2);
  expect(scoped.business!.flows.map((f) => f.flowId)).toEqual([
    p.flows[0].flowId,
  ]);
  expect(
    scoped.business!.refs.every((r) => r.flowId === p.flows[0].flowId),
  ).toBe(true);
  expect(JSON.stringify(plan.snapshot)).toBe(before);
  expect(scopeDesignSnapshot(plan.snapshot, x.db)!.catalog.tables).toEqual(
    x.s.draft.catalog.tables,
  );
});
