import { useState } from "react";
import {
  Plus,
  Workflow,
  Pencil,
  Trash2,
  ArrowRight,
  Search,
} from "lucide-react";
import { useWorkspace } from "../state/workspace-provider";
import { addFlow, updateFlow, deleteFlow } from "../domain/flows";
import { useStudioNavigation } from "./studio-shell";
import { Modal, Empty } from "./workbench-ui";
export function FlowList() {
  const ctx = useWorkspace(),
    nav = useStudioNavigation();
  const db = nav.databaseId || localStorage.getItem("database_id");
  const flows =
    ctx.state.draft.business?.flows.filter((f) => f.databaseId === db) ?? [];
  const [form, setForm] = useState<{
      id?: string;
      name: string;
      note: string;
    } | null>(null),
    [error, setError] = useState(""),
    [deleting, setDeleting] = useState<string | null>(null),
    [q, setQ] = useState("");
  const doomed = flows.find((f) => f.flowId === deleting);
  return (
    <div className="studio-flow-list" data-testid="flows-root">
      <div className="studio-page-title">
        <div>
          <h2>业务流程</h2>
          <p>每个流程独立绘制步骤、表引用、匹配与字段映射。</p>
        </div>
        <button
          className="primary"
          data-testid="new-flow"
          disabled={!db}
          onClick={() => {
            setForm({ name: "", note: "" });
            setError("");
          }}
        >
          <Plus size={14} />
          新建业务流程
        </button>
      </div>
      <label className="studio-search studio-flow-search">
        <Search size={14} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索流程名称与备注"
        />
      </label>
      {!flows.length && (
        <Empty>
          <Workflow size={38} />
          <h3>{db ? "还没有业务流程" : "请先创建设计库"}</h3>
          <p>
            例如创建「采购」，添加审批步骤，把已有表拖进步骤，再连线说明条件和公式。
          </p>
          {!db && (
            <button onClick={() => nav.createDesign()}>创建设计库</button>
          )}
        </Empty>
      )}
      <div className="studio-flow-grid">
        {flows
          .filter((f) => (f.name + f.note).includes(q))
          .map((f) => (
            <article
              className="studio-flow-card"
              data-testid={`flow-row-${f.flowId}`}
              key={f.flowId}
            >
              <div className="studio-flow-card-icon">
                <Workflow size={22} />
              </div>
              <div className="studio-flow-card-text">
                <h3>{f.name}</h3>
                <p>{f.note || "尚未填写业务说明"}</p>
                <small>
                  {f.steps.length} 个节点 ·{" "}
                  {
                    ctx.state.draft.business?.refs.filter(
                      (r) => r.flowId === f.flowId,
                    ).length
                  }{" "}
                  处表引用 ·{" "}
                  {
                    ctx.state.draft.business?.rules.filter(
                      (r) => r.flowId === f.flowId,
                    ).length
                  }{" "}
                  条字段规则
                </small>
              </div>
              <div className="studio-flow-card-actions">
                <button
                  aria-label={`编辑流程 ${f.name}`}
                  onClick={() => {
                    setForm({ id: f.flowId, name: f.name, note: f.note });
                    setError("");
                  }}
                >
                  <Pencil size={14} />
                </button>
                <button
                  aria-label={`删除流程 ${f.name}`}
                  onClick={() => setDeleting(f.flowId)}
                >
                  <Trash2 size={14} />
                </button>
                <button
                  className="primary"
                  onClick={() => nav.go("/studio/flows/" + f.flowId)}
                >
                  打开画布
                  <ArrowRight size={14} />
                </button>
              </div>
            </article>
          ))}
      </div>
      {form && (
        <Modal
          title={form.id ? "编辑业务流程" : "新建业务流程"}
          onClose={() => setForm(null)}
        >
          <label>
            名称
            <input
              data-testid="flow-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="例如：采购、收货"
            />
          </label>
          <label>
            业务说明
            <textarea
              data-testid="flow-note"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </label>
          {error && <p className="studio-error">{error}</p>}
          <div className="studio-actions">
            <button data-testid="flow-cancel" onClick={() => setForm(null)}>
              取消
            </button>
            <button
              className="primary"
              data-testid="flow-apply"
              onClick={() => {
                const r = ctx.applyOperation((s) =>
                  form.id
                    ? updateFlow(s, {
                        flowId: form.id,
                        name: form.name,
                        note: form.note,
                      })
                    : addFlow(s, {
                        databaseId: db!,
                        name: form.name,
                        note: form.note,
                      }),
                );
                if (r.ok) setForm(null);
                else setError(r.error.message);
              }}
            >
              应用
            </button>
          </div>
        </Modal>
      )}
      {doomed && (
        <Modal
          title={`删除流程「${doomed.name}」`}
          onClose={() => setDeleting(null)}
        >
          <p>
            将移除本流程的{doomed.steps.length}个节点、
            {
              ctx.state.draft.business?.refs.filter(
                (r) => r.flowId === doomed.flowId,
              ).length
            }
            处表引用及所有字段规则、触发箭头。目录中的表和字段不删除。
          </p>
          <div className="studio-actions">
            <button
              data-testid="flow-delete-cancel"
              onClick={() => setDeleting(null)}
            >
              取消
            </button>
            <button
              className="danger"
              data-testid="flow-delete-confirm"
              onClick={() => {
                const r = ctx.applyOperation((s) =>
                  deleteFlow(s, { flowId: doomed.flowId, confirmed: true }),
                );
                if (r.ok) setDeleting(null);
              }}
            >
              确认删除流程
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
