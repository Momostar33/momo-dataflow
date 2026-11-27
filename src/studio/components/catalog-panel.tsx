import { useState, useEffect } from "react";
import { Table2, Plus, Search, Trash2, ExternalLink } from "lucide-react";
import { useMomoWorkspace } from "../state/momo-view";
import { projectCatalog } from "../projection/catalog-view";
import { getCatalogUsage } from "../domain/catalog-usage";
import { TableEditor } from "./table-editor";
import { FieldEditor } from "./field-editor";
import { FieldList } from "./field-list";
import { SidePanel, Empty, Modal } from "./workbench-ui";
import { useStudioNavigation } from "./studio-shell";
export interface CatalogPanelProps {
  onSelectDatabase?: (id: string | null) => void;
  onSelectTable?: (id: string | null) => void;
  onSelectField?: (id: string | null) => void;
}
export function CatalogPanel({
  onSelectTable,
  onSelectField,
}: CatalogPanelProps) {
  const ctx = useMomoWorkspace(),
    nav = useStudioNavigation();
  const view = projectCatalog(
    ctx.state.draft.catalog,
    ctx.state.draft.metadata,
  );
  const db =
    nav.databaseId ||
    localStorage.getItem("database_id") ||
    view.databases[0]?.id;
  const tables = view.tables.filter((t) => t.databaseId === db);
  const [selected, setSelected] = useState<string | null>(null),
    [q, setQ] = useState(""),
    [newTable, setNewTable] = useState(false),
    [field, setField] = useState<string | "new" | null>(null),
    [confirm, setConfirm] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (!tables.some((t) => t.tableId === selected))
      setSelected(tables[0]?.tableId ?? null);
  }, [db, tables.map((t) => t.tableId).join(",")]);
  const table = tables.find((t) => t.tableId === selected),
    usage = selected
      ? getCatalogUsage(ctx.state.draft, "table", selected)
      : null;
  function choose(id: string) {
    setSelected(id);
    setField(null);
    setError("");
    onSelectTable?.(id);
    onSelectField?.(null);
  }
  return (
    <div className="studio-catalog-workspace" data-testid="catalog-root">
      <SidePanel initial={300}>
        <div className="studio-side-toolbar">
          <label className="studio-search">
            <Search size={13} />
            <input
              data-testid="catalog-search"
              placeholder="表名 / 说明名称 / 备注"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <button
            className="primary"
            data-testid="new-table"
            disabled={!db}
            onClick={() => setNewTable(true)}
          >
            <Plus size={13} />
            新建表
          </button>
        </div>
        <div className="studio-panel-scroll">
          {tables
            .filter((t) =>
              [t.name, t.label, t.note].some((v) =>
                v?.toLowerCase().includes(q.toLowerCase()),
              ),
            )
            .map((t) => (
              <button
                key={t.tableId}
                data-testid={`table-row-${t.tableId}`}
                className={`studio-resource ${selected === t.tableId ? "active" : ""}`}
                onClick={() => choose(t.tableId)}
              >
                <Table2 size={15} />
                <div>
                  <strong>{t.label}</strong>
                  <small>{t.name}</small>
                </div>
                <span className="studio-count">{t.fields.length}</span>
              </button>
            ))}
          {!tables.length && (
            <Empty>
              <Table2 size={24} />
              目录为空，点击新建表开始。
              {!db && (
                <button onClick={() => nav.createDesign()}>
                  先创建设计库
                </button>
              )}
            </Empty>
          )}
        </div>
      </SidePanel>
      <section className="studio-catalog-main">
        {table ? (
          <>
            <div className="studio-table-properties">
              <TableEditor
                key={table.tableId}
                inline
                databaseId={db!}
                tableId={table.tableId}
              />
              <button
                className="danger"
                aria-label="删除选中表"
                onClick={() => setConfirm(true)}
              >
                <Trash2 size={13} />
                删除表
              </button>
            </div>
            {error && (
              <p role="alert" className="studio-error">
                {error}
              </p>
            )}
            <div className="studio-table-block">
              <div className="studio-block-heading">
                <strong>字段（{table.fields.length}）</strong>
                <button data-testid="new-field" onClick={() => setField("new")}>
                  <Plus size={13} />
                  新建字段
                </button>
              </div>
              <FieldList
                tableId={table.tableId}
                onSelect={(id) => {
                  onSelectField?.(id);
                }}
                onEdit={(id) => {
                  setField(id);
                  onSelectField?.(id);
                }}
              />
            </div>
            <p className="studio-help">
              此处管理表和字段。流程关系在业务流程编辑器中维护。
            </p>
            {ctx.state.draft.business?.refs.some(
              (r) => r.tableId === table.tableId,
            ) && (
              <div className="studio-table-block">
                <div className="studio-block-heading">
                  <strong>业务流程中的使用位置</strong>
                </div>
                {ctx.state.draft.business.refs
                  .filter((r) => r.tableId === table.tableId)
                  .map((r) => (
                    <button
                      key={r.refId}
                      className="studio-usage"
                      onClick={() =>
                        nav.go(`/studio/flows/${r.flowId}?ref=${r.refId}`)
                      }
                    >
                      <ExternalLink size={13} />
                      {
                        ctx.state.draft.business?.flows.find(
                          (f) => f.flowId === r.flowId,
                        )?.name
                      }{" "}
                      /{" "}
                      {
                        ctx.state.draft.business?.flows
                          .find((f) => f.flowId === r.flowId)
                          ?.steps.find((s) => s.stepId === r.stepId)?.name
                      }
                    </button>
                  ))}
              </div>
            )}
          </>
        ) : (
          <Empty>从左侧选择一张表，或新建表。</Empty>
        )}
      </section>
      {newTable && (
        <Modal title="新建数据表" onClose={() => setNewTable(false)}>
          <TableEditor
            databaseId={db!}
            onApplied={(id) => {
              choose(id);
              setNewTable(false);
            }}
            onCancel={() => setNewTable(false)}
          />
        </Modal>
      )}
      {field && table && (
        <Modal
          title={
            field === "new"
              ? `新建字段 · ${table.name}`
              : `编辑字段 · ${table.name}`
          }
          onClose={() => setField(null)}
        >
          <FieldEditor
            tableId={table.tableId}
            fieldId={field === "new" ? undefined : field}
            onApplied={() => setField(null)}
            onCancel={() => setField(null)}
          />
        </Modal>
      )}
      {confirm && table && (
        <Modal
          title={usage?.blocked ? "无法删除表" : "确认删除表"}
          onClose={() => setConfirm(false)}
        >
          {usage?.blocked ? (
            <>
              <p>此表仍被下列对象引用，请先处理引用。</p>
              {usage.usages.map((u, i) => (
                <div className="studio-usage" key={i}>
                  {u.label || u.kind}
                  {u.flowId && (
                    <button
                      onClick={() =>
                        nav.go(
                          `/studio/flows/${u.flowId}${u.refId ? "?ref=" + u.refId : u.ruleId ? "?rule=" + u.ruleId : ""}`,
                        )
                      }
                    >
                      定位
                    </button>
                  )}
                </div>
              ))}
            </>
          ) : (
            <>
              <p>删除「{table.label}」及其字段。取消不会修改目录。</p>
              <div className="studio-actions">
                <button onClick={() => setConfirm(false)}>取消</button>
                <button
                  className="danger"
                  onClick={() => {
                    const r = ctx.deleteTable({ tableId: table.tableId });
                    if (r.ok) {
                      setConfirm(false);
                      setSelected(null);
                    } else setError(r.error.message);
                  }}
                >
                  确认删除表
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
