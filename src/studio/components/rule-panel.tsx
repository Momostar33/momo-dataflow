import React, { useEffect, useState, useCallback, useMemo } from "react";
import type { Rule } from "../contracts/business";
import { ConditionsEditor } from "./conditions-editor";
import { ExpressionEditor } from "./expression-editor";
import { useWorkspace } from "../state/workspace-provider";
import { newStableId } from "../state/workspace-state";
import { addRule, updateRule } from "../domain/rules";
import type { ValidationIssue } from "../domain/rule-validation";

/**
 * Props for the RulePanel component.
 *
 * @param flowId   The flow id that the rule belongs to.
 * @param rule     Optional existing rule to edit. If omitted a new rule is created.
 * @param initialCandidate Optional private candidate rule used when creating a new rule.
 * @param onClose  Callback invoked when the panel should be closed
 *                 (after successful apply or when the user cancels).
 */
export interface RulePanelProps {
  flowId: string;
  rule?: Rule;
  initialCandidate?: Rule;
  onClose?: () => void;
}

/**
 * RulePanel component.
 *
 * The component keeps a private, deep‑cloned copy of the rule being edited.
 * For a new rule a fresh UUID is generated and the rule is initialised with
 * empty name/note, empty conditions/mappings and logic "ALL".
 *
 * The panel renders:
 *   - Text inputs for name and note.
 *   - A select for logic (ALL / ANY).
 *   - ConditionsEditor for the rule's conditions.
 *   - ExpressionEditor for the rule's mappings.
 *   - Apply / Cancel buttons.
 *
 * Apply triggers the domain addRule / updateRule via the workspace provider's
 * applyOperation.  On success the panel closes; on failure the error is shown
 * and the draft remains untouched.
 */
export function RulePanel({
  flowId,
  rule,
  initialCandidate,
  onClose,
}: RulePanelProps) {
  const { state, applyOperation } = useWorkspace();
  const business = state.draft.business;
  const catalog = state.draft.catalog;
  const editorBusiness = useMemo(
    () =>
      business
        ? {
            ...business,
            refs: business.refs.filter((r) => r.flowId === flowId),
          }
        : undefined,
    [business, flowId],
  );

  // Local copy of the rule being edited.
  const [candidate, setCandidate] = useState<Rule>(() => {
    if (rule) {
      return structuredClone(rule);
    }
    if (initialCandidate) {
      return structuredClone(initialCandidate);
    }
    return {
      ruleId: newStableId(),
      flowId,
      name: "",
      note: "",
      logic: "ALL",
      conditions: [],
      mappings: [],
    };
  });

  // Error state for failed apply.
  const [invalidExpression, setInvalidExpression] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<ValidationIssue[] | null>(null);

  // Keep local copy in sync when the incoming rule or initialCandidate changes.
  useEffect(() => {
    if (rule) {
      setCandidate(structuredClone(rule));
    } else if (initialCandidate) {
      setCandidate(structuredClone(initialCandidate));
    } else {
      setCandidate({
        ruleId: newStableId(),
        flowId,
        name: "",
        note: "",
        logic: "ALL",
        conditions: [],
        mappings: [],
      });
    }
    setError(null);
    setIssues(null);
  }, [rule, initialCandidate, flowId]);

  const handleApply = useCallback(() => {
    if (!business) {
      setError("Business document missing");
      return;
    }
    const op = rule ? updateRule : addRule;
    const result = applyOperation((s) => op(s, { rule: candidate }));
    if (result.ok) {
      setError(null);
      setIssues(null);
      onClose?.();
    } else {
      setError(result.error.message);
      setIssues(result.error.issues ?? null);
    }
  }, [applyOperation, business, candidate, rule, onClose]);

  const handleCancel = useCallback(() => {
    onClose?.();
  }, [onClose]);

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setCandidate((c) => ({ ...c, name: e.target.value }));
    },
    [],
  );

  const handleNoteChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setCandidate((c) => ({ ...c, note: e.target.value }));
    },
    [],
  );

  const handleConditionsChange = useCallback(
    (payload: { conditions: Rule["conditions"]; logic: "ALL" | "ANY" }) => {
      setCandidate((c) => ({
        ...c,
        conditions: payload.conditions,
        logic: payload.logic,
      }));
    },
    [],
  );

  const handleMappingsChange = useCallback((mappings: Rule["mappings"]) => {
    setCandidate((c) => ({ ...c, mappings }));
  }, []);

  return (
    <div
      data-testid="rule-panel"
      style={{ padding: "1rem", maxWidth: "600px" }}
    >
      <h2>{rule ? "编辑字段规则" : "新建字段规则"}</h2>
      <div style={{ marginBottom: "0.5rem" }}>
        <label>
          规则名称:
          <input
            type="text"
            data-testid="rule-name"
            value={candidate.name}
            onChange={handleNameChange}
            style={{ width: "100%" }}
          />
        </label>
      </div>
      <div style={{ marginBottom: "0.5rem" }}>
        <label>
          备注:
          <input
            type="text"
            data-testid="rule-note"
            value={candidate.note}
            onChange={handleNoteChange}
            style={{ width: "100%" }}
          />
        </label>
      </div>
      {business && catalog && (
        <>
          <ConditionsEditor
            business={editorBusiness!}
            catalog={catalog}
            conditions={candidate.conditions}
            logic={candidate.logic}
            onChange={handleConditionsChange}
          />
          <ExpressionEditor
            business={editorBusiness!}
            catalog={catalog}
            mappings={candidate.mappings}
            onChange={handleMappingsChange}
            onValidityChange={setInvalidExpression}
          />
        </>
      )}
      {error && (
        <div style={{ color: "red", marginTop: "0.5rem" }}>
          <strong>{error}</strong>
          {issues && (
            <pre style={{ whiteSpace: "pre-wrap" }}>
              {JSON.stringify(issues, null, 2)}
            </pre>
          )}
        </div>
      )}
      <div style={{ marginTop: "1rem", textAlign: "right" }}>
        <button
          data-testid="rule-cancel"
          onClick={handleCancel}
          style={{ marginRight: "0.5rem" }}
        >
          取消
        </button>
        <button
          data-testid="rule-apply"
          disabled={invalidExpression}
          onClick={handleApply}
        >
          应用到草稿
        </button>
      </div>
    </div>
  );
}
