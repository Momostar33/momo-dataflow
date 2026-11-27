import { uiError, uiText, useUiLanguage } from "../i18n";
import { useState } from "react";
import { useMomoWorkspace } from "../state/momo-view";
import { addTable, renameTable } from "../domain/catalog-tables";
import { applyTablePatch } from "../projection/catalog-patch";
import type { WorkspaceState } from "../state/workspace-state";
/**
 * TableEditor renders a form for creating or editing a table.
 *
 * @param databaseId   The database to which a new table will belong.
 * @param tableId      Optional id of the table to edit. If omitted, a new table is created.
 * @param onApplied    Called with the real table id after a successful apply.
 * @param onCancel     Called when the user cancels the edit.
 */
export function TableEditor({
  databaseId,
  tableId,
  onApplied,
  onCancel,
  inline = false,
}: {
  inline?: boolean;
  databaseId: string;
  tableId?: string;
  onApplied?: (id: string) => void;
  onCancel?: () => void;
}): JSX.Element {
  useUiLanguage();
  const ctx = useMomoWorkspace();
  const { state } = ctx;
  const { catalog, metadata } = state.draft;
  // Find the raw table row if editing
  const table = tableId ? catalog.tables.find((t) => t.id === tableId) : null;
  // Initialize form fields from raw data or empty for new table
  const [name, setName] = useState(table?.name ?? "");
  const [note, setNote] = useState(table?.note ?? "");
  const [displayName, setDisplayName] = useState(
    tableId ? (metadata.tableDisplayNames[tableId] ?? "") : "",
  );
  const [error, setError] = useState<string | null>(null);
  type TableApplyResult =
    | {
        ok: true;
        state: WorkspaceState;
        tableId: string;
      }
    | {
        ok: false;
        error: {
          code: string;
          message: string;
        };
      };
  const handleApply = () => {
    const result = ctx.applyOperation<TableApplyResult>((current) => {
      if (!tableId) {
        // New table
        return addTable(current, {
          databaseId,
          name,
          note,
          displayName: displayName === "" ? null : displayName,
        });
      } else {
        // Edit existing table
        const renamed = renameTable(current, { tableId, name });
        if (!renamed.ok) return renamed;
        const patched = applyTablePatch(renamed.state, {
          tableId,
          changes: {
            displayName,
            note,
          },
        });
        if (!patched.ok) return patched;
        const newState = {
          ...patched.state,
          editVersion: current.editVersion + 1,
        } as WorkspaceState;
        return { ok: true, state: newState, tableId };
      }
    });
    if (result.ok) {
      setError(null);
      const newId = tableId ?? result.tableId;
      onApplied?.(newId);
      onCancel?.();
    } else {
      setError(result.error.message);
    }
  };
  return (
    <div
      data-testid="edit-table"
      className={inline ? "studio-inline-table-editor" : "studio-table-editor"}
      style={{
        border: "1px solid #ddd",
        padding: "12px",
        borderRadius: "4px",
        maxWidth: "400px",
        backgroundColor: "#fafafa",
      }}
    >
      <h3>{tableId ? uiText("编辑数据表") : uiText("新建数据表")}</h3>
      {error && (
        <div style={{ color: "red", marginBottom: "8px" }}>
          {uiError(error)}
        </div>
      )}
      <div style={{ marginBottom: "8px" }}>
        <label>
          {uiText("MySQL 技术表名:")}
          <input
            data-testid="table-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ width: "100%" }}
          />
        </label>
      </div>
      <div style={{ marginBottom: "8px" }}>
        <label>
          {uiText("说明名称:")}
          <input
            data-testid="table-label"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            style={{ width: "100%" }}
          />
        </label>
      </div>
      <div style={{ marginBottom: "8px" }}>
        <label>
          {uiText("备注:")}
          <textarea
            data-testid="table-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={{ width: "100%", height: "80px" }}
          />
        </label>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
        <button data-testid="table-cancel" onClick={onCancel}>
          {uiText("取消")}
        </button>
        <button data-testid="table-apply" onClick={handleApply}>
          {uiText("应用")}
        </button>
      </div>
    </div>
  );
}
