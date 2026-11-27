/**
 * G01 · T005 — 表定义创建、编辑与安全删除（纯 TS，无 React/DOM/DB 依赖，可单测）
 *
 * 职责（对应 inputs/G01.md T005）：
 *  - 在共享目录草稿（WorkspaceState.draft）中管理表的：技术名、显示名（metadata）、备注。
 *  - 只读影响查询接口 `tableImpact`：列出删除该表会牵涉的子行与外部引用。
 *  - 安全删除：存在真实引用（relationships / indices / field_indices）时阻止直接删除，
 *    不修改草稿；不允许把删除直接接到无保护 cascade（保存时的级联删除只在草稿
 *    已表达“无引用”的前提下由 T004 的原子事务执行，见 local-workspace.ts）。
 *
 * 不变量：
 *  - 空名称（trim 后为空）与同库 trim 后重名一律拒绝，拒绝时不修改草稿。
 *  - 不同库允许同名，但行 id（身份）必须不同。
 *  - 重命名只改 `name`：稳定 id、posX/posY/sequence/note 与显示名元数据全部保留。
 *  - 新增行用 `newStableId()`（uuid v4，T002 口径）；`createdAt` 留 null，
 *    与 ERD 真实建表路径（tables-controller addNewTable）一致，该列为可空。
 *  - 所有成功变更经 `withDraftMutations`（clone→mutate→freeze→editVersion+1），
 *    失败路径原样返回，不产生新状态。
 *
 * 依赖：仅 F01 合同（../contracts/catalog）与 T002 状态机（../state/workspace-state）。
 * 不新增依赖、不 `any`、不 `ts-ignore`、不求值公式。
 */

import {
    CatalogFieldIndexRow,
    CatalogFieldRow,
    CatalogIndexRow,
    CatalogRelationshipRow,
    CatalogSnapshot,
    CatalogTableRow,
} from "../contracts/catalog";
import {
    WorkspaceState,
    withDraftMutations,
    newStableId,
    trimName,
    isDuplicateName,
} from "../state/workspace-state";

// ─────────────────────────────────────────────────────────────────────────────
// 错误与结果
// ─────────────────────────────────────────────────────────────────────────────

export type CatalogErrorCode =
    | "EMPTY_NAME"
    | "DUPLICATE_NAME"
    | "TABLE_NOT_FOUND"
    | "DATABASE_NOT_FOUND"
    | "DELETE_BLOCKED";

export interface CatalogErrorInfo {
    code: CatalogErrorCode;
    message: string;
    /** DUPLICATE_NAME：冲突的 trim 后名称（供界面回显）。 */
    name?: string;
    /** DELETE_BLOCKED：只读影响查询结果（供界面展示“被谁引用”）。 */
    impact?: TableImpact;
}

export type CatalogOpResult =
    | { ok: true; state: WorkspaceState }
    | { ok: false; error: CatalogErrorInfo };

/** 建表成功时附带新行 id，供界面聚焦/选中（T007 用）。 */
export type AddTableResult =
    | { ok: true; state: WorkspaceState; tableId: string }
    | { ok: false; error: CatalogErrorInfo };

// ─────────────────────────────────────────────────────────────────────────────
// 只读影响查询
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 删除某表的影响面（只读，不改草稿）：
 *  - fields        ：表自己的字段行（子行，随表一起从草稿移除，不构成“引用”）。
 *  - relationships ：以该表为 source/target 的真实关系（阻止删除）。
 *  - indices       ：建在该表上的索引（阻止删除）。
 *  - fieldIndices  ：索引落到该表字段上的映射（阻止删除）。
 *  - blocking      ：上述三类引用总数，> 0 即不允许直接删除。
 */
export interface TableImpact {
    tableId: string;
    fields: CatalogFieldRow[];
    relationships: CatalogRelationshipRow[];
    indices: CatalogIndexRow[];
    fieldIndices: CatalogFieldIndexRow[];
    blocking: number;
}

