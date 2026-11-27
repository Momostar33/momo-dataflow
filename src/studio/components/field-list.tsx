// src/studio/components/field-list.tsx
import { Pencil, ArrowUp, ArrowDown, Trash2 } from "lucide-react";
import { useState, useMemo } from "react";
import { useMomoWorkspace } from "../state/momo-view";
import { deleteField, moveField } from "../domain/catalog-fields";
import { getCatalogUsage, Usage } from "../domain/catalog-usage";
import { projectCatalog } from "../projection/catalog-view";
import type { FieldOpResult } from "../domain/catalog-fields";

/**
 * FieldList renders a searchable, sequence‑sorted list of fields for a
 * single table.  Each row shows the field name, label and id, and a delete
 * button that opens a confirmation modal.  The modal displays any
 * catalog usages that would be affected by the deletion.
 *
 * Props:
 * - tableId: id of the table whose fields to list.
 * - onSelect?: callback invoked with the field id when a row is clicked.
 * - search?: optional search string; if omitted, no filtering is applied.
 *
 * The component uses the current workspace snapshot via `useMomoWorkspace`
 * and performs a single provider operation when a field is deleted or moved.
 */
export function FieldList({
  tableId,
  onSelect,
  onEdit,
  search = "",
}: {
  tableId: string;
  onSelect?: (fieldId: string) => void;
  onEdit?: (fieldId: string) => void;
  search?: string;
}): JSX.Element {
  const ctx = useMomoWorkspace();
  const { state } = ctx;
  const { catalog, metadata } = state.draft;

  // Project view for display names
  const view = useMemo(
    () => projectCatalog(catalog, metadata),
    [catalog, metadata],
  );

  // Find raw fields for the table
  const rawFields = useMemo(() => {
    return catalog.fields.filter((f) => f.tableId === tableId);
  }, [catalog, tableId]);

  // Stable sort by sequence (undefined treated as Infinity)
  const sortedFields = useMemo(() => {
    return [...rawFields].sort((a, b) => {
      const sa = a.sequence ?? Infinity;
      const sb = b.sequence ?? Infinity;
      return sa - sb;
    });
  }, [rawFields]);

  // Search helpers
  const normalize = (s: string | null | undefined) => (s ?? "").toLowerCase();
  const matches = (f: (typeof sortedFields)[0]) => {
    const q = normalize(search);
    if (!q) return true;
    const viewField = view.tables
      .flatMap((t) => t.fields)
      .find((v) => v.fieldId === f.id);
    return (
      normalize(f.id).includes(q) ||
      normalize(f.name).includes(q) ||
      (viewField?.label && normalize(viewField.label).includes(q)) ||
      (viewField?.note && normalize(viewField.note).includes(q))
    );
  };

  const [showConfirm, setShowConfirm] = useState(false);
  const [confirmFieldId, setConfirmFieldId] = useState<string | null>(null);
  const [usageInfo, setUsageInfo] = useState<{
    blocked: boolean;
    usages: Usage[];
  } | null>(null);

  const openConfirm = (fieldId: string) => {
    setConfirmFieldId(fieldId);
    setShowConfirm(true);
  };

  const handleDelete = async () => {
    if (!confirmFieldId) return;
    const result = await ctx.applyOperation<FieldOpResult>((current) => {
      const usage = getCatalogUsage(current.draft, "field", confirmFieldId);
      if (usage.blocked) {
        return {
          ok: false,
          error: {
            code: "DELETE_BLOCKED",
            message: "字段存在引用，不能删除",
          },
        } as const;
      }
      return deleteField(current, { fieldId: confirmFieldId });
    });
    if (!result.ok) {
      const usage = getCatalogUsage(ctx.state.draft, "field", confirmFieldId);
      setUsageInfo(usage);
      return;
    }
    setShowConfirm(false);
    setConfirmFieldId(null);
    setUsageInfo(null);
  };

  const handleMove = (fieldId: string, toIndex: number) => {
    ctx.applyOperation((state) => moveField(state, { fieldId, toIndex }));
  };

  return (
    <>
      <table data-testid="catalog-fields">
        <thead>
          <tr>
            <th>字段名</th>
            <th>说明名称</th>
            <th>技术类型</th>
            <th>精度 / 长度</th>
            <th>小数位</th>
            <th>类型模板</th>
            <th>备注</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {sortedFields.filter(matches).map((f, idx) => {
            const viewField = view.tables
              .flatMap((t) => t.fields)
              .find((v) => v.fieldId === f.id);
            return (
              <tr
                key={f.id}
                data-testid={`field-row-${f.id}`}
                onClick={() => onSelect?.(f.id)}
              >
                <td>{f.name}</td>
                <td>{viewField?.label ?? ""}</td>
                <td>
                  {catalog.dataTypes.find((t) => t.id === f.typeId)?.name ??
                    f.typeId ??
                    "—"}
                </td>
                <td>{f.precision ?? f.maxLength ?? "—"}</td>
                <td>{f.scale ?? "—"}</td>
                <td>
                  {(() => {
                    const a = state.draft.business?.assignments.find(
                        (a) => a.fieldId === f.id,
                      ),
                      t = state.draft.business?.templates.find(
                        (t) => t.templateId === a?.templateId,
                      );
                    return t && a ? (
                      <span
                        title={
                          Math.max(...t.versions.map((v) => v.version)) >
                          a.appliedVersion
                            ? "模板有新版本，请到类型模板预览更新"
                            : ""
                        }
                      >
                        {t.name} v{a.appliedVersion}
                        {Math.max(...t.versions.map((v) => v.version)) >
                          a.appliedVersion && (
                          <span className="studio-update-badge">待更新</span>
                        )}
                      </span>
                    ) : (
                      "—"
                    );
                  })()}
                </td>
                <td>{f.note ?? "—"}</td>
                <td>
                  <button
                    aria-label={`编辑字段 ${f.name}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit?.(f.id);
                    }}
                  >
                    <Pencil size={13} />
                  </button>
                  <button
                    data-testid={`field-up-${f.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (idx > 0) handleMove(f.id, idx - 1);
                    }}
                    disabled={idx === 0}
                  >
                    <ArrowUp size={12} />
                  </button>
                  <button
                    data-testid={`field-down-${f.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (idx < sortedFields.length - 1)
                        handleMove(f.id, idx + 1);
                    }}
                    disabled={idx === sortedFields.length - 1}
                  >
                    <ArrowDown size={12} />
                  </button>
                  <button
                    data-testid={`field-delete-${f.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      openConfirm(f.id);
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {showConfirm && confirmFieldId && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              backgroundColor: "white",
              padding: "16px",
              borderRadius: "4px",
              maxWidth: "400px",
              width: "100%",
            }}
          >
            <h4>确认删除字段</h4>
            {usageInfo?.blocked && (
              <div>
                <p>字段仍被引用：</p>
                <ul>
                  {usageInfo.usages.map((u, idx) => (
                    <li key={idx}>
                      {u.kind} - {u.id}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div style={{ marginTop: "12px", textAlign: "right" }}>
              <button
                data-testid="delete-cancel"
                onClick={() => {
                  setShowConfirm(false);
                  setConfirmFieldId(null);
                  setUsageInfo(null);
                }}
                style={{ marginRight: "8px" }}
              >
                取消
              </button>
              <button data-testid="delete-confirm" onClick={handleDelete}>
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
