import { withDraftMutations } from "../state/workspace-state";
import type { WorkspaceState } from "../state/workspace-state";

export interface TablePatchChanges {
    /** Display name (metadata). Undefined means no change. */
    displayName?: string | null;
    /** Alias for displayName used in tests. */
    label?: string | null;
    /** Table note. Undefined means no change. */
    note?: string | null;
}

export interface FieldPatchChanges {
    /** Technical name (field name). Undefined means no change. */
    name?: string | null;
    /** Display name (metadata). Undefined means no change. */
    displayName?: string | null;
    /** Field note. Undefined means no change. */
    note?: string | null;
    /** Type ID. Undefined means no change; null clears the type. */
    typeId?: string | null;
    /** Precision. Undefined means no change; null clears. */
    precision?: number | null;
    /** Scale. Undefined means no change; null clears. */
    scale?: number | null;
    /** Max length. Undefined means no change; null clears. */
    maxLength?: number | null;
    /** Nullable flag. Undefined means no change; null clears. */
    nullable?: boolean | null;
    /** Primary key flag. Undefined means no change; null clears. */
    isPrimary?: boolean | null;
    /** Unique flag. Undefined means no change; null clears. */
    unique?: boolean | null;
    /** Default value. Undefined means no change; null clears. */
    defaultValue?: string | null;
}

export interface TablePatchArgs {
    tableId: string;
    changes: TablePatchChanges;
}

export interface FieldPatchArgs {
    fieldId: string;
    changes: FieldPatchChanges;
}

export type CatalogOpResult =
    | { ok: true; state: WorkspaceState }
    | { ok: false; error: { code: string; message: string } };

export type FieldOpResult =
    | { ok: true; state: WorkspaceState }
    | { ok: false; error: { code: string; message: string } };

// Helper to find table in current state draft
function findTable(state: WorkspaceState, tableId: string) {
    return state.draft.catalog.tables.find((t) => t.id === tableId);
}

// Helper to find field in current state draft
function findField(state: WorkspaceState, fieldId: string) {
    return state.draft.catalog.fields.find((f) => f.id === fieldId);
}

export function applyTablePatch(state: WorkspaceState, args: TablePatchArgs): CatalogOpResult {
    const { tableId, changes } = args;
    const table = findTable(state, tableId);
    if (!table) {
        return { ok: false, error: { code: "TABLE_NOT_FOUND", message: "Table not found." } };
    }
    // Validate allowed keys
    const allowed = new Set(["displayName", "label", "note"]);
    for (const key of Object.keys(changes)) {
        if (!allowed.has(key)) {
            return { ok: false, error: { code: "INVALID_PATCH_KEY", message: `Unexpected key '${key}'.` } };
        }
    }
    const { displayName, label, note } = changes;
    const display = displayName ?? label;
    // If no actual changes, return same state
    if (displayName === undefined && label === undefined && note === undefined) {
        return { ok: true, state };
    }
    const next = withDraftMutations(state, (draft) => {
        const tbl = draft.catalog.tables.find((t) => t.id === tableId);
        if (!tbl) return;
        if (display !== undefined) {
            if (display) {
                draft.metadata.tableDisplayNames[tableId] = display;
            } else {
                delete draft.metadata.tableDisplayNames[tableId];
            }
        }
        if (note !== undefined) {
            tbl.note = note ?? null;
        }
    });
    return { ok: true, state: next };
}

export function applyFieldPatch(state: WorkspaceState, args: FieldPatchArgs): FieldOpResult {
    const { fieldId, changes } = args;
    const field = findField(state, fieldId);
    if (!field) {
        return { ok: false, error: { code: "FIELD_NOT_FOUND", message: "Field not found." } };
    }
    const allowed = new Set([
        "name",
        "displayName",
        "note",
        "typeId",
        "precision",
        "scale",
        "maxLength",
        "nullable",
        "isPrimary",
        "unique",
        "defaultValue",
    ]);
    for (const key of Object.keys(changes)) {
        if (!allowed.has(key)) {
            return { ok: false, error: { code: "INVALID_PATCH_KEY", message: `Unexpected key '${key}'.` } };
        }
    }
    const {
        name,
        displayName,
        note,
        typeId,
        precision,
        scale,
        maxLength,
        nullable,
        isPrimary,
        unique,
        defaultValue,
    } = changes;
    const { catalog } = state.draft;
    // Validate typeId
    if (typeId !== undefined) {
        if (typeId !== null) {
            const exists = catalog.dataTypes.some((dt) => dt.id !== null && dt.id === typeId);
            if (!exists) {
                return { ok: false, error: { code: "TYPE_NOT_FOUND", message: "Type not found." } };
            }
        }
    }
    // Validate name
    if (name !== undefined) {
        const trimmed = name?.trim();
        if (!trimmed) {
            return { ok: false, error: { code: "EMPTY_NAME", message: "Name cannot be empty." } };
        }
        const siblings = catalog.fields.filter((f) => f.tableId === field.tableId && f.id !== field.id);
        const dup = siblings.some((f) => f.name.trim() === trimmed);
        if (dup) {
            return { ok: false, error: { code: "DUPLICATE_NAME", message: "Duplicate name." } };
        }
    }
    const next = withDraftMutations(state, (draft) => {
        const fld = draft.catalog.fields.find((f) => f.id === fieldId);
        if (!fld) return;
        if (name !== undefined) {
            fld.name = name === null ? "" : name.trim();
        }
        if (displayName !== undefined) {
            if (displayName) {
                draft.metadata.fieldDisplayNames[fieldId] = displayName;
            } else {
                delete draft.metadata.fieldDisplayNames[fieldId];
            }
        }
        if (note !== undefined) {
            fld.note = note ?? null;
        }
        if (typeId !== undefined) {
            fld.typeId = typeId;
            if (typeId === null) {
                fld.precision = null;
                fld.scale = null;
            }
        }
        if (precision !== undefined) {
            fld.precision = precision;
        }
        if (scale !== undefined) {
            fld.scale = scale;
        }
        if (maxLength !== undefined) {
            fld.maxLength = maxLength;
        }
        if (nullable !== undefined) {
            fld.nullable = nullable;
        }
        if (isPrimary !== undefined) {
            fld.isPrimary = isPrimary;
        }
        if (unique !== undefined) {
            fld.unique = unique;
        }
        if (defaultValue !== undefined) {
            fld.defaultValue = defaultValue;
        }
    });
    return { ok: true, state: next };
}
