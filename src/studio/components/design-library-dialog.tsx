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
      title="删除当前设计库"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      {summary && (
        <>
          <p>确定删除设计库「{summary.name}」吗？</p>
          <p>
            {summary.tables} 张表 · {summary.fields} 个字段 · {summary.flows}{" "}
            个流程 · {summary.refs} 处表引用 · {summary.rules} 条业务规则 ·{" "}
            {summary.relationships} 条外键 · {summary.indices} 个索引
          </p>
          <p>
            这些内容将从本机工作区永久删除，没有回收站。其他设计库、共享字段模板和原
            JSON 文件保留。删除成功立即保存。
          </p>
        </>
      )}
      {(blocked || error) && (
        <p role="alert" className="studio-error">
          {blocked || error}
        </p>
      )}
      <div className="studio-actions">
        <button disabled={busy} onClick={onClose}>
          取消
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
          {busy ? "正在删除…" : "确认删除整个设计库"}
        </button>
      </div>
    </Modal>
  );
}
