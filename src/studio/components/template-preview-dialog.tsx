import type { TemplatePreview } from "../domain/template-preview";
import type { CatalogSnapshot } from "../contracts/catalog";
import type { BusinessDocument, TypeParams } from "../contracts/business";
import { Modal } from "./workbench-ui";
export interface TemplatePreviewDialogProps {
  preview: TemplatePreview;
  catalog: CatalogSnapshot;
  business?: BusinessDocument;
  error?: string;
  onConfirm: () => void;
  onCancel: () => void;
}
export function TemplatePreviewDialog({
  preview,
  catalog,
  business,
  error,
  onConfirm,
  onCancel,
}: TemplatePreviewDialogProps) {
  const type = (v: TypeParams) => {
    const name =
      catalog.dataTypes.find((t) => t.id === v.typeId)?.name ?? "未设类型";
    return (
      name +
      (v.precision !== null
        ? `(${v.precision}${v.scale !== null ? "," + v.scale : ""})`
        : v.maxLength !== null
          ? `(${v.maxLength})`
          : "")
    );
  };
  const field = (id: string) => {
    const f = catalog.fields.find((f) => f.id === id);
    return f
      ? `${catalog.tables.find((t) => t.id === f.tableId)?.name ?? "未知表"}.${f.name}`
      : "失效字段";
  };
  return (
    <Modal title="确认批量应用模板" onClose={onCancel}>
      <div data-testid="template-preview-dialog">
        <p>
          <strong>
            {business?.templates.find(
              (t) => t.templateId === preview.templateId,
            )?.name ?? "类型模板"}{" "}
            · v{preview.version}
          </strong>
        </p>
        <p>
          将更新 {preview.changes.length}{" "}
          个字段。确认后加入工作区草稿，点击顶部保存后持久化；取消不修改字段。
        </p>
        <div className="studio-table-block">
          <table>
            <thead>
              <tr>
                <th>字段</th>
                <th>当前类型</th>
                <th>应用后</th>
              </tr>
            </thead>
            <tbody>
              {preview.changes.map((c) => (
                <tr key={c.fieldId}>
                  <td>{field(c.fieldId)}</td>
                  <td>{type(c.before)}</td>
                  <td>{type(c.after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {error && (
          <p role="alert" className="studio-error">
            {error}
          </p>
        )}
        {preview.issues.map((issue, i) => (
          <p className="studio-error" key={i}>
            {issue.message}
          </p>
        ))}
        <div className="studio-actions">
          <button data-testid="template-cancel" onClick={onCancel}>
            取消
          </button>
          <button
            className="primary"
            data-testid="template-confirm"
            onClick={onConfirm}
            disabled={!!error || preview.issues.length > 0}
          >
            确认更新 {preview.changes.length} 个字段
          </button>
        </div>
      </div>
    </Modal>
  );
}
