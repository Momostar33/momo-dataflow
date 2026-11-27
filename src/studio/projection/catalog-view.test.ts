import { describe, it, expect } from "vitest";
import { projectCatalog, TableView, FieldView } from "./catalog-view";
import type {
  CatalogSnapshot,
  CatalogMetadata,
  CatalogDatabaseRow,
  CatalogTableRow,
  CatalogFieldRow,
  CatalogDataTypeRow,
} from "../contracts/catalog";

const database: CatalogDatabaseRow = {
  id: "d1",
  name: "local",
  dialect: "postgres",
  numOfTables: 1,
  createdAt: null,
};
const dataType: CatalogDataTypeRow = {
  id: "dt1",
  name: "integer",
  dialect: "postgres",
  type: "integer",
  modifiers: null,
  synonyms: null,
};
const table: CatalogTableRow = {
  id: "t1",
  databaseId: "d1",
  name: "orders",
  posX: 0,
  posY: 0,
  color: null,
  width: null,
  note: "order table",
  sequence: 0,
  createdAt: null,
};
const field: CatalogFieldRow = {
  id: "f1",
  tableId: "t1",
  name: "id",
  isPrimary: true,
  unique: true,
  nullable: false,
  defaultValue: null,
  note: "primary key",
  typeId: "dt1",
  sequence: 0,
  maxLength: null,
  unsigned: null,
  isForeign: null,
  zeroFill: null,
  autoIncrement: true,
  precision: null,
  scale: null,
  charset: null,
  collate: null,
  values: null,
};

const snapshot: CatalogSnapshot = {
  databases: [database],
  tables: [table],
  fields: [field],
  dataTypes: [dataType],
  relationships: [],
  indices: [],
  fieldIndices: [],
};
const metadata: CatalogMetadata = {
  tableDisplayNames: { t1: "订单" },
  fieldDisplayNames: { f1: "主键" },
};

describe("projectCatalog", () => {
  it("produces correct view", () => {
    const view = projectCatalog(snapshot, metadata);
    expect(view.databases).toHaveLength(1);
    expect(view.databases[0]).toEqual(database);
    expect(view.tables).toHaveLength(1);
    const tbl = view.tables[0] as TableView;
    expect(tbl.tableId).toBe("t1");
    expect(tbl.label).toBe("订单");
    expect(tbl.erdPos).toEqual({ x: 0, y: 0 });
    expect(tbl.fields).toHaveLength(1);
    const fld = tbl.fields[0] as FieldView;
    expect(fld.fieldId).toBe("f1");
    expect(fld.label).toBe("主键");
    expect(fld.typeName).toBe("integer");
    expect(fld.raw).toEqual(field);
  });
});
