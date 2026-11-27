import { describe, test, expect } from "vitest";
import { validateRule, validateFieldTypeChange } from "./rule-validation";
import type { BusinessDocument, Rule, ExprToken } from "../contracts/business";
import type { CatalogSnapshot } from "../contracts/catalog";

// Helper to create minimal catalog snapshot
const catalog: CatalogSnapshot = {
  databases: [],
  tables: [
    {
      id: "t1",
      databaseId: "db1",
      name: "Table1",
      posX: 0,
      posY: 0,
      color: null,
      width: null,
      note: null,
      sequence: null,
      createdAt: null,
    },
  ],
  fields: [
    {
      id: "f1",
      tableId: "t1",
      name: "Field1",
      isPrimary: false,
      unique: false,
      nullable: false,
      defaultValue: null,
      note: null,
      typeId: "int",
      sequence: null,
      maxLength: null,
      unsigned: null,
      isForeign: null,
      zeroFill: null,
      autoIncrement: null,
      precision: null,
      scale: null,
      charset: null,
      collate: null,
      values: null,
    },
    {
      id: "f2",
      tableId: "t1",
      name: "Field2",
      isPrimary: false,
      unique: false,
      nullable: false,
      defaultValue: null,
      note: null,
      typeId: "int",
      sequence: null,
      maxLength: null,
      unsigned: null,
      isForeign: null,
      zeroFill: null,
      autoIncrement: null,
      precision: null,
      scale: null,
      charset: null,
      collate: null,
      values: null,
    },
  ],
  dataTypes: [
    {
      id: "int",
      name: "INT",
      dialect: "sqlite",
      type: "INT",
      modifiers: null,
      synonyms: null,
    },
    {
      id: "varchar",
      name: "VARCHAR",
      dialect: "sqlite",
      type: "VARCHAR",
      modifiers: null,
      synonyms: null,
    },
  ],
  relationships: [],
  indices: [],
  fieldIndices: [],
};

const ref = {
  refId: "r1",
  flowId: "f1",
  stepId: "s1",
  tableId: "t1",
  x: 0,
  y: 0,
  collapsed: false,
};

const business: BusinessDocument = {
  schemaVersion: 2,
  templates: [],
  assignments: [],
  flows: [
    {
      flowId: "f1",
      databaseId: "db1",
      name: "Flow1",
      note: "",
      steps: [],
    },
  ],
  refs: [ref],
  rules: [],
  settings: {
    autosaveMinutes: 5,
  },
};

describe("validateRule", () => {
  test("valid rule passes", () => {
    const rule: Rule = {
      ruleId: "r1",
      flowId: "f1",
      name: "TestRule",
      note: "",
      logic: "ALL",
      conditions: [
        {
          id: "c1",
          left: { refId: "r1", fieldId: "f1" },
          right: { refId: "r1", fieldId: "f2" },
        },
      ],
      mappings: [],
    };
    const issues = validateRule(rule, business, catalog);
    expect(issues).toHaveLength(0);
  });

  test("missing condition side fails", () => {
    const rule: Rule = {
      ruleId: "r2",
      flowId: "f1",
      name: "BadRule",
      note: "",
      logic: "ALL",
      conditions: [
        {
          id: "c1",
          left: null,
          right: { refId: "r1", fieldId: "f2" },
        },
      ],
      mappings: [],
    };
    const issues = validateRule(rule, business, catalog);
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringMatching(/匹配条件第 1 行两侧字段都必须选择/) })
      ])
    );
  });
});

describe("validateFieldTypeChange", () => {
  test("valid type change passes", () => {
    const change = {
      fieldId: "f2",
      typeId: "int",
      precision: null,
      scale: null,
      maxLength: null,
    };
    const issues = validateFieldTypeChange({ catalog }, change);
    expect(issues).toHaveLength(0);
  });

  test("type change with conflicting rule fails", () => {
    const mapping: ExprToken = { kind: "field", refId: "r1", fieldId: "f2" };
    const rule: Rule = {
      ruleId: "r3",
      flowId: "f1",
      name: "MapRule",
      note: "",
      logic: "ALL",
      conditions: [],
      mappings: [
        {
          id: "m1",
          target: { refId: "r1", fieldId: "f2" },
          expr: [mapping],
          note: "",
        },
      ],
    };
    const businessWithRule: BusinessDocument = { ...business, rules: [rule] };
    const change = {
      fieldId: "f2",
      typeId: "varchar",
      precision: null,
      scale: null,
      maxLength: null,
    };
    const issues = validateFieldTypeChange({ catalog, business: businessWithRule }, change);
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ message: expect.stringMatching(/不兼容/) })
      ])
    );
  });
});
