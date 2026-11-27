import { uiError, uiText, useUiLanguage } from "../i18n";
import { useStudioNavigation } from "./studio-shell";
import { Plus, Layers, Trash2 } from "lucide-react";
import { SidePanel, Modal, Empty } from "./workbench-ui";
import { useState, useEffect } from "react";
import { useWorkspace } from "../state/workspace-provider";
import {
  createTemplate,
  updateTemplate,
  publishTemplateVersion,
  deleteTemplate,
} from "../domain/templates";
import { previewTemplateApplication } from "../domain/template-preview";
import { applyTemplatePreview } from "../domain/template-application";
import { TemplatePreviewDialog } from "./template-preview-dialog";
import type { TemplatePreview } from "../domain/template-preview";
export function TemplatesPage() {
  useUiLanguage();
  const ctx = useWorkspace();
  const { databaseId } = useStudioNavigation();
  const [fieldQuery, setFieldQuery] = useState("");
  const tableIds = new Set(
    ctx.state.draft.catalog.tables
      .filter((t) => !databaseId || t.databaseId === databaseId)
      .map((t) => t.id),
  );
  const eligibleFields = ctx.state.draft.catalog.fields.filter((f) =>
    tableIds.has(f.tableId),
  );
  const targetFields = eligibleFields.filter(
    (f) =>
      !fieldQuery ||
      [
        f.name,
        ctx.state.draft.catalog.tables.find((t) => t.id === f.tableId)?.name,
        ctx.state.draft.metadata.fieldDisplayNames[f.id],
      ].some((v) => v?.toLowerCase().includes(fieldQuery.toLowerCase())),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [kind, setKind] = useState<
    "money" | "int" | "text" | "datetime" | "custom"
  >("money");
  const [typeId, setTypeId] = useState<string>("");
  const [precision, setPrecision] = useState<string>("");
  const [scale, setScale] = useState<string>("");
  const [maxLength, setMaxLength] = useState<string>("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Preview state
  const [preview, setPreview] = useState<TemplatePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  // Field selection state
  const [selectedFieldIds, setSelectedFieldIds] = useState<string[]>([]);
  const business = ctx.state.draft.business;
  const dataTypes = ctx.state.draft.catalog.dataTypes.filter(
    (d) => d.id !== null,
  );
  // Map tables for display
  const tablesMap = new Map(
    ctx.state.draft.catalog.tables.map((t) => [t.id, t]),
  );
  const loadTemplate = (id: string) => {
    const tmpl = business?.templates.find((t) => t.templateId === id);
    if (!tmpl) return;
    setSelectedId(id);
    setName(tmpl.name);
    setNote(tmpl.note);
    setKind(tmpl.kind);
    // Use latest version for defaults
    const latest = tmpl.versions.reduce(
      (a, b) => (b.version > a.version ? b : a),
      tmpl.versions[0],
    );
    setTypeId(latest.typeId ?? "");
    setPrecision(latest.precision?.toString() ?? "");
    setScale(tmpl.kind === "money" ? "2" : (latest.scale?.toString() ?? ""));
    setMaxLength(latest.maxLength?.toString() ?? "");
    // Reset preview and field selection
    setPreview(null);
    setPreviewError(null);
    setSelectedFieldIds([]);
  };
  const clearForm = () => {
    setSelectedId(null);
    setName("");
    setNote("");
    setKind("money");
    const selectedDb =
      ctx.state.draft.catalog.databases.find(
        (d) => d.id === localStorage.getItem("database_id"),
      ) ?? ctx.state.draft.catalog.databases[0];
    setTypeId(
      dataTypes.find(
        (d) =>
          d.name?.toUpperCase() === "DECIMAL" &&
          (!selectedDb || d.dialect === selectedDb.dialect),
      )?.id ?? "",
    );
    // Apply defaults for new money template
    setPrecision("18");
    setScale("2");
    setMaxLength("");
    setError(null);
    setPreview(null);
    setPreviewError(null);
    setSelectedFieldIds([]);
  };
  // Default precision/scale for new money template
  useEffect(() => {
    if (!selectedId && kind === "money" && precision === "" && scale === "") {
      setPrecision("18");
      setScale("2");
    }
  }, [selectedId, kind, precision, scale]);
  // Clear preview and field selection when template changes
  useEffect(() => {
    if (!selectedId) clearForm();
    else {
      setPreview(null);
      setPreviewError(null);
      setSelectedFieldIds([]);
    }
  }, [selectedId]);
  const handleApply = () => {
    if (!name.trim()) {
      setError(uiText("模板名称不能为空"));
      return;
    }
    const params = {
      name,
      kind,
      typeId,
      note,
      precision: precision ? parseInt(precision, 10) : undefined,
      scale: scale ? parseInt(scale, 10) : undefined,
      maxLength: maxLength ? parseInt(maxLength, 10) : undefined,
    };
    if (selectedId) {
      const res = ctx.applyOperation((state) =>
        updateTemplate(state, { templateId: selectedId, name, note }),
      );
      if (!res.ok) setError(res.error.message);
    } else {
      const res = ctx.applyOperation((state) => createTemplate(state, params));
      if (!res.ok) setError(res.error.message);
      else {
        // Select the newly created template
        setSelectedId(res.templateId);
        loadTemplate(res.templateId);
      }
    }
  };
  const handlePublish = () => {
    if (!selectedId) return;
    const params = {
      templateId: selectedId,
      typeId,
      precision: precision ? parseInt(precision, 10) : undefined,
      scale: scale ? parseInt(scale, 10) : undefined,
      maxLength: maxLength ? parseInt(maxLength, 10) : undefined,
    };
    const res = ctx.applyOperation((state) =>
      publishTemplateVersion(state, params),
    );
    if (!res.ok) setError(res.error.message);
  };
  const handlePreview = () => {
    if (!selectedId) return;
    if (selectedFieldIds.length === 0) {
      setPreviewError(uiText("请选择字段"));
      setPreview(null);
      return;
    }
    const tmpl = business?.templates.find((t) => t.templateId === selectedId);
    if (!tmpl) return;
    const latest = tmpl.versions.reduce(
      (a, b) => (b.version > a.version ? b : a),
      tmpl.versions[0],
    );
    const res = previewTemplateApplication(ctx.state, {
      templateId: selectedId,
      version: latest.version,
      fieldIds: selectedFieldIds,
    });
    if (!res.ok) {
      setPreviewError(res.error.message);
      setPreview(null);
    } else {
      setPreview(res.preview);
      setPreviewError(null);
    }
  };
  const handleConfirmPreview = () => {
    if (!preview) return;
    const res = ctx.applyOperation((state) =>
      applyTemplatePreview(state, { preview }),
    );
    if (!res.ok) {
      setPreviewError(res.error.message);
    } else {
      setPreview(null);
      setPreviewError(null);
    }
  };
  const handleCancelPreview = () => {
    setPreview(null);
    setPreviewError(null);
  };
  const selected = business?.templates.find((t) => t.templateId === selectedId);
  const latest = selected?.versions.reduce((a, b) =>
    a.version > b.version ? a : b,
  );
  const pendingFields =
    business?.assignments.filter(
      (a) =>
        tableIds.has(
          ctx.state.draft.catalog.fields.find((f) => f.id === a.fieldId)
            ?.tableId ?? "",
        ) &&
        a.templateId === selectedId &&
        a.appliedVersion < (latest?.version ?? 0),
    ) ?? [];
  return (
    <div className="studio-template-workspace" data-testid="templates-root">
      <SidePanel initial={280}>
        <div className="studio-panel-heading">
          <strong>{uiText("字段模板")}</strong>
          <button data-testid="new-template" onClick={clearForm}>
            <Plus size={13} />
            {uiText("新建字段模板")}
          </button>
        </div>
        <div className="studio-panel-scroll">
          {business?.templates.map((t) => (
            <button
              key={t.templateId}
              className={`studio-resource ${selectedId === t.templateId ? "active" : ""}`}
              data-testid={`template-row-${t.templateId}`}
              onClick={() => loadTemplate(t.templateId)}
            >
              <Layers size={15} />
              <div>
                <strong>{t.name}</strong>
                <small>
                  v{Math.max(...t.versions.map((v) => v.version))} ·{" "}
                  {t.kind === "money" ? uiText("金额固定两位") : t.kind}
                </small>
              </div>
            </button>
          ))}
        </div>
      </SidePanel>
      <section className="studio-template-main">
        <div className="studio-page-title">
          <div>
            <h2>{selected?.name ?? uiText("新建字段模板")}</h2>
            <p>
              {uiText("字段采用模板后参数统一；发布新版不会自动修改已有字段。")}
            </p>
          </div>
          {selected && (
            <button className="danger" onClick={() => setDeleting(true)}>
              <Trash2 size={13} />
              {uiText("删除模板")}
            </button>
          )}
        </div>
        <div className="studio-template-columns">
          <section className="studio-table-block studio-template-form">
            <div className="studio-block-heading">
              <strong>
                {uiText("类型配置")}
                {latest
                  ? uiText(" · 当前 v{{v0}}", {
                      v0: latest.version,
                    })
                  : ""}
              </strong>
            </div>
            <div className="studio-form-grid">
              <label>
                {uiText("模板名称")}
                <input
                  data-testid="template-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <label>
                {uiText("业务类型")}
                <select
                  data-testid="template-kind"
                  value={kind}
                  disabled={!!selectedId}
                  onChange={(e) => {
                    setKind(e.target.value as typeof kind);
                    if (e.target.value === "money") {
                      setPrecision("18");
                      setScale("2");
                      setTypeId(
                        dataTypes.find(
                          (d) => d.name?.toUpperCase() === "DECIMAL",
                        )?.id ?? "",
                      );
                    }
                  }}
                >
                  <option value="money">{uiText("金额")}</option>
                  <option value="int">{uiText("整数")}</option>
                  <option value="text">{uiText("文本")}</option>
                  <option value="datetime">{uiText("日期时间")}</option>
                  <option value="custom">{uiText("自定义")}</option>
                </select>
              </label>
              <label>
                {uiText("技术类型")}
                <select
                  data-testid="template-type"
                  value={typeId}
                  onChange={(e) => setTypeId(e.target.value)}
                >
                  <option value="">{uiText("请选择")}</option>
                  {dataTypes
                    .filter(
                      (d) =>
                        kind !== "money" || d.name?.toUpperCase() === "DECIMAL",
                    )
                    .map((d) => (
                      <option key={d.id!} value={d.id!}>
                        {d.name} · {d.dialect}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                {uiText("总精度")}
                <input
                  data-testid="template-precision"
                  type="number"
                  value={precision}
                  onChange={(e) => setPrecision(e.target.value)}
                />
              </label>
              <label>
                {uiText("小数位")}
                {kind === "money" ? uiText("（固定2）") : ""}
                <input
                  data-testid="template-scale"
                  type="number"
                  disabled={kind === "money"}
                  value={kind === "money" ? "2" : scale}
                  onChange={(e) => setScale(e.target.value)}
                />
              </label>
              <label>
                {uiText("字符长度")}
                <input
                  data-testid="template-length"
                  type="number"
                  disabled={kind === "money"}
                  value={maxLength}
                  onChange={(e) => setMaxLength(e.target.value)}
                />
              </label>
              <label className="studio-form-full">
                {uiText("备注")}
                <textarea
                  data-testid="template-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>
            </div>
            {error && (
              <p role="alert" className="studio-error">
                {uiError(error)}
              </p>
            )}
            <div className="studio-actions">
              <button
                className="primary"
                data-testid="template-apply"
                onClick={handleApply}
              >
                {selectedId ? uiText("更新名称与备注") : uiText("创建模板")}
              </button>
              {selectedId && (
                <button data-testid="template-publish" onClick={handlePublish}>
                  {uiText("发布新版本")}
                </button>
              )}
            </div>
            {selected && (
              <p className="studio-help">
                {uiText("历史版本：")}
                {selected.versions.map((v) => `v${v.version}`).join(" / ")}
                {uiText(" · 字段继续采用原版本，直到确认应用。")}
              </p>
            )}
          </section>
          <section className="studio-table-block studio-template-targets">
            <div className="studio-block-heading">
              <strong>{uiText("选择批量应用的字段")}</strong>
              <span>
                {pendingFields.length}
                {uiText(" 项待更新")}
              </span>
            </div>
            <label className="studio-search">
              <input
                aria-label={uiText("搜索待应用字段")}
                placeholder={uiText("搜索当前设计库的表名或字段")}
                value={fieldQuery}
                onChange={(e) => setFieldQuery(e.target.value)}
              />
            </label>
            {targetFields.length > 150 && (
              <p className="studio-help">
                {uiText("当前匹配")}
                {targetFields.length}
                {uiText("项，显示前150项；请用搜索定位字段。")}
              </p>
            )}
            {!eligibleFields.length ? (
              <Empty>{uiText("先在表目录创建字段，再预览应用模板。")}</Empty>
            ) : (
              targetFields.slice(0, 150).map((f) => (
                <label className="studio-checkbox-row" key={f.id}>
                  <input
                    data-testid={`template-target-${f.id}`}
                    type="checkbox"
                    checked={selectedFieldIds.includes(f.id)}
                    onChange={(e) =>
                      setSelectedFieldIds((old) =>
                        e.target.checked
                          ? [...old, f.id]
                          : old.filter((id) => id !== f.id),
                      )
                    }
                  />
                  <span>
                    {tablesMap.get(f.tableId)?.name}.{f.name}
                  </span>
                </label>
              ))
            )}
            <div className="studio-actions">
              {selected && pendingFields.length > 0 && (
                <button
                  onClick={() =>
                    setSelectedFieldIds(pendingFields.map((a) => a.fieldId))
                  }
                >
                  {uiText("选择全部待更新字段")}
                </button>
              )}
              <button
                data-testid="template-preview"
                disabled={!selectedId || !selectedFieldIds.length}
                onClick={handlePreview}
              >
                {uiText("预览更改（")}
                {selectedFieldIds.length}
                {uiText("\uFF09")}
              </button>
            </div>
            {previewError && (
              <p className="studio-error">{uiError(previewError)}</p>
            )}
          </section>
        </div>
      </section>
      {preview && (
        <TemplatePreviewDialog
          catalog={ctx.state.draft.catalog}
          business={business}
          error={previewError ?? undefined}
          preview={preview}
          onConfirm={handleConfirmPreview}
          onCancel={handleCancelPreview}
        />
      )}
      {deleting && selected && (
        <Modal
          title={uiText("删除模板「") + selected.name + "」"}
          onClose={() => setDeleting(false)}
        >
          <p>
            {uiText(
              "仅能删除没有字段采用的非金额模板，旧版本采用也会阻止删除。",
            )}
          </p>
          <div className="studio-actions">
            <button onClick={() => setDeleting(false)}>{uiText("取消")}</button>
            <button
              className="danger"
              onClick={() => {
                const result = ctx.applyOperation((s) =>
                  deleteTemplate(s, selected.templateId),
                );
                if (result.ok) {
                  setDeleting(false);
                  clearForm();
                } else {
                  setError(result.error.message);
                  setDeleting(false);
                }
              }}
            >
              {uiText("确认删除模板")}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
