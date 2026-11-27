/**
 * G01 · T002 — 草稿工作区状态（纯 TS，无 React/DOM 依赖，可单测）
 *
 * 设计约束（见 IMPLEMENTATION_NOTES.md / G01-interfaces.md）：
 *  - 草稿以 F01 合同（src/studio/contracts/catalog.ts）为唯一数据结构：
 *    WorkspaceSnapshot = { catalog: CatalogSnapshot; metadata: CatalogMetadata }
 *    不新造平行类型；保留可空与未知列；data_types.id 保持 string | null。
 *  - 不可变更新：每次变更整体 clone → mutate → deepFreeze，避免意外共享引用。
 *  - 稳定 id：新增行用 uuid v4（项目既有依赖）；改名只改 name/metadata，不改 id。
 *  - 冲突检测口径：
 *      baseRevision   —— 载入时 studio_document 的 revision（0 = 从未保存过）
 *      baseFingerprint—— 载入时“被动列”的确定性指纹：databases / dataTypes /
 *                        relationships / indices / fieldIndices（G01 不编辑它们）。
 *    tables/fields 由草稿全量快照表达（last-write-wins），不参与冲突判定，
 *    但其“被动依赖行”（relationships/indices/field_indices）若被外部改动则冲突。
 *  - 手动保存、版本、持久化在 T004 的 local-workspace 中落地；本模块只做状态机与纯函数。
 */

import { v4 as uuidv4 } from "uuid";
import { CatalogMetadata, CatalogRow, CatalogSnapshot } from "../contracts/catalog";

/** 一个可保存的工作区快照：原始目录 + 显示名业务元数据（键为稳定行 id）。 */
import type { BusinessDocument } from "../contracts/business";

export interface WorkspaceSnapshot {
    catalog: CatalogSnapshot;
    metadata: CatalogMetadata;
    business?: BusinessDocument;
}

/**
 * 草稿工作区状态。
 *  - draft            ：当前可编辑快照（deep-frozen；修改必须经 withDraftMutations）。
 *  - lastSavedSnapshot：最近一次成功保存的快照（未保存过为 null）。
 *  - editVersion      ：每次草稿变更 +1（从 0 起）。
 *  - savedEditVersion ：最近一次成功保存时的 editVersion。
 *  - baseRevision / baseFingerprint：载入时记录的冲突检测基线（见文件头注释）。
 */
export interface WorkspaceState {
    draft: WorkspaceSnapshot;
    lastSavedSnapshot: WorkspaceSnapshot | null;
    editVersion: number;
    savedEditVersion: number;
    baseRevision: number;
    baseFingerprint: string;
}

/** 载入时的冲突基线（由读取层在 T003 提供）。 */
export interface LoadBaseline {
    revision: number;
    fingerprint: string;
}

/** 空的原始目录快照（7 类实体全空数组）。 */
export const emptyCatalog = (): CatalogSnapshot => ({
    databases: [],
    tables: [],
    fields: [],
    dataTypes: [],
    relationships: [],
    indices: [],
    fieldIndices: [],
});

/** 空的显示名元数据。 */
export const emptyMetadata = (): CatalogMetadata => ({
    tableDisplayNames: {},
    fieldDisplayNames: {},
});

/**
 * 深拷贝（structuredClone）。原始行来自 SQLite/JSON，均为可克隆的纯数据；
 * 保留 nullability、未知列与数组顺序。
 */
export function cloneSnapshot(snapshot: WorkspaceSnapshot): WorkspaceSnapshot {
    return structuredClone(snapshot);
}

/** 递归冻结（防御性；冻结后任何写操作在严格模式下抛错）。 */
export function deepFreeze<T>(value: T): T {
    if (value !== null && typeof value === "object") {
        const obj = value as Record<string | symbol, unknown>;
        for (const key of Object.getOwnPropertyNames(obj)) {
            deepFreeze(obj[key]);
        }
        Object.freeze(obj);
    }
    return value;
}

/**
 * 用载入的快照初始化工作区。
 *  - draft 与 lastSavedSnapshot 指向同一内容（不同冻结对象），
 *    因此初始 hasUnsavedChanges === false。
 */
export function createInitialWorkspace(
    snapshot: WorkspaceSnapshot,
    baseline: LoadBaseline
): WorkspaceState {
    const draft = deepFreeze(cloneSnapshot(snapshot));
    const saved = deepFreeze(cloneSnapshot(snapshot));
    return {
        draft,
        lastSavedSnapshot: saved,
        editVersion: 0,
        savedEditVersion: 0,
        baseRevision: baseline.revision,
        baseFingerprint: baseline.fingerprint,
    };
}

/**
 * 不可变草稿变更：clone → mutate → freeze → editVersion + 1。
 * mutate 收到的是深拷贝，可以安全修改；返回值是新状态，旧状态不被修改。
 */
