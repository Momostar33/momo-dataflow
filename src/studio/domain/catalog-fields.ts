/**
 * G01 · T006A — 字段创建、编辑与技术类型（纯 TS，无 React/DOM/DB 依赖，可单测）
 *
 * 职责（对应 inputs/G01.md T006A + T006B）：
 *  - 在共享目录草稿（WorkspaceState.draft）中管理字段的：
 *    技术名（name）、显示名（metadata.fieldDisplayNames）、备注（note 列）、
 *    技术类型引用（typeId）与精度/标度（precision/scale）。
 *  - 重命名：只改 `name`，稳定 id / note / constraints / defaultValue /
 *    nullable / typeId / precision / scale 全部保留。
 *  - 类型参数：typeId 引用 data_types 行的稳定 id（非 null），或 null 表示无类型；
 *    data_types.id 在 F01 合同中保持 `string | null`，不新造代理键。
 *
 *  - 顺序调整（T006B `moveField`）：按同表 sequence 稳定排序后把目标字段移动到
 *    指定 0-based 位置，再重排 sequence = 0..n-1；不改变任何字段 id 或其他列。
 *  - 引用保护删除（T006B `fieldImpact` / `deleteField`）：字段被 relationships
 *    （sourceFieldId/targetFieldId）或 field_indices（fieldId）引用时阻止直接删除；
 *    无引用才移除字段行并清理 metadata.fieldDisplayNames。只读影响查询 `fieldImpact`
 *    与表侧 `tableImpact`（T005）同口径。
 *
 * 不变量：
 *  - 空名称（trim 后为空）与同表 trim 后重名一律拒绝，拒绝时不修改草稿。
 *  - 不同表允许同名字段，但行 id（身份）必须不同。
 *  - 无类型旧字段保留 typeId: null，任何操作不自动改变它。
 *  - 所有成功变更经 withDraftMutations（clone→mutate→freeze→editVersion+1），
 *    失败路径原样返回，不产生新状态。
 *
 * 依赖：仅 F01 合同（../contracts/catalog）与 T002 状态机（../state/workspace-state）。
 * 不新增依赖、不 `any`、不 `ts-ignore`、不求值公式。
 */

