import type { WorkspaceState } from "../state/workspace-state";
import type { Rule } from "../contracts/business";
import type { ValidationIssue } from "./rule-validation";
import { withDraftMutations } from "../state/workspace-state";
import { validateRule } from "./rule-validation";

/**
 * Result of attempting to add a rule to the workspace.
 * - ok:true  → state contains the new rule
 * - ok:false → error contains code, message and optional ValidationIssue[].
 */
export type AddRuleResult =
    | { ok: true; state: WorkspaceState }
    | { ok: false; error: { code: string; message: string; issues?: ValidationIssue[] } };

/**
 * Add a new rule to the current workspace.
 *
 * The function performs the following steps in order:
 * 1. Clone the incoming rule (structuredClone) to avoid mutating the caller's object.
 * 2. Ensure the ruleId is unique across all existing rules.
 * 3. Run the existing validateRule helper to collect any rule‑level validation issues.
 * 4. Detect duplicate target FieldTokens (refId + fieldId) within the same flow
 *    across all other rules.  Any duplicates are added to the issue list.
 * 5. If any issues exist, return an error result without mutating the state.
 * 6. Otherwise, push the cloned rule into the business.rules array via
 *    withDraftMutations and return the new state.
 *
 * The function never mutates the original state or the supplied rule object.
 */
export function addRule(
    state: WorkspaceState,
    { rule }: { rule: Rule }
): AddRuleResult {
    // 1. Clone the candidate rule
    const candidate = structuredClone(rule);

    const business = state.draft.business;
    const catalog = state.draft.catalog;

    if (!business) {
        return {
            ok: false,
            error: {
                code: "no_business",
                message: "Business document missing",
            },
        };
    }

    // 2. Ensure ruleId uniqueness
    if (business.rules.some((r) => r.ruleId === candidate.ruleId)) {
        return {
            ok: false,
            error: {
                code: "duplicate_rule_id",
                message: `Duplicate ruleId: ${candidate.ruleId}`,
                issues: [
                    {
                        code: "rule_error",
                        message: `Duplicate ruleId: ${candidate.ruleId}`,
                        ruleId: candidate.ruleId,
                    },
                ],
            },
        };
    }

    // 3. Validate rule with existing helper
    const issues: ValidationIssue[] = validateRule(candidate, business, catalog);

    // 4. Detect duplicate target tokens across rules in the same flow
    const duplicateTargetIssues: ValidationIssue[] = [];
    for (const m of candidate.mappings) {
        if (!m.target) continue;
        const { refId, fieldId } = m.target;
        for (const r of business.rules) {
            if (r.flowId !== candidate.flowId) continue;
            for (const rm of r.mappings) {
                if (!rm.target) continue;
                if (rm.target.refId === refId && rm.target.fieldId === fieldId) {
                    duplicateTargetIssues.push({
                        code: "rule_error",
                        message: `Duplicate target field in flow ${candidate.flowId}`,
                        ruleId: candidate.ruleId,
                        flowId: candidate.flowId,
                        refId,
                        fieldId,
                        path: "mappings",
                    });
                }
            }
        }
    }

    const allIssues = [...issues, ...duplicateTargetIssues];
    if (allIssues.length > 0) {
        return {
            ok: false,
            error: {
                code: "rule_error",
                message: "Validation failed",
                issues: allIssues,
            },
        };
    }

    // 5. Push the cloned rule into the business.rules array
    const next = withDraftMutations(state, (draft) => {
        draft.business!.rules.push(candidate);
    });

    return { ok: true, state: next };
}

/**
 * Update an existing rule in the workspace.
 *
 * The function:
 * 1. Clones the supplied rule to avoid mutating the caller's object.
 * 2. Finds the existing rule by ruleId; if not found, returns an error.
 * 3. Validates the cloned rule with validateRule and duplicate‑target checks
 *    (excluding the rule itself).
 * 4. If any validation issues exist, returns an error without mutating the state.
 * 5. Otherwise, replaces the existing rule with the cloned one via
 *    withDraftMutations and returns the new state.
 */
export function updateRule(
    state: WorkspaceState,
    { rule }: { rule: Rule }
): AddRuleResult {
    const candidate = structuredClone(rule);

    const business = state.draft.business;
    const catalog = state.draft.catalog;

    if (!business) {
        return {
            ok: false,
            error: {
                code: "no_business",
                message: "Business document missing",
            },
        };
    }

    const existingIndex = business.rules.findIndex((r) => r.ruleId === candidate.ruleId);
    if (existingIndex === -1) {
        return {
            ok: false,
            error: {
                code: "rule_not_found",
                message: `Rule not found: ${candidate.ruleId}`,
            },
        };
    }

    // Validate rule
    const issues: ValidationIssue[] = validateRule(candidate, business, catalog);

    // Duplicate target check excluding itself
    const duplicateTargetIssues: ValidationIssue[] = [];
    for (const m of candidate.mappings) {
        if (!m.target) continue;
        const { refId, fieldId } = m.target;
        for (const r of business.rules) {
            if (r.ruleId === candidate.ruleId) continue;
            if (r.flowId !== candidate.flowId) continue;
            for (const rm of r.mappings) {
                if (!rm.target) continue;
                if (rm.target.refId === refId && rm.target.fieldId === fieldId) {
                    duplicateTargetIssues.push({
                        code: "rule_error",
                        message: `Duplicate target field in flow ${candidate.flowId}`,
                        ruleId: candidate.ruleId,
                        flowId: candidate.flowId,
                        refId,
                        fieldId,
                        path: "mappings",
                    });
                }
            }
        }
    }

    const allIssues = [...issues, ...duplicateTargetIssues];
    if (allIssues.length > 0) {
        return {
            ok: false,
            error: {
                code: "rule_error",
                message: "Validation failed",
                issues: allIssues,
            },
        };
    }

    const next = withDraftMutations(state, (draft) => {
        draft.business!.rules[existingIndex] = candidate;
    });

    return { ok: true, state: next };
}

/**
 * Delete a rule from the workspace by ruleId.
 *
 * The function:
 * 1. Finds the rule by ruleId; if not found, returns an error.
 * 2. Removes the rule from business.rules via withDraftMutations.
 * 3. Returns the new state; other rules, refs, and catalog remain unchanged.
 */
export function deleteRule(
    state: WorkspaceState,
    { ruleId }: { ruleId: string }
): AddRuleResult {
    const business = state.draft.business;

    if (!business) {
        return {
            ok: false,
            error: {
                code: "no_business",
                message: "Business document missing",
            },
        };
    }

    const index = business.rules.findIndex((r) => r.ruleId === ruleId);
    if (index === -1) {
        return {
            ok: false,
            error: {
                code: "rule_not_found",
                message: `Rule not found: ${ruleId}`,
            },
        };
    }

    const next = withDraftMutations(state, (draft) => {
        draft.business!.rules.splice(index, 1);
    });

    return { ok: true, state: next };
}
