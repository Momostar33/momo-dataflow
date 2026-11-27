/**
 * G01 · T005 — 表定义创建、编辑与安全删除（定向单测，纯 TS，Node 端可运行）
 *
 * 覆盖点（对照 inputs/G01.md T005 完成条件）：
 *  - 空名/纯空白拒绝；同库去首尾空白后重名拒绝（"orders" vs " orders "）
 *  - 不同库同名允许且行身份（id）不同
 *  - 重命名：稳定 id、posX/posY、sequence、note、显示名元数据全部保留
 *  - 删除取消/被阻止：草稿不修改（editVersion 不变、行集合不变）
 *  - 有真实引用（relationships / indices / field_indices）时阻止直接删除，
 *    且错误附带只读影响查询结果
 *  - 无引用删除：表行 + 字段子行 + 显示名元数据一并清理，其余行位置不变
 *  - T005B：target 侧关系引用同样阻止删除；被阻止时草稿/版本逐字节不变；
 *    无引用删除不级联（兄弟表字段/索引/映射/元数据全部保留）
 *  - 备注/显示名设置与清除（空 = 未设置）
 *  - DATABASE_NOT_FOUND / TABLE_NOT_FOUND 错误路径
 *  - sequence 口径（空库 0；非空 max+1；容忍 null）与新表位置不重叠
 *
 * 说明：draft 经 deepFreeze 冻结，测试不得直接修改状态；
 * 所有"带引用/带元数据"的场景都通过初始快照工厂构造（合法路径）。
 */

import { describe, it, expect } from "vitest";

import {
    CatalogDataTypeRow,
    CatalogDatabaseRow,
    CatalogFieldIndexRow,
    CatalogFieldRow,
    CatalogIndexRow,
    CatalogRelationshipRow,
    CatalogSnapshot,
    CatalogTableRow,
} from "../contracts/catalog";
import {
    WorkspaceSnapshot,
    createInitialWorkspace,
    emptyCatalog,
    emptyMetadata,
    hasUnsavedChanges,
} from "../state/workspace-state";
import {
    addTable,
    deleteTable,
    renameTable,
    setTableDisplayName,
    setTableNote,
    tableImpact,
} from "./catalog-tables";

// ─────────────────────────────────────────────────────────────────────────────
// 合成行工厂
// ─────────────────────────────────────────────────────────────────────────────

const database = (over: Partial<CatalogDatabaseRow> = {}): CatalogDatabaseRow => ({
    id: "d1",
    name: "local",
    dialect: "postgres",
    numOfTables: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...over,
});

const tableRow = (over: Partial<CatalogTableRow> = {}): CatalogTableRow => ({
    id: "t1",
    databaseId: "d1",
    name: "orders",
    posX: 0,
    posY: 0,
    color: null,
    width: null,
    note: null,
    sequence: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...over,
});

const fieldRow = (over: Partial<CatalogFieldRow> = {}): CatalogFieldRow => ({
    id: "f1",
    tableId: "t1",
    name: "id",
    isPrimary: true,
    unique: true,
    nullable: false,
    defaultValue: null,
    note: null,
    typeId: "ty1",
    sequence: 0,
    maxLength: null,
    unsigned: null,
    isForeign: null,
    zeroFill: null,
    autoIncrement: true,
    precision: null,
    scale: null,
    charset: null,
    collate: null,
    values: null,
    ...over,
});

const dataType = (over: Partial<CatalogDataTypeRow> = {}): CatalogDataTypeRow => ({
    id: "ty1",
    name: "integer",
    dialect: "postgres",
    type: "integer",
    modifiers: null,
    synonyms: null,
    ...over,
});

const relationship = (
    over: Partial<CatalogRelationshipRow> = {}
): CatalogRelationshipRow => ({
    id: "r1",
    name: "rel",
    sourceTableId: "t1",
    targetTableId: "t2",
    sourceFieldId: "f1",
    targetFieldId: "f2",
    cardinality: "one_to_many",
    onDelete: "no_action",
    onUpdate: "no_action",
    databaseId: "d1",
    sourceAliasName: null,
    targetAliasName: null,
    createdAt: null,
    ...over,
});

