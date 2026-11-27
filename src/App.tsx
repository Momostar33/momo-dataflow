// Modified for Momo DataFlow, 2026-11-27. See NOTICE.md.
import "@/styles/globals.css";
import { ReactFlowProvider } from "@xyflow/react";
import useAppRoutes from "./routes/app-route";
import { SyncProvider } from "./providers/sync-provider/sync-provider";
import DatabaseProvider from "./providers/database-provider/database-provider";
export default function App() {
 const routes=useAppRoutes();
 return <SyncProvider><ReactFlowProvider><DatabaseProvider>{routes}</DatabaseProvider></ReactFlowProvider></SyncProvider>;
}
