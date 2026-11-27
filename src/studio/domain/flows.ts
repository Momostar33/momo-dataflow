// src/studio/domain/flows.ts
import type { WorkspaceState } from "../state/workspace-state";
import { withDraftMutations, newStableId } from "../state/workspace-state";

/**
 * Result of a flow operation.
 * `ok:true` carries the new state; `ok:false` indicates failure with an error.
 * For `addFlow` a `flowId` is also returned on success.
 */
export type FlowOperationResult =
    | { ok: true; state: WorkspaceState; flowId?: string }
    | { ok: false; error: { code: string; message: string } };

/**
 * Add a new flow to the workspace.
 *
 * @param state Current workspace state.
 * @param args  { databaseId, name, note? }
 * @returns Operation result with generated flowId on success.
 */
export function addFlow(
    state: WorkspaceState,
    args: { databaseId: string; name: string; note?: string }
): FlowOperationResult {
    const { databaseId, name, note } = args;

    // Basic validation: business, catalog, database, name
    if (
        !state.draft.business ||
        !state.draft.catalog.databases ||
        !state.draft.catalog.databases.find((db) => db.id === databaseId)
    ) {
        return {
            ok: false,
            error: { code: "MISSING_BUSINESS_OR_DATABASE", message: "Business or database not found" },
        };
    }
    if (!name || name.trim() === "") {
        return {
            ok: false,
            error: { code: "INVALID_NAME", message: "Flow name cannot be empty" },
        };
    }

    // Ensure unique name within the same database
    const existing = state.draft.business.flows.find(
        (f) => f.databaseId === databaseId && f.name === name
    );
    if (existing) {
        return {
            ok: false,
            error: { code: "DUPLICATE_FLOW", message: "Flow name already exists in this database" },
        };
    }

    const flowId = newStableId();

    const next = withDraftMutations(state, (draft) => {
        draft.business!.flows.push({
            flowId,
            databaseId,
            name,
            note: note ?? "",
            steps: [],
        });
    });

    return { ok: true, state: next, flowId };
}

/**
 * Update an existing flow's name and/or note.
 *
 * @param state Current workspace state.
 * @param args  { flowId, name?, note? }
 * @returns Operation result.
 */
export function updateFlow(
    state: WorkspaceState,
    args: { flowId: string; name?: string; note?: string }
): FlowOperationResult {
    const { flowId, name, note } = args;

    if (!state.draft.business) {
        return {
            ok: false,
            error: { code: "MISSING_BUSINESS", message: "Business not found" },
        };
    }

    const flow = state.draft.business.flows.find((f) => f.flowId === flowId);
    if (!flow) {
        return {
            ok: false,
            error: { code: "FLOW_NOT_FOUND", message: "Flow not found" },
        };
    }

    // Validate new name if provided
    if (name !== undefined) {
        if (!name || name.trim() === "") {
            return {
                ok: false,
                error: { code: "INVALID_NAME", message: "Flow name cannot be empty" },
            };
        }
        const duplicate = state.draft.business.flows.find(
            (f) => f.flowId !== flowId && f.databaseId === flow.databaseId && f.name === name
        );
        if (duplicate) {
            return {
                ok: false,
                error: { code: "DUPLICATE_FLOW", message: "Flow name already exists in this database" },
            };
        }
    }

    const next = withDraftMutations(state, (draft) => {
        const f = draft.business!.flows.find((ff) => ff.flowId === flowId)!;
        if (name !== undefined) f.name = name;
        if (note !== undefined) f.note = note;
    });

    return { ok: true, state: next };
}

/**
 * Delete a flow. Requires explicit confirmation.
 *
 * @param state Current workspace state.
 * @param args  { flowId, confirmed }
 * @returns Operation result.
 */
export function deleteFlow(
    state: WorkspaceState,
    args: { flowId: string; confirmed: boolean }
): FlowOperationResult {
    const { flowId, confirmed } = args;

    if (!confirmed) {
        return {
            ok: false,
            error: { code: "CONFIRMATION_REQUIRED", message: "Deletion not confirmed" },
        };
    }

    if (!state.draft.business) {
        return {
            ok: false,
            error: { code: "MISSING_BUSINESS", message: "Business not found" },
        };
    }

    const flow = state.draft.business.flows.find((f) => f.flowId === flowId);
    if (!flow) {
        return {
            ok: false,
            error: { code: "FLOW_NOT_FOUND", message: "Flow not found" },
        };
    }

    const next = withDraftMutations(state, (draft) => {
        // Remove flow
        draft.business!.flows = draft.business!.flows.filter((f) => f.flowId !== flowId);
        // Remove associated refs
        draft.business!.refs = draft.business!.refs.filter((r) => r.flowId !== flowId);
        // Remove associated rules
        draft.business!.rules = draft.business!.rules.filter((r) => r.flowId !== flowId);
    });

    return { ok: true, state: next };
}
