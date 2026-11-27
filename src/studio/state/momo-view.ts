// src/studio/state/momo-view.ts
import { useWorkspace } from "./workspace-provider";
import { projectCatalog } from "../projection/catalog-view";
import {
    addTable,
    renameTable,
    deleteTable,
} from "../domain/catalog-tables";
import { applyTablePatch, TablePatchArgs } from "../projection/catalog-patch";
import {
    addField,
    renameField,
    deleteField,
    moveField,
} from "../domain/catalog-fields";
import { applyFieldPatch, FieldPatchArgs } from "../projection/catalog-patch";
import { validateFieldTypeChange } from "../domain/rule-validation";
import { getCatalogUsage } from "../domain/catalog-usage";

/**
 * Hook that exposes a read‑only view of the catalog and a set of
 * table‑level operations that operate directly on the workspace state.
 *
 * The returned object contains all members of the original WorkspaceContext
 * plus:
 *   - `view`: a projected read‑only view of the catalog.
 *   - `addTable`, `renameTable`, `deleteTable`, `patchTable`: thin wrappers
 *     that forward arguments to the corresponding domain functions via
 *     `ctx.applyOperation`.
 *   - `addField`, `renameField`, `deleteField`, `moveField`, `patchField`: thin wrappers
 *     that forward arguments to the corresponding domain functions via
 *     `ctx.applyOperation`. `patchField` performs type‑prevalidation
 *     before delegating to `applyFieldPatch`.
 *
 * The wrappers return the full discriminated result from the domain
 * functions (including `tableId` on successful `addTable`).
 */
export function useMomoWorkspace() {
    const ctx = useWorkspace();

    const view = projectCatalog(
        ctx.state.draft.catalog,
        ctx.state.draft.metadata
    );

    // Table wrappers
    const addTableWrapper = (
        args: Parameters<typeof addTable>[1]
    ) => ctx.applyOperation((state) => addTable(state, args));

    const renameTableWrapper = (
        args: Parameters<typeof renameTable>[1]
    ) => ctx.applyOperation((state) => renameTable(state, args));

    const deleteTableWrapper = (
        args: Parameters<typeof deleteTable>[1]
    ) => {
        const { blocked } = getCatalogUsage(
            ctx.state.draft,
            "table",
            args.tableId
        );
        if (blocked) {
            return {
                ok: false,
                error: {
                    code: "TABLE_DELETION_BLOCKED",
                    message: "Deletion blocked due to existing usage",
                },
            } as const;
        }
        return ctx.applyOperation((state) => deleteTable(state, args));
    };

    const patchTableWrapper = (
        args: TablePatchArgs
    ) => ctx.applyOperation((state) => applyTablePatch(state, args));

    // Field wrappers
    const addFieldWrapper = (
        args: Parameters<typeof addField>[1]
    ) => ctx.applyOperation((state) => addField(state, args));

    const renameFieldWrapper = (
        args: Parameters<typeof renameField>[1]
    ) => ctx.applyOperation((state) => renameField(state, args));

    const deleteFieldWrapper = (
        args: Parameters<typeof deleteField>[1]
    ) => {
        const { blocked } = getCatalogUsage(
            ctx.state.draft,
            "field",
            args.fieldId
        );
        if (blocked && !args.confirmed) {
            return {
                ok: false,
                error: {
                    code: "FIELD_DELETION_BLOCKED",
                    message: "Deletion blocked due to existing usage",
                },
            } as const;
        }
        return ctx.applyOperation((state) => deleteField(state, args));
    };

    const moveFieldWrapper = (
        args: Parameters<typeof moveField>[1]
    ) => ctx.applyOperation((state) => moveField(state, args));

    const patchFieldWrapper = (
        args: FieldPatchArgs
    ) => ctx.applyOperation((state) => {
        // Locate current field
        const currentField = state.draft.catalog.fields.find(
            (f) => f.id === args.fieldId
        );
        if (!currentField) {
            return {
                ok: false,
                error: {
                    code: "FIELD_NOT_FOUND",
                    message: "Field not found",
                },
            } as const;
        }

        // Build final change for type validation
        const finalChange = {
            fieldId: args.fieldId,
            typeId:
                args.changes.typeId === undefined
                    ? currentField.typeId
                    : args.changes.typeId,
            precision:
                args.changes.typeId === null
                    ? null
                    : args.changes.precision === undefined
                    ? currentField.precision
                    : args.changes.precision,
            scale:
                args.changes.typeId === null
                    ? null
                    : args.changes.scale === undefined
                    ? currentField.scale
                    : args.changes.scale,
            maxLength:
                args.changes.maxLength === undefined
                    ? currentField.maxLength
                    : args.changes.maxLength,
        };

        const issues = validateFieldTypeChange(
            {
                catalog: state.draft.catalog,
                business: state.draft.business,
            },
            finalChange
        );

        if (issues.length > 0) {
            return {
                ok: false as const,
                error: {
                    code: "FIELD_TYPE_ERROR",
                    message: issues[0].message,
                    issues,
                },
            } as const;
        }

        // No validation errors – apply the patch
        return applyFieldPatch(state, args);
    });

    return {
        ...ctx,
        view,
        addTable: addTableWrapper,
        renameTable: renameTableWrapper,
        deleteTable: deleteTableWrapper,
        patchTable: patchTableWrapper,
        addField: addFieldWrapper,
        renameField: renameFieldWrapper,
        deleteField: deleteFieldWrapper,
        moveField: moveFieldWrapper,
        patchField: patchFieldWrapper,
    };
}
