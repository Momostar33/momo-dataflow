import { uiText, useUiLanguage } from "../i18n";
import { useState } from "react";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { useWorkspace } from "../state/workspace-provider";
import { removeReference, updateReference } from "../domain/references";
import { Modal } from "../components/workbench-ui";
export function ReferenceActions({ refId }: { refId: string }) {
  useUiLanguage();
  const { state, applyOperation } = useWorkspace();
  const [confirm, setConfirm] = useState(false);
  const r = state.draft.business?.refs.find((r) => r.refId === refId);
  if (!r) return null;
  const rules =
    state.draft.business?.rules.filter(
      (rule) =>
        rule.conditions.some(
          (c) => c.left?.refId === refId || c.right?.refId === refId,
        ) ||
        rule.mappings.some(
          (m) =>
            m.target?.refId === refId ||
            m.expr.some((t) => t.kind === "field" && t.refId === refId),
        ),
    ) ?? [];
  return (
    <div className="studio-reference-actions">
      <button
        data-testid={`reference-collapse-${refId}`}
        onClick={() =>
          applyOperation((s) =>
            updateReference(s, { refId, collapsed: !r.collapsed }),
          )
        }
      >
        {r.collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}{" "}
        {r.collapsed ? uiText("展开字段") : uiText("折叠字段")}
      </button>
      <button
        className="danger"
        data-testid={`reference-remove-${refId}`}
        onClick={() => setConfirm(true)}
      >
        <Trash2 size={13} />
        {uiText("移除引用")}
      </button>
      {confirm && (
        <Modal
          title={uiText("移除当前表引用")}
          onClose={() => setConfirm(false)}
        >
          <p>
            {uiText("目录中的表不会删除。会同时删除下列引用此表的字段规则：")}
          </p>
          {rules.length ? (
            <ul>
              {rules.map((rule) => (
                <li key={rule.ruleId}>{rule.name}</li>
              ))}
            </ul>
          ) : (
            <p>{uiText("没有受影响的规则。")}</p>
          )}
          <div className="studio-actions">
            <button
              data-testid="reference-remove-cancel"
              onClick={() => setConfirm(false)}
            >
              {uiText("取消")}
            </button>
            <button
              className="danger"
              data-testid="reference-remove-confirm"
              onClick={() => {
                applyOperation((s) =>
                  removeReference(s, { refId, confirmed: true }),
                );
                setConfirm(false);
              }}
            >
              {uiText("确认移除")}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
