/**
 * F01 · 目录原始行合同 (Catalog raw-row contracts)
 *
 * Self-contained contract: NO imports from the upstream schema files
 * (src/lib/schemas/*). The upstream `DatabaseType` interface already carries a
 * historical TS2430 (its `dialect` enum is broader than the table schema's),
 * so importing it would propagate that defect into this pure type contract.
 * We therefore restate the raw column set, nullability and SQL enum unions
 * directly, based on the real Drizzle table definitions at baseline
 * main@6eca62716165cd943dc4a2a23c38323a03b25778.
 *
 * Design rules honored:
 *  - Preserve every real raw column, its nullability, and the SQL enum union.
 *  - Every row permits unknown future columns via a string index signature.
 *  - data_types.id IS nullable in the real schema (no primaryKey/notNull);
 *    it is kept as `string | null` here. We do not force it to `string` and
 *    we do not invent a surrogate key.
 *  - Avoid the hydrated TableType/FieldType (those add nested relations, which
 *    are not raw rows).
 *  - No new dependencies, no `any`, no `ts-ignore`, no runtime formula eval.
 *
 * Only `id`, `name`-style scalar columns and enum unions are declared; the
 * nested relational helpers (e.g. `fields`, `sourceRelations`) that appear on
 * TableType/FieldType/DatabaseType are deliberately excluded — they are not
 * columns of the underlying tables.
 */

/**
 * Base raw catalog row.
 *
 * `id` is `string | null` because at least one real table (data_types) has a
 * nullable id. Concrete rows whose real id is NOT NULL narrow this to `string`.
 * The index signature lets consumers read stable known columns while still
 * preserving any column added to the real schema later.
 */
export interface CatalogRow {
    id: string | null;
    [column: string]: unknown;
}

/**
 * Raw row of the `databases` table.
 * Source: src/lib/schemas/database-schema.ts
 */
export interface CatalogDatabaseRow extends CatalogRow {
    id: string;
    name: string;
    dialect: "postgres" | "mysql" | "sqlite" | "mariadb";
    numOfTables: number;
    createdAt: string | null;
}

/**
 * Raw row of the `tables` table.
 * Source: src/lib/schemas/table-schema.ts
 */
export interface CatalogTableRow extends CatalogRow {
    id: string;
    databaseId: string;
    name: string;
    posX: number;
    posY: number;
    color: string | null;
    width: number | null;
    note: string | null;
    sequence: number | null;
    createdAt: string | null;
}

/**
 * Raw row of the `fields` table.
 * Source: src/lib/schemas/field-schema.ts
 *
 * `type`/relations from the hydrated `FieldType` are intentionally absent:
 * a raw field row only stores `typeId` as a reference id.
 */
export interface CatalogFieldRow extends CatalogRow {
    id: string;
    tableId: string;
    name: string;
    isPrimary: boolean | null;
    unique: boolean | null;
    nullable: boolean | null;
    defaultValue: string | null;
    note: string | null;
    typeId: string | null;
    sequence: number | null;
    maxLength: number | null;
    unsigned: boolean | null;
    isForeign: boolean | null;
    zeroFill: boolean | null;
    autoIncrement: boolean | null;
    precision: number | null;
    scale: number | null;
    charset: string | null;
    collate: string | null;
    values: string | null;
}

/**
 * Raw row of the `data_types` table.
 * Source: src/lib/schemas/data-type-schema.ts
 *
 * NOTE: `id` is nullable in the real table (plain `text("id")`, no
 * primaryKey/notNull), so it stays `string | null` (inherited from CatalogRow,
 * deliberately NOT narrowed). `modifiers`/`synonyms` are raw text columns
 * (string | null); the upstream `DataType` widens them with `any`, which this
 * contract avoids.
 */
export interface CatalogDataTypeRow extends CatalogRow {
    name: string | null;
    dialect: "postgres" | "mysql" | "sqlite" | "mariadb" | "mssql" | "oracle";
    type: string;
    modifiers: string | null;
    synonyms: string | null;
}

/**
 * Raw row of the `relationships` table.
 * Source: src/lib/schemas/relationship-schema.ts
 *
 * `onDelete`/`onUpdate` carry a default but are not NOT NULL, so their
 * inferred type is `enum | null`. `cardinality` is NOT NULL. The nested
 * `sourceTable`/`targetTable`/... relations from `RelationshipType` are absent.
 */
export interface CatalogRelationshipRow extends CatalogRow {
    id: string;
    name: string | null;
    sourceTableId: string;
    targetTableId: string;
    sourceFieldId: string;
    targetFieldId: string;
    cardinality: "one_to_one" | "one_to_many" | "many_to_one" | "many_to_many";
    onDelete: "no_action" | "cascade" | "set_null" | "set_default" | "restrict" | null;
    onUpdate: "no_action" | "cascade" | "set_null" | "set_default" | "restrict" | null;
    databaseId: string;
    sourceAliasName: string | null;
    targetAliasName: string | null;
    createdAt: string | null;
}

/**
 * Raw row of the `indices` table.
 * Source: src/lib/schemas/index-schema.ts
 */
export interface CatalogIndexRow extends CatalogRow {
    id: string;
    tableId: string;
    name: string;
    unique: boolean | null;
    createdAt: string | null;
}

/**
 * Raw row of the `field_indices` table.
 * Source: src/lib/schemas/field_index-schema.ts
 */
export interface CatalogFieldIndexRow extends CatalogRow {
    id: string;
    fieldId: string;
    indexId: string;
}

/**
 * A full raw snapshot of the catalog: each entity represented by its raw-row
 * list, preserving all real columns and any unknown future columns.
 */
export interface CatalogSnapshot {
    databases: CatalogDatabaseRow[];
    tables: CatalogTableRow[];
    fields: CatalogFieldRow[];
    dataTypes: CatalogDataTypeRow[];
    relationships: CatalogRelationshipRow[];
    indices: CatalogIndexRow[];
    fieldIndices: CatalogFieldIndexRow[];
}

/**
 * Display-name extensions keyed by the stable upstream row ids. These are
 * business metadata only; the canonical names/notes still live on the raw rows
 * and on the upstream schema.
 */
export interface CatalogMetadata {
    tableDisplayNames: Record<string, string>;
    fieldDisplayNames: Record<string, string>;
}
