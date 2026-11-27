import type { WorkspaceState } from "../state/workspace-state";
import { withDraftMutations, stableStringify } from "../state/workspace-state";
import { previewTemplateApplication } from "./template-preview";
import type { TemplatePreview } from "./template-preview";

/**
 * Apply a previously generated template preview to the workspace state.
 *
 * The function follows the exact sequence of checks defined in the task
 * description:
 *
 * 1. Verify that the preview fingerprint matches the current state.
 * 2. Re‑run the preview to ensure it is still valid.
 * 3. Ensure the preview data (fieldIds + changes) has not been tampered.
 * 4. Reject if the fresh preview contains validation issues.
 * 5. If all checks pass, apply the changes atomically via
 *    `withDraftMutations`.  The changes affect only the four type
 *    parameters (`typeId`, `precision`, `scale`, `maxLength`) of the
 *    affected fields and the corresponding assignments.
 *
 * The function never mutates the input state; it returns a new state
 * object on success or the original state on failure.
 */
export function applyTemplatePreview(
    state: WorkspaceState,
    params: { preview: TemplatePreview }
):
    | { ok: true; state: WorkspaceState }
    | { ok: false; error: { code: string; message: string; issues?: any[] } } {
    const { preview } = params;

    // 1. Fingerprint check
    const currentFingerprint = stableStringify({
        catalog: state.draft.catalog,
        metadata: state.draft.metadata,
        business: state.draft.business,
    });
    if (preview.baselineFingerprint !== currentFingerprint) {
        return {
            ok: false,
            error: { code: "STALE_PREVIEW", message: "Stale preview" },
        };
    }

    // 2. Re‑run preview
    const fresh = previewTemplateApplication(state, {
        templateId: preview.templateId,
        version: preview.version,
        fieldIds: preview.fieldIds,
    });
    if (!fresh.ok) {
        // Forward the error from the fresh preview
        return { ok: false, error: fresh.error };
    }

    // 3. Tamper check
    const previewKey = stableStringify({
        fieldIds: preview.fieldIds,
        changes: preview.changes,
    });
    const freshKey = stableStringify({
        fieldIds: fresh.preview.fieldIds,
        changes: fresh.preview.changes,
    });
    if (previewKey !== freshKey) {
        return {
            ok: false,
            error: { code: "TAMPERED_PREVIEW", message: "Tampered preview" },
        };
    }

    // 4. Validation issues
    if (fresh.preview.issues.length > 0) {
        return {
            ok: false,
            error: {
                code: "VALIDATION_FAILED",
                message: "Validation failed",
                issues: fresh.preview.issues,
            },
        };
    }

    // 5. Apply changes atomically
    const newState = withDraftMutations(state, (draft) => {
        // Apply field type changes
        preview.changes.forEach((c) => {
            const field = draft.catalog.fields.find((f) => f.id === c.fieldId);
            if (!field) return;
            field.typeId = c.after.typeId;
            field.precision = c.after.precision;
            field.scale = c.after.scale;
            field.maxLength = c.after.maxLength;
        });

        // Update or add assignments
        const business = draft.business;
        if (!business) return;
        preview.changes.forEach((c) => {
            const existing = business.assignments.find(
                (a) => a.fieldId === c.fieldId
            );
            if (existing) {
                existing.templateId = preview.templateId;
                existing.appliedVersion = preview.version;
            } else {
                business.assignments.push({
                    fieldId: c.fieldId,
                    templateId: preview.templateId,
                    appliedVersion: preview.version,
                });
            }
        });
    });

    return { ok: true, state: newState };
}
