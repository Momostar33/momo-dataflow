import { useState } from "react";
import { Modal } from "./workbench-ui";
import { useWorkspace } from "../state/workspace-provider";
import { importDesignPackage } from "../local-workspace";
import { newDesignPackage } from "../domain/new-design";

export function CreateDesignDialog({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (databaseId: string) => void;
}) {
  const ctx = useWorkspace();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function create() {
    setBusy(true); setError("");
    try {
      const packet = newDesignPackage(name);
      const state = await importDesignPackage(ctx.state, packet);
      ctx.restore(state);
      onCreated(packet.database.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }
  return <Modal title="新建设计库" onClose={() => { if (!busy) onClose(); }}>
    <p>创建设计库后，可添加表、字段和业务流程。这里只保存本地设计，不连接真实数据库。</p>
    <label>名称
      <input autoFocus data-testid="new-design-name" value={name} maxLength={255}
        disabled={busy} placeholder="例如：采购与库存设计"
        onChange={e => setName(e.target.value)} />
    </label>
    <p>字段类型：MySQL。当前设计包导入使用同一类型目录。</p>
    {ctx.isDirty && <p className="studio-error">请先保存当前工作区，再新建设计库。</p>}
    {error && <p className="studio-error" role="alert">{error}</p>}
    <div className="studio-actions">
      <button disabled={busy} onClick={onClose}>取消</button>
      <button className="primary" data-testid="confirm-new-design" disabled={busy || ctx.isDirty || !name.trim()}
        onClick={create}>{busy ? "正在创建…" : "创建设计库"}</button>
    </div>
  </Modal>;
}
