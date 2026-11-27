/**
 * G01 · T002 — 冻结的工作区合同（最小公开接口）
 *
 * 对 src/studio/state/workspace-state.ts 中纯草稿状态机的薄“冻结门面”：
 * 统一暴露核心状态类型，并定义 React Provider 与消费方共用的最小公开接口
 * （上下文值 + 保存失败错误形状）。
 *
 * 设计规则：
 *  - 类型只在一处定义：WorkspaceState / WorkspaceSnapshot / LoadBaseline 来自
 *    state/workspace-state（状态机是唯一事实来源）；此处仅再导出，供消费方
 *    通过单一合同模块引用，不必直接触碰状态机模块。
 *  - 目录原始行类型仍只来自 contracts/catalog.ts（F01）；这里不重复导出，
 *    避免形成第二套可编辑目录主数据。
 *  - 本模块不引入 React：保持纯 TS，Provider 与非 React 代码都可安全导入。
 *  - 无运行时行为、无公式求值、无 `any`、无 `ts-ignore`。
 */

import type {
    LoadBaseline,
    WorkspaceSnapshot,
    WorkspaceState,
} from "../state/workspace-state";

// 再导出核心状态类型，作为单一冻结合同入口。
export type { LoadBaseline, WorkspaceSnapshot, WorkspaceState };

/**
 * 一次未真正落库的保存尝试所携带的错误信息。
 *  - kind "no_saver"   ：Provider 创建时未注入保存处理器（saveFn）。
 *  - kind "save_failed"：保存处理器拒绝（如 T004 的 WorkspaceConflictError /
 *                        WorkspaceCorruptionError）。
 * `cause` 保留原始拒绝对象以供诊断（绝不对其做公式求值）。
 */
export interface WorkspaceSaveError {
    kind: "no_saver" | "save_failed";
    message: string;
    cause?: unknown;
}

/**
 * 冻结的工作区公开接口。
 *
 *  - state            ：当前草稿工作区状态（draft 深冻结；变更必须经 mutate）。
 *  - isDirty          ：hasUnsavedChanges(state) —— 草稿存在比上次成功保存更新的编辑时为 true。
 *  - lastSaveError    ：最近一次失败保存尝试（无则为 null；restore 时清除）。
 *  - mutate(fn)       ：不可变草稿变更（clone → mutate → freeze → editVersion + 1）。
 *  - save()           ：经注入的保存处理器持久化；失败时以 WorkspaceSaveError 拒绝，
 *                       且不触碰草稿；成功后合并（保留 in-flight 编辑、采用新基线）。
 *  - restore(state)   ：整体替换工作区状态（例如冲突后重新载入），并清除 lastSaveError。
 *
 * 该接口为最小冻结面：不暴露 draft 的直接写入口、不暴露第二套目录主数据。
 */
export interface WorkspaceContextValue {
    state: WorkspaceState;
    isDirty: boolean;
    lastSaveError: WorkspaceSaveError | null;
    mutate: (fn: (draft: WorkspaceSnapshot) => void) => void;
    save: () => Promise<void>;
    restore: (state: WorkspaceState) => void;
}
