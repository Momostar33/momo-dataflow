import { nextRelationName } from "../domain/relation-names";
import { useEffect, useState, useMemo } from "react";
import type { Rule } from "../contracts/business";
import { ConditionsEditor } from "./conditions-editor";
import { ExpressionEditor } from "./expression-editor";
import { useWorkspace } from "../state/workspace-provider";
import { newStableId } from "../state/workspace-state";
import { addRule, updateRule } from "../domain/rules";
import {
  ruleReferenceIds,
  scopeRuleEditor,
  ruleScopeLabel,
  prepareScopedRule,
} from "../domain/rule-editor-scope";
import type { ValidationIssue } from "../domain/rule-validation";
export interface RulePanelProps {
  flowId: string;
  rule?: Rule;
  initialCandidate?: Rule;
  onClose?: () => void;
  onDelete?: () => void;
}
export function RulePanel({
  flowId,
  rule,
  initialCandidate,
  onClose,
  onDelete,
}: RulePanelProps) {
  const { state, applyOperation } = useWorkspace();
  const fresh = (): Rule =>
    structuredClone(
      rule ??
        initialCandidate ?? {
          ruleId: newStableId(),
          flowId,
          name: nextRelationName(state.draft.business, flowId),
          note: "",
          logic: "ALL",
          conditions: [],
          mappings: [],
        },
    );
  const [candidate, setCandidate] = useState<Rule>(fresh);
  const [allowed, setAllowed] = useState<string[]>(() =>
    ruleReferenceIds(rule ?? initialCandidate),
  );
  const [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const [error, setError] = useState(""),
    [issues, setIssues] = useState<ValidationIssue[]>([]),
    [invalidExpression, setInvalidExpression] = useState(false);
  useEffect(() => {
    setCandidate(fresh());
    setAllowed(ruleReferenceIds(rule ?? initialCandidate));
    setFrom("");
    setTo("");
    setError("");
    setIssues([]);
    setInvalidExpression(false);
  }, [rule?.ruleId, initialCandidate?.ruleId, flowId]);
  const editor = useMemo(() => {
    try {
      return { data: scopeRuleEditor(state.draft, flowId, allowed), error: "" };
    } catch (e) {
      return { data: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [state.draft, flowId, allowed]);
  const flowRefs =
    state.draft.business?.refs.filter((r) => r.flowId === flowId) ?? [];
  const [showExpressionErrors, setShowExpressionErrors] = useState(false);
  function apply() {
    if (invalidExpression) {
      setShowExpressionErrors(true);
      return;
    }
    try {
      const result = applyOperation((s) =>
        (rule ? updateRule : addRule)(s, {
          rule: prepareScopedRule(s.draft, candidate, allowed),
        }),
      );
      if (result.ok) onClose?.();
      else {
        setError(result.error.message);
        setIssues(result.error.issues ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  return (
    <section data-testid="rule-panel" className="studio-rule-editor">
      <div className="studio-editor-heading">
        <span className="studio-eyebrow">字段关系</span>
        <h2>{rule ? "编辑字段规则" : "新建字段规则"}</h2>
      </div>
      {allowed.length ? (
        <section className="studio-bound-pair" aria-label="已连接的表">
          <strong>已连接的表</strong>
          {allowed.map((id, i) => (
            <div key={id}>
              <span className="studio-endpoint-number">{i + 1}</span>
              <span title={ruleScopeLabel(state.draft, id)}>
                {ruleScopeLabel(state.draft, id)}
              </span>
            </div>
          ))}
          <p>仅使用以上表的字段，可继续添加匹配条件和映射。</p>
        </section>
      ) : (
        <section className="studio-editor-card">
          <h3>先选择关系两端</h3>
          <p className="studio-help">
            也可直接从画布上连接两个字段，自动带入对象。
          </p>
          <label>
            来源表
            <select
              data-testid="rule-scope-source"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            >
              <option value="">选择当前流程的表</option>
              {flowRefs.map((r) => (
                <option key={r.refId} value={r.refId}>
                  {ruleScopeLabel(state.draft, r.refId)}
                </option>
              ))}
            </select>
          </label>
          <label>
            目标表
            <select
              data-testid="rule-scope-target"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            >
              <option value="">选择当前流程的表</option>
              {flowRefs.map((r) => (
                <option key={r.refId} value={r.refId}>
                  {ruleScopeLabel(state.draft, r.refId)}
                </option>
              ))}
            </select>
          </label>
          <button
            data-testid="rule-scope-confirm"
            disabled={!from || !to}
            onClick={() => setAllowed([...new Set([from, to])])}
          >
            使用这两张表
          </button>
        </section>
      )}
      <label>
        规则名称
        <input
          data-testid="rule-name"
          value={candidate.name}
          placeholder="自动命名"
          onChange={(e) =>
            setCandidate((c) => ({ ...c, name: e.target.value }))
          }
        />
      </label>
      <details className="studio-editor-details">
        <summary>备注说明（可选）</summary>
        <label>
          备注
          <input
            data-testid="rule-note"
            value={candidate.note}
            onChange={(e) =>
              setCandidate((c) => ({ ...c, note: e.target.value }))
            }
          />
        </label>
      </details>
      {!!allowed.length && editor.data && (
        <>
          <ConditionsEditor
            business={editor.data.business}
            catalog={editor.data.catalog}
            conditions={candidate.conditions}
            logic={candidate.logic}
            onChange={(v) => setCandidate((c) => ({ ...c, ...v }))}
          />
          <ExpressionEditor
            business={editor.data.business}
            catalog={editor.data.catalog}
            mappings={candidate.mappings}
            onChange={(mappings) => setCandidate((c) => ({ ...c, mappings }))}
            onValidityChange={setInvalidExpression}
            showErrors={showExpressionErrors}
          />
        </>
      )}
      {(error || editor.error) && (
        <div role="alert" className="studio-error">
          {error || editor.error}
          {!!issues.length && (
            <ul>
              {issues.map((v, i) => (
                <li key={i}>{v.message}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="studio-editor-actions">
        {onDelete && (
          <button
            className="danger"
            data-testid="rule-delete"
            onClick={onDelete}
          >
            删除
          </button>
        )}
        <button data-testid="rule-cancel" onClick={onClose}>
          取消
        </button>
        <button
          className="primary"
          data-testid="rule-apply"
          disabled={!allowed.length || !!editor.error}
          onClick={apply}
        >
          保存关系
        </button>
      </div>
    </section>
  );
}
