import { useState, useEffect, useMemo } from "react";
import type {
  BusinessDocument,
  FieldToken,
  Mapping,
} from "../contracts/business";
import type { CatalogSnapshot } from "../contracts/catalog";
import { FieldPicker } from "./field-picker";
import { Modal } from "./workbench-ui";
import {
  fieldAliases,
  formatExpression,
  parseExpressionInput,
} from "../domain/expression-input";
export interface ExpressionEditorProps {
  business: BusinessDocument;
  catalog: CatalogSnapshot;
  mappings: Mapping[];
  onChange: (m: Mapping[]) => void;
  onValidityChange?: (invalid: boolean) => void;
}
export function ExpressionEditor({
  business,
  catalog,
  mappings,
  onChange,
  onValidityChange,
}: ExpressionEditorProps) {
  const aliases = useMemo(
    () => fieldAliases(business, catalog),
    [business, catalog],
  );
  const [inputs, setInputs] = useState<Record<string, string>>({}),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [picker, setPicker] = useState<string | null>(null),
    [pending, setPending] = useState<FieldToken | null>(null);
  useEffect(() => {
    setInputs(
      Object.fromEntries(
        mappings.map((m) => [m.id, formatExpression(m.expr, aliases)]),
      ),
    );
  }, [mappings, aliases]);
  const invalid = mappings.some((m) => !!errors[m.id]);
  useEffect(() => {
    onValidityChange?.(invalid);
    return () => onValidityChange?.(false);
  }, [invalid, onValidityChange]);
  function update(id: string, patch: Partial<Mapping>) {
    onChange(mappings.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }
  function edit(m: Mapping, value: string) {
    setInputs((s) => ({ ...s, [m.id]: value }));
    const parsed = parseExpressionInput(value, aliases);
    setErrors((s) => ({ ...s, [m.id]: parsed.error ?? "" }));
    if (!parsed.error) update(m.id, { expr: parsed.tokens });
  }
  return (
    <div>
      <h3>字段映射 / 运算说明</h3>
      <p className="studio-help">
        目标字段 = 来源表达式。选择字段后，可直接输入 + − * /
        与括号；只保存逻辑，不执行计算。
      </p>
      {mappings.map((m, i) => (
        <section key={m.id} className="studio-rule-mapping">
          <label>
            目标字段
            <FieldPicker
              business={business}
              catalog={catalog}
              value={m.target}
              onChange={(target) => update(m.id, { target })}
              refTestId={`mapping-target-ref-${i}`}
              fieldTestId={`mapping-target-field-${i}`}
            />
          </label>
          <label>
            来源表达式
            <textarea
              data-testid={`mapping-expression-${i}`}
              value={inputs[m.id] ?? formatExpression(m.expr, aliases)}
              onChange={(e) => edit(m, e.target.value)}
              placeholder="选择字段，或输入数字和四则运算"
            />
          </label>
          {errors[m.id] && (
            <p role="alert" className="studio-error">
              {errors[m.id]}；未改动原表达式，应用已阻止。
            </p>
          )}
          <div>
            {m.expr
              .filter((t) => t.kind === "field")
              .map((t, n) => (
                <span key={n} className="studio-token-chip">
                  {aliases.find(
                    (a) => a.refId === t.refId && a.fieldId === t.fieldId,
                  )?.label ?? "失效字段"}
                </span>
              ))}
          </div>
          <div className="studio-expression-tools">
            <button
              data-testid={`mapping-add-field-${i}`}
              onClick={() => {
                setPicker(m.id);
                setPending(null);
              }}
            >
              插入字段
            </button>
            {["+", "-", "*", "/", "(", ")"].map((op) => (
              <button
                aria-label={`插入 ${op}`}
                key={op}
                onClick={() =>
                  edit(
                    m,
                    (inputs[m.id] ?? formatExpression(m.expr, aliases)) +
                      " " +
                      op,
                  )
                }
              >
                {op}
              </button>
            ))}
            <button
              className="danger"
              onClick={() => onChange(mappings.filter((x) => x.id !== m.id))}
            >
              移除此映射
            </button>
          </div>
          <label>
            映射备注
            <input
              data-testid={`mapping-note-${i}`}
              value={m.note}
              onChange={(e) => update(m.id, { note: e.target.value })}
              placeholder="描述业务含义，供后续开发阅读"
            />
          </label>
        </section>
      ))}
      <button
        data-testid="add-mapping"
        className="studio-wide"
        onClick={() =>
          onChange([
            ...mappings,
            { id: crypto.randomUUID(), target: null, expr: [], note: "" },
          ])
        }
      >
        添加字段映射
      </button>
      {picker && (
        <Modal title="选择来源字段" onClose={() => setPicker(null)}>
          <FieldPicker
            business={business}
            catalog={catalog}
            value={pending}
            onChange={setPending}
          />
          <div className="studio-actions">
            <button
              data-testid="field-picker-cancel"
              onClick={() => setPicker(null)}
            >
              取消
            </button>
            <button
              data-testid="field-picker-confirm"
              className="primary"
              disabled={!pending}
              onClick={() => {
                const m = mappings.find((m) => m.id === picker);
                if (m && pending) {
                  const alias = aliases.find(
                    (a) =>
                      a.refId === pending.refId &&
                      a.fieldId === pending.fieldId,
                  );
                  if (alias) {
                    const field = formatExpression(
                      [
                        {
                          kind: "field",
                          refId: pending.refId,
                          fieldId: pending.fieldId,
                        },
                      ],
                      aliases,
                    );
                    edit(
                      m,
                      (inputs[m.id] ?? formatExpression(m.expr, aliases)) +
                        " " +
                        field,
                    );
                  }
                }
                setPicker(null);
              }}
            >
              插入字段
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
