import { useState, useEffect, useMemo, useRef } from "react";
import type {
  BusinessDocument,
  FieldToken,
  Mapping,
} from "../contracts/business";
import type { CatalogSnapshot } from "../contracts/catalog";
import { FieldPicker } from "./field-picker";
import { useFieldInsertion } from "./field-insertion-context";
import {
  fieldAliases,
  formatExpression,
  parseExpressionInput,
} from "../domain/expression-input";
import {
  FIELD_DRAG_TYPE,
  decodeDraggedField,
  insertFieldAtSelection,
} from "../domain/field-insertion";
export interface ExpressionEditorProps {
  business: BusinessDocument;
  catalog: CatalogSnapshot;
  mappings: Mapping[];
  onChange: (m: Mapping[]) => void;
  onValidityChange?: (invalid: boolean) => void;
  showErrors?: boolean;
}
export function ExpressionEditor({
  business,
  catalog,
  mappings,
  onChange,
  onValidityChange,
  showErrors = false,
}: ExpressionEditorProps) {
  const aliases = useMemo(
    () => fieldAliases(business, catalog),
    [business, catalog],
  );
  const [inputs, setInputs] = useState<Record<string, string>>({}),
    [picker, setPicker] = useState<string | null>(null),
    [active, setActive] = useState<string | null>(null),
    [insertError, setInsertError] = useState("");
  const areas = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const cursors = useRef<Record<string, { start: number; end: number }>>({});
  const bridge = useFieldInsertion();
  // Keep unfinished text when a target or another mapping changes. New rule IDs remount this editor.
  useEffect(
    () =>
      setInputs((old) =>
        Object.fromEntries(
          mappings.map((m) => [
            m.id,
            old[m.id] ?? formatExpression(m.expr, aliases),
          ]),
        ),
      ),
    [mappings, aliases],
  );
  const invalid = mappings.some(
    (m) =>
      !!parseExpressionInput(
        inputs[m.id] ?? formatExpression(m.expr, aliases),
        aliases,
      ).error,
  );
  useEffect(() => {
    onValidityChange?.(invalid);
    return () => onValidityChange?.(false);
  }, [invalid, onValidityChange]);
  function update(id: string, patch: Partial<Mapping>) {
    onChange(mappings.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }
  function edit(m: Mapping, value: string) {
    setInputs((old) => ({ ...old, [m.id]: value }));
    setInsertError("");
    const parsed = parseExpressionInput(value, aliases);
    if (!parsed.error) update(m.id, { expr: parsed.tokens });
  }
  function remember(id: string, el: HTMLTextAreaElement) {
    setActive(id);
    cursors.current[id] = { start: el.selectionStart, end: el.selectionEnd };
  }
  function insert(token: FieldToken, id?: string) {
    const m = mappings.find((m) => m.id === (id ?? active)) ??
      mappings[0] ?? {
        id: crypto.randomUUID(),
        target: null,
        expr: [],
        note: "",
      };
    const text = inputs[m.id] ?? formatExpression(m.expr, aliases);
    try {
      const pos = cursors.current[m.id];
      const next = insertFieldAtSelection(
        text,
        token,
        aliases,
        pos?.start ?? text.length,
        pos?.end ?? text.length,
      );
      const parsed = parseExpressionInput(next.value, aliases);
      setInputs((old) => ({ ...old, [m.id]: next.value }));
      setActive(m.id);
      setInsertError("");
      if (!mappings.some((x) => x.id === m.id))
        onChange([
          ...mappings,
          { ...m, expr: parsed.error ? [] : parsed.tokens },
        ]);
      else if (!parsed.error) update(m.id, { expr: parsed.tokens });
      cursors.current[m.id] = { start: next.caret, end: next.caret };
      setPicker(null);
      requestAnimationFrame(() => {
        const el = areas.current[m.id];
        el?.focus();
        el?.setSelectionRange(next.caret, next.caret);
      });
    } catch (e) {
      setInsertError(e instanceof Error ? e.message : String(e));
    }
  }
  useEffect(
    () => bridge.register((token) => insert(token)),
    [bridge, mappings, inputs, aliases, active],
  );
  return (
    <section className="studio-editor-card studio-mappings">
      <h3>字段映射与公式</h3>
      {insertError && (
        <p role="alert" className="studio-error">
          {insertError}
        </p>
      )}
      {mappings.map((m, i) => {
        const text = inputs[m.id] ?? formatExpression(m.expr, aliases);
        const error = showErrors
          ? parseExpressionInput(text, aliases).error
          : undefined;
        return (
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
              公式
              <textarea
                data-testid={`mapping-expression-${i}`}
                ref={(el) => {
                  areas.current[m.id] = el;
                }}
                value={text}
                onFocus={(e) => remember(m.id, e.currentTarget)}
                onSelect={(e) => remember(m.id, e.currentTarget)}
                onBlur={(e) => remember(m.id, e.currentTarget)}
                onChange={(e) => edit(m, e.target.value)}
                onDragOver={(e) => {
                  if (e.dataTransfer.types.includes(FIELD_DRAG_TYPE)) {
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = "copy";
                  }
                }}
                onDrop={(e) => {
                  const raw = e.dataTransfer.getData(FIELD_DRAG_TYPE);
                  if (!raw) return;
                  e.preventDefault();
                  e.stopPropagation();
                  const token = decodeDraggedField(raw);
                  if (token) insert(token, m.id);
                  else setInsertError("无法读取这个字段");
                }}
              />
            </label>
            {error && (
              <p role="alert" className="studio-error">
                {error}
              </p>
            )}
            <div className="studio-expression-tools">
              <button
                data-testid={`mapping-add-field-${i}`}
                onClick={() => {
                  setPicker(picker === m.id ? null : m.id);
                  setActive(m.id);
                }}
              >
                选择字段
              </button>
              <button
                className="danger"
                onClick={() => onChange(mappings.filter((x) => x.id !== m.id))}
              >
                移除此映射
              </button>
            </div>
            {picker === m.id && (
              <div className="studio-inline-field-picker">
                <FieldPicker
                  business={business}
                  catalog={catalog}
                  value={null}
                  onChange={(token) => {
                    if (token) insert(token, m.id);
                  }}
                  refTestId={`mapping-source-ref-${i}`}
                  fieldTestId={`mapping-source-field-${i}`}
                />
              </div>
            )}
            <details className="studio-editor-details">
              <summary>备注</summary>
              <input
                aria-label="映射备注"
                data-testid={`mapping-note-${i}`}
                value={m.note}
                onChange={(e) => update(m.id, { note: e.target.value })}
              />
            </details>
          </section>
        );
      })}
      <button
        data-testid="add-mapping"
        className="studio-wide"
        onClick={() => {
          const id = crypto.randomUUID();
          setActive(id);
          onChange([...mappings, { id, target: null, expr: [], note: "" }]);
        }}
      >
        添加字段映射
      </button>
    </section>
  );
}
