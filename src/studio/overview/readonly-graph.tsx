import { uiError, uiText, useUiLanguage } from "../i18n";
import "@xyflow/react/dist/style.css";
import { useMemo, useEffect, useState } from "react";
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
import {
  layoutOverview,
  OVERVIEW_TABLE_WIDTH,
  OVERVIEW_TABLE_HEIGHT,
  type OverviewPositions,
} from "./overview-layout";
type TableNode = Node<
  {
    displayName: string;
    name: string;
    tableId: string;
  },
  "overview"
>;
function OverviewTableNode({ data, selected }: NodeProps<TableNode>) {
  useUiLanguage();
  return (
    <div
      data-testid={`overview-table-${data.tableId}`}
      className={`studio-overview-table ${selected ? "is-selected" : ""}`}
    >
      <Handle type="target" position={Position.Left} />
      <Table2 size={16} />
      <div>
        <strong title={data.displayName}>{data.displayName}</strong>
        <code title={data.name}>{data.name}</code>
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
  useUiLanguage();
  const layoutKey = JSON.stringify({
    nodes: nodes.map((n) => n.tableId).sort(),
    edges: edges.map((e) => [e.sourceTableId, e.targetTableId, e.kind]).sort(),
  });
  const [layout, setLayout] = useState<{
    key: string;
    positions: OverviewPositions;
    error: string;
  }>({ key: "", positions: {}, error: "" });
  useEffect(() => {
    let active = true;
    layoutOverview(nodes, edges)
      .then((positions) => {
        if (active) setLayout({ key: layoutKey, positions, error: "" });
      })
      .catch(() => {
        // Deterministic fallback keeps a failed layout readable without touching data.
        if (active)
          setLayout({
            key: layoutKey,
            positions: Object.fromEntries(
              nodes.map((n, i) => [
                n.tableId,
                { x: (i % 3) * 380, y: Math.floor(i / 3) * 160 },
              ]),
            ),
            error: uiText("自动排布暂时失败，已使用简化布局。"),
          });
      });
    return () => {
      active = false;
    };
  }, [layoutKey]);
  const ready = layout.key === layoutKey;
  const displayNodes = useMemo(
    () =>
      nodes.map((n) => ({
        id: n.tableId,
        type: "overview" as const,
        data: { displayName: n.displayName, name: n.name, tableId: n.tableId },
        position: layout.positions[n.tableId] ?? { x: 0, y: 0 },
        style: { width: OVERVIEW_TABLE_WIDTH, height: OVERVIEW_TABLE_HEIGHT },
        selected: selectedTableId === n.tableId,
      })),
    [nodes, selectedTableId, layout.positions],
  );
  const displayEdges = useMemo(
    () =>
      edges.map((e) => {
        const reverse =
          e.kind === "matching" &&
          (layout.positions[e.sourceTableId]?.x ?? 0) >
            (layout.positions[e.targetTableId]?.x ?? 0);
        return {
          id: e.id,
          source: reverse ? e.targetTableId : e.sourceTableId,
          target: reverse ? e.sourceTableId : e.targetTableId,
          label: e.flowNames.join("、"),
          markerEnd:
            e.kind === "mapping" ? { type: MarkerType.ArrowClosed } : undefined,
          style: {
            stroke: e.kind === "mapping" ? "#3974c6" : "#c78b34",
            strokeDasharray: e.kind === "matching" ? "6 4" : undefined,
          },
          labelStyle: { fontSize: 11 },
        };
      }),
    [edges, layout.positions],
  );
  const label = (id: string) =>
    nodes.find((n) => n.tableId === id)?.displayName ?? uiText("未知表");
  return (
    <div className="studio-readonly-layout" data-testid="readonly-graph">
      <div className="studio-overview-canvas" aria-busy={!ready}>
        {!ready && (
          <div className="studio-canvas-empty" role="status">
            {uiText("正在自动排布…")}
          </div>
        )}
        {ready && (
          <ReactFlow
            key={layoutKey}
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
        )}
        {ready && layout.error && (
          <p className="studio-canvas-notice" role="status">
            {uiError(layout.error)}
          </p>
        )}
        {ready && !nodes.length && (
          <div className="studio-canvas-empty">
            {uiText("尚无已保存的表关系。在业务流程中添加表与字段规则后保存。")}
          </div>
        )}
      </div>
      <aside className="studio-overview-relations">
        <div className="studio-properties-title">
          {selectedTableId
            ? uiText("此表的上下游")
            : uiText("表关联与业务模块")}
        </div>
        <p className="studio-help">
          {uiText("仅展示表，不展开字段。进入所属流程编辑关系。")}
        </p>
        {selectedTableId && (
          <button onClick={() => onSelectTable?.(selectedTableId)}>
            {uiText("查看关联表")}
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
            <small>
              {e.kind === "mapping"
                ? uiText("映射 / 公式")
                : uiText("匹配条件")}
            </small>
            {e.flowIds.map((id, i) => (
              <button
                key={id}
                data-testid={`overview-edge-${e.id}-flow-${id}`}
                onClick={() => onOpenFlow?.(id)}
              >
                <ExternalLink size={12} />
                {e.flowNames[i] || uiText("业务流程")}
              </button>
            ))}
          </section>
        ))}
        {!edges.length && (
          <p className="studio-help">{uiText("当前范围没有表关联。")}</p>
        )}
      </aside>
    </div>
  );
}
export default ReadonlyGraph;
