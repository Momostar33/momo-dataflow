import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MysqlDataType } from "../../lib/data_types/mysql_data_types";
import {
  createInitialWorkspace,
  emptyCatalog,
  emptyMetadata,
} from "../state/workspace-state";
import { emptyBusinessDocument } from "../contracts/business";
import { planDesignImport } from "./design-import";

function initial() {
  const catalog = emptyCatalog();
  catalog.dataTypes = MysqlDataType.map((row) => ({
    id: row.id!,
    name: row.name ?? null,
    type: row.type ?? null,
    dialect: "mysql",
    modifiers: row.modifiers ? JSON.stringify(row.modifiers) : null,
    synonyms: row.synonyms ? JSON.stringify(row.synonyms) : null,
  }));
  return createInitialWorkspace(
    { catalog, metadata: emptyMetadata(), business: emptyBusinessDocument() },
    { revision: 0, fingerprint: "" },
  );
}
const example = "docs/usage/examples/design-package-v1.example.json";
const files = process.env.MOMO_DESIGN_PACKAGE
  ? [process.env.MOMO_DESIGN_PACKAGE]
  : [example, "docs/usage/examples/showcase-purchase.stackrender.json"];
describe.each(files)("native design package validation: %s", (filename) => {
  it("accepts the package and leaves input/workspace untouched", () => {
    const input = JSON.parse(readFileSync(resolve(filename), "utf8"));
    const before = JSON.stringify(input),
      state = initial(),
      baseline = JSON.stringify(state);
    const plan = planDesignImport(state, input);
    expect(JSON.stringify(input)).toBe(before);
    expect(JSON.stringify(state)).toBe(baseline);
    expect(plan.summary.databaseId).toBe(input.database.id);
    if (process.env.MOMO_DESIGN_PACKAGE)
      console.log(
        `${basename(filename)}: ${plan.summary.tables} tables, ${plan.summary.fields} fields, ${plan.summary.modules} flows; ${plan.summary.unknownTypes.length} unrecognized SQL types. No browser data was written.`,
      );
  });
});
describe.skipIf(!!process.env.MOMO_DESIGN_PACKAGE)(
  "published package-v1 boundaries",
  () => {
    const input = () => JSON.parse(readFileSync(resolve(example), "utf8"));
    it("rejects duplicate entity IDs", () => {
      const p = input();
      p.tables[1].id = p.tables[0].id;
      expect(() => planDesignImport(initial(), p)).toThrow(/ID重复/);
    });
    it("rejects a field endpoint from another table", () => {
      const p = input();
      p.rules[0].conditions[0].left.fieldId = p.tables[0].columns[0].id;
      expect(() => planDesignImport(initial(), p)).toThrow(/字段引用无效/);
    });
    it("rejects formulas in package v1", () => {
      const p = input();
      p.rules[0].mappings.push({ id: crypto.randomUUID() });
      expect(() => planDesignImport(initial(), p)).toThrow(/计算公式/);
    });
    it("rejects a decision node in package v1", () => {
      const p = input();
      p.flows[0].steps[0].kind = "decision";
      expect(() => planDesignImport(initial(), p)).toThrow(/仅支持表分组步骤/);
    });
  },
);