const indexRow = (over: Partial<CatalogIndexRow> = {}): CatalogIndexRow => ({
    id: "ix1",
    tableId: "t1",
    name: "ix_orders_no",
    unique: true,
    createdAt: null,
    ...over,
});

const fieldIndexRow = (
    over: Partial<CatalogFieldIndexRow> = {}
): CatalogFieldIndexRow => ({
    id: "fi1",
    fieldId: "f1",
    indexId: "ix1",
    ...over,
});

/** 初始快照构造参数（合法构造路径，绕过对冻结草稿的直接修改）。 */
interface Seed {
    tables?: CatalogTableRow[];
    fields?: CatalogFieldRow[];
    relationships?: CatalogRelationshipRow[];
    indices?: CatalogIndexRow[];
    fieldIndices?: CatalogFieldIndexRow[];
    tableDisplayNames?: Record<string, string>;
    fieldDisplayNames?: Record<string, string>;
}

/** 标准工作区：库 d1/d2，表 t1(orders)+t2(customers)，字段 f1 属于 t1。 */
const makeState = (seed: Seed = {}) => {
    const catalog: CatalogSnapshot = emptyCatalog();
    catalog.databases.push(database(), database({ id: "d2", name: "other" }));
    catalog.tables.push(
        tableRow(),
        tableRow({ id: "t2", name: "customers", posX: 304, sequence: 1 })
    );
    catalog.fields.push(fieldRow());
    catalog.dataTypes.push(dataType());
    if (seed.tables) {
        catalog.tables = seed.tables.length ? seed.tables : catalog.tables;
    }
    if (seed.fields) {
        catalog.fields = seed.fields.length ? seed.fields : catalog.fields;
    }
    if (seed.relationships) catalog.relationships = seed.relationships;
    if (seed.indices) catalog.indices = seed.indices;
    if (seed.fieldIndices) catalog.fieldIndices = seed.fieldIndices;
    const metadata = emptyMetadata();
    metadata.tableDisplayNames = seed.tableDisplayNames ?? {};
    metadata.fieldDisplayNames = seed.fieldDisplayNames ?? {};
    const snapshot: WorkspaceSnapshot = { catalog, metadata };
    return createInitialWorkspace(snapshot, { revision: 0, fingerprint: "" });
};

// ─────────────────────────────────────────────────────────────────────────────
// addTable
// ─────────────────────────────────────────────────────────────────────────────

