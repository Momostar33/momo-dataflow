// Modified for Momo DataFlow, 2026-11-27. See NOTICE.md.
import { CreateDesignDialog } from "./create-design-dialog";
import { DesignImportDialog } from "./design-import-dialog";
import { useDatabaseOperations } from "../../providers/database-provider/database-provider";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import {
  Database,
  Settings,
  Table2,
  Network,
  Workflow,
  SlidersHorizontal,
} from "lucide-react";
import { WorkspaceProvider, useWorkspace } from "../state/workspace-provider";
import { loadWorkspace, saveWorkspace } from "../local-workspace";
import type { WorkspaceState } from "../state/workspace-state";
import { createInitialWorkspace } from "../state/workspace-state";
import { SaveStatus } from "./save-status";
import { SaveSettings } from "./save-settings";
import { useAutosave } from "../state/use-autosave";
import { useUnsavedNavigation } from "../state/use-unsaved-navigation";
import { Modal } from "./workbench-ui";
import "./studio-workbench.css";
const NavContext = createContext<{
  go: (to: string) => void;
  databaseId: string;
  createDesign: () => void;
}>({ go: () => {}, databaseId: "", createDesign: () => {} });
export const useStudioNavigation = () => useContext(NavContext);
export function StudioShell({ children }: { children?: ReactNode }) {
  const [initial, setInitial] = useState<WorkspaceState | null>(null),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    setError("");
    loadWorkspace()
      .then((s) => {
        const rows = s.draft.catalog.databases;
        if (
          rows.length &&
          !rows.some((d) => d.id === localStorage.getItem("database_id"))
        )
          localStorage.setItem("database_id", rows[0].id);
        if (live) setInitial(s);
      })
      .catch((e) => {
        if (live) setError(String(e));
      });
    return () => {
      live = false;
    };
  }, [retry]);
  if (error)
    return (
      <div className="studio-workbench">
        <div className="studio-empty" role="alert">
          载入失败：{error}
          <button onClick={() => setRetry((n) => n + 1)}>重试</button>
        </div>
      </div>
    );
  if (!initial)
    return (
      <div className="studio-workbench">
        <div className="studio-empty">正在读取本机设计工作区…</div>
      </div>
    );
  return (
    <WorkspaceProvider initialState={initial} saveFn={saveWorkspace}>
      <Workbench>{children}</Workbench>
    </WorkspaceProvider>
  );
}
function Workbench({ children }: { children?: ReactNode }) {
  const ctx = useWorkspace(),
    location = useLocation(),
    databaseOperations = useDatabaseOperations();
  const [importOpen, setImportOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [settings, setSettings] = useState(false),
    [db, setDb] = useState(
      () =>
        localStorage.getItem("database_id") ??
        ctx.state.draft.catalog.databases[0]?.id ??
        "",
    ),
    [switchDb, setSwitchDb] = useState<string | null>(null);
  useEffect(() => {
    databaseOperations.switchDatabase(db || undefined);
  }, [db, databaseOperations.switchDatabase]);
  useAutosave({
    isDirty: ctx.isDirty,
    editVersion: ctx.state.editVersion,
    minutes: ctx.state.draft.business?.settings.autosaveMinutes ?? 5,
    save: ctx.save,
  });
  const guard = useUnsavedNavigation({
    isDirty: ctx.isDirty,
    save: ctx.save,
    discard: () => {
      const snapshot = ctx.state.lastSavedSnapshot;
      if (snapshot)
        ctx.restore(
          createInitialWorkspace(snapshot, {
            revision: ctx.state.baseRevision,
            fingerprint: ctx.state.baseFingerprint,
          }),
        );
    },
  });
  const go = (to: string) => {
    if (to !== location.pathname) guard.requestLeave(to);
  };
  const sections = [
    { to: "/studio/tables", name: "表字段", Icon: Table2 },
    { to: "/studio/templates", name: "类型模板", Icon: SlidersHorizontal },
    { to: "/studio/flows", name: "业务流程", Icon: Workflow },
    { to: "/studio/overview", name: "关系总览", Icon: Network },
  ];
  const flow = ctx.state.draft.business?.flows.find((f) =>
    location.pathname.endsWith("/" + f.flowId),
  );
  const title = flow
    ? "业务流程 / " + flow.name
    : (sections.find((s) => location.pathname.startsWith(s.to))?.name ?? "");
  function commitDb() {
    if (switchDb) {
      databaseOperations.switchDatabase(switchDb);
      setDb(switchDb);
      setSwitchDb(null);
    }
  }
  return (
    <NavContext.Provider value={{ go, databaseId: db, createDesign: () => setCreateOpen(true) }}>
      <div className="studio-workbench" data-testid="studio-root">
        <header className="studio-chrome">
          <Link
            className="studio-brand"
            to="/studio/tables"
            onClick={(e) => {
              e.preventDefault();
              go("/studio/tables");
            }}
          >
            <Database size={15} />
            <strong>
              Momo <em>DataFlow</em>
            </strong>
          </Link>
          <nav aria-label="工作区导航">
            {sections.map((s) => (
              <Link
                key={s.to}
                to={s.to}
                aria-current={
                  location.pathname.startsWith(s.to) ? "page" : undefined
                }
                onClick={(e) => {
                  e.preventDefault();
                  go(s.to);
                }}
              >
                {s.name}
              </Link>
            ))}
          </nav>
          <div className="studio-chrome-right">
            <span className="studio-breadcrumb" title={title}>
              {title}
            </span>
            <label className="studio-db-label">
              设计库{" "}
              <select
                aria-label="设计库"
                data-testid="workspace-database"
                value={db}
                onChange={(e) => {
                  const id = e.target.value;
                  if (ctx.isDirty) {
                    setSwitchDb(id);
                    guard.requestLeave("/studio/tables");
                  } else {
                    databaseOperations.switchDatabase(id);
                    setDb(id);
                    go("/studio/tables");
                  }
                }}
              >
                {!ctx.state.draft.catalog.databases.length && (
                  <option value="">尚未创建</option>
                )}
                {ctx.state.draft.catalog.databases.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
            <button className="studio-settings-button" data-testid="open-new-design" onClick={() => setCreateOpen(true)}>新建设计库</button>
            <button
              data-testid="open-design-import"
              className="studio-settings-button"
              onClick={() => setImportOpen(true)}
            >
              导入设计包
            </button>
            <SaveStatus />
            <button
              className="studio-settings-button"
              onClick={() => setSettings(true)}
            >
              <Settings size={14} />
              设置
            </button>
          </div>
        </header>
        {ctx.lastSaveError && (
          <div className="studio-error" role="alert">
            {ctx.lastSaveError.message}，草稿已保留。
          </div>
        )}
        <main className="studio-content" key={db}>
          {children ?? <Outlet />}
        </main>
        <footer className="studio-footer">
          <span>
            本机 SQLite · {ctx.isDirty ? "有未保存修改" : "已保存"} · 自动保存{" "}
            {ctx.state.draft.business?.settings.autosaveMinutes ?? 5} 分钟
          </span>
          <span>只描述业务逻辑，不执行公式与触发动作 · <button onClick={() => setAboutOpen(true)}>关于与许可证</button></span>
        </footer>
        {createOpen && <CreateDesignDialog onClose={() => setCreateOpen(false)} onCreated={(id) => {
          databaseOperations.switchDatabase(id); setDb(id); setCreateOpen(false); go("/studio/tables");
        }} />}
        {aboutOpen && <Modal title="关于 Momo DataFlow" onClose={() => setAboutOpen(false)}>
          <p>Momo DataFlow 0.1.0-beta.1，基于 StackRender 二次开发。修改日期：2026-11-27。</p>
          <p>原项目及贡献者版权继续保留；本修改版依 GNU AGPL v3 提供，不附带任何担保。</p>
          <p><a href="https://github.com/stackrender/stackrender" target="_blank" rel="noreferrer">StackRender 原项目</a> · <a href="https://github.com/Momostar33/momo-dataflow" target="_blank" rel="noreferrer">本版本源代码</a> · <a href="/LICENSE.txt" target="_blank" rel="noreferrer">AGPL-3.0 许可全文</a></p>
        </Modal>}
        {importOpen && (
          <DesignImportDialog
            onClose={() => setImportOpen(false)}
            onImported={(id) => {
              databaseOperations.switchDatabase(id);
              setDb(id);
              setImportOpen(false);
              go("/studio/flows");
            }}
          />
        )}
        {settings && (
          <Modal title="工作区设置" onClose={() => setSettings(false)}>
            <SaveSettings manageAutosave={false} />
            <p className="studio-muted">
              绘制数据保存在当前浏览器的本机 SQLite 中。
            </p>
            <button onClick={() => setSettings(false)}>完成</button>
          </Modal>
        )}
        {guard.pendingTo && (
          <Modal
            title="有未保存的更改"
            onClose={() => {
              guard.cancel();
              setSwitchDb(null);
            }}
          >
            <p>离开前请选择如何处理工作区草稿。</p>
            <div className="studio-actions">
              <button
                data-testid="nav-cancel"
                onClick={() => {
                  guard.cancel();
                  setSwitchDb(null);
                }}
              >
                取消
              </button>
              <button
                data-testid="nav-discard"
                onClick={() => {
                  commitDb();
                  guard.discardAndLeave();
                  guard.cancel();
                }}
              >
                丢弃并继续
              </button>
              <button
                className="primary"
                data-testid="nav-save"
                onClick={async () => {
                  try {
                    await guard.saveAndLeave();
                    guard.cancel();
                    commitDb();
                  } catch {}
                }}
              >
                保存并继续
              </button>
            </div>
          </Modal>
        )}
      </div>
    </NavContext.Provider>
  );
}
