import { Navigate, Route } from "react-router-dom";

const useDatabaseRoutes = () => {
  return (
    <Route path="/database">
      <Route index element={<Navigate to="/studio/tables" replace />} />
      <Route path="tables" element={<Navigate to="/studio/tables" replace />} />
      <Route
        path="relationships"
        element={<Navigate to="/studio/flows" replace />}
      />
      <Route path="erd" element={<Navigate to="/studio/erd" replace />} />
      <Route
        path="foreign-keys"
        element={<Navigate to="/studio/erd/foreign-keys" replace />}
      />
    </Route>
  );
};

export default useDatabaseRoutes;
