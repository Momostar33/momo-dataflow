import { uiText, useUiLanguage } from "../i18n";
import React from "react";
import type { Condition, BusinessDocument } from "../contracts/business";
import type { CatalogSnapshot } from "../contracts/catalog";
import { FieldPicker } from "./field-picker";
import { newStableId } from "../state/workspace-state";
export interface ConditionsEditorProps {
  business: BusinessDocument;
  catalog: CatalogSnapshot;
  conditions: Condition[];
  logic: "ALL" | "ANY";
  onChange: (payload: {
    conditions: Condition[];
    logic: "ALL" | "ANY";
  }) => void;
}
export function ConditionsEditor({
  business,
  catalog,
  conditions,
  logic,
  onChange,
}: ConditionsEditorProps) {
  useUiLanguage();
  const handleConditionChange = (
    index: number,
    side: "left" | "right",
    value: {
      refId: string;
      fieldId: string;
    } | null,
  ) => {
    const newConditions = conditions.map((c, i) =>
      i === index ? { ...c, [side]: value } : c,
    );
    onChange({ conditions: newConditions, logic });
  };
  const handleRemove = (index: number) => {
    const newConditions = conditions.filter((_, i) => i !== index);
    onChange({ conditions: newConditions, logic });
  };
  const handleAdd = () => {
    const newCondition: Condition = {
      id: newStableId(),
      left: null,
      right: null,
    };
    onChange({ conditions: [...conditions, newCondition], logic });
  };
  const handleLogicChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLogic = e.target.value as "ALL" | "ANY";
    onChange({ conditions, logic: newLogic });
  };
  return (
    <section className="studio-editor-card studio-conditions">
      <h3>{uiText("匹配条件")}</h3>
      <div style={{ marginBottom: "0.5rem" }}>
        <label>
          {uiText("条件组合:")}
          <select
            value={logic}
            onChange={handleLogicChange}
            data-testid="condition-logic"
          >
            <option value="ALL">{uiText("全部满足（AND）")}</option>
            <option value="ANY">{uiText("任一满足（OR）")}</option>
          </select>
        </label>
      </div>
      {conditions.map((cond, idx) => (
        <div key={cond.id} className="studio-condition-row">
          <FieldPicker
            business={business}
            catalog={catalog}
            fixedRefId={
              business.refs.length <= 2
                ? (cond.left?.refId ?? business.refs[0]?.refId)
                : undefined
            }
            value={cond.left}
            onChange={(v) => handleConditionChange(idx, "left", v)}
            refTestId={`condition-left-ref-${idx}`}
            fieldTestId={`condition-left-field-${idx}`}
          />
          <span className="studio-condition-equals">=</span>
          <FieldPicker
            business={business}
            catalog={catalog}
            fixedRefId={
              business.refs.length <= 2
                ? (cond.right?.refId ??
                  business.refs[1]?.refId ??
                  business.refs[0]?.refId)
                : undefined
            }
            value={cond.right}
            onChange={(v) => handleConditionChange(idx, "right", v)}
            refTestId={`condition-right-ref-${idx}`}
            fieldTestId={`condition-right-field-${idx}`}
          />
          <button
            type="button"
            onClick={() => handleRemove(idx)}
            className="studio-remove-condition"
            data-testid={`remove-condition-${idx}`}
          >
            {uiText("删除条件")}
          </button>
        </div>
      ))}
      <button type="button" onClick={handleAdd} data-testid="add-condition">
        {uiText("添加匹配条件")}
      </button>
    </section>
  );
}
