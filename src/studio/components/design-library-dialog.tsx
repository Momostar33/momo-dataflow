import { uiError, uiText, useUiLanguage } from "../i18n";
import { useState } from "react";
import { useWorkspace } from "../state/workspace-provider";
import { planDesignLibraryDeletion } from "../domain/design-library";
import { deleteDesignLibrary } from "../local-workspace";
import { Modal } from "./workbench-ui";
export function DesignLibraryDialog({
  databaseId,
  onClose,
  onDeleted,
}: {
  databaseId: string;
  onClose: () => void;
  onDeleted: (nextId: string) => void;
}) {
  useUiLanguage();
  const ctx = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  let summary: ReturnType<typeof planDesignLibraryDeletion>["summary"] | null =
    null;
  let blocked = "";
  try {
    summary = planDesignLibraryDeletion(ctx.state, databaseId).summary;
  } catch (e) {
    blocked = e instanceof Error ? e.message : String(e);
  }
  return (
    <Modal
      title={uiText("删除当前设计库")}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {summary && (
        <>
          <p>
            {uiText("确定删除设计库「")}
            {summary.name}
            {uiText("」吗？")}
          </p>
          <p>
            {summary.tables}
            {uiText(" 张表 · ")}
            {summary.fields}
            {uiText(" 个字段 · ")}
            {summary.flows} {uiText("个流程 · ")}
            {summary.refs}
            {uiText(" 处表引用 · ")}
            {summary.rules}
            {uiText(" 条业务规则 ·")} {summary.relationships}
            {uiText(" 条外键 · ")}
            {summary.indices}
            {uiText(" 个索引")}
          </p>
          <p>
            {uiText(
              "这些内容将从本机工作区永久删除，没有回收站。其他设计库、共享字段模板和原 JSON 文件保留。删除成功立即保存。",
            )}
          </p>
        </>
      )}
      {(blocked || error) && (
        <p role="alert" className="studio-error">
          {uiError(blocked || error)}
        </p>
      )}
      <div className="studio-actions">
        <button disabled={busy} onClick={onClose}>
          {uiText("取消")}
        </button>
        <button
          className="danger"
          data-testid="confirm-library-delete"
          disabled={busy || !summary}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const next = await deleteDesignLibrary(ctx.state, databaseId);
              ctx.restore(next);
              onDeleted(next.draft.catalog.databases[0]?.id ?? "");
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
              setBusy(false);
            }
          }}
        >
          {busy ? uiText("正在删除…") : uiText("确认删除整个设计库")}
        </button>
      </div>
    </Modal>
  );
}
