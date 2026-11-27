import { useState, useEffect, useRef } from "react";
import { Modal } from "./workbench-ui";
import { useWorkspace } from "../state/workspace-provider";
import { planDesignImport } from "../domain/design-import";
import { importDesignPackage } from "../local-workspace";
import { readDesignPackageFiles } from "../domain/design-package-file";
export function DesignImportDialog({
  onClose,
  onImported,
  initialFiles,
}: {
  initialFiles?: readonly File[];
  onClose: () => void;
  onImported: (databaseId: string) => void;
}) {
  const ctx = useWorkspace(),
    [input, setInput] = useState<unknown>(null),
    [summary, setSummary] = useState<
      ReturnType<typeof planDesignImport>["summary"] | null
    >(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [reading, setReading] = useState(false);
  const request = useRef(0);
  async function loadFiles(files: readonly File[]) {
    const token = ++request.current;
    setSummary(null);
    setInput(null);
    setError("");
    setReading(true);
    try {
      const value = await readDesignPackageFiles(files);
      const plan = planDesignImport(ctx.state, value);
      if (token !== request.current) return;
      setInput(value);
      setSummary(plan.summary);
    } catch (e) {
      if (token === request.current)
        setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (token === request.current) setReading(false);
    }
  }
  useEffect(() => {
    if (initialFiles) void loadFiles(initialFiles);
    return () => {
      request.current++;
    };
  }, [initialFiles]);
  return (
    <Modal
      title="导入表结构与业务模块"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <p>
        导入设计包只新增独立设计库和模块，不覆盖原图，不连接来源数据库。已有同名库或ID冲突时拒绝导入。
      </p>
      <div
        className="studio-import-drop"
        data-testid="design-package-dropzone"
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes("Files")) {
            e.preventDefault();
            e.stopPropagation();
            e.dataTransfer.dropEffect = "copy";
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!busy) void loadFiles(Array.from(e.dataTransfer.files));
        }}
      >
        <p>将一个 JSON 设计包拖到这里，或选择文件。先预览，确认后才写入。</p>
        <label>
          选择设计包（JSON）
          <input
            data-testid="design-package-file"
            type="file"
            accept=".json,application/json"
            disabled={busy || ctx.isDirty}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              if (files.length) void loadFiles(files);
            }}
          />
        </label>
        {reading && <p role="status">正在读取设计包…</p>}
      </div>
      {ctx.isDirty && (
        <p className="studio-error">请先关闭弹窗并保存当前工作区。</p>
      )}
      {summary && (
        <section
          className="studio-table-block"
          style={{ padding: 12, marginTop: 12 }}
        >
          <h3>{summary.name}</h3>
          <p>结构时间：{summary.capturedAt}</p>
          <p>{summary.note}</p>
          <p>
            <strong>
              {summary.tables} 张表/视图 · {summary.fields} 个字段 ·{" "}
              {summary.modules} 个模块视图
            </strong>
          </p>
          <p>
            {summary.physicalRelationships} 条物理外键 · {summary.rules}{" "}
            组来源条件 · {summary.indexes} 个索引
          </p>
          {summary.unknownTypes.length > 0 && (
            <p>
              当前类型库未识别：{summary.unknownTypes.join("、")}
              。原SQL类型保留在字段备注，未擅自替代类型。
            </p>
          )}
        </section>
      )}
      {error && (
        <p role="alert" className="studio-error">
          {error}
        </p>
      )}
      <div className="studio-actions">
        <button disabled={busy} onClick={onClose}>
          取消
        </button>
        <button
          className="primary"
          data-testid="confirm-design-import"
          disabled={busy || reading || !summary || ctx.isDirty}
          onClick={async () => {
            if (!summary || !input) return;
            setBusy(true);
            setError("");
            try {
              const next = await importDesignPackage(ctx.state, input);
              ctx.restore(next);
              onImported(summary.databaseId);
            } catch (e) {
              setError(e instanceof Error ? e.message : String(e));
              setBusy(false);
            }
          }}
        >
          {busy ? "正在保存，完成前请勿关闭…" : "新增设计库并导入"}
        </button>
      </div>
    </Modal>
  );
}