export function tableImpact(snapshot: CatalogSnapshot, tableId: string): TableImpact {
    const ownFieldIds = new Set(
        snapshot.fields.filter((field) => field.tableId === tableId).map((field) => field.id)
    );
    const relationships = snapshot.relationships.filter(
        (rel) => rel.sourceTableId === tableId || rel.targetTableId === tableId
    );
    const indices = snapshot.indices.filter((index) => index.tableId === tableId);
    const fieldIndices = snapshot.fieldIndices.filter((fi) => ownFieldIds.has(fi.fieldId));
    return {
        tableId,
        fields: snapshot.fields.filter((field) => field.tableId === tableId),
        relationships,
        indices,
        fieldIndices,
        blocking: relationships.length + indices.length + fieldIndices.length,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 内部工具
// ─────────────────────────────────────────────────────────────────────────────

const TABLE_NODE_WIDTH = 224; // 与 ERD 布局口径一致（isTablesOverlapping 使用的默认宽）
const TABLE_NODE_GAP = 80;    // 新表与最右已有表之间的留白

const fail = (error: CatalogErrorInfo): CatalogOpResult => ({ ok: false, error });

const failAdd = (error: CatalogErrorInfo): AddTableResult => ({ ok: false, error });

const findTable = (state: WorkspaceState, tableId: string): CatalogTableRow | undefined =>
    state.draft.catalog.tables.find((table) => table.id === tableId);

const tablesOfDatabase = (state: WorkspaceState, databaseId: string): CatalogTableRow[] =>
    state.draft.catalog.tables.filter((table) => table.databaseId === databaseId);

/** ERD 同口径的下一 sequence（空库 = 0；非空 = 最大+1），容忍 null。 */
const nextTableSequence = (tables: CatalogTableRow[]): number => {
    if (tables.length === 0) return 0;
    const max = tables.reduce(
        (acc, table) => (typeof table.sequence === "number" && table.sequence > acc ? table.sequence : acc),
        0
    );
    return max + 1;
};

// ─────────────────────────────────────────────────────────────────────────────
// 操作
// ─────────────────────────────────────────────────────────────────────────────

export interface AddTableArgs {
    databaseId: string;
    name: string;
    /** 备注；trim 后为空视为未设置（存 null）。 */
    note?: string | null;
    /** 显示名（仅 metadata）；trim 后为空视为未设置（不建键）。 */
    displayName?: string | null;
}

/**
 * 新建表：空名/同库 trim 后重名拒绝；不同库同名允许（id 不同）。
 * 新行 posX/posY 避开该库已有表（确定性、无重叠），sequence 取 ERD 同口径。
 */
export function addTable(state: WorkspaceState, args: AddTableArgs): AddTableResult {
    const { databaseId, name } = args;
    const trimmed = trimName(name);
    if (!trimmed) {
        return failAdd({ code: "EMPTY_NAME", message: "Table name cannot be empty." });
    }
    if (!state.draft.catalog.databases.some((db) => db.id === databaseId)) {
        return failAdd({ code: "DATABASE_NOT_FOUND", message: "Database not found in the current draft." });
    }
    const siblings = tablesOfDatabase(state, databaseId);
    if (isDuplicateName(trimmed, siblings)) {
        return failAdd({
            code: "DUPLICATE_NAME",
            name: trimmed,
            message: `A table named "${trimmed}" already exists in this database.`,
        });
    }

    const tableId = newStableId();
    const rightmost = siblings.reduce(
        (acc, table) => (typeof table.posX === "number" ? Math.max(acc, table.posX + TABLE_NODE_WIDTH) : acc),
        0
    );
    const row: CatalogTableRow = {
        id: tableId,
        databaseId,
        name: trimmed,
        posX: siblings.length === 0 ? 0 : rightmost + TABLE_NODE_GAP,
        posY: 0,
        color: null,
        width: null,
        note: trimName(args.note ?? "") || null,
        sequence: nextTableSequence(siblings),
        createdAt: null, // 与 ERD addNewTable 一致：该列可空，留空
    };
    const displayName = trimName(args.displayName ?? "");

    const next = withDraftMutations(state, (draft) => {
        draft.catalog.tables.push(row);
        if (displayName) {
            draft.metadata.tableDisplayNames[tableId] = displayName;
        }
    });
    return { ok: true, state: next, tableId };
}

/**
 * 重命名表：只改 `name`（trim 后），稳定 id / 位置 / 备注 / 显示名元数据不变。
 */
export function renameTable(
    state: WorkspaceState,
    args: { tableId: string; name: string }
): CatalogOpResult {
    const table = findTable(state, args.tableId);
    if (!table) {
        return fail({ code: "TABLE_NOT_FOUND", message: "Table not found in the current draft." });
    }
    const trimmed = trimName(args.name);
    if (!trimmed) {
        return fail({ code: "EMPTY_NAME", message: "Table name cannot be empty." });
    }
    const siblings = tablesOfDatabase(state, table.databaseId);
    if (isDuplicateName(trimmed, siblings, table.id)) {
        return fail({
            code: "DUPLICATE_NAME",
            name: trimmed,
            message: `A table named "${trimmed}" already exists in this database.`,
        });
    }
    const next = withDraftMutations(state, (draft) => {
        const target = draft.catalog.tables.find((t) => t.id === args.tableId);
        if (target) target.name = trimmed;
    });
    return { ok: true, state: next };
}

/**
 * 设置/清除表显示名（metadata.tableDisplayNames，键为稳定行 id）。
 * trim 后为空 = 清除该键（界面回退展示技术名，T007 用）。
 */
export function setTableDisplayName(
    state: WorkspaceState,
    args: { tableId: string; displayName: string }
): CatalogOpResult {
    if (!findTable(state, args.tableId)) {
        return fail({ code: "TABLE_NOT_FOUND", message: "Table not found in the current draft." });
    }
    const trimmed = trimName(args.displayName);
    const next = withDraftMutations(state, (draft) => {
        if (trimmed) {
            draft.metadata.tableDisplayNames[args.tableId] = trimmed;
        } else if (Object.prototype.hasOwnProperty.call(draft.metadata.tableDisplayNames, args.tableId)) {
            delete draft.metadata.tableDisplayNames[args.tableId];
        }
    });
    return { ok: true, state: next };
}

/**
 * 设置/清除表备注（行内 note 列；trim 后为空存 null）。
 */
export function setTableNote(
    state: WorkspaceState,
    args: { tableId: string; note: string }
): CatalogOpResult {
    if (!findTable(state, args.tableId)) {
        return fail({ code: "TABLE_NOT_FOUND", message: "Table not found in the current draft." });
    }
    const trimmed = trimName(args.note);
    const next = withDraftMutations(state, (draft) => {
        const target = draft.catalog.tables.find((t) => t.id === args.tableId);
        if (target) target.note = trimmed || null;
    });
    return { ok: true, state: next };
}

/**
 * 安全删除表：
 *  - 有真实引用（relationships / indices / field_indices）→ 阻止，草稿不修改。
 *  - 无引用 → 移除表行及其字段子行，并清理对应的显示名元数据；
 *    其余行的顺序与位置不受影响（保留原位置）。
 */
export function deleteTable(state: WorkspaceState, args: { tableId: string }): CatalogOpResult {
    const table = findTable(state, args.tableId);
    if (!table) {
        return fail({ code: "TABLE_NOT_FOUND", message: "Table not found in the current draft." });
    }
    const impact = tableImpact(state.draft.catalog, args.tableId);
    if (impact.blocking > 0) {
        return fail({
            code: "DELETE_BLOCKED",
            impact,
            message:
                `Cannot delete "${table.name}": it is referenced by ` +
                `${impact.relationships.length} relationship(s), ${impact.indices.length} index(es), ` +
                `${impact.fieldIndices.length} field index mapping(s). Remove those references first.`,
        });
    }
    const ownFieldIds = impact.fields.map((field) => field.id);
    const next = withDraftMutations(state, (draft) => {
        draft.catalog.tables = draft.catalog.tables.filter((t) => t.id !== args.tableId);
        draft.catalog.fields = draft.catalog.fields.filter((f) => f.tableId !== args.tableId);
        if (Object.prototype.hasOwnProperty.call(draft.metadata.tableDisplayNames, args.tableId)) {
            delete draft.metadata.tableDisplayNames[args.tableId];
        }
        for (const fieldId of ownFieldIds) {
            if (Object.prototype.hasOwnProperty.call(draft.metadata.fieldDisplayNames, fieldId)) {
                delete draft.metadata.fieldDisplayNames[fieldId];
            }
        }
    });
    return { ok: true, state: next };
}