import {
    CatalogDataTypeRow,
    CatalogFieldIndexRow,
    CatalogFieldRow,
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

export type FieldErrorCode =
    | "EMPTY_NAME"
    | "DUPLICATE_NAME"
    | "FIELD_NOT_FOUND"
    | "TABLE_NOT_FOUND"
    | "TYPE_NOT_FOUND"
    | "POSITION_OUT_OF_RANGE"
    | "DELETE_BLOCKED";

export interface FieldErrorInfo {
    code: FieldErrorCode;
    message: string;
    /** DUPLICATE_NAME：冲突的 trim 后名称（供界面回显）。 */
    name?: string;
    /** DELETE_BLOCKED：只读影响查询结果（供界面展示"被谁引用"）。 */
    impact?: FieldImpact;
}

export type FieldOpResult =
    | { ok: true; state: WorkspaceState }
    | { ok: false; error: FieldErrorInfo };

/** 建字段成功时附带新行 id，供界面聚焦/选中。 */
export type AddFieldResult =
    | { ok: true; state: WorkspaceState; fieldId: string }
    | { ok: false; error: FieldErrorInfo };

// ─────────────────────────────────────────────────────────────────────────────
// 内部工具
// ─────────────────────────────────────────────────────────────────────────────

const fail = (error: FieldErrorInfo): FieldOpResult => ({ ok: false, error });

const failAdd = (error: FieldErrorInfo): AddFieldResult => ({ ok: false, error });

const findField = (state: WorkspaceState, fieldId: string): CatalogFieldRow | undefined =>
    state.draft.catalog.fields.find((f) => f.id === fieldId);

const findTable = (state: WorkspaceState, tableId: string): CatalogTableRow | undefined =>
    state.draft.catalog.tables.find((t) => t.id === tableId);

const fieldsOfTable = (state: WorkspaceState, tableId: string): CatalogFieldRow[] =>
    state.draft.catalog.fields.filter((f) => f.tableId === tableId);

/**
 * 检查 typeId 是否引用了草稿中某条 data_types 行的非 null id。
 * data_types.id 在 F01 合同中是 string | null（无主键约束），
 * 因此必须显式排除 id === null 的行。
 */
const hasDataType = (state: WorkspaceState, typeId: string): boolean =>
    state.draft.catalog.dataTypes.some(
        (dt: CatalogDataTypeRow) => dt.id !== null && dt.id === typeId
    );

/** 同表内下一 sequence（空表 = 0；非空 = 已知最大值+1，容忍 null）。 */
const nextFieldSequence = (fields: CatalogFieldRow[]): number => {
    if (fields.length === 0) return 0;
    const max = fields.reduce(
        (acc, field) =>
            typeof field.sequence === "number" && field.sequence > acc ? field.sequence : acc,
        0
    );
    return max + 1;
};

// ─────────────────────────────────────────────────────────────────────────────
// 只读影响查询（T006B）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 删除某字段的影响面（只读，不改草稿）：
 *  - relationships ：以该字段为 sourceFieldId 或 targetFieldId 的真实关系（阻止删除）。
 *  - fieldIndices  ：索引落到该字段上的映射行（阻止删除）。
 *  - blocking      ：上述两类引用总数，> 0 即不允许直接删除。
 *
 * 说明：`indices` 表本身按 tableId 归属，不直接引用具体字段，因此不计入
 * 字段级"引用"；它落到字段上的关联经 `field_indices`（fieldId）表达，已计入。
 */
export interface FieldImpact {
    fieldId: string;
    relationships: CatalogRelationshipRow[];
    fieldIndices: CatalogFieldIndexRow[];
    blocking: number;
}

export function fieldImpact(snapshot: CatalogSnapshot, fieldId: string): FieldImpact {
    const relationships = snapshot.relationships.filter(
        (rel) => rel.sourceFieldId === fieldId || rel.targetFieldId === fieldId
    );
    const fieldIndices = snapshot.fieldIndices.filter((fi) => fi.fieldId === fieldId);
    return {
        fieldId,
        relationships,
        fieldIndices,
        blocking: relationships.length + fieldIndices.length,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// 操作
// ─────────────────────────────────────────────────────────────────────────────

export interface AddFieldArgs {
    tableId: string;
    name: string;
    /** 备注；trim 后为空视为未设置（存 null）。 */
    note?: string | null;
    /** 显示名（仅 metadata.fieldDisplayNames）；trim 后为空视为未设置（不建键）。 */
    displayName?: string | null;
    /**
     * 技术类型引用：
     *  - undefined / null → typeId = null（无类型）
     *  - 非空字符串       → 必须匹配草稿中某条 data_types 行的非 null id
     */
    typeId?: string | null;
    /** 精度（nullable number）；undefined = 未提供（存 null）。 */
    precision?: number | null;
    /** 标度（nullable number）；undefined = 未提供（存 null）。 */
    scale?: number | null;
}

/**
 * 新建字段：
 *  - 空名 / 同表 trim 后重名拒绝（不同表允许同名，id 不同）。
 *  - typeId 非 null 时必须在草稿 data_types 中找到匹配行（非 null id）。
 *  - 新行所有可空列初始化为 null；sequence 取同表 max+1（空表 = 0）。
 *  - note / displayName / typeId / precision / scale 按参数填充。
 */
export function addField(state: WorkspaceState, args: AddFieldArgs): AddFieldResult {
    const { tableId, name } = args;
    const trimmed = trimName(name);
    if (!trimmed) {
        return failAdd({ code: "EMPTY_NAME", message: "Field name cannot be empty." });
    }
    if (!findTable(state, tableId)) {
        return failAdd({ code: "TABLE_NOT_FOUND", message: "Table not found in the current draft." });
    }
    if (args.typeId !== null && args.typeId !== undefined && !hasDataType(state, args.typeId)) {
        return failAdd({
            code: "TYPE_NOT_FOUND",
            message: "Referenced data type not found in the current draft.",
        });
    }
    const siblings = fieldsOfTable(state, tableId);
    if (isDuplicateName(trimmed, siblings)) {
        return failAdd({
            code: "DUPLICATE_NAME",
            name: trimmed,
            message: `A field named "${trimmed}" already exists in this table.`,
        });
    }

    const fieldId = newStableId();
    const row: CatalogFieldRow = {
        id: fieldId,
        tableId,
        name: trimmed,
        isPrimary: null,
        unique: null,
        nullable: null,
        defaultValue: null,
        note: trimName(args.note ?? "") || null,
        typeId: args.typeId ?? null,
        sequence: nextFieldSequence(siblings),
        maxLength: null,
        unsigned: null,
        isForeign: null,
        zeroFill: null,
        autoIncrement: null,
        precision: args.precision ?? null,
        scale: args.scale ?? null,
        charset: null,
        collate: null,
        values: null,
    };
    const displayName = trimName(args.displayName ?? "");

    const next = withDraftMutations(state, (draft) => {
        draft.catalog.fields.push(row);
        if (displayName) {
            draft.metadata.fieldDisplayNames[fieldId] = displayName;
        }
    });
    return { ok: true, state: next, fieldId };
}

/**
 * 重命名字段：只改 `name`（trim 后），稳定 id / note / constraints /
 * defaultValue / nullable / typeId / precision / scale / 显示名元数据全部保留。
 */
export function renameField(
    state: WorkspaceState,
    args: { fieldId: string; name: string }
): FieldOpResult {
    const field = findField(state, args.fieldId);
    if (!field) {
        return fail({ code: "FIELD_NOT_FOUND", message: "Field not found in the current draft." });
    }
    const trimmed = trimName(args.name);
    if (!trimmed) {
        return fail({ code: "EMPTY_NAME", message: "Field name cannot be empty." });
    }
    const siblings = fieldsOfTable(state, field.tableId);
    if (isDuplicateName(trimmed, siblings, field.id)) {
        return fail({
            code: "DUPLICATE_NAME",
            name: trimmed,
            message: `A field named "${trimmed}" already exists in this table.`,
        });
    }
    const next = withDraftMutations(state, (draft) => {
        const target = draft.catalog.fields.find((f) => f.id === args.fieldId);
        if (target) target.name = trimmed;
    });
    return { ok: true, state: next };
}

/**
 * 设置/清除字段备注（行内 note 列；trim 后为空存 null）。
 */
export function setFieldNote(
    state: WorkspaceState,
    args: { fieldId: string; note: string }
): FieldOpResult {
    if (!findField(state, args.fieldId)) {
        return fail({ code: "FIELD_NOT_FOUND", message: "Field not found in the current draft." });
    }
    const trimmed = trimName(args.note);
    const next = withDraftMutations(state, (draft) => {
        const target = draft.catalog.fields.find((f) => f.id === args.fieldId);
        if (target) target.note = trimmed || null;
    });
    return { ok: true, state: next };
}

/**
 * 设置/清除字段显示名（metadata.fieldDisplayNames，键为稳定行 id）。
 * trim 后为空 = 清除该键（界面回退展示技术名）。
 */
export function setFieldDisplayName(
    state: WorkspaceState,
    args: { fieldId: string; displayName: string }
): FieldOpResult {
    if (!findField(state, args.fieldId)) {
        return fail({ code: "FIELD_NOT_FOUND", message: "Field not found in the current draft." });
    }
    const trimmed = trimName(args.displayName);
    const next = withDraftMutations(state, (draft) => {
        if (trimmed) {
            draft.metadata.fieldDisplayNames[args.fieldId] = trimmed;
        } else if (
            Object.prototype.hasOwnProperty.call(draft.metadata.fieldDisplayNames, args.fieldId)
        ) {
            delete draft.metadata.fieldDisplayNames[args.fieldId];
        }
    });
    return { ok: true, state: next };
}

export interface SetFieldTypeArgs {
    fieldId: string;
    /**
     * 技术类型引用：
     *  - null       → 清除类型（同时清除 precision / scale）
     *  - 非空字符串 → 必须匹配草稿中某条 data_types 行的非 null id
     */
    typeId: string | null;
    /** 可选；undefined = 保持当前值；null = 清除；number = 设置。 */
    precision?: number | null;
    /** 可选；undefined = 保持当前值；null = 清除；number = 设置。 */
    scale?: number | null;
}

/**
 * 设置/清除字段技术类型：
 *  - typeId = null：清除类型，同时 precision / scale 归 null。
 *  - typeId = 有效 id：设置 typeId；precision/scale 仅在显式提供时更新。
 *  - 不修改 isPrimary / unique / nullable / defaultValue / note 等其他列。
 *  - 无类型旧字段（typeId 本已为 null）保持 null，除非显式传入有效 id。
 */
export function setFieldType(
    state: WorkspaceState,
    args: SetFieldTypeArgs
): FieldOpResult {
    const field = findField(state, args.fieldId);
    if (!field) {
        return fail({ code: "FIELD_NOT_FOUND", message: "Field not found in the current draft." });
    }
    if (args.typeId !== null && !hasDataType(state, args.typeId)) {
        return fail({
            code: "TYPE_NOT_FOUND",
            message: "Referenced data type not found in the current draft.",
        });
    }
    const next = withDraftMutations(state, (draft) => {
        const target = draft.catalog.fields.find((f) => f.id === args.fieldId);
        if (!target) return;
        target.typeId = args.typeId;
        if (args.typeId === null) {
            target.precision = null;
            target.scale = null;
        } else {
            if (args.precision !== undefined) target.precision = args.precision;
            if (args.scale !== undefined) target.scale = args.scale;
        }
    });
    return { ok: true, state: next };
}

// ─────────────────────────────────────────────────────────────────────────────
// 顺序调整与引用保护删除（T006B）
// ─────────────────────────────────────────────────────────────────────────────

/** "按 sequence 升序、null 最后、相等保持数组原序"的稳定排序。 */
const sortBySequence = (rows: CatalogFieldRow[]): CatalogFieldRow[] =>
    [...rows].sort((a, b) => {
        const aNum = typeof a.sequence === "number";
        const bNum = typeof b.sequence === "number";
        if (aNum && bNum) return (a.sequence as number) - (b.sequence as number);
        if (aNum) return -1; // a 有值、b 无值 → a 在前
        if (bNum) return 1; // b 有值、a 无值 → b 在前
        return 0; // 都无值 → 保持原序
    });

export interface MoveFieldArgs {
    fieldId: string;
    /**
     * 目标位置（0-based，含目标字段自身）。
     * 必须是 [0, 同表字段数 - 1] 的整数；越界或非整数 → POSITION_OUT_OF_RANGE。
     */
    toIndex: number;
}

/**
 * 调整同表内字段顺序：
 *  - 按当前 sequence 稳定排序（null 最后，相等保持数组原序）作为基线序；
 *  - 把目标字段移动到 toIndex 位置；
 *  - 重排 sequence = 0..n-1（n = 同表字段数）。
 *
 * 不变量：
 *  - 不改变任何字段的 id / name / note / constraints / typeId / precision / scale
 *    等其余列，仅重排 sequence。
 *  - 只影响目标字段所在表；其他表的字段 sequence 保持不变。
 *  - 成功经 withDraftMutations（不可变更新），失败原样返回。
 */
export function moveField(state: WorkspaceState, args: MoveFieldArgs): FieldOpResult {
    const field = findField(state, args.fieldId);
    if (!field) {
        return fail({ code: "FIELD_NOT_FOUND", message: "Field not found in the current draft." });
    }
    const siblings = fieldsOfTable(state, field.tableId);
    const n = siblings.length;
    if (!Number.isInteger(args.toIndex) || args.toIndex < 0 || args.toIndex > n - 1) {
        return fail({
            code: "POSITION_OUT_OF_RANGE",
            message: `Position must be an integer between 0 and ${n - 1}.`,
        });
    }
    const ordered = sortBySequence(siblings);
    const remaining = ordered.filter((f) => f.id !== field.id);
    remaining.splice(args.toIndex, 0, field);
    const order = remaining.map((f) => f.id);
    const next = withDraftMutations(state, (draft) => {
        for (let i = 0; i < order.length; i++) {
            const row = draft.catalog.fields.find((f) => f.id === order[i]);
            if (row) row.sequence = i;
        }
    });
    return { ok: true, state: next };
}

/**
 * 安全删除字段：
 *  - 有真实引用（relationships.sourceFieldId/targetFieldId 或 field_indices.fieldId）
 *    → 阻止，草稿不修改，返回影响面供界面提示"被谁引用"。
 *  - 无引用 → 移除该字段行并清理 metadata.fieldDisplayNames（若该键存在）。
 *
 * 说明：允许删除（无引用）时，按定义不存在指向该字段的 relationship / fieldIndex，
 * 因此无需级联清理它们；仅字段行与其显示名元数据需要移除。
 */
export function deleteField(state: WorkspaceState, args: { fieldId: string }): FieldOpResult {
    const field = findField(state, args.fieldId);
    if (!field) {
        return fail({ code: "FIELD_NOT_FOUND", message: "Field not found in the current draft." });
    }
    const impact = fieldImpact(state.draft.catalog, args.fieldId);
    if (impact.blocking > 0) {
        return fail({
            code: "DELETE_BLOCKED",
            impact,
            message:
                `Cannot delete field "${field.name}": it is referenced by ` +
                `${impact.relationships.length} relationship(s) and ` +
                `${impact.fieldIndices.length} field index mapping(s). ` +
                "Remove those references first.",
        });
    }
    const next = withDraftMutations(state, (draft) => {
        draft.catalog.fields = draft.catalog.fields.filter((f) => f.id !== args.fieldId);
        if (Object.prototype.hasOwnProperty.call(draft.metadata.fieldDisplayNames, args.fieldId)) {
            delete draft.metadata.fieldDisplayNames[args.fieldId];
        }
    });
    return { ok: true, state: next };
}
