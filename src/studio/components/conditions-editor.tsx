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
  const handleConditionChange = (
    index: number,
    side: "left" | "right",
    value: { refId: string; fieldId: string } | null,
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
    <div>
      <div style={{ marginBottom: "0.5rem" }}>
        <label>
          条件组合:
          <select
            value={logic}
            onChange={handleLogicChange}
            data-testid="condition-logic"
          >
            <option value="ALL">全部满足（AND）</option>
            <option value="ANY">任一满足（OR）</option>
          </select>
        </label>
      </div>
      {conditions.map((cond, idx) => (
        <div key={cond.id} style={{ marginBottom: "0.5rem" }}>
          <FieldPicker
            business={business}
            catalog={catalog}
            value={cond.left}
            onChange={(v) => handleConditionChange(idx, "left", v)}
            refTestId={`condition-left-ref-${idx}`}
            fieldTestId={`condition-left-field-${idx}`}
          />
          <span style={{ margin: "0 0.5rem" }}>=</span>
          <FieldPicker
            business={business}
            catalog={catalog}
            value={cond.right}
            onChange={(v) => handleConditionChange(idx, "right", v)}
            refTestId={`condition-right-ref-${idx}`}
            fieldTestId={`condition-right-field-${idx}`}
          />
          <button
            type="button"
            onClick={() => handleRemove(idx)}
            style={{ marginLeft: "0.5rem" }}
            data-testid={`remove-condition-${idx}`}
          >
            删除条件
          </button>
        </div>
      ))}
      <button type="button" onClick={handleAdd} data-testid="add-condition">
        添加匹配条件
      </button>
    </div>
  );
}
