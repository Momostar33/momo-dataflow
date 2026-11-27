/**
 * G01 · T002 — 草稿工作区 React Provider
 *
 * 把纯草稿状态机（./workspace-state）包成一个可跨页面切换存活的工作区上下文：
 *  - 状态保存在 React 上下文里（而非各路由本地），因此在新工作区内路由切换时
 *    草稿 / 版本 / 基线不被丢弃。
 *  - 保存走注入的 `saveFn`（对齐 T004 local-workspace.saveWorkspace 的真实接口
 *    `(state) => Promise<WorkspaceState>`）；本 Provider 不静态导入 local-workspace
 *    （那是浏览器 + 数据库层），保持纯状态与存储解耦。
 *  - 保存是 in-flight-safe：成功时经 applySaveSuccess 合并，保留保存期间的新编辑、
 *    采用新基线；失败时草稿不动，仅记录 lastSaveError。
 *
 * 本模块只做最小 Provider 接线：不引入第二套目录主数据、不写后续业务规则 /
 * 图算法、不求值公式、不加新依赖、无 `any` / `ts-ignore`。
 */

import {
    createContext,
    useCallback,
    useContext,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import type {
    WorkspaceContextValue,
    WorkspaceSaveError,
} from "../contracts/workspace";
import {
    applySaveSuccess,
    createInitialWorkspace,
    emptyCatalog,
    emptyMetadata,
    hasUnsavedChanges,
    withDraftMutations,
    type WorkspaceSnapshot,
    type WorkspaceState,
} from "./workspace-state";
import type { ValidationIssue } from "../domain/rule-validation";

/**
 * Result of a synchronous workspace operation.
 * `ok:true` carries the new state; `ok:false` carries an error with optional validation issues.
 */
export type WorkspaceOperationResult =
    | { ok: true; state: WorkspaceState }
    | { ok: false; error: { code: string; message: string; issues?: ValidationIssue[] } };

/**
 * Workspace context extended with a synchronous operation API.
 */
export interface WorkspaceContextWithOperation extends WorkspaceContextValue {
    applyOperation<R extends WorkspaceOperationResult>(
        op: (state: WorkspaceState) => R
    ): R;
}

const WorkspaceContext = createContext<WorkspaceContextWithOperation | null>(null);

export interface WorkspaceProviderProps {
    /** 可选：Provider 本身不要求内容，便于 SSR / 测试与后续接线方式共存。 */
    children?: ReactNode;
    /** 初始工作区状态。缺省为一个空工作区（revision 0、空目录、无未保存变更）。 */
    initialState?: WorkspaceState;
    /**
     * 保存处理器接缝：接收要持久化的工作区状态，成功后返回对齐后的状态，
     * 失败（冲突/损坏）应抛错。与 T004 local-workspace.saveWorkspace 对齐。
     * 不注入时仍可编辑草稿，但 save() 会以 WorkspaceSaveError(kind="no_saver") 拒绝。
     */
    saveFn?: (state: WorkspaceState) => Promise<WorkspaceState>;
}

const defaultInitialState = (): WorkspaceState =>
    createInitialWorkspace(
        { catalog: emptyCatalog(), metadata: emptyMetadata() },
        { revision: 0, fingerprint: "" }
    );

export function WorkspaceProvider(props: WorkspaceProviderProps) {
    const { children, initialState, saveFn } = props;
    const [state, setState] = useState<WorkspaceState>(
        () => initialState ?? defaultInitialState()
    );
    const [lastSaveError, setLastSaveError] = useState<WorkspaceSaveError | null>(null);

    // 最新状态引用：save() 开始时捕获“要持久化”的那份状态。
    const stateRef = useRef(state);
    stateRef.current = state;

    // 进行中保存守卫：避免并发保存相互覆盖。
    const savingRef = useRef(false);

    const mutate = useCallback((fn: (draft: WorkspaceSnapshot) => void) => {
        setState((prev) => withDraftMutations(prev, fn));
    }, []);

    const save = useCallback(async (): Promise<void> => {
        if (!saveFn) {
            const err: WorkspaceSaveError = {
                kind: "no_saver",
                message: "工作区未配置保存处理器（saveFn）",
            };
            setLastSaveError(err);
            throw err;
        }
        if (savingRef.current) {
            const err: WorkspaceSaveError = {
                kind: "save_failed",
                message: "已有一次保存正在进行，请等待其完成",
            };
            setLastSaveError(err);
            throw err;
        }

        savingRef.current = true;
        const startedState = stateRef.current; // 保存开始时的状态 = 真正要持久化的版本
        try {
            const saved = await saveFn(startedState);
            // in-flight-safe 合并：保留保存期间的新编辑、采用新基线。
            setState((current) => applySaveSuccess(current, saved));
            setLastSaveError(null);
        } catch (cause) {
            // 失败：草稿不动，仅记录错误并拒绝（供调用方呈现/重试）。
            const message =
                cause instanceof Error ? cause.message : String(cause);
            const err: WorkspaceSaveError = { kind: "save_failed", message, cause };
            setLastSaveError(err);
            throw err;
        } finally {
            savingRef.current = false;
        }
    }, [saveFn]);

    const restore = useCallback((next: WorkspaceState) => {
        setState(next);
        setLastSaveError(null);
    }, []);

    const applyOperation = function <R extends WorkspaceOperationResult>(
        op: (state: WorkspaceState) => R
    ): R {
        const currentState = stateRef.current;
        const result = op(currentState);
        if (result.ok) {
            // 更新引用后再 setState，保持最新状态同步
            stateRef.current = result.state;
            setState(result.state);
        }
        // 对于失败不做任何状态变更，保持 draft/editVersion/dirty/lastSaveError 不变
        return result;
    };

    const value = useMemo<WorkspaceContextWithOperation>(
        () => ({
            state,
            isDirty: hasUnsavedChanges(state),
            lastSaveError,
            mutate,
            save,
            restore,
            applyOperation,
        }),
        [state, lastSaveError, mutate, save, restore]
    );

    return (
        <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
    );
}

/** 在 <WorkspaceProvider> 内取工作区上下文；缺失时抛出清晰错误。 */
export function useWorkspace(): WorkspaceContextWithOperation {
    const ctx = useContext(WorkspaceContext);
    if (!ctx) {
        throw new Error("useWorkspace 必须在 <WorkspaceProvider> 内部使用");
    }
    return ctx;
}
