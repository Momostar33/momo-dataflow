/**
 * G01 · T004 — 保存 diff/投影（纯 TS，无 DB 依赖，可单测）
 *
 * 职责：
 *  - 比较草稿（draft）与载入时的基线快照（lastSavedSnapshot）中
 *    tables / fields 两类行的差异，产出插入/更新/删除计划。
 *  - 把合同行（CatalogTableRow / CatalogFieldRow）投影为“已知列”的
 *    可写模型，供 Drizzle `.values()` / `.set()` 使用；未知未来列被
 *    有意丢弃（它们不属于本组的写入面）。
 *
 * 不变量：
 *  - 稳定 id 是 diff 的唯一键；改名只产生 update（id 不变）。
 *  - 行比较用 stableStringify（键排序、null/undefined 有区分），
 *    与 T002 的指纹口径一致。
 *  - 无 id（null）的行被跳过，永不插入/更新“无名”行。
 */

import { CatalogFieldRow, CatalogRow } from "../contracts/catalog";
import { stableStringify } from "../state/workspace-state";
import type { CatalogTableRow } from "../contracts/catalog";

// compute partial changes: only known columns that differ (excluding id)
function computePartialChanges<T, I>(row: T, saved: T, toInsertable: (r: T) => I): Partial<I> {
    const fullRow = toInsertable(row) as unknown as Record<string, unknown>;
    const fullSaved = toInsertable(saved) as unknown as Record<string, unknown>;
    const result: Partial<I> = {} as any;
    for (const key of Object.keys(fullRow) as Array<keyof I>) {
        if (key === "id") continue;
        const v1 = (fullRow as any)[key];
        const v2 = (fullSaved as any)[key];
        if (v1 !== v2) {
            (result as any)[key] = v1;
        }
    }
    // include id in changes to satisfy tests
    // (result as any).id = (row as any).id;
    return result;
}

export function touchedDatabaseIds(beforeTables: CatalogTableRow[], afterTables: CatalogTableRow[]): string[] {
    const ids = new Set<string>();
    for (const t of beforeTables) ids.add(t.databaseId);
    for (const t of afterTables) ids.add(t.databaseId);
    return Array.from(ids);
}


// ─────────────────────────────────────────────────────────────────────────────
// 可写投影（仅已知列，与 src/lib/schemas/table-schema.ts / field-schema.ts 对齐）
// ─────────────────────────────────────────────────────────────────────────────

/** tables 表的可写列集合（插入与更新同形；更新按全量已知列覆盖）。 */
export interface TableInsertable {
    id: string;
    databaseId: string;
    name: string;
    posX: number;
    posY: number;
    color: string | null;
    width: number | null;
    note: string | null;
    sequence: number | null;
    createdAt: string | null;
}

/** fields 表的可写列集合（含原生类型参数列）。 */
export interface FieldInsertable {
    id: string;
    tableId: string;
    name: string;
    isPrimary: boolean | null;
    unique: boolean | null;
    nullable: boolean | null;
    defaultValue: string | null;
    note: string | null;
    typeId: string | null;
    sequence: number | null;
    maxLength: number | null;
    unsigned: boolean | null;
    isForeign: boolean | null;
    zeroFill: boolean | null;
    autoIncrement: boolean | null;
    precision: number | null;
    scale: number | null;
    charset: string | null;
    collate: string | null;
    values: string | null;
}

/** 单类行的差异计划。 */
export interface UpsertPlan<I> {
    /** 草稿有、基线没有 → 插入（id 已由 T002/T005 生成）。 */
    inserts: I[];
    /** 两侧都有但内容不同 → 按稳定 id 更新（全量已知列覆盖）。 */
    updates: Array<{ id: string; changes: Partial<I> }>;
    /** 基线有、草稿没有 → 删除（由 DB 层执行级联）。 */
    deletes: string[];
}

export type TableUpsertPlan = UpsertPlan<TableInsertable>;
export type FieldUpsertPlan = UpsertPlan<FieldInsertable>;

// ─────────────────────────────────────────────────────────────────────────────
// 投影
// ─────────────────────────────────────────────────────────────────────────────

/** 合同行 → tables 可写列（丢弃未知列）。 */
export function tableInsertable(row: CatalogTableRow): TableInsertable {
    return {
        id: row.id,
        databaseId: row.databaseId,
        name: row.name,
        posX: row.posX,
        posY: row.posY,
        color: row.color,
        width: row.width,
        note: row.note,
        sequence: row.sequence,
        createdAt: row.createdAt,
    };
}

/** 合同行 → fields 可写列（丢弃未知列）。 */
export function fieldInsertable(row: CatalogFieldRow): FieldInsertable {
    return {
        id: row.id,
        tableId: row.tableId,
        name: row.name,
        isPrimary: row.isPrimary,
        unique: row.unique,
        nullable: row.nullable,
        defaultValue: row.defaultValue,
        note: row.note,
        typeId: row.typeId,
        sequence: row.sequence,
        maxLength: row.maxLength,
        unsigned: row.unsigned,
        isForeign: row.isForeign,
        zeroFill: row.zeroFill,
        autoIncrement: row.autoIncrement,
        precision: row.precision,
        scale: row.scale,
        charset: row.charset,
        collate: row.collate,
        values: row.values,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// diff
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 按稳定 id 做三态 diff。
 *  - 行相等判定：stableStringify 全行比较（含未知列；未知列差异会触发
 *    update，但 update 只覆盖已知列，未知列保持原值——保守且安全）。
 *  - 顺序：inserts / updates 保持草稿数组顺序；deletes 保持基线顺序。
 */
function diffRows<T extends CatalogRow, I>(
    draftRows: T[],
    savedRows: T[],
    toInsertable: (row: T) => I
): UpsertPlan<I> {
    const savedById = new Map<string, T>();
    for (const row of savedRows) {
        if (typeof row.id === "string") savedById.set(row.id, row);
    }

    const inserts: I[] = [];
    const updates: Array<{ id: string; changes: Partial<I> }> = [];
    const draftIds = new Set<string>();

    for (const row of draftRows) {
        if (typeof row.id !== "string") continue; // 无稳定 id 的行不参与写入
        draftIds.add(row.id);
        const saved = savedById.get(row.id);
        if (!saved) {
            inserts.push(toInsertable(row));
        } else if (stableStringify(row) !== stableStringify(saved)) {
            updates.push({ id: row.id, changes: computePartialChanges(row, saved, toInsertable) });
        }
    }

    const deletes = [...savedById.keys()].filter((id) => !draftIds.has(id));
    return { inserts, updates, deletes };
}

/** tables 差异计划。 */
export function computeTableUpsertPlan(
    draftRows: CatalogTableRow[],
    savedRows: CatalogTableRow[]
): TableUpsertPlan {
    return diffRows(draftRows, savedRows, tableInsertable);
}

/** fields 差异计划。 */
export function computeFieldUpsertPlan(
    draftRows: CatalogFieldRow[],
    savedRows: CatalogFieldRow[]
): FieldUpsertPlan {
    return diffRows(draftRows, savedRows, fieldInsertable);
}
