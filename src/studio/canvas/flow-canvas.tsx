import { useState, useEffect, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useReactFlow,
  MarkerType,
  type Node,
  type Edge,
  type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { flowNodeTypes } from "./flow-nodes";
import { useWorkspace } from "../state/workspace-provider";
import { projectCatalog } from "../projection/catalog-view";
import { addReference, updateReference } from "../domain/references";
import { addStep, updateStep } from "../domain/steps";
import { deriveFieldEdges } from "../domain/flow-diagram";
import { connectionToRuleCandidate } from "./rule-connections";
import { encodeFieldHandle } from "./field-handle";
import { Modal } from "../components/workbench-ui";
import type { Rule, FlowTransition, StepKind } from "../contracts/business";
export type FlowSelection = {
  kind: "step" | "ref" | "rule" | "transition";
  id: string;
} | null;
export interface FlowCanvasProps {
  flowId: string;
  onRuleCandidate?: (r: Rule | null) => void;
  onSelectRule?: (id: string) => void;
  selection?: FlowSelection;
  onSelect?: (s: FlowSelection) => void;
  onTransitionCandidate?: (t: Omit<FlowTransition, "transitionId">) => void;
}
export function FlowCanvas({
  flowId,
  onRuleCandidate,
  onSelectRule,
  selection,
  onSelect,
  onTransitionCandidate,
}: FlowCanvasProps) {
  const { state, applyOperation } = useWorkspace(),
    rf = useReactFlow();
  const [pending, setPending] = useState<Connection | null>(null),
    [kind, setKind] = useState<"mapping" | "matching">("mapping"),
    [notice, setNotice] = useState("");
  const flow = state.draft.business?.flows.find((f) => f.flowId === flowId),
    view = useMemo(
      () => projectCatalog(state.draft.catalog, state.draft.metadata),
      [state.draft.catalog, state.draft.metadata],
    );
  const refs =
    state.draft.business?.refs.filter((r) => r.flowId === flowId) ?? [];
  const desired: Node[] = flow
    ? [
        ...flow.steps.map((s) => ({
          id: s.stepId,
          type: "step",
          data: { step: s, flowId },
          position: { x: s.x, y: s.y },
          style: { width: s.w, height: s.h },
          selected: selection?.kind === "step" && selection.id === s.stepId,
        })),
        ...refs
          .filter((r) => flow.steps.some((s) => s.stepId === r.stepId))
          .map((r) => ({
            id: r.refId,
            type: "reference",
            parentId: r.stepId,
            extent: "parent" as const,
            position: { x: Math.max(12, r.x), y: Math.max(48, r.y) },
            data: {
              reference: r,
              table: view.tables.find((t) => t.tableId === r.tableId),
            },
            selected: selection?.kind === "ref" && selection.id === r.refId,
            zIndex: 2,
          })),
      ]
    : [];
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(desired);
  const desiredKey = JSON.stringify(desired);
  useEffect(() => {
    setNodes((old) => {
      const map = new Map(old.map((n) => [n.id, n]));
      return desired.map((n) => ({ ...map.get(n.id), ...n }));
    });
  }, [desiredKey, setNodes]);
  const headerHandle = (refId: string, fieldId: string, side: "in" | "out") => {
    const r = refs.find((r) => r.refId === refId);
    return r?.collapsed ||
      (r?.visibleFieldIds && !r.visibleFieldIds.includes(fieldId))
      ? `header-${side}`
      : encodeFieldHandle({ refId, fieldId });
  };
  const seen = new Set<string>();
  const edges: Edge[] = deriveFieldEdges(state.draft, flowId).map((e) => {
    const first = !seen.has(e.ruleId);
    seen.add(e.ruleId);
    return {
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: headerHandle(e.source, e.sourceFieldId, "out"),
      targetHandle: headerHandle(e.target, e.targetFieldId, "in"),
      label: e.label,
      selected: selection?.kind === "rule" && selection.id === e.ruleId,
      data: { ruleId: e.ruleId },
      markerEnd:
        e.kind === "mapping" ? { type: MarkerType.ArrowClosed } : undefined,
      style: {
        stroke: e.kind === "mapping" ? "#3974c6" : "#c78b34",
        strokeDasharray: e.kind === "matching" ? "6 4" : undefined,
        strokeWidth: selection?.id === e.ruleId ? 2.5 : 1.5,
      },
      labelStyle: { fontSize: 10 },
      domAttributes: {
        "data-testid": `rule-edge-${e.ruleId}${first ? "" : ":" + e.id}`,
      } as React.SVGAttributes<SVGGElement>,
    };
  });
  for (const e of flow?.transitions ?? [])
    edges.push({
      id: "transition:" + e.transitionId,
      source: e.sourceStepId,
      target: e.targetStepId,
      sourceHandle: "flow-out",
      targetHandle: "flow-in",
      label: e.label || e.condition || "下一步",
      data: { transitionId: e.transitionId },
      markerEnd: { type: MarkerType.ArrowClosed },
      style: {
        stroke: e.kind === "trigger" ? "#9363b6" : "#536778",
        strokeDasharray: e.kind === "trigger" ? "5 3" : undefined,
        strokeWidth: selection?.id === e.transitionId ? 2.5 : 1.6,
      },
      domAttributes: {
        "data-testid": `transition-edge-${e.transitionId}`,
      } as React.SVGAttributes<SVGGElement>,
    });
  function connect(c: Connection) {
    setNotice("");
    if (!c.sourceHandle || !c.targetHandle) return;
    if (c.sourceHandle === "flow-out" && c.targetHandle === "flow-in") {
      onTransitionCandidate?.({
        sourceStepId: c.source,
        targetStepId: c.target,
        kind: "sequence",
        label: "",
        condition: "",
        note: "",
      });
      return;
    }
    if (
      c.sourceHandle.startsWith("header-") ||
      c.targetHandle.startsWith("header-")
    ) {
      setNotice("创建字段关系前请展开表，或在右侧新建规则。");
      return;
    }
    setKind("mapping");
    setPending(c);
  }
  if (!flow) return <div data-testid="flow-canvas">流程不存在</div>;
  return (
    <div
      className="studio-canvas"
      data-testid="flow-canvas"
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(e) => {
        e.preventDefault();
        setNotice("");
        const pos = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
        const shape = e.dataTransfer.getData("application/x-stackrender-node");
        if (shape) {
          try {
            const kind = JSON.parse(shape).kind as StepKind;
            if (!["step", "start", "end", "decision"].includes(kind)) return;
            const label = {
              step: "业务步骤",
              start: "开始",
              end: "结束",
              decision: "判断",
            }[kind];
            let i = 1;
            while (flow.steps.some((s) => s.name === `${label} ${i}`)) i++;
            const result = applyOperation((s) =>
              addStep(s, {
                flowId,
                name: `${label} ${i}`,
                kind,
                x: pos.x,
                y: pos.y,
                w: kind === "step" ? 640 : kind === "decision" ? 200 : 144,
                h: kind === "step" ? 360 : kind === "decision" ? 140 : 64,
              }),
            );
            if (result.ok && result.stepId)
              onSelect?.({ kind: "step", id: result.stepId });
          } catch {
            setNotice("无法读取节点数据");
          }
          return;
        }
        const raw = e.dataTransfer.getData("application/x-stackrender-table");
        if (!raw) return;
        try {
          const { tableId } = JSON.parse(raw);
          const step = flow.steps
            .slice()
            .reverse()
            .find(
              (s) =>
                (s.kind ?? "step") === "step" &&
                pos.x >= s.x &&
                pos.x < s.x + s.w &&
                pos.y >= s.y &&
                pos.y < s.y + s.h,
            );
          if (!step) {
            setNotice("请把表拖入业务步骤框内。");
            return;
          }
          const result = applyOperation((s) =>
            addReference(s, {
              flowId,
              stepId: step.stepId,
              tableId,
              x: Math.max(12, Math.min(pos.x - step.x, step.w - 248)),
              y: Math.max(48, Math.min(pos.y - step.y, step.h - 100)),
            }),
          );
          if (result.ok) onSelect?.({ kind: "ref", id: result.refId });
          else setNotice(result.error.message);
        } catch {
          setNotice("无法读取表引用数据");
        }
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={flowNodeTypes}
        onNodesChange={onNodesChange}
        fitView
        minZoom={0.2}
        maxZoom={2}
        deleteKeyCode={null}
        onNodeClick={(event, n) => {
          if ((event.target as HTMLElement).closest(".react-flow__handle"))
            return;
          onSelect?.({
            kind: n.type === "reference" ? "ref" : "step",
            id: n.id,
          });
        }}
        onPaneClick={() => onSelect?.(null)}
        onEdgeClick={(_, e) => {
          if (e.data?.ruleId) {
            onSelect?.({ kind: "rule", id: String(e.data.ruleId) });
            onSelectRule?.(String(e.data.ruleId));
          } else if (e.data?.transitionId)
            onSelect?.({ kind: "transition", id: String(e.data.transitionId) });
        }}
        onConnect={connect}
        onNodeDragStop={(_, n) => {
          const result = applyOperation((s) =>
            n.type === "reference"
              ? updateReference(s, {
                  refId: n.id,
                  x: n.position.x,
                  y: n.position.y,
                })
              : updateStep(s, {
                  flowId,
                  stepId: n.id,
                  x: n.position.x,
                  y: n.position.y,
                }),
          );
          if (!result.ok) setNotice(result.error.message);
        }}
      >
        <Background gap={20} size={1} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable />
      </ReactFlow>
      <div className="studio-canvas-legend">
        <span className="map">字段映射 →</span>
        <span className="match">匹配条件 ┄</span>
        <span>流程顺序 →</span>
        <span className="trigger">条件 / 触发 ⇢</span>
      </div>
      {!flow.steps.length && (
        <div className="studio-canvas-empty">
          从左侧添加或拖入开始、业务步骤、判断和结束节点
        </div>
      )}
      {notice && (
        <div className="studio-canvas-notice" role="status">
          {notice}
        </div>
      )}
      {pending && (
        <Modal title="创建字段关系" onClose={() => setPending(null)}>
          <p>连线只预填规则，应用后才加入当前流程。</p>
          <select
            aria-label="关系类型"
            data-testid="connection-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as "mapping" | "matching")}
          >
            <option value="mapping">字段映射 / 运算</option>
            <option value="matching">匹配条件</option>
          </select>
          <div className="studio-actions">
            <button
              data-testid="connection-cancel"
              onClick={() => setPending(null)}
            >
              取消
            </button>
            <button
              className="primary"
              data-testid="connection-confirm"
              onClick={() => {
                if (
                  !pending.sourceHandle ||
                  !pending.targetHandle ||
                  !state.draft.business
                )
                  return;
                const candidate = connectionToRuleCandidate(
                  {
                    flowId,
                    kind,
                    sourceHandle: pending.sourceHandle,
                    targetHandle: pending.targetHandle,
                  },
                  state.draft.business,
                  state.draft.catalog,
                );
                if (candidate) {
                  onRuleCandidate?.(candidate);
                  setPending(null);
                } else setNotice("字段引用无效，未创建任何规则。");
              }}
            >
              继续配置
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
