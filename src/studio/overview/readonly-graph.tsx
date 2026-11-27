import "@xyflow/react/dist/style.css";
import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  MarkerType,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { Table2, ExternalLink } from "lucide-react";
import type { OverviewNode, OverviewEdge } from "./derive-overview";
type TableNode = Node<
  { displayName: string; name: string; tableId: string },
  "overview"
>;
function OverviewTableNode({ data, selected }: NodeProps<TableNode>) {
  return (
    <div
      data-testid={`overview-table-${data.tableId}`}
      className={`studio-overview-table ${selected ? "is-selected" : ""}`}
    >
      <Handle type="target" position={Position.Left} />
      <Table2 size={16} />
      <div>
        <strong>{data.displayName}</strong>
        <code>{data.name}</code>
      </div>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
const nodeTypes = { overview: OverviewTableNode };
export interface ReadonlyGraphProps {
  nodes: OverviewNode[];
  edges: OverviewEdge[];
  selectedTableId?: string | null;
  onSelectTable?: (id: string) => void;
  onOpenFlow?: (id: string) => void;
}
export function ReadonlyGraph({
  nodes,
  edges,
  selectedTableId,
  onSelectTable,
  onOpenFlow,
}: ReadonlyGraphProps) {
  const displayNodes = useMemo(
    () =>
      nodes.map((n, i) => ({
        id: n.tableId,
        type: "overview" as const,
        data: { displayName: n.displayName, name: n.name, tableId: n.tableId },
        position: { x: (i % 3) * 310, y: Math.floor(i / 3) * 180 },
        selected: selectedTableId === n.tableId,
      })),
    [nodes, selectedTableId],
  );
  const displayEdges = useMemo(
    () =>
      edges.map((e) => ({
        id: e.id,
        source: e.sourceTableId,
        target: e.targetTableId,
        label: e.flowNames.join("、"),
        markerEnd:
          e.kind === "mapping" ? { type: MarkerType.ArrowClosed } : undefined,
        style: {
          stroke: e.kind === "mapping" ? "#3974c6" : "#c78b34",
          strokeDasharray: e.kind === "matching" ? "6 4" : undefined,
        },
        labelStyle: { fontSize: 11 },
      })),
    [edges],
  );
  const label = (id: string) =>
    nodes.find((n) => n.tableId === id)?.displayName ?? "未知表";
  return (
    <div className="studio-readonly-layout" data-testid="readonly-graph">
      <div className="studio-overview-canvas">
        <ReactFlow
          nodes={displayNodes}
          edges={displayEdges}
          nodeTypes={nodeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          edgesReconnectable={false}
          deleteKeyCode={null}
          maxZoom={1.25}
          fitView
          onNodeClick={(_, n) => onSelectTable?.(n.id)}
        >
          <Controls showInteractive={false} />
          <Background gap={24} />
        </ReactFlow>
        {!nodes.length && (
          <div className="studio-canvas-empty">
            尚无已保存的表关系。在业务流程中添加表与字段规则后保存。
          </div>
        )}
      </div>
      <aside className="studio-overview-relations">
        <div className="studio-properties-title">
          {selectedTableId ? "此表的上下游" : "表关联与业务模块"}
        </div>
        <p className="studio-help">
          仅展示表，不展开字段。进入所属流程编辑关系。
        </p>
        {selectedTableId && (
          <button onClick={() => onSelectTable?.(selectedTableId)}>
            查看关联表
          </button>
        )}
        {edges.map((e) => (
          <section
            className="studio-overview-relation"
            data-testid={`overview-edge-${e.id}`}
            key={e.id}
          >
            <strong>
              {label(e.sourceTableId)} {e.kind === "mapping" ? "→" : "↔"}{" "}
              {label(e.targetTableId)}
            </strong>
            <small>{e.kind === "mapping" ? "映射 / 公式" : "匹配条件"}</small>
            {e.flowIds.map((id, i) => (
              <button
                key={id}
                data-testid={`overview-edge-${e.id}-flow-${id}`}
                onClick={() => onOpenFlow?.(id)}
              >
                <ExternalLink size={12} />
                {e.flowNames[i] || "业务流程"}
              </button>
            ))}
          </section>
        ))}
        {!edges.length && <p className="studio-help">当前范围没有表关联。</p>}
      </aside>
    </div>
  );
}
export default ReadonlyGraph;
