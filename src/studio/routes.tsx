// Modified for Momo DataFlow, 2026-11-27. See NOTICE.md.
import type { ReactNode } from "react";
import { Route, Navigate } from "react-router-dom";
import { StudioShell } from "./components/studio-shell";
import { CatalogPanel } from "./components/catalog-panel";
import { FlowList } from "./components/flow-list";
import { FlowPage } from "./components/flow-page";
import { TemplatesPage } from "./components/templates-page";
import { OverviewPage } from "./overview/overview-page";
export function useStudioRoutes(): ReactNode {
 return <Route path="/studio" element={<StudioShell />}>
  <Route index element={<Navigate to="tables" replace />} />
  <Route path="tables" element={<CatalogPanel />} />
  <Route path="flows" element={<FlowList />} />
  <Route path="flows/:flowId" element={<FlowPage />} />
  <Route path="templates" element={<TemplatesPage />} />
  <Route path="overview" element={<OverviewPage />} />
  <Route path="erd/*" element={<Navigate to="/studio/tables" replace />} />
 </Route>;
}
export { FlowList, OverviewPage };
