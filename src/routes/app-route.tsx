// Modified for Momo DataFlow, 2026-11-27. See NOTICE.md.
import { Route, Routes, Navigate } from "react-router-dom";
import { useStudioRoutes } from "../studio/routes";
export default function useAppRoutes() {
 return <Routes>
  <Route path="/" element={<Navigate to="/studio/tables" replace />} />
  <Route path="/database/*" element={<Navigate to="/studio/tables" replace />} />
  {useStudioRoutes()}
  <Route path="*" element={<Navigate to="/studio/tables" replace />} />
 </Routes>;
}
