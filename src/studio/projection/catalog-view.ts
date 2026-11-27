// Auto-generated view of catalog for UI projection
// Read‑only, never mutates input data

import type {
  CatalogSnapshot,
  CatalogMetadata,
  CatalogDatabaseRow,
  CatalogTableRow,
  CatalogFieldRow,
  CatalogDataTypeRow,
} from "../contracts/catalog";

/**
 * View of a field for the UI projection.
 *
 * - `raw` keeps the original raw row from the snapshot.
 * - `typeName` is resolved from {@link catalog.dataTypes} by matching
 *   {@link CatalogFieldRow.typeId}. If no match or the type is unknown, the
 *   value is `null`.
 * - `label` falls back to the technical name (`field.name`) when no
 *   display name is supplied.
 */
export interface FieldView {
  fieldId: string;
  name: string;
  label: string;
  note: string | null;
  typeId: string | null;
  typeName: string | null;
  raw: CatalogFieldRow;
}

/**
 * View of a table for the UI projection.
 *
 * - `erdPos` contains the original `posX`/`posY` values.
 * - `fields` are projected from the snapshot.
 * - `label` falls back to the technical name (`table.name`).
 */
export interface TableView {
  tableId: string;
  databaseId: string;
  name: string;
  label: string;
  note: string | null;
  fields: FieldView[];
  erdPos: { x: number; y: number };
  raw: CatalogTableRow;
}

/**
 * The read‑only view exposed by the UI. The snapshot is *not* mutated.
 */
export interface CatalogView {
  databases: CatalogDatabaseRow[];
  tables: TableView[];
}

/**
 * Export a read‑only projection of the catalog for the UI.
 *
 * @param catalog  The raw snapshot of the catalog.
 * @param metadata The display name metadata.
 * @returns a CatalogView containing databases and tables with projected fields.
 */
export function projectCatalog(
  catalog: CatalogSnapshot,
  metadata: CatalogMetadata
): CatalogView {
  // Directly expose databases – they are immutable in the snapshot.
  const databases = catalog.databases.map((db) => ({ ...db }));

  // Build a lookup for data types to resolve type names.
  const typeById = new Map<string | null, CatalogDataTypeRow>();
  for (const dt of catalog.dataTypes) {
    typeById.set(dt.id, dt);
  }

  const tables: TableView[] = catalog.tables.map((tbl) => {
    const tblFields = catalog.fields.filter((f) => f.tableId === tbl.id);
    const fieldViews: FieldView[] = tblFields.map((fld) => {
      const label = metadata.fieldDisplayNames[fld.id] ?? fld.name;
      const typeRow = typeById.get(fld.typeId ?? "");
      const typeName = typeRow ? typeRow.name ?? null : null;
      return {
        fieldId: fld.id,
        name: fld.name,
        label,
        note: fld.note,
        typeId: fld.typeId,
        typeName,
        raw: fld,
      };
    });
    const tableLabel = metadata.tableDisplayNames[tbl.id] ?? tbl.name;
    return {
      tableId: tbl.id,
      databaseId: tbl.databaseId,
      name: tbl.name,
      label: tableLabel,
      note: tbl.note,
      fields: fieldViews,
      erdPos: { x: tbl.posX, y: tbl.posY },
      raw: tbl,
    };
  });

  return {
    databases,
    tables,
  };
}
