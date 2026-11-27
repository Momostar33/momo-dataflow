import { uiText, useUiLanguage } from "../i18n";
import { useFieldInsertion } from "../components/field-insertion-context";
import { FIELD_DRAG_TYPE } from "../domain/field-insertion";
import { toast } from "sonner";
import {
  Handle,
  Position,
  NodeResizer,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import {
  Table2,
  ChevronDown,
  ChevronRight,
  Diamond,
  Play,
  Square,
  Layers,
} from "lucide-react";
import { useWorkspace } from "../state/workspace-provider";
import { updateStep } from "../domain/steps";
import { updateReference } from "../domain/references";
import type { Step, TableRef } from "../contracts/business";
import type { TableView } from "../projection/catalog-view";
import { encodeFieldHandle } from "./field-handle";
export type StepFlowNode = Node<
  {
    step: Step;
    flowId: string;
  },
  "step"
>;
export type ReferenceFlowNode = Node<
  {
    reference: TableRef;
    table?: TableView;
  },
  "reference"
>;
export function StepNode({ data, selected }: NodeProps<StepFlowNode>) {
  useUiLanguage();
  const { applyOperation } = useWorkspace();
  const s = data.step,
    kind = s.kind ?? "step";
  const Icon =
    kind === "start"
      ? Play
      : kind === "end"
        ? Square
        : kind === "decision"
          ? Diamond
          : Layers;
  return (
    <div
      data-testid={`step-node-${s.stepId}`}
      className={`studio-step-node kind-${kind} ${selected ? "is-selected" : ""}`}
    >
      {kind === "step" && (
        <NodeResizer
          isVisible={selected}
          minWidth={320}
          minHeight={220}
          onResizeEnd={(_, p) =>
            applyOperation((state) =>
              updateStep(state, {
                flowId: data.flowId,
                stepId: s.stepId,
                x: p.x,
                y: p.y,
                w: p.width,
                h: p.height,
              }),
            )
          }
        />
      )}
      <div className="studio-node-heading">
        <Icon size={14} />
        <strong>{s.name}</strong>
        {kind === "step" && <span>{uiText("业务步骤")}</span>}
      </div>
      {kind !== "step" && s.note && <p>{s.note}</p>}
      {kind !== "start" && (
        <Handle
          type="target"
          position={Position.Left}
          id="flow-in"
          className="studio-flow-handle"
        />
      )}
      {kind !== "end" && (
        <Handle
          type="source"
          position={Position.Right}
          id="flow-out"
          className="studio-flow-handle"
        />
      )}
    </div>
  );
}
export function ReferenceNode({
  data,
  selected,
}: NodeProps<ReferenceFlowNode>) {
  useUiLanguage();
  const { applyOperation } = useWorkspace();
  const { reference: r, table } = data;
  const fieldInsertion = useFieldInsertion();
  if (!table)
    return (
      <div className="studio-ref-node studio-error">
        {uiText("此表定义已不存在")}
      </div>
    );
  const fields = r.visibleFieldIds
    ? table.fields.filter((f) => r.visibleFieldIds!.includes(f.fieldId))
    : table.fields;
  return (
    <div
      data-testid={`reference-node-${r.refId}`}
      className={`studio-ref-node ${selected ? "is-selected" : ""}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="header-in"
        style={{ top: 23, opacity: r.collapsed ? 1 : 0 }}
      />
      <div className="studio-ref-heading">
        <Table2 size={14} />
        <div>
          <strong>{table.label}</strong>
          <code>{table.name}</code>
        </div>
        <button
          className="nodrag"
          aria-label={r.collapsed ? uiText("展开表字段") : uiText("折叠表字段")}
          onClick={(e) => {
            e.stopPropagation();
            applyOperation((s) =>
              updateReference(s, { refId: r.refId, collapsed: !r.collapsed }),
            );
          }}
        >
          {r.collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
        </button>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        id="header-out"
        style={{ top: 23, opacity: r.collapsed ? 1 : 0 }}
      />
      {!r.collapsed &&
        fields.map((f) => (
          <div
            key={f.fieldId}
            className="studio-ref-field nodrag"
            draggable
            title={uiText("拖入公式，或 Ctrl/⌘ 点击插入")}
            onDragStart={(e) => {
              e.stopPropagation();
              e.dataTransfer.setData(
                FIELD_DRAG_TYPE,
                JSON.stringify({ refId: r.refId, fieldId: f.fieldId }),
              );
              e.dataTransfer.effectAllowed = "copy";
            }}
            onClick={(e) => {
              if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                e.stopPropagation();
                if (
                  !fieldInsertion.insert({ refId: r.refId, fieldId: f.fieldId })
                )
                  toast.info(uiText("请先打开要编辑的字段关系"));
              }
            }}
            data-testid={`reference-field-${r.refId}-${f.fieldId}`}
          >
            <Handle
              type="target"
              position={Position.Left}
              id={encodeFieldHandle({ refId: r.refId, fieldId: f.fieldId })}
            />
            <span title={f.note ?? ""}>{f.label}</span>
            <code>{f.raw.typeId ? f.typeName : uiText("未设类型")}</code>
            <Handle
              type="source"
              position={Position.Right}
              id={encodeFieldHandle({ refId: r.refId, fieldId: f.fieldId })}
            />
          </div>
        ))}
      {!r.collapsed && fields.length === 0 && (
        <p className="studio-muted">
          {uiText("尚无可见字段，在右侧选择字段。")}
        </p>
      )}
    </div>
  );
}
export const flowNodeTypes = { step: StepNode, reference: ReferenceNode };
