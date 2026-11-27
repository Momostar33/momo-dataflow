import React, { useEffect, useState } from "react";
import type { BusinessDocument } from "../contracts/business";
import type { CatalogSnapshot } from "../contracts/catalog";
import type { FieldToken } from "../contracts/business";

/**
 * Props for the FieldPicker component.
 *
 * @param business   The full business document (flows, refs, etc.).
 * @param catalog    The raw catalog snapshot.
 * @param value      The currently selected field token or null.
 * @param onChange   Callback invoked with the new value (or null to clear).
 * @param flowId     Optional flow id to filter refs.
 * @param refTestId  Test id for the ref <select> (default: "field-ref-picker").
 * @param fieldTestId Test id for the field <select> (default: "field-field-picker").
 */
export interface FieldPickerProps {
  business: BusinessDocument;
  catalog: CatalogSnapshot;
  value: FieldToken | null;
  onChange: (value: FieldToken | null) => void;
  flowId?: string;
  fixedRefId?: string;
  refTestId?: string;
  fieldTestId?: string;
}

/**
 * FieldPicker component.
 *
 * Two native <select> elements:
 *   - Ref selector (value = refId)
 *   - Field selector (value = fieldId)
 *
 * The component keeps the selected ref in local state so that clearing the
 * field (onChange(null)) does not immediately drop the ref.  Changing the
 * ref resets the field to null via onChange(null).  Invalid or disappeared
 * selections are shown as an error message and the component does not
 * automatically substitute another field.
 *
 * When more than six refs are available a simple search input is shown
 * to filter refs by table name, flow name or step name.
 *
 * The component accepts an optional flowId to filter refs to a single flow.
 */
export function FieldPicker({
  business,
  catalog,
  value,
  onChange,
  flowId,
  fixedRefId,
  refTestId = "field-ref-picker",
  fieldTestId = "field-field-picker",
}: FieldPickerProps) {
  // Local state for the selected ref id (kept even when field is cleared).
  const [localRefId, setRefId] = useState<string>(value?.refId ?? "");
  const refId = fixedRefId ?? localRefId;
  // Search query for refs when >6 refs.
  const [search, setSearch] = useState<string>("");

  // Update local refId when the external value changes to a new ref.
  useEffect(() => {
    if (value?.refId && value.refId !== refId) {
      setRefId(value.refId);
    }
  }, [value, refId]);

  // Filter refs by flowId if provided.
  const allRefs = flowId
    ? business.refs.filter(
        (r: (typeof business.refs)[0]) => r.flowId === flowId,
      )
    : business.refs;

  // Build lookup maps for quick access.
  const flowMap = new Map<string, (typeof business.flows)[0]>();
  business.flows.forEach((f) => flowMap.set(f.flowId, f));

  const tableMap = new Map<string, (typeof catalog.tables)[0]>();
  catalog.tables.forEach((t) => tableMap.set(t.id, t));

  // Compute the list of refs to display, applying search if needed.
  const filteredRefs = allRefs.filter((r: (typeof business.refs)[0]) => {
    if (!search) return true;
    const table = tableMap.get(r.tableId);
    const flow = flowMap.get(r.flowId);
    const step = flow?.steps.find(
      (s: (typeof business.flows)[0]["steps"][0]) => s.stepId === r.stepId,
    );
    const parts = [table?.name, flow?.name, step?.name].filter(Boolean);
    return parts.some((p) => p?.toLowerCase().includes(search.toLowerCase()));
  });

  // Find the currently selected ref and its related entities.
  const selectedRef = allRefs.find(
    (r: (typeof business.refs)[0]) => r.refId === refId,
  );
  const selectedTable = selectedRef
    ? tableMap.get(selectedRef.tableId)
    : undefined;
  // const selectedFlow = selectedRef ? flowMap.get(selectedRef.flowId) : undefined;
  // const selectedStep = selectedFlow?.steps.find((s: typeof business.flows[0]["steps"][0]) => s.stepId === selectedRef?.stepId);

  // Fields belonging to the selected table.
  const tableFields = selectedTable
    ? catalog.fields.filter(
        (f: (typeof catalog.fields)[0]) => f.tableId === selectedTable.id,
      )
    : [];

  // Determine if the current field selection is valid.
  const fieldId = value?.fieldId ?? "";
  const selectedField = tableFields.find(
    (f: (typeof catalog.fields)[0]) => f.id === fieldId,
  );
  const fieldInvalid = fieldId && !selectedField;

  // Determine if the current ref selection is valid.
  const refInvalid = !!refId && (!selectedRef || !selectedTable);

  // Handlers
  const handleRefChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newRefId = e.target.value;
    setRefId(newRefId);
    // Reset field selection
    onChange(null);
  };

  const handleFieldChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newFieldId = e.target.value;
    if (!newFieldId) {
      onChange(null);
    } else {
      onChange({ refId, fieldId: newFieldId });
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
  };

  // Render
  return (
    <div className={`studio-field-picker ${fixedRefId ? "is-fixed" : "is-two-column"}`}>
      {!fixedRefId && filteredRefs.length > 6 && (
        <div style={{ marginBottom: "0.5rem" }}>
          <input
            type="text"
            placeholder="搜索流程内表引用"
            value={search}
            onChange={handleSearchChange}
            style={{ width: "100%" }}
          />
        </div>
      )}
      <div style={{ marginBottom: "0.5rem" }}>
        {fixedRefId ? (
          <div className="studio-fixed-table" title={selectedTable?.name}>
            {selectedTable?.name ?? "表引用已失效"}
          </div>
        ) : (
          <select
            aria-label="选择关系中的表"
            data-testid={refTestId}
            value={refId}
            onChange={handleRefChange}
            style={{ width: "100%" }}
          >
            <option value="" disabled>
              选择步骤 / 表引用
            </option>
            {filteredRefs.map((r: (typeof business.refs)[0]) => {
              const t = tableMap.get(r.tableId);
              const flow = flowMap.get(r.flowId);
              const s = flow?.steps.find(
                (st: (typeof business.flows)[0]["steps"][0]) =>
                  st.stepId === r.stepId,
              );
              const labelParts = [s?.name, t?.name].filter(Boolean);
              const label = labelParts.join(" / ");
              return (
                <option key={r.refId} value={r.refId}>
                  {label}
                </option>
              );
            })}
          </select>
        )}
        {refInvalid && (
          <div style={{ color: "red", marginTop: "0.25rem" }}>
            表引用已失效，请重新选择
          </div>
        )}
      </div>
      <div>
        <select
          aria-label="选择字段"
          data-testid={fieldTestId}
          value={fieldId}
          onChange={handleFieldChange}
          style={{ width: "100%" }}
          disabled={!selectedTable}
        >
          <option value="" disabled>
            选择字段
          </option>
          {tableFields.map((f: (typeof catalog.fields)[0]) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        {fieldInvalid && (
          <div style={{ color: "red", marginTop: "0.25rem" }}>
            字段已失效，请重新选择
          </div>
        )}
      </div>
    </div>
  );
}
