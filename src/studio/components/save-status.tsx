import { useState, useCallback } from "react";
import { Save, Loader2 } from "lucide-react";
import { useWorkspace } from "../state/workspace-provider";

/**
 * SaveStatus displays a button to trigger a workspace save and a status
 * indicator that reflects the current save state:
 *   - "保存中" while a save is in progress
 *   - "保存失败" if the last save attempt failed
 *   - "已修改" if there are unsaved changes
 *   - "已保存" when everything is up‑to‑date
 *
 * The component uses the WorkspaceProvider context to access the current
 * dirty flag, last error, and the `save` operation.
 */
export function SaveStatus() {
  const ctx = useWorkspace();
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(() => {
    setSaving(true);
    ctx
      .save()
      .catch(() => {
        /* error is handled by the provider via lastSaveError */
      })
      .finally(() => setSaving(false));
  }, [ctx]);

  const { isDirty, lastSaveError } = ctx;

  let statusText: string;
  if (saving) {
    statusText = "保存中";
  } else if (lastSaveError) {
    statusText = "保存失败";
  } else if (isDirty) {
    statusText = "已修改";
  } else {
    statusText = "已保存";
  }

  return (
    <div
      data-testid="save-status"
      style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
    >
      <button
        type="button"
        data-testid="save-workspace"
        onClick={handleSave}
        disabled={saving || !isDirty}
      >
        {saving ? (
          <Loader2 size={13} className="studio-spin" />
        ) : (
          <Save size={13} />
        )}{" "}
        保存
      </button>
      <span
        className={
          lastSaveError
            ? "status-error"
            : isDirty
              ? "status-dirty"
              : "status-saved"
        }
      >
        {statusText}
      </span>
    </div>
  );
}