describe("addTable", () => {
    it("拒绝空名与纯空白，且不修改草稿", () => {
        const state = makeState();
        const before = JSON.stringify(state.draft);
        for (const name of ["", "   ", "\t\n"]) {
            const result = addTable(state, { databaseId: "d1", name });
            expect(result).toMatchObject({ ok: false, error: { code: "EMPTY_NAME" } });
        }
        expect(state.editVersion).toBe(0);
        expect(JSON.stringify(state.draft)).toBe(before);
    });

    it("库不存在时拒绝（DATABASE_NOT_FOUND）", () => {
        const result = addTable(makeState(), { databaseId: "nope", name: "x" });
        expect(result).toMatchObject({ ok: false, error: { code: "DATABASE_NOT_FOUND" } });
    });

    it("同库去首尾空白后重名拒绝（'orders' vs '  orders '）", () => {
        const result = addTable(makeState(), { databaseId: "d1", name: "  orders " });
        expect(result).toMatchObject({
            ok: false,
            error: { code: "DUPLICATE_NAME", name: "orders" },
        });
    });

    it("同库已有名称本身带空白时，与新名 trim 后相同也判重", () => {
        const state = makeState({
            tables: [
                tableRow({ name: "orders  " }),
                tableRow({ id: "t2", name: "customers", posX: 304, sequence: 1 }),
            ],
        });
        const result = addTable(state, { databaseId: "d1", name: "orders" });
        expect(result).toMatchObject({ ok: false, error: { code: "DUPLICATE_NAME" } });
    });

    it("不同库同名允许，且行身份（id）不同", () => {
        const state = makeState();
        const result = addTable(state, { databaseId: "d2", name: "orders" });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const newRow = result.state.draft.catalog.tables.find(
            (t) => t.id === result.tableId
        );
        expect(newRow).toBeDefined();
        expect(newRow!.databaseId).toBe("d2");
        expect(newRow!.name).toBe("orders");
        expect(newRow!.id).not.toBe("t1"); // 身份不同
        expect(result.state.draft.catalog.tables).toHaveLength(3);
    });

    it("新行：名称 trim、uuid 新 id、空库 posX=0/posY=0、sequence=0、createdAt=null", () => {
        const result = addTable(makeState(), {
            databaseId: "d2",
            name: "  purchase_order  ",
            note: "  采购单  ",
            displayName: " 采购单 ",
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const row = result.state.draft.catalog.tables.find((t) => t.id === result.tableId)!;
        expect(row.name).toBe("purchase_order");
        expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
        expect(row.posX).toBe(0);
        expect(row.posY).toBe(0);
        expect(row.sequence).toBe(0);
        expect(row.createdAt).toBeNull();
        expect(row.note).toBe("采购单");
        expect(result.state.draft.metadata.tableDisplayNames[row.id]).toBe("采购单");
    });

    it("非空库：sequence = max+1，posX 避开已有表（默认宽 224 + 间隙 80）", () => {
        const result = addTable(makeState(), { databaseId: "d1", name: "invoices" });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const row = result.state.draft.catalog.tables.find((t) => t.id === result.tableId)!;
        // d1 已有 sequence 0 与 1 → max+1 = 2
        expect(row.sequence).toBe(2);
        // 最右表 t2.posX=304 → 304 + 224 + 80 = 608（不与已有表重叠）
        expect(row.posX).toBe(608);
        expect(row.posY).toBe(0);
    });

    it("容忍 sequence 为 null 的已有行（取已知最大值 +1）", () => {
        const result = addTable(
            makeState({
                tables: [tableRow({ id: "t9", name: "legacy", sequence: null })],
                fields: [],
            }),
            { databaseId: "d1", name: "fresh" }
        );
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const row = result.state.draft.catalog.tables.find((t) => t.id === result.tableId)!;
        // null 不算值：max(0) + 1 = 1
        expect(row.sequence).toBe(1);
    });

    it("显示名/备注为空时不建键/存 null", () => {
        const result = addTable(makeState(), {
            databaseId: "d2",
            name: "t_blank",
            note: "   ",
            displayName: "  ",
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const row = result.state.draft.catalog.tables.find((t) => t.id === result.tableId)!;
        expect(row.note).toBeNull();
        expect(result.state.draft.metadata.tableDisplayNames[row.id]).toBeUndefined();
    });

    it("成功变更走不可变更新：editVersion+1、hasUnsavedChanges=true、旧状态不变", () => {
        const state = makeState();
        const before = JSON.stringify(state.draft);
        const result = addTable(state, { databaseId: "d1", name: "ok" });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.state.editVersion).toBe(state.editVersion + 1);
        expect(hasUnsavedChanges(result.state)).toBe(true);
        expect(JSON.stringify(state.draft)).toBe(before); // 旧状态未被修改
        expect(result.state.draft).not.toBe(state.draft);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// renameTable
// ─────────────────────────────────────────────────────────────────────────────

describe("renameTable", () => {
    it("未知表 → TABLE_NOT_FOUND", () => {
        expect(renameTable(makeState(), { tableId: "nope", name: "x" }))
            .toMatchObject({ ok: false, error: { code: "TABLE_NOT_FOUND" } });
    });

    it("空名 → EMPTY_NAME 且草稿不变", () => {
        const state = makeState();
        const result = renameTable(state, { tableId: "t1", name: "   " });
        expect(result).toMatchObject({ ok: false, error: { code: "EMPTY_NAME" } });
        expect(state.editVersion).toBe(0);
    });

    it("重命名只改 name：id/posX/posY/sequence/note/显示名元数据保留", () => {
        const state = makeState({ tableDisplayNames: { t1: "订单" } });
        const target = state.draft.catalog.tables.find((t) => t.id === "t1")!;
        const result = renameTable(state, { tableId: "t1", name: "  sales_orders " });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const row = result.state.draft.catalog.tables.find((t) => t.id === "t1")!;
        expect(row.name).toBe("sales_orders");
        expect(row.id).toBe(target.id);
        expect(row.posX).toBe(target.posX);
        expect(row.posY).toBe(target.posY);
        expect(row.sequence).toBe(target.sequence);
        expect(row.note).toBe(target.note);
        // 显示名元数据仍按同一稳定 id 保留
        expect(result.state.draft.metadata.tableDisplayNames).toEqual({ t1: "订单" });
    });

    it("改名为自己名称的空白变体不判重（排除自身，并归一 trim）", () => {
        const result = renameTable(makeState(), { tableId: "t1", name: "   orders   " });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const row = result.state.draft.catalog.tables.find((t) => t.id === "t1")!;
        expect(row.name).toBe("orders");
    });

    it("改名为同库他表名 → DUPLICATE_NAME，草稿不变", () => {
        const state = makeState();
        const before = JSON.stringify(state.draft);
        const result = renameTable(state, { tableId: "t1", name: " customers" });
        expect(result).toMatchObject({
            ok: false,
            error: { code: "DUPLICATE_NAME", name: "customers" },
        });
        expect(JSON.stringify(state.draft)).toBe(before);
        expect(state.editVersion).toBe(0);
    });

    it("改名不受其他库同名表影响（作用域 = 同库）", () => {
        const state = makeState({
            tables: [
                tableRow(),
                tableRow({ id: "t2", name: "customers", posX: 304, sequence: 1 }),
                tableRow({ id: "t3", databaseId: "d2", name: "d2_target", posX: 0, sequence: 0 }),
            ],
        });
        const result = renameTable(state, { tableId: "t1", name: "d2_target" });
        expect(result.ok).toBe(true);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// setTableDisplayName / setTableNote
// ─────────────────────────────────────────────────────────────────────────────

describe("setTableDisplayName", () => {
    it("设置后以稳定 id 为键保存 trim 值", () => {
        const result = setTableDisplayName(makeState(), { tableId: "t1", displayName: " 订单 " });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.state.draft.metadata.tableDisplayNames).toEqual({ t1: "订单" });
    });

    it("空值清除已有键（界面回退技术名）", () => {
        const state = makeState({ tableDisplayNames: { t1: "旧显示名" } });
        const result = setTableDisplayName(state, { tableId: "t1", displayName: "  " });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.state.draft.metadata.tableDisplayNames).toEqual({});
    });

    it("未知表 → TABLE_NOT_FOUND", () => {
        expect(setTableDisplayName(makeState(), { tableId: "nope", displayName: "x" }))
            .toMatchObject({ ok: false, error: { code: "TABLE_NOT_FOUND" } });
    });
});

describe("setTableNote", () => {
    it("设置备注（trim 后存行内 note 列）", () => {
        const result = setTableNote(makeState(), { tableId: "t1", note: " 采购单主表 " });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.state.draft.catalog.tables.find((t) => t.id === "t1")!.note)
            .toBe("采购单主表");
    });

    it("空值存 null（清除备注）", () => {
        const state = makeState({ tables: [tableRow({ note: "旧备注" })] });
        const result = setTableNote(state, { tableId: "t1", note: "" });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.state.draft.catalog.tables.find((t) => t.id === "t1")!.note).toBeNull();
    });

    it("未知表 → TABLE_NOT_FOUND", () => {
        expect(setTableNote(makeState(), { tableId: "nope", note: "x" }))
            .toMatchObject({ ok: false, error: { code: "TABLE_NOT_FOUND" } });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// tableImpact（只读影响查询）
// ─────────────────────────────────────────────────────────────────────────────

describe("tableImpact", () => {
    it("列出子字段与三类引用，blocking = 引用总数（子行不计）", () => {
        const state = makeState({
            relationships: [relationship(), relationship({ id: "r2", sourceTableId: "t2", targetTableId: "t1" })],
            indices: [indexRow()],
            fieldIndices: [fieldIndexRow()],
        });
        const impact = tableImpact(state.draft.catalog, "t1");
        expect(impact.fields).toHaveLength(1);
        expect(impact.fields[0].id).toBe("f1");
        // r1: source=t1 命中；r2: source=t2/target=t1 命中（target 也算引用）
        expect(impact.relationships.map((r) => r.id).sort()).toEqual(["r1", "r2"]);
        expect(impact.indices).toHaveLength(1);
        expect(impact.fieldIndices).toHaveLength(1);
        expect(impact.blocking).toBe(4);
    });

    it("无引用时 blocking=0，各清单为空", () => {
        const impact = tableImpact(makeState().draft.catalog, "t1");
        expect(impact.blocking).toBe(0);
        expect(impact.relationships).toEqual([]);
        expect(impact.indices).toEqual([]);
        expect(impact.fieldIndices).toEqual([]);
    });

    it("字段索引映射到别的表字段时不计入本表影响", () => {
        const state = makeState({
            fields: [fieldRow(), fieldRow({ id: "f9", tableId: "t2" })],
            indices: [indexRow({ tableId: "t2", name: "ix_other" })],
            fieldIndices: [fieldIndexRow({ fieldId: "f9", indexId: "ix_other" })],
        });
        const impact = tableImpact(state.draft.catalog, "t1");
        expect(impact.blocking).toBe(0);
        expect(impact.fieldIndices).toEqual([]);
        expect(impact.indices).toEqual([]);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// deleteTable（安全删除）
// ─────────────────────────────────────────────────────────────────────────────

describe("deleteTable", () => {
    it("未知表 → TABLE_NOT_FOUND", () => {
        expect(deleteTable(makeState(), { tableId: "nope" }))
            .toMatchObject({ ok: false, error: { code: "TABLE_NOT_FOUND" } });
    });

    it("有 relationships 时阻止，草稿不变，且错误携带影响清单", () => {
        const state = makeState({ relationships: [relationship()] });
        const before = JSON.stringify(state.draft);
        const result = deleteTable(state, { tableId: "t1" });
        expect(result).toMatchObject({ ok: false, error: { code: "DELETE_BLOCKED" } });
        if (result.ok) return;
        expect(result.error.impact!.blocking).toBeGreaterThanOrEqual(1);
        expect(result.error.impact!.relationships.map((r) => r.id)).toEqual(["r1"]);
        expect(JSON.stringify(state.draft)).toBe(before);
        expect(state.editVersion).toBe(0);
    });

    it("有 indices 时阻止", () => {
        const state = makeState({ indices: [indexRow()] });
        const result = deleteTable(state, { tableId: "t1" });
        expect(result).toMatchObject({ ok: false, error: { code: "DELETE_BLOCKED" } });
        if (!result.ok) {
            expect(result.error.impact!.indices).toHaveLength(1);
        }
    });

    it("有 field_indices（映射到本表字段）时阻止", () => {
        const state = makeState({
            indices: [indexRow()],
            fieldIndices: [fieldIndexRow({ fieldId: "f1", indexId: "ix1" })],
        });
        const result = deleteTable(state, { tableId: "t1" });
        expect(result).toMatchObject({ ok: false, error: { code: "DELETE_BLOCKED" } });
        if (!result.ok) {
            expect(result.error.impact!.fieldIndices).toHaveLength(1);
        }
    });

    it("只属于本表的字段不构成阻止（子行随表清理）", () => {
        const result = deleteTable(makeState(), { tableId: "t1" });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const next = result.state.draft;
        expect(next.catalog.tables.find((t) => t.id === "t1")).toBeUndefined();
        expect(next.catalog.fields.find((f) => f.tableId === "t1")).toBeUndefined();
        // 其他表的行与原位置不受影响
        const t2 = next.catalog.tables.find((t) => t.id === "t2")!;
        expect(t2.posX).toBe(304);
        expect(t2.sequence).toBe(1);
    });

    it("删除时一并清理显示名/字段元数据，其他行的元数据保留", () => {
        const state = makeState({
            fields: [fieldRow(), fieldRow({ id: "f2", tableId: "t2", name: "id" })],
            tableDisplayNames: { t1: "订单", t2: "客户" },
            fieldDisplayNames: { f1: "主键", f2: "外键" },
        });
        const result = deleteTable(state, { tableId: "t1" });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.state.draft.metadata.tableDisplayNames).toEqual({ t2: "客户" });
        expect(result.state.draft.metadata.fieldDisplayNames).toEqual({ f2: "外键" });
    });

    it("成功后旧状态不变、editVersion+1（不可变更新）", () => {
        const state = makeState();
        const before = JSON.stringify(state.draft);
        const result = deleteTable(state, { tableId: "t1" });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.state.editVersion).toBe(state.editVersion + 1);
        expect(JSON.stringify(state.draft)).toBe(before);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// T005B 表删除影响与取消保护（定向证据：target 侧引用阻止 + 无级联副作用）
// ─────────────────────────────────────────────────────────────────────────────

describe("T005B 表删除影响与取消保护", () => {
    it("表作为关系 target 时同样阻止直接删除，草稿不修改", () => {
        const state = makeState({
            relationships: [relationship({ id: "r1", sourceTableId: "t2", targetTableId: "t1" })],
        });
        const before = JSON.stringify(state.draft);
        const result = deleteTable(state, { tableId: "t1" });
        expect(result).toMatchObject({ ok: false, error: { code: "DELETE_BLOCKED" } });
        if (result.ok) return;
        // 影响清单如实报告 target 侧引用，供界面提示“被谁引用”
        expect(result.error.impact!.relationships.map((r) => r.id)).toEqual(["r1"]);
        expect(result.error.impact!.blocking).toBe(1);
        // 取消/被阻止：草稿逐字节不变、版本号不动
        expect(JSON.stringify(state.draft)).toBe(before);
        expect(state.editVersion).toBe(0);
    });

    it("无引用删除不级联：兄弟表的字段/索引/字段索引映射/显示名全部保留", () => {
        const state = makeState({
            fields: [fieldRow(), fieldRow({ id: "f2", tableId: "t2", name: "customer_no" })],
            indices: [indexRow({ id: "ix2", tableId: "t2", name: "ix_customers_no" })],
            fieldIndices: [fieldIndexRow({ id: "fi2", fieldId: "f2", indexId: "ix2" })],
            tableDisplayNames: { t1: "订单", t2: "客户" },
            fieldDisplayNames: { f1: "主键", f2: "客户号" },
        });
        const result = deleteTable(state, { tableId: "t1" });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const next = result.state.draft;
        // 被删表及其子行/元数据移除
        expect(next.catalog.tables.find((t) => t.id === "t1")).toBeUndefined();
        expect(next.catalog.fields.find((f) => f.tableId === "t1")).toBeUndefined();
        expect(next.metadata.tableDisplayNames).not.toHaveProperty("t1");
        expect(next.metadata.fieldDisplayNames).not.toHaveProperty("f1");
        // 兄弟表不受任何级联影响：行、字段、索引、映射、元数据全部保留
        expect(next.catalog.tables.find((t) => t.id === "t2")).toMatchObject({ name: "customers", posX: 304 });
        expect(next.catalog.fields.find((f) => f.id === "f2")).toBeDefined();
        expect(next.catalog.indices.map((i) => i.id)).toEqual(["ix2"]);
        expect(next.catalog.fieldIndices.map((fi) => fi.id)).toEqual(["fi2"]);
        expect(next.metadata.tableDisplayNames).toEqual({ t2: "客户" });
        expect(next.metadata.fieldDisplayNames).toEqual({ f2: "客户号" });
    });

    it("被阻止的删除不产生任何新状态对象（取消不改草稿，含元数据）", () => {
        const state = makeState({
            relationships: [relationship()],
            tableDisplayNames: { t1: "订单", t2: "客户" },
        });
        const before = JSON.stringify(state); // 整个状态（draft + 版本）
        const result = deleteTable(state, { tableId: "t1" });
        expect(result).toMatchObject({ ok: false, error: { code: "DELETE_BLOCKED" } });
        expect(JSON.stringify(state)).toBe(before);
    });
});
