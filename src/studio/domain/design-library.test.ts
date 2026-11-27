import { describe, it, expect } from "vitest";
import { fixture, rule } from "../../../tests/helpers/workspace-fixture";
import {
  withDraftMutations,
  createInitialWorkspace,
  catalogFingerprint,
} from "../state/workspace-state";
import { planDesignLibraryDeletion } from "./design-library";
import { readDesignPackageFiles } from "./design-package-file";

describe("confirmed design library deletion planning", () => {
  it("removes only the selected library and dependent records; retains other libraries/shared templates", () => {
    const x = fixture();
    let s = withDraftMutations(x.s, (d) => {
      d.catalog.databases.push({
        ...d.catalog.databases[0],
        id: "other-db",
        name: "保留库",
        numOfTables: 1,
      });
      d.catalog.tables.push({
        ...d.catalog.tables[0],
        id: "other-table",
        databaseId: "other-db",
      });
      d.catalog.fields.push({
        ...d.catalog.fields[0],
        id: "other-field",
        tableId: "other-table",
      });
      d.catalog.indices.push(
        {
          id: "idx",
          tableId: x.ta,
          name: "composite",
          unique: false,
          createdAt: null,
        },
        {
          id: "other-index",
          tableId: "other-table",
          name: "keep",
          unique: false,
          createdAt: null,
        },
      );
      d.catalog.fieldIndices.push(
        { id: "a", indexId: "idx", fieldId: x.fa },
        { id: "b", indexId: "idx", fieldId: x.ft },
        { id: "keep-link", indexId: "other-index", fieldId: "other-field" },
      );
      d.business!.flows.push({
        ...d.business!.flows[0],
        flowId: "other-flow",
        databaseId: "other-db",
        steps: [],
      });
      d.business!.rules.push(rule(x), {
        ...rule(x),
        ruleId: "other-rule",
        flowId: "other-flow",
        mappings: [],
      });
      d.business!.templates.push({
        templateId: "shared",
        name: "共享",
        kind: "custom",
        note: "",
        versions: [],
      });
      d.business!.assignments.push(
        { fieldId: x.fa, templateId: "shared", appliedVersion: 1 },
        { fieldId: "other-field", templateId: "shared", appliedVersion: 1 },
      );
      d.metadata.fieldDisplayNames[x.fa] = "删除";
      d.metadata.fieldDisplayNames["other-field"] = "保留";
    });
    s = createInitialWorkspace(s.draft, {
      revision: 2,
      fingerprint: catalogFingerprint(s.draft.catalog),
    });
    const before = JSON.stringify(s),
      p = planDesignLibraryDeletion(s, x.db);
    expect(p.summary).toMatchObject({
      tables: 2,
      fields: 3,
      flows: 1,
      refs: 2,
      rules: 1,
      indices: 1,
    });
    expect(p.snapshot.catalog.databases.map((d) => d.id)).toEqual(["other-db"]);
    expect(p.snapshot.catalog.tables.map((d) => d.id)).toEqual(["other-table"]);
    expect(p.snapshot.catalog.fields.map((d) => d.id)).toEqual(["other-field"]);
    expect(p.snapshot.catalog.indices.map((d) => d.id)).toEqual([
      "other-index",
    ]);
    expect(p.snapshot.catalog.fieldIndices.map((d) => d.id)).toEqual([
      "keep-link",
    ]);
    expect(p.snapshot.business!.flows.map((f) => f.flowId)).toEqual([
      "other-flow",
    ]);
    expect(p.snapshot.business!.rules.map((r) => r.ruleId)).toEqual([
      "other-rule",
    ]);
    expect(p.snapshot.business!.refs).toEqual([]);
    expect(p.snapshot.business!.assignments.map((a) => a.fieldId)).toEqual([
      "other-field",
    ]);
    expect(p.snapshot.business!.templates).toEqual(s.draft.business!.templates);
    expect(p.snapshot.metadata.fieldDisplayNames).toEqual({
      "other-field": "保留",
    });
    expect(p.snapshot.catalog.dataTypes).toEqual(s.draft.catalog.dataTypes);
    expect(JSON.stringify(s)).toBe(before);
  });
  it("can remove the last library, leaving a valid empty workspace", () => {
    const x = fixture(),
      p = planDesignLibraryDeletion(x.s, x.db);
    expect(p.snapshot.catalog.databases).toEqual([]);
    expect(p.snapshot.catalog.fields).toEqual([]);
    expect(p.snapshot.business!.flows).toEqual([]);
  });
  it("rejects dirty/missing targets without touching the input", () => {
    const x = fixture(),
      s = withDraftMutations(x.s, (d) => {
        d.catalog.fields[0].note = "未保存";
      });
    const before = JSON.stringify(s);
    expect(() => planDesignLibraryDeletion(s, x.db)).toThrow(/先保存/);
    expect(() => planDesignLibraryDeletion(x.s, "missing")).toThrow(/不存在/);
    expect(JSON.stringify(s)).toBe(before);
  });
  it("also removes cross-library dangling relationships and rules using the deleted endpoints", () => {
    const x = fixture();
    let s = withDraftMutations(x.s, (d) => {
      d.catalog.databases.push({ ...d.catalog.databases[0], id: "other" });
      d.catalog.tables.push({
        ...d.catalog.tables[0],
        id: "t",
        databaseId: "other",
      });
      d.catalog.fields.push({
        ...d.catalog.fields[0],
        id: "f",
        tableId: "t",
        isForeign: true,
      });
      d.catalog.relationships.push({
        id: "cross",
        databaseId: "other",
        name: "cross",
        sourceTableId: "t",
        targetTableId: x.ta,
        sourceFieldId: "f",
        targetFieldId: x.fa,
        cardinality: "many_to_one",
        onDelete: null,
        onUpdate: null,
        sourceAliasName: null,
        targetAliasName: null,
        createdAt: null,
      });
      d.business!.rules.push({ ...rule(x), flowId: "outside" });
    });
    s = createInitialWorkspace(s.draft, {
      revision: 0,
      fingerprint: catalogFingerprint(s.draft.catalog),
    });
    const p = planDesignLibraryDeletion(s, x.db);
    expect(p.removed.relationships).toEqual(["cross"]);
    expect(p.snapshot.catalog.fields[0].isForeign).toBe(false);
    expect(p.snapshot.business!.rules).toEqual([]);
  });
});

describe("same file validation for browse and drop", () => {
  it("reads a single JSON without changing its content", async () => {
    const f = new File(['{"format":"example"}'], "demo.stackrender.JSON");
    expect(await readDesignPackageFiles([f])).toEqual({ format: "example" });
    expect(await f.text()).toBe('{"format":"example"}');
  });
  it("rejects multiple files, non JSON, oversize and broken JSON", async () => {
    const f = new File(["{}"], "a.json");
    await expect(readDesignPackageFiles([])).rejects.toThrow(/一个/);
    await expect(readDesignPackageFiles([f, f])).rejects.toThrow(/一个/);
    await expect(
      readDesignPackageFiles([new File(["{}"], "a.txt")]),
    ).rejects.toThrow(/JSON/);
    await expect(
      readDesignPackageFiles([
        { name: "a.json", size: 30 * 1024 * 1024 + 1 } as File,
      ]),
    ).rejects.toThrow(/30MiB/);
    await expect(
      readDesignPackageFiles([new File(["{"], "a.json")]),
    ).rejects.toThrow(/格式不正确/);
  });
});
