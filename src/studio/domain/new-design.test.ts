import { describe, it, expect } from "vitest";
import { newDesignPackage } from "./new-design";
import { planDesignImport } from "./design-import";
import { addTable } from "./catalog-tables";
import { addFlow } from "./flows";
import { emptyBusinessDocument } from "../contracts/business";
import { emptyCatalog, emptyMetadata, createInitialWorkspace, catalogFingerprint } from "../state/workspace-state";

function blank() {
  const snapshot = { catalog: emptyCatalog(), metadata: emptyMetadata(), business: emptyBusinessDocument() };
  return createInitialWorkspace(snapshot, { revision: 0, fingerprint: catalogFingerprint(snapshot.catalog) });
}
describe("blank design without the ERD interface", () => {
  it("starts from an empty installation and supports tables and business flows", () => {
    const state = blank();
    const p = newDesignPackage("  采购设计  ");
    const r = planDesignImport(state, p);
    expect(r.snapshot.catalog.databases[0].name).toBe("采购设计");
    expect(state.draft.catalog.databases).toHaveLength(0);
    let next = createInitialWorkspace(r.snapshot, { revision: 1, fingerprint: catalogFingerprint(r.snapshot.catalog) });
    const table = addTable(next, { databaseId: p.database.id, name: "purchase_order" });
    expect(table.ok).toBe(true);
    if (!table.ok) throw Error("table creation failed");
    next = table.state;
    expect(addFlow(next, { databaseId: p.database.id, name: "采购", note: "" }).ok).toBe(true);
  });
  it("rejects a duplicate design without changing existing data", () => {
    const p = newDesignPackage("采购");
    const snapshot = planDesignImport(blank(), p).snapshot;
    const saved = createInitialWorkspace(snapshot, { revision: 1, fingerprint: catalogFingerprint(snapshot.catalog) });
    const before = JSON.stringify(saved);
    expect(() => planDesignImport(saved, newDesignPackage("采购"))).toThrow(/已存在/);
    expect(JSON.stringify(saved)).toBe(before);
  });
  it("rejects blank or oversized names", () => {
    expect(() => newDesignPackage("  ")).toThrow();
    expect(() => newDesignPackage("x".repeat(256))).toThrow();
  });
});
