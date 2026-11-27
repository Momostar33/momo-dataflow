import { useEffect, useState } from "react";
import { useParams, useLocation } from "react-router-dom";
import { useReactFlow } from "@xyflow/react";
import {
  ArrowLeft,
  Plus,
  Table2,
  Workflow,
  Layers,
  Diamond,
  Play,
  Square,
  Search,
  Link2,
  Trash2,
} from "lucide-react";
import { useWorkspace } from "../state/workspace-provider";
import { deleteRule } from "../domain/rules";
import { addStep, updateStep, deleteStep } from "../domain/steps";
import { addReference, updateReference } from "../domain/references";
import { saveTransition, removeTransition } from "../domain/flow-diagram";
import type {
  FlowTransition,
  StepKind,
  Rule,
  Step,
} from "../contracts/business";
import { FlowCanvas, type FlowSelection } from "../canvas/flow-canvas";
import { RulePanel } from "./rule-panel";
import { ReferenceActions } from "../canvas/reference-actions";
import { SidePanel, Empty, Modal } from "./workbench-ui";
import { useStudioNavigation } from "./studio-shell";
type TransitionDraft = Omit<FlowTransition, "transitionId"> & {
  transitionId?: string;
};
const shapes: [StepKind, string, typeof Layers][] = [
  ["start", "开始", Play],
  ["step", "业务步骤", Layers],
  ["decision", "判断分支", Diamond],
  ["end", "结束", Square],
];
export function FlowPage() {
  const { flowId = "" } = useParams(),
    location = useLocation(),
    ctx = useWorkspace(),
    rf = useReactFlow(),
    nav = useStudioNavigation();
  const [tab, setTab] = useState<"steps" | "tables" | "rules">("steps"),
    [sel, setSel] = useState<FlowSelection>(null),
    [q, setQ] = useState(""),
    [candidate, setCandidate] = useState<Rule | null>(null),
    [transition, setTransition] = useState<TransitionDraft | null>(null),
    [error, setError] = useState("");
  const [confirm, setConfirm] = useState<{
    title: string;
    action: () => void;
    body: string;
  } | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(location.search),
      ref = params.get("ref"),
      rule = params.get("rule"),
      step = params.get("step");
    setSel(
      ref
        ? { kind: "ref", id: ref }
        : rule
          ? { kind: "rule", id: rule }
          : step
            ? { kind: "step", id: step }
            : null,
    );
    setCandidate(null);
    setTransition(null);
    setError("");
  }, [flowId, location.search]);
  const business = ctx.state.draft.business,
    flow = business?.flows.find((f) => f.flowId === flowId),
    refs = business?.refs.filter((r) => r.flowId === flowId) ?? [],
    rules = business?.rules.filter((r) => r.flowId === flowId) ?? [];
  if (!flow)
    return (
      <Empty>
        此流程不存在。
        <button onClick={() => nav.go("/studio/flows")}>返回流程列表</button>
      </Empty>
    );
  const tables = ctx.state.draft.catalog.tables.filter(
      (t) => t.databaseId === flow.databaseId,
    ),
    filtered = tables.filter((t) =>
      [t.name, t.note, ctx.state.draft.metadata.tableDisplayNames[t.id]].some(
        (v) => v?.toLowerCase().includes(q.toLowerCase()),
      ),
    );
  const selectedStepId =
    sel?.kind === "step"
      ? sel.id
      : sel?.kind === "ref"
        ? refs.find((r) => r.refId === sel.id)?.stepId
        : undefined;
  const selectedRule =
    sel?.kind === "rule"
      ? candidate?.ruleId === sel.id
        ? candidate
        : rules.find((r) => r.ruleId === sel.id)
      : null;
  const selectedRef =
    sel?.kind === "ref" ? refs.find((r) => r.refId === sel.id) : undefined;
  function select(value: FlowSelection) {
    setSel(value);
    setCandidate(null);
    setTransition(null);
    setError("");
  }
  function create(kind: StepKind) {
    const label = shapes.find((s) => s[0] === kind)![1];
    let n = 1;
    while (flow!.steps.some((s) => s.name === label + " " + n)) n++;
    const result = ctx.applyOperation((s) =>
      addStep(s, {
        flowId,
        name: label + " " + n,
        kind,
        x: flow!.steps.length
          ? Math.max(...flow!.steps.map((s) => s.x + s.w)) + 80
          : 40,
        y: kind === "step" ? 120 : 20,
        w: kind === "step" ? 640 : kind === "decision" ? 200 : 144,
        h: kind === "step" ? 360 : kind === "decision" ? 140 : 64,
      }),
    );
    if (result.ok && result.stepId) {
      select({ kind: "step", id: result.stepId });
      setTimeout(() => rf.fitView({ duration: 200, padding: 0.25 }), 80);
    } else if (!result.ok) setError(result.error.message);
  }
  function attach(tableId: string) {
    const step = flow!.steps.find((s) => s.stepId === selectedStepId);
    if (!step || (step.kind ?? "step") !== "step") {
      setError("请先选择一个业务步骤，再添加表。");
      return;
    }
    const old = refs.find(
      (r) => r.stepId === step.stepId && r.tableId === tableId,
    );
    if (old) {
      select({ kind: "ref", id: old.refId });
      return;
    }
    const count = refs.filter((r) => r.stepId === step.stepId).length,
      x = 18 + (count % 2) * 272,
      y = 54 + Math.floor(count / 2) * 250,
      cardHeight =
        62 +
        ctx.state.draft.catalog.fields.filter((f) => f.tableId === tableId)
          .length *
          27;
    const result = ctx.applyOperation((s) => {
      const added = addReference(s, {
        flowId,
        stepId: step.stepId,
        tableId,
        x,
        y,
      });
      if (!added.ok) return added;
      const resized = updateStep(added.state, {
        flowId,
        stepId: step.stepId,
        w: Math.max(step.w, 570),
        h: Math.max(step.h, y + cardHeight + 24),
      });
      return resized.ok ? { ...added, state: resized.state } : resized;
    });
    if (result.ok && "refId" in result && typeof result.refId === "string") {
      select({ kind: "ref", id: result.refId });
      setTimeout(() => rf.fitView({ duration: 200, padding: 0.25 }), 80);
    } else if (!result.ok) setError(result.error.message);
  }
  function propose(rule: Rule | null) {
    if (rule) {
      setCandidate(rule);
      setTransition(null);
      setSel({ kind: "rule", id: rule.ruleId });
    }
  }
  const activeTransition =
    transition ??
    (sel?.kind === "transition"
      ? flow.transitions?.find((t) => t.transitionId === sel.id)
      : null);
  return (
    <div className="studio-flow-editor" data-testid="flow-page">
      <SidePanel initial={280}>
        <div className="studio-panel-heading">
          <button
            aria-label="返回业务流程"
            onClick={() => nav.go("/studio/flows")}
          >
            <ArrowLeft size={15} />
          </button>
          <div>
            <strong>{flow.name}</strong>
            <small>
              {flow.steps.length} 个节点 · {refs.length} 处表引用
            </small>
          </div>
        </div>
        <div className="studio-tabs">
          {(
            [
              ["steps", "步骤与图形"],
              ["tables", "已有表目录"],
              ["rules", "字段规则"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              aria-pressed={tab === id}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="studio-panel-scroll">
          {tab === "steps" && (
            <>
              <div className="studio-shapes">
                {shapes.map(([kind, label, Icon]) => (
                  <button
                    key={kind}
                    data-testid={`add-${kind}`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(
                        "application/x-stackrender-node",
                        JSON.stringify({ kind }),
                      );
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    onClick={() => create(kind)}
                  >
                    <Icon size={17} />
                    {label}
                  </button>
                ))}
              </div>
              <p className="studio-help">
                点击添加，或拖到画布。选中节点后在右侧编辑；节点右侧端口连接到下一节点。
              </p>
              {flow.steps.map((s, i) => (
                <button
                  key={s.stepId}
                  data-testid={`step-row-${s.stepId}`}
                  className={`studio-resource ${selectedStepId === s.stepId ? "active" : ""}`}
                  onClick={() => {
                    select({ kind: "step", id: s.stepId });
                    rf.fitBounds(
                      { x: s.x, y: s.y, width: s.w, height: s.h },
                      { duration: 250, padding: 0.4 },
                    );
                  }}
                >
                  <Layers size={14} />
                  <div>
                    <strong>
                      {i + 1}. {s.name}
                    </strong>
                    <small>
                      {shapes.find((k) => k[0] === (s.kind ?? "step"))?.[1]} ·{" "}
                      {refs.filter((r) => r.stepId === s.stepId).length} 张表
                    </small>
                  </div>
                </button>
              ))}
            </>
          )}
          {tab === "tables" && (
            <>
              <label className="studio-search">
                <Search size={14} />
                <input
                  placeholder="搜索表名、说明或备注"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </label>
              <p className="studio-help">
                把表拖入业务步骤框；也可选中步骤后点添加。仅引用表，不复制表定义。
              </p>
              {filtered.map((t) => (
                <div
                  className="studio-resource"
                  key={t.id}
                  draggable
                  data-testid={`drag-table-${t.id}`}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      "application/x-stackrender-table",
                      JSON.stringify({ tableId: t.id }),
                    );
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                >
                  <Table2 size={14} />
                  <div>
                    <strong>
                      {ctx.state.draft.metadata.tableDisplayNames[t.id] ||
                        t.name}
                    </strong>
                    <small>{t.name}</small>
                  </div>
                  <button
                    aria-label={`添加表 ${t.name}`}
                    disabled={!selectedStepId}
                    onClick={() => attach(t.id)}
                  >
                    <Plus size={14} />
                  </button>
                </div>
              ))}
              {!filtered.length && (
                <Empty>当前设计库暂无匹配的表。先在表字段目录创建。</Empty>
              )}
            </>
          )}
          {tab === "rules" && (
            <>
              <button
                data-testid="new-rule"
                className="studio-wide"
                onClick={() => {
                  setCandidate(null);
                  setTransition(null);
                  setSel({ kind: "rule", id: "new" });
                }}
              >
                <Plus size={14} />
                新建字段规则
              </button>
              {rules.map((r) => (
                <button
                  key={r.ruleId}
                  data-testid={`rule-row-${r.ruleId}`}
                  className={`studio-resource ${sel?.id === r.ruleId ? "active" : ""}`}
                  onClick={() => select({ kind: "rule", id: r.ruleId })}
                >
                  <Link2 size={14} />
                  <div>
                    <strong>{r.name}</strong>
                    <small>
                      {r.conditions.length} 条匹配 · {r.mappings.length} 行映射
                    </small>
                  </div>
                </button>
              ))}
              {!rules.length && (
                <Empty>从字段端口连线，可预填匹配或映射规则。</Empty>
              )}
            </>
          )}
        </div>
      </SidePanel>
      <FlowCanvas
        key={flowId}
        flowId={flowId}
        selection={sel}
        onSelect={select}
        onRuleCandidate={propose}
        onTransitionCandidate={(t) => {
          setCandidate(null);
          setTransition(t);
          setSel({ kind: "transition", id: "new" });
        }}
      />
      <aside className="studio-properties">
        <div className="studio-properties-title">属性与业务逻辑</div>
        <div className="studio-properties-scroll">
          {error && (
            <p role="alert" className="studio-error">
              {error}
            </p>
          )}
          {!sel && (
            <Empty>
              <Workflow size={28} />
              <strong>选择步骤、表或连线</strong>
              <p>
                左侧添加图形与表，中间自由绘图；右侧编辑名称、条件、映射公式和说明。
              </p>
            </Empty>
          )}
          {sel?.kind === "step" &&
            flow.steps.find((s) => s.stepId === sel.id) && (
              <StepProperties
                key={sel.id}
                step={flow.steps.find((s) => s.stepId === sel.id)!}
                flowId={flowId}
                onAttach={() => setTab("tables")}
                onDelete={() => {
                  const removed = refs
                    .filter((r) => r.stepId === sel.id)
                    .map((r) => r.refId);
                  const affected = rules.filter(
                    (r) =>
                      r.conditions.some(
                        (c) =>
                          removed.includes(c.left?.refId ?? "") ||
                          removed.includes(c.right?.refId ?? ""),
                      ) ||
                      r.mappings.some(
                        (m) =>
                          removed.includes(m.target?.refId ?? "") ||
                          m.expr.some(
                            (t) =>
                              t.kind === "field" && removed.includes(t.refId),
                          ),
                      ),
                  );
                  setConfirm({
                    title: "删除节点",
                    body: `将移除此节点、${removed.length} 处表引用、${affected.length} 条字段规则及相连流程箭头；目录中的表不会被删除。`,
                    action: () => {
                      const result = ctx.applyOperation((s) =>
                        deleteStep(s, {
                          flowId,
                          stepId: sel.id,
                          confirmed: true,
                        }),
                      );
                      if (!result.ok) setError(result.error.message);
                      else select(null);
                    },
                  });
                }}
              />
            )}
          {selectedRef && (
            <>
              <h3>
                {
                  ctx.state.draft.catalog.tables.find(
                    (t) => t.id === selectedRef.tableId,
                  )?.name
                }
              </h3>
              <p className="studio-help">
                本流程局部表引用。移除不会删除表定义。
              </p>
              <ReferenceActions refId={selectedRef.refId} />
              <h4>画布可见字段</h4>
              <button
                onClick={() =>
                  ctx.applyOperation((s) =>
                    updateReference(s, {
                      refId: selectedRef.refId,
                      visibleFieldIds: s.draft.catalog.fields
                        .filter((f) => f.tableId === selectedRef.tableId)
                        .map((f) => f.id),
                    }),
                  )
                }
              >
                显示全部字段
              </button>
              {ctx.state.draft.catalog.fields
                .filter((f) => f.tableId === selectedRef.tableId)
                .map((f) => (
                  <label className="studio-checkbox-row" key={f.id}>
                    <input
                      type="checkbox"
                      checked={
                        !selectedRef.visibleFieldIds ||
                        selectedRef.visibleFieldIds.includes(f.id)
                      }
                      onChange={(e) => {
                        const all =
                          selectedRef.visibleFieldIds ??
                          ctx.state.draft.catalog.fields
                            .filter((f) => f.tableId === selectedRef.tableId)
                            .map((f) => f.id);
                        ctx.applyOperation((s) =>
                          updateReference(s, {
                            refId: selectedRef.refId,
                            visibleFieldIds: e.target.checked
                              ? [...all, f.id]
                              : all.filter((id) => id !== f.id),
                          }),
                        );
                      }}
                    />
                    {ctx.state.draft.metadata.fieldDisplayNames[f.id] || f.name}
                  </label>
                ))}
              <h4>相关字段规则</h4>
              {rules
                .filter(
                  (r) =>
                    r.conditions.some(
                      (c) =>
                        c.left?.refId === selectedRef.refId ||
                        c.right?.refId === selectedRef.refId,
                    ) ||
                    r.mappings.some(
                      (m) =>
                        m.target?.refId === selectedRef.refId ||
                        m.expr.some(
                          (t) =>
                            t.kind === "field" && t.refId === selectedRef.refId,
                        ),
                    ),
                )
                .map((r) => (
                  <button
                    className="studio-wide"
                    key={r.ruleId}
                    onClick={() => select({ kind: "rule", id: r.ruleId })}
                  >
                    {r.name}
                  </button>
                ))}
            </>
          )}
          {sel?.kind === "rule" && (selectedRule || sel.id === "new") && (
            <RulePanel
              key={sel.id}
              flowId={flowId}
              rule={candidate ? undefined : (selectedRule ?? undefined)}
              initialCandidate={candidate ?? undefined}
              onClose={() => select(null)}
            />
          )}
          {sel?.kind === "rule" && selectedRule && !candidate && (
            <button
              className="danger"
              onClick={() =>
                setConfirm({
                  title: "删除字段规则",
                  body: "只删除当前规则及其画布连线，不删除任何表或字段。",
                  action: () => {
                    ctx.applyOperation((s) =>
                      deleteRule(s, { ruleId: selectedRule.ruleId }),
                    );
                    select(null);
                  },
                })
              }
            >
              删除字段规则
            </button>
          )}
          {activeTransition && (
            <TransitionProperties
              key={
                activeTransition.transitionId ??
                `${activeTransition.sourceStepId}:${activeTransition.targetStepId}`
              }
              value={activeTransition}
              flowId={flowId}
              onClose={() => select(null)}
            />
          )}
        </div>
      </aside>
      {confirm && (
        <Modal title={confirm.title} onClose={() => setConfirm(null)}>
          <p>{confirm.body}</p>
          <div className="studio-actions">
            <button onClick={() => setConfirm(null)}>取消</button>
            <button
              className="danger"
              onClick={() => {
                confirm.action();
                setConfirm(null);
              }}
            >
              确认删除
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
function StepProperties({
  step,
  flowId,
  onAttach,
  onDelete,
}: {
  step: Step;
  flowId: string;
  onAttach: () => void;
  onDelete: () => void;
}) {
  const ctx = useWorkspace();
  const [name, setName] = useState(step.name),
    [note, setNote] = useState(step.note),
    [x, setX] = useState(step.x),
    [y, setY] = useState(step.y),
    [w, setW] = useState(step.w),
    [h, setH] = useState(step.h),
    [error, setError] = useState("");
  useEffect(() => {
    setX(step.x);
    setY(step.y);
    setW(step.w);
    setH(step.h);
  }, [step.x, step.y, step.w, step.h]);
  return (
    <section data-testid="flow-detail">
      <h3>{shapes.find((s) => s[0] === (step.kind ?? "step"))?.[1]}</h3>
      <label>
        节点名称
        <input
          data-testid="step-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label>
        业务说明
        <textarea
          data-testid="step-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <div className="studio-form-pair">
        <label>
          横坐标
          <input
            type="number"
            data-testid="step-x"
            value={x}
            onChange={(e) => setX(Number(e.target.value))}
          />
        </label>
        <label>
          纵坐标
          <input
            type="number"
            data-testid="step-y"
            value={y}
            onChange={(e) => setY(Number(e.target.value))}
          />
        </label>
      </div>
      {(step.kind ?? "step") === "step" && (
        <>
          <div className="studio-form-pair">
            <label>
              宽度
              <input
                type="number"
                min={320}
                value={w}
                onChange={(e) => setW(Number(e.target.value))}
              />
            </label>
            <label>
              高度
              <input
                type="number"
                min={220}
                value={h}
                onChange={(e) => setH(Number(e.target.value))}
              />
            </label>
          </div>
          <button className="studio-wide" onClick={onAttach}>
            <Plus size={14} />
            从已有表目录添加
          </button>
        </>
      )}
      {error && <p className="studio-error">{error}</p>}
      <div className="studio-actions">
        <button
          data-testid="step-apply"
          className="primary"
          onClick={() => {
            const r = ctx.applyOperation((s) =>
              updateStep(s, {
                flowId,
                stepId: step.stepId,
                name,
                note,
                x,
                y,
                w,
                h,
              }),
            );
            setError(r.ok ? "" : r.error.message);
          }}
        >
          应用节点属性
        </button>
        <button className="danger" onClick={onDelete}>
          <Trash2 size={13} />
          删除节点
        </button>
      </div>
      <p className="studio-help">
        位置 {Math.round(step.x)}, {Math.round(step.y)} · 拖动自动更新布局草稿。
      </p>
    </section>
  );
}
function TransitionProperties({
  value,
  flowId,
  onClose,
}: {
  value: TransitionDraft;
  flowId: string;
  onClose: () => void;
}) {
  const ctx = useWorkspace();
  const [draft, setDraft] = useState({ ...value }),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState(false);
  const flow = ctx.state.draft.business?.flows.find((f) => f.flowId === flowId);
  return (
    <section data-testid="transition-panel">
      <h3>流程连线</h3>
      <p className="studio-help">
        只记录顺序、条件及动作说明，不执行任何业务。
      </p>
      <label>
        来源节点
        <select
          value={draft.sourceStepId}
          onChange={(e) => setDraft({ ...draft, sourceStepId: e.target.value })}
        >
          {flow?.steps.map((s) => (
            <option value={s.stepId} key={s.stepId}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        目标节点
        <select
          value={draft.targetStepId}
          onChange={(e) => setDraft({ ...draft, targetStepId: e.target.value })}
        >
          {flow?.steps.map((s) => (
            <option value={s.stepId} key={s.stepId}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        连线类型
        <select
          data-testid="transition-kind"
          value={draft.kind}
          onChange={(e) =>
            setDraft({
              ...draft,
              kind: e.target.value as "sequence" | "trigger",
            })
          }
        >
          <option value="sequence">流程顺序</option>
          <option value="trigger">条件 / 触发</option>
        </select>
      </label>
      <label>
        连线名称
        <input
          data-testid="transition-label"
          value={draft.label}
          onChange={(e) => setDraft({ ...draft, label: e.target.value })}
          placeholder="例如：审批通过"
        />
      </label>
      <label>
        条件说明
        <textarea
          data-testid="transition-condition"
          value={draft.condition}
          onChange={(e) => setDraft({ ...draft, condition: e.target.value })}
          placeholder="例如：审核状态 = 已通过"
        />
      </label>
      <label>
        动作与备注
        <textarea
          value={draft.note}
          onChange={(e) => setDraft({ ...draft, note: e.target.value })}
          placeholder="例如：生成采购单；仅记录，不执行"
        />
      </label>
      {error && (
        <p role="alert" className="studio-error">
          {error}
        </p>
      )}
      <div className="studio-actions">
        <button data-testid="transition-cancel" onClick={onClose}>
          取消
        </button>
        <button
          className="primary"
          data-testid="transition-apply"
          onClick={() => {
            const result = ctx.applyOperation((s) =>
              saveTransition(s, flowId, draft),
            );
            if (result.ok) onClose();
            else setError(result.error.message);
          }}
        >
          应用连线
        </button>
        {value.transitionId && (
          <button className="danger" onClick={() => setConfirm(true)}>
            删除
          </button>
        )}
      </div>
      {confirm && (
        <Modal title="删除流程连线" onClose={() => setConfirm(false)}>
          <p>只删除当前流程的这条连线，不影响节点和表。</p>
          <button
            className="danger"
            onClick={() => {
              const id = value.transitionId;
              if (id)
                ctx.applyOperation((s) => removeTransition(s, flowId, id));
              onClose();
            }}
          >
            确认删除
          </button>
        </Modal>
      )}
    </section>
  );
}