export function withDraftMutations(
    state: WorkspaceState,
    mutate: (draft: WorkspaceSnapshot) => void
): WorkspaceState {
    const next = cloneSnapshot(state.draft);
    mutate(next);
    return {
        ...state,
        draft: deepFreeze(next),
        editVersion: state.editVersion + 1,
    };
}

/** 标记一次保存成功：记录快照副本，并把 savedEditVersion 对齐到当前 editVersion。 */
export function markSaved(state: WorkspaceState): WorkspaceState {
    const saved = deepFreeze(cloneSnapshot(state.draft));
    return {
        ...state,
        lastSavedSnapshot: saved,
        savedEditVersion: state.editVersion,
    };
}

/**
 * 保存成功合并（in-flight-safe，纯函数）。
 *
 * 语义：一次保存从 `startedState`（保存开始时的状态）出发，在事务提交时返回
 * 对齐后的 `saved`；但保存是异步的，期间用户可能又做了编辑（`current`）。
 * 合并必须满足：
 *  - 保留 in-flight 编辑：draft / editVersion 取 `current`（保存期间的新编辑不被清除）；
 *  - 采用新基线：baseRevision / baseFingerprint 取 `saved`（避免下次保存误报冲突）；
 *  - 不把“比被保存版本更新的编辑”标记为已保存：
 *    savedEditVersion = min(current.editVersion, saved.savedEditVersion)；
 *  - lastSavedSnapshot = 实际持久化的那份快照（保存开始时的草稿副本）。
 *
 * 纯函数：不修改任何入参，返回全新状态对象。
 */
export function applySaveSuccess(
    current: WorkspaceState,
    saved: WorkspaceState
): WorkspaceState {
    const lastSaved = saved.lastSavedSnapshot ?? deepFreeze(cloneSnapshot(saved.draft));
    return {
        draft: current.draft,
        lastSavedSnapshot: lastSaved,
        editVersion: current.editVersion,
        savedEditVersion: Math.min(current.editVersion, saved.savedEditVersion),
        baseRevision: saved.baseRevision,
        baseFingerprint: saved.baseFingerprint,
    };
}

/** 是否存在未保存变更。 */
export const hasUnsavedChanges = (state: WorkspaceState): boolean =>
    state.editVersion !== state.savedEditVersion;

/**
 * 确定性序列化：对象键排序后 JSON.stringify。
 * 用于指纹/比较；对同一原始行集合产生稳定字符串（行内列顺序无关）。
 */
export function stableStringify(value: unknown): string {
    if (value === null || typeof value !== "object") {
        if (value === undefined) return "undefined";
        return JSON.stringify(value) ?? "null";
    }
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableStringify(item)).join(",")}]`;
    }
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj)
        .filter((k) => obj[k] !== undefined)
        .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

/** 全部 7 类实体的确定性指纹。 */
export function catalogFingerprint(snapshot: CatalogSnapshot): string {
    return stableStringify(snapshot);
}

/**
 * G01 冲突判定用的“被动列”指纹：
 * databases / dataTypes / relationships / indices / fieldIndices。
 * tables/fields 由草稿全量快照表达，不参与冲突判定（见文件头注释）。
 */
export function passiveFingerprint(snapshot: CatalogSnapshot): string {
    return stableStringify({
        databases: snapshot.databases,
        dataTypes: snapshot.dataTypes,
        relationships: snapshot.relationships,
        indices: snapshot.indices,
        fieldIndices: snapshot.fieldIndices,
    });
}

/** 生成稳定新 id（uuid v4，与项目既有 id 口径一致）。 */
export const newStableId = (): string => uuidv4();

/** trim 后的名称。 */
export const trimName = (name: string): string => (typeof name === "string" ? name.trim() : "");

/**
 * 按 trim 后名称判重（同作用域内）。
 * @param name       候选名称
 * @param siblings   同作用域现有行（id/name）
 * @param excludeId  改名场景下排除自身
 * 空名称（trim 后为空）不算重名，由调用方单独报“名称为空”。
 */
export function isDuplicateName(
    name: string,
    siblings: Pick<CatalogRow, "id" | "name">[],
    excludeId?: string
): boolean {
    const target = trimName(name);
    if (!target) return false;
    return siblings.some(
        (row) =>
            row.id !== excludeId &&
            typeof row.name === "string" &&
            trimName(row.name) === target
    );
}

/** 取某作用域（如 databaseId / tableId）的现有名称列表，供判重。 */
export function siblingNames<T extends CatalogRow & { databaseId?: string }>(
    rows: T[],
    key: "databaseId" | "tableId",
    scopeId: string
): string[] {
    return rows
        .filter((row) => row[key] === scopeId)
        .map((row) => (typeof row.name === "string" ? row.name : ""));
}
