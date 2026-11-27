import { getUiLanguage, uiText, useUiLanguage } from "../i18n";
import { scopeDesignSnapshot } from "../domain/design-scope";
import { useState, useMemo } from "react";
import { useStudioNavigation } from "../components/studio-shell";
import { SidePanel } from "../components/workbench-ui";
import { useWorkspace } from "../state/workspace-provider";
import { deriveOverview } from "./derive-overview";
import type { OverviewNode } from "./derive-overview";
import ReadonlyGraph from "./readonly-graph";
/**
 * Overview page – read‑only graph view of tables and business edges.
 *
 * - Uses the last saved snapshot from the workspace provider.
 * - Derives nodes/edges via `deriveOverview`.
 * - Allows filtering by flow (module) and by table (node).
 * - All UI elements use data-testid attributes as required.
 */
export function OverviewPage() {
  useUiLanguage();
  const { state } = useWorkspace();
  const { go: navigate, databaseId } = useStudioNavigation();
  const snapshot = useMemo(
    () => scopeDesignSnapshot(state.lastSavedSnapshot, databaseId),
    [state.lastSavedSnapshot, databaseId],
  );
  // Derive full graph once per snapshot change
  const { nodes: allNodes, edges: allEdges } = useMemo(
    () => (snapshot ? deriveOverview(snapshot) : { nodes: [], edges: [] }),
    [snapshot],
  );
  // Flow filter state
  const [selectedFlowId, setSelectedFlowId] = useState<string>("");
  // Table selection state
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  // Compute filtered nodes based on selected flow
  const filteredNodes = useMemo(() => {
    if (!selectedFlowId) return allNodes;
    const flowRefs = snapshot?.business?.refs.filter(
      (r) => r.flowId === selectedFlowId,
    );
    const refTableIds = new Set(flowRefs?.map((r) => r.tableId) ?? []);
    return allNodes.filter((n) => refTableIds.has(n.tableId));
  }, [selectedFlowId, allNodes, snapshot]);
  // Compute filtered edges based on selected flow
  const filteredEdges = useMemo(() => {
    if (!selectedFlowId) return allEdges;
    return allEdges.filter((e) => e.flowIds.includes(selectedFlowId));
  }, [selectedFlowId, allEdges]);
  // Compute reachable set when a table is selected
  const reachableNodes = useMemo(() => {
    if (!selectedTableId) return filteredNodes;
    const nodeMap = new Map<string, OverviewNode>();
    filteredNodes.forEach((n) => nodeMap.set(n.tableId, n));
    const visited = new Set<string>();
    const stack: string[] = [selectedTableId];
    while (stack.length) {
      const id = stack.pop()!;
      if (!visited.has(id)) {
        visited.add(id);
        // Find edges where this node is source or target
        filteredEdges.forEach((e) => {
          if (e.sourceTableId === id && !visited.has(e.targetTableId)) {
            stack.push(e.targetTableId);
          }
          if (e.targetTableId === id && !visited.has(e.sourceTableId)) {
            stack.push(e.sourceTableId);
          }
        });
      }
    }
    return filteredNodes.filter((n) => visited.has(n.tableId));
  }, [selectedTableId, filteredNodes, filteredEdges]);
  // Edges to display based on reachable nodes
  const reachableEdges = useMemo(() => {
    const nodeSet = new Set(reachableNodes.map((n) => n.tableId));
    return filteredEdges.filter(
      (e) => nodeSet.has(e.sourceTableId) && nodeSet.has(e.targetTableId),
    );
  }, [reachableNodes, filteredEdges]);
  // Handle table click
  const onTableClick = (tableId: string) => {
    setSelectedTableId((prev) => (prev === tableId ? null : tableId));
  };
  // Build flow options for select
  const flowOptions = useMemo(() => {
    const flows = snapshot?.business?.flows ?? [];
    return [
      { value: "", label: uiText("全部业务流程") },
      ...flows.map((f) => ({ value: f.flowId, label: f.name })),
    ];
  }, [snapshot, getUiLanguage()]);
  return (
    <div data-testid="overview-root" className="studio-overview-workspace">
      <SidePanel initial={270}>
        <h3>{uiText("关系总览")}</h3>
        <p className="studio-help">
          {uiText(
            "只读最近成功保存的快照。点击表查看其上下游，在具体流程中修改。",
          )}
        </p>
        <div>
          <label htmlFor="flow-filter">{uiText("业务模块: ")}</label>
          <select
            id="flow-filter"
            data-testid="overview-module-filter"
            value={selectedFlowId}
            onChange={(e) => setSelectedFlowId(e.target.value)}
          >
            {flowOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </SidePanel>
      <div className="studio-overview-main">
        <ReadonlyGraph
          nodes={reachableNodes}
          edges={reachableEdges}
          selectedTableId={selectedTableId}
          onSelectTable={onTableClick}
          onOpenFlow={(flowId) =>
            navigate(`/studio/flows/${encodeURIComponent(flowId)}`)
          }
        />
      </div>
    </div>
  );
}
export default OverviewPage;
