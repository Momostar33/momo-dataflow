/**
 * G01 · T006A — 字段创建、编辑与技术类型（定向单测，纯 TS，Node 端可运行）
 *
 * 覆盖点（对照 inputs/G01.md T006A 完成条件）：
 *  - 空名/纯空白拒绝；同表 trim 后重名拒绝（"col_a" vs " col_a "）
 *  - 不同表同名字段允许且行身份（id）不同
 *  - 重命名：稳定 id、note、constraints（isPrimary/unique/nullable）、
 *    defaultValue、typeId、precision/scale、显示名元数据全部保留
 *  - 备注/显示名设置与清除（空 = 未设置/null）
 *  - 类型参数：有效 typeId 引用；TYPE_NOT_FOUND；清除类型（typeId=null）
 *  - 无类型旧字段（typeId: null）保持 null
 *  - 失败路径草稿不修改（editVersion 不变、行集合不变）
 *  - sequence 口径（空表 0；非空 max+1；容忍 null）
 *
 * 说明：draft 经 deepFreeze 冻结，测试不得直接修改状态；
 * 所有"带元数据/带类型"的场景都通过初始快照工厂构造（合法路径）。
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
    addField,
    renameField,
    setFieldNote,
    setFieldDisplayName,
    setFieldType,
    fieldImpact,
    moveField,
    deleteField,
} from "./catalog-fields";

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
    createdAt: null,
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

const relationship = (over: Partial<CatalogRelationshipRow> = {}): CatalogRelationshipRow => ({
    id: "r1",
    name: "rel",
    sourceTableId: "t1",
    targetTableId: "t2",
    sourceFieldId: "f1",
    targetFieldId: "f2",
    cardinality: "many_to_one",
    onDelete: null,
    onUpdate: null,
    databaseId: "d1",
    sourceAliasName: null,
    targetAliasName: null,
    createdAt: null,
    ...over,
});

const indexRow = (over: Partial<CatalogIndexRow> = {}): CatalogIndexRow => ({
    id: "ix1",
    tableId: "t1",
    name: "idx",
    unique: null,
    createdAt: null,
    ...over,
});

const fieldIndex = (over: Partial<CatalogFieldIndexRow> = {}): CatalogFieldIndexRow => ({
    id: "fx1",
    fieldId: "f1",
    indexId: "ix1",
    ...over,
});

/** 初始快照构造参数。 */
interface Seed {
    tables?: CatalogTableRow[];
    fields?: CatalogFieldRow[];
    dataTypes?: CatalogDataTypeRow[];
    relationships?: CatalogRelationshipRow[];
    indices?: CatalogIndexRow[];
    fieldIndices?: CatalogFieldIndexRow[];
    fieldDisplayNames?: Record<string, string>;
}

/** 标准工作区：库 d1，表 t1(orders)+t2(customers)，字段 f1 属于 t1。 */
const makeState = (seed: Seed = {}) => {
    const catalog: CatalogSnapshot = emptyCatalog();
    catalog.databases.push(database());
    catalog.tables.push(
        tableRow(),
        tableRow({ id: "t2", name: "customers", posX: 304, sequence: 1 })
    );
    catalog.fields.push(fieldRow());
    catalog.dataTypes.push(dataType(), dataType({ id: "ty2", name: "decimal", type: "decimal" }));
    if (seed.tables) catalog.tables = seed.tables;
    if (seed.fields) catalog.fields = seed.fields;
    if (seed.dataTypes) catalog.dataTypes = seed.dataTypes;
    if (seed.relationships) catalog.relationships = seed.relationships;
    if (seed.indices) catalog.indices = seed.indices;
    if (seed.fieldIndices) catalog.fieldIndices = seed.fieldIndices;
    const metadata = emptyMetadata();
    metadata.fieldDisplayNames = seed.fieldDisplayNames ?? {};
    const snapshot: WorkspaceSnapshot = { catalog, metadata };
    return createInitialWorkspace(snapshot, { revision: 0, fingerprint: "" });
};

// ─────────────────────────────────────────────────────────────────────────────
// addField
// ─────────────────────────────────────────────────────────────────────────────

describe("addField", () => {
    it("拒绝空名与纯空白，且不修改草稿", () => {
        const state = makeState();
        const before = JSON.stringify(state.draft);
        for (const name of ["", "   ", "\t\n"]) {
            const result = addField(state, { tableId: "t1", name });
            expect(result).toMatchObject({ ok: false, error: { code: "EMPTY_NAME" } });
        }
        expect(state.editVersion).toBe(0);
        expect(JSON.stringify(state.draft)).toBe(before);
    });

    it("表不存在时拒绝（TABLE_NOT_FOUND）", () => {
        const result = addField(makeState(), { tableId: "nope", name: "x" });
        expect(result).toMatchObject({ ok: false, error: { code: "TABLE_NOT_FOUND" } });
    });

    it("同表 trim 后重名拒绝（'id' vs '  id '）", () => {
        const result = addField(makeState(), { tableId: "t1", name: "  id " });
        expect(result).toMatchObject({
            ok: false,
            error: { code: "DUPLICATE_NAME", name: "id" },
        });
    });

    it("不同表同名字段允许，且行身份（id）不同", () => {
        const state = makeState();
        const result = addField(state, { tableId: "t2", name: "id" });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const newRow = result.state.draft.catalog.fields.find((f) => f.id === result.fieldId);
        expect(newRow).toBeDefined();
        expect(newRow!.tableId).toBe("t2");
        expect(newRow!.name).toBe("id");
        expect(newRow!.id).not.toBe("f1"); // 身份不同
    });

    it("typeId 不存在于 dataTypes → TYPE_NOT_FOUND", () => {
        const result = addField(makeState(), { tableId: "t1", name: "new_col", typeId: "nonexistent" });
        expect(result).toMatchObject({ ok: false, error: { code: "TYPE_NOT_FOUND" } });
    });

    it("dataTypes 中 id 为 null 的行不算有效类型引用", () => {
        const state = makeState({
            dataTypes: [
                dataType({ id: null, name: "anon", type: "text" }),
            ],
        });
        const result = addField(state, { tableId: "t1", name: "x", typeId: "ghost" });
        expect(result).toMatchObject({ ok: false, error: { code: "TYPE_NOT_FOUND" } });
    });

    it("新行：uuid 新 id、所有可空列 null、sequence=max+1、note/displayName 填充", () => {
        const result = addField(makeState(), {
            tableId: "t1",
            name: "  amount  ",
            note: " 金额  ",
            displayName: " 金额(元) ",
            typeId: "ty2",
            precision: 10,
            scale: 2,
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const row = result.state.draft.catalog.fields.find((f) => f.id === result.fieldId)!;
        expect(row.name).toBe("amount");
        expect(row.id).toMatch(/^[0-9a-f-]{36}$/);
        expect(row.tableId).toBe("t1");
        expect(row.isPrimary).toBeNull();
        expect(row.unique).toBeNull();
        expect(row.nullable).toBeNull();
        expect(row.defaultValue).toBeNull();
        expect(row.note).toBe("金额");
        expect(row.typeId).toBe("ty2");
        expect(row.sequence).toBe(1); // f1 已有 sequence=0 → max+1=1
        expect(row.maxLength).toBeNull();
        expect(row.unsigned).toBeNull();
        expect(row.isForeign).toBeNull();
        expect(row.zeroFill).toBeNull();
        expect(row.autoIncrement).toBeNull();
        expect(row.precision).toBe(10);
        expect(row.scale).toBe(2);
        expect(row.charset).toBeNull();
        expect(row.collate).toBeNull();
        expect(row.values).toBeNull();
        expect(result.state.draft.metadata.fieldDisplayNames[row.id]).toBe("金额(元)");
    });

    it("无类型新字段：typeId=null、precision/scale=null", () => {
        const result = addField(makeState(), { tableId: "t2", name: "label" });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const row = result.state.draft.catalog.fields.find((f) => f.id === result.fieldId)!;
        expect(row.typeId).toBeNull();
        expect(row.precision).toBeNull();
        expect(row.scale).toBeNull();
        expect(row.sequence).toBe(0); // t2 无已有字段 → 0
    });

    it("容忍 sequence 为 null 的已有字段行（取已知最大值 +1）", () => {
        const state = makeState({
            fields: [fieldRow({ sequence: null }), fieldRow({ id: "f2", name: "b", sequence: 3 })],
        });
        const result = addField(state, { tableId: "t1", name: "c" });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const row = result.state.draft.catalog.fields.find((f) => f.id === result.fieldId)!;
        // null 不算值：max(3) + 1 = 4
        expect(row.sequence).toBe(4);
    });

    it("显示名/备注为空时不建键/存 null", () => {
        const result = addField(makeState(), {
            tableId: "t2",
            name: "plain",
            note: "   ",
            displayName: "  ",
        });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const row = result.state.draft.catalog.fields.find((f) => f.id === result.fieldId)!;
        expect(row.note).toBeNull();
        expect(result.state.draft.metadata.fieldDisplayNames[row.id]).toBeUndefined();
    });

    it("成功变更走不可变更新：editVersion+1、hasUnsavedChanges=true、旧状态不变", () => {
        const state = makeState();
        const before = JSON.stringify(state.draft);
        const result = addField(state, { tableId: "t1", name: "ok" });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.state.editVersion).toBe(state.editVersion + 1);
        expect(hasUnsavedChanges(result.state)).toBe(true);
        expect(JSON.stringify(state.draft)).toBe(before);
        expect(result.state.draft).not.toBe(state.draft);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// renameField
// ─────────────────────────────────────────────────────────────────────────────

describe("renameField", () => {
    it("未知字段 → FIELD_NOT_FOUND", () => {
        expect(renameField(makeState(), { fieldId: "nope", name: "x" }))
            .toMatchObject({ ok: false, error: { code: "FIELD_NOT_FOUND" } });
    });

    it("空名 → EMPTY_NAME 且草稿不变", () => {
        const state = makeState();
        const result = renameField(state, { fieldId: "f1", name: "   " });
        expect(result).toMatchObject({ ok: false, error: { code: "EMPTY_NAME" } });
        expect(state.editVersion).toBe(0);
    });

    it("同表他字段重名 → DUPLICATE_NAME，草稿不变", () => {
        const state = makeState({
            fields: [fieldRow(), fieldRow({ id: "f2", name: "other" })],
        });
        const before = JSON.stringify(state.draft);
        const result = renameField(state, { fieldId: "f1", name: "  other " });
        expect(result).toMatchObject({
            ok: false,
            error: { code: "DUPLICATE_NAME", name: "other" },
        });
        expect(JSON.stringify(state.draft)).toBe(before);
        expect(state.editVersion).toBe(0);
    });

    it("重命名只改 name：id/note/constraints/defaultValue/nullable/typeId/precision/scale 保留", () => {
        const state = makeState({
            fields: [
                fieldRow({
                    note: "主键",
                    isPrimary: true,
                    unique: true,
                    nullable: false,
                    defaultValue: "0",
                    typeId: "ty1",
                    precision: 8,
                    scale: 2,
                }),
            ],
            fieldDisplayNames: { f1: "主键ID" },
        });
        const result = renameField(state, { fieldId: "f1", name: "  primary_key " });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const row = result.state.draft.catalog.fields.find((f) => f.id === "f1")!;
        expect(row.name).toBe("primary_key");
        expect(row.id).toBe("f1");
        expect(row.note).toBe("主键");
        expect(row.isPrimary).toBe(true);
        expect(row.unique).toBe(true);
        expect(row.nullable).toBe(false);
        expect(row.defaultValue).toBe("0");
        expect(row.typeId).toBe("ty1");
        expect(row.precision).toBe(8);
        expect(row.scale).toBe(2);
        // 显示名元数据仍按同一稳定 id 保留
        expect(result.state.draft.metadata.fieldDisplayNames).toEqual({ f1: "主键ID" });
    });

    it("改名为自己名称的空白变体不判重（排除自身，并归一 trim）", () => {
        const result = renameField(makeState(), { fieldId: "f1", name: "   id   " });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const row = result.state.draft.catalog.fields.find((f) => f.id === "f1")!;
        expect(row.name).toBe("id");
    });

    it("不同表同名字段不受影响（作用域 = 同表）", () => {
        const state = makeState({
            fields: [fieldRow(), fieldRow({ id: "f2", tableId: "t2", name: "t2_name" })],
        });
        // t2 已有 "t2_name"，t1 改名为 "t2_name" 应允许（不同表）
        const result = renameField(state, { fieldId: "f1", name: "t2_name" });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const row = result.state.draft.catalog.fields.find((f) => f.id === "f1")!;
        expect(row.name).toBe("t2_name");
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// setFieldNote / setFieldDisplayName
// ─────────────────────────────────────────────────────────────────────────────

describe("setFieldNote", () => {
    it("设置备注（trim 后存行内 note 列）", () => {
        const result = setFieldNote(makeState(), { fieldId: "f1", note: " 订单金额 " });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.state.draft.catalog.fields.find((f) => f.id === "f1")!.note)
            .toBe("订单金额");
    });

    it("空值存 null（清除备注）", () => {
        const state = makeState({
            fields: [fieldRow({ note: "旧备注" })],
        });
        const result = setFieldNote(state, { fieldId: "f1", note: "" });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.state.draft.catalog.fields.find((f) => f.id === "f1")!.note).toBeNull();
    });

    it("未知字段 → FIELD_NOT_FOUND", () => {
        expect(setFieldNote(makeState(), { fieldId: "nope", note: "x" }))
            .toMatchObject({ ok: false, error: { code: "FIELD_NOT_FOUND" } });
    });
});

describe("setFieldDisplayName", () => {
    it("设置后以稳定 id 为键保存 trim 值", () => {
        const result = setFieldDisplayName(makeState(), { fieldId: "f1", displayName: " 主键 " });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.state.draft.metadata.fieldDisplayNames).toEqual({ f1: "主键" });
    });

    it("空值清除已有键（界面回退技术名）", () => {
        const state = makeState({ fieldDisplayNames: { f1: "旧显示名" } });
        const result = setFieldDisplayName(state, { fieldId: "f1", displayName: "  " });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.state.draft.metadata.fieldDisplayNames).toEqual({});
    });

    it("未知字段 → FIELD_NOT_FOUND", () => {
        expect(setFieldDisplayName(makeState(), { fieldId: "nope", displayName: "x" }))
            .toMatchObject({ ok: false, error: { code: "FIELD_NOT_FOUND" } });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// setFieldType
// ─────────────────────────────────────────────────────────────────────────────

describe("setFieldType", () => {
    it("未知字段 → FIELD_NOT_FOUND", () => {
        expect(setFieldType(makeState(), { fieldId: "nope", typeId: "ty1" }))
            .toMatchObject({ ok: false, error: { code: "FIELD_NOT_FOUND" } });
    });

    it("无效 typeId → TYPE_NOT_FOUND，草稿不变", () => {
        const state = makeState();
        const before = JSON.stringify(state.draft);
        const result = setFieldType(state, { fieldId: "f1", typeId: "ghost" });
        expect(result).toMatchObject({ ok: false, error: { code: "TYPE_NOT_FOUND" } });
        expect(JSON.stringify(state.draft)).toBe(before);
        expect(state.editVersion).toBe(0);
    });

    it("设置有效类型：typeId 更新，precision/scale 仅在显式提供时更新", () => {
        const state = makeState({
            fields: [fieldRow({ typeId: "ty1", precision: 5, scale: 2 })],
        });
        const result = setFieldType(state, { fieldId: "f1", typeId: "ty2", precision: 12 });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const row = result.state.draft.catalog.fields.find((f) => f.id === "f1")!;
        expect(row.typeId).toBe("ty2");
        expect(row.precision).toBe(12);
        expect(row.scale).toBe(2); // 未提供 → 保持原值
    });

    it("清除类型（typeId=null）：precision/scale 一并归 null", () => {
        const state = makeState({
            fields: [fieldRow({ typeId: "ty1", precision: 8, scale: 4 })],
        });
        const result = setFieldType(state, { fieldId: "f1", typeId: null });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const row = result.state.draft.catalog.fields.find((f) => f.id === "f1")!;
        expect(row.typeId).toBeNull();
        expect(row.precision).toBeNull();
        expect(row.scale).toBeNull();
    });

    it("不修改 isPrimary/unique/nullable/defaultValue/note 等其他列", () => {
        const state = makeState({
            fields: [
                fieldRow({
                    isPrimary: true,
                    unique: true,
                    nullable: false,
                    defaultValue: "42",
                    note: "保留",
                    typeId: "ty1",
                }),
            ],
        });
        const result = setFieldType(state, { fieldId: "f1", typeId: "ty2" });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const row = result.state.draft.catalog.fields.find((f) => f.id === "f1")!;
        expect(row.isPrimary).toBe(true);
        expect(row.unique).toBe(true);
        expect(row.nullable).toBe(false);
        expect(row.defaultValue).toBe("42");
        expect(row.note).toBe("保留");
        expect(row.typeId).toBe("ty2");
    });

    it("无类型旧字段（typeId=null）设置新类型后更新，清除后回到 null", () => {
        // 初始无类型
        const state = makeState({
            fields: [fieldRow({ typeId: null, precision: null, scale: null })],
        });
        // 设置类型
        const r1 = setFieldType(state, { fieldId: "f1", typeId: "ty1", precision: 4, scale: 1 });
        expect(r1.ok).toBe(true);
        if (!r1.ok) return;
        let row = r1.state.draft.catalog.fields.find((f) => f.id === "f1")!;
        expect(row.typeId).toBe("ty1");
        expect(row.precision).toBe(4);
        expect(row.scale).toBe(1);
        // 清除类型
        const r2 = setFieldType(r1.state, { fieldId: "f1", typeId: null });
        expect(r2.ok).toBe(true);
        if (!r2.ok) return;
        row = r2.state.draft.catalog.fields.find((f) => f.id === "f1")!;
        expect(row.typeId).toBeNull();
        expect(row.precision).toBeNull();
        expect(row.scale).toBeNull();
    });

    it("显式 precision=null / scale=null 清除对应值", () => {
        const state = makeState({
            fields: [fieldRow({ typeId: "ty1", precision: 10, scale: 3 })],
        });
        const result = setFieldType(state, { fieldId: "f1", typeId: "ty1", precision: null, scale: null });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const row = result.state.draft.catalog.fields.find((f) => f.id === "f1")!;
        expect(row.typeId).toBe("ty1");
        expect(row.precision).toBeNull();
        expect(row.scale).toBeNull();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// fieldImpact（T006B 只读影响查询）
// ─────────────────────────────────────────────────────────────────────────────

describe("fieldImpact", () => {
    it("无引用 → blocking=0，relationships/fieldIndices 为空", () => {
        const snapshot = makeState().draft.catalog;
        expect(fieldImpact(snapshot, "f1")).toEqual({
            fieldId: "f1",
            relationships: [],
            fieldIndices: [],
            blocking: 0,
        });
    });

    it("relationship.sourceFieldId 命中计入 blocking", () => {
        const snapshot = makeState({
            fields: [fieldRow(), fieldRow({ id: "f2", tableId: "t2" })],
            relationships: [relationship({ sourceFieldId: "f1", targetFieldId: "f2" })],
        }).draft.catalog;
        const impact = fieldImpact(snapshot, "f1");
        expect(impact.blocking).toBe(1);
        expect(impact.relationships).toHaveLength(1);
        expect(impact.fieldIndices).toHaveLength(0);
    });

    it("relationship.targetFieldId 命中计入 blocking", () => {
        const snapshot = makeState({
            fields: [fieldRow(), fieldRow({ id: "f2", tableId: "t2" })],
            relationships: [relationship({ sourceFieldId: "f2", targetFieldId: "f1" })],
        }).draft.catalog;
        expect(fieldImpact(snapshot, "f1").blocking).toBe(1);
    });

    it("fieldIndex.fieldId 命中计入 blocking", () => {
        const snapshot = makeState({
            fields: [fieldRow()],
            indices: [indexRow({ id: "ix1", tableId: "t1" })],
            fieldIndices: [fieldIndex({ id: "fx1", fieldId: "f1", indexId: "ix1" })],
        }).draft.catalog;
        const impact = fieldImpact(snapshot, "f1");
        expect(impact.blocking).toBe(1);
        expect(impact.fieldIndices).toHaveLength(1);
        expect(impact.relationships).toHaveLength(0);
    });

    it("一条关系 + 一条字段索引 = blocking 2", () => {
        const snapshot = makeState({
            fields: [fieldRow(), fieldRow({ id: "f2", tableId: "t2" })],
            relationships: [relationship({ sourceFieldId: "f1", targetFieldId: "f2" })],
            indices: [indexRow({ id: "ix1", tableId: "t1" })],
            fieldIndices: [fieldIndex({ id: "fx1", fieldId: "f1", indexId: "ix1" })],
        }).draft.catalog;
        expect(fieldImpact(snapshot, "f1").blocking).toBe(2);
    });

    it("仅表级 index（无 fieldIndex 映射）不算字段引用", () => {
        const snapshot = makeState({
            fields: [fieldRow()],
            indices: [indexRow({ id: "ix1", tableId: "t1" })],
        }).draft.catalog;
        expect(fieldImpact(snapshot, "f1").blocking).toBe(0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// moveField（T006B 顺序调整）
// ─────────────────────────────────────────────────────────────────────────────

describe("moveField", () => {
    it("未知字段 → FIELD_NOT_FOUND", () => {
        expect(moveField(makeState(), { fieldId: "nope", toIndex: 0 }))
            .toMatchObject({ ok: false, error: { code: "FIELD_NOT_FOUND" } });
    });

    it("移动不换 id：末位字段移到首位，重排 sequence=0..n-1，其余列不变", () => {
        const state = makeState({
            fields: [
                fieldRow({ id: "a", name: "col_a", sequence: 0 }),
                fieldRow({ id: "b", name: "col_b", sequence: 1 }),
                fieldRow({ id: "c", name: "col_c", sequence: 2 }),
            ],
        });
        const result = moveField(state, { fieldId: "c", toIndex: 0 });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.state.draft.catalog.fields.map((f) => f.id).sort()).toEqual(["a", "b", "c"]);
        const byId = (id: string) => result.state.draft.catalog.fields.find((f) => f.id === id)!;
        expect(byId("c").sequence).toBe(0);
        expect(byId("a").sequence).toBe(1);
        expect(byId("b").sequence).toBe(2);
        expect(byId("c").name).toBe("col_c"); // 其余列不变
        expect(byId("c").tableId).toBe("t1");
    });

    it("数组序与 sequence 不一致时以 sequence 为基线序", () => {
        // 数组顺序 a,b,c；sequence: a=2, b=0, c=1 → 基线序 b,c,a
        const state = makeState({
            fields: [
                fieldRow({ id: "a", name: "col_a", sequence: 2 }),
                fieldRow({ id: "b", name: "col_b", sequence: 0 }),
                fieldRow({ id: "c", name: "col_c", sequence: 1 }),
            ],
        });
        const result = moveField(state, { fieldId: "a", toIndex: 0 });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const byId = (id: string) => result.state.draft.catalog.fields.find((f) => f.id === id)!;
        expect(byId("a").sequence).toBe(0);
        expect(byId("b").sequence).toBe(1);
        expect(byId("c").sequence).toBe(2);
    });

    it("null sequence 视为末位（null-last 稳定排序）", () => {
        const state = makeState({
            fields: [
                fieldRow({ id: "a", name: "col_a", sequence: null }),
                fieldRow({ id: "b", name: "col_b", sequence: 0 }),
                fieldRow({ id: "c", name: "col_c", sequence: 1 }),
            ],
        });
        // 基线序 b,c,a(null)；把 a 移到首位 → a,b,c
        const result = moveField(state, { fieldId: "a", toIndex: 0 });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const byId = (id: string) => result.state.draft.catalog.fields.find((f) => f.id === id)!;
        expect(byId("a").sequence).toBe(0);
        expect(byId("b").sequence).toBe(1);
        expect(byId("c").sequence).toBe(2);
    });

    it("只影响目标字段所在表：其他表 sequence 保持不变", () => {
        const state = makeState({
            fields: [
                fieldRow({ id: "a", tableId: "t1", name: "a", sequence: 0 }),
                fieldRow({ id: "b", tableId: "t1", name: "b", sequence: 1 }),
                fieldRow({ id: "c", tableId: "t2", name: "c", sequence: 0 }),
            ],
        });
        const result = moveField(state, { fieldId: "b", toIndex: 0 });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        const byId = (id: string) => result.state.draft.catalog.fields.find((f) => f.id === id)!;
        expect(byId("b").sequence).toBe(0);
        expect(byId("a").sequence).toBe(1);
        expect(byId("c").sequence).toBe(0); // t2 未受影响
    });

    it("越界/非整数 toIndex → POSITION_OUT_OF_RANGE，草稿不变", () => {
        const state = makeState({
            fields: [fieldRow({ id: "a", sequence: 0 }), fieldRow({ id: "b", sequence: 1 })],
        });
        const before = JSON.stringify(state.draft);
        for (const bad of [-1, 2, 5, 0.5, Number.NaN]) {
            const r = moveField(state, { fieldId: "a", toIndex: bad });
            expect(r).toMatchObject({ ok: false, error: { code: "POSITION_OUT_OF_RANGE" } });
        }
        expect(JSON.stringify(state.draft)).toBe(before);
        expect(state.editVersion).toBe(0);
    });

    it("成功变更走不可变更新：editVersion+1、hasUnsavedChanges=true、旧状态不变", () => {
        const state = makeState({
            fields: [fieldRow({ id: "a", sequence: 0 }), fieldRow({ id: "b", sequence: 1 })],
        });
        const before = JSON.stringify(state.draft);
        const result = moveField(state, { fieldId: "a", toIndex: 1 });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.state.editVersion).toBe(state.editVersion + 1);
        expect(hasUnsavedChanges(result.state)).toBe(true);
        expect(JSON.stringify(state.draft)).toBe(before);
        expect(result.state.draft).not.toBe(state.draft);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// deleteField（T006B 引用保护删除）
// ─────────────────────────────────────────────────────────────────────────────

describe("deleteField", () => {
    it("未知字段 → FIELD_NOT_FOUND", () => {
        expect(deleteField(makeState(), { fieldId: "nope" }))
            .toMatchObject({ ok: false, error: { code: "FIELD_NOT_FOUND" } });
    });

    it("被 relationship.sourceFieldId 引用 → DELETE_BLOCKED，草稿不变，impact 可见", () => {
        const state = makeState({
            fields: [fieldRow(), fieldRow({ id: "f2", tableId: "t2" })],
            relationships: [relationship({ sourceFieldId: "f1", targetFieldId: "f2" })],
        });
        const before = JSON.stringify(state.draft);
        const result = deleteField(state, { fieldId: "f1" });
        expect(result).toMatchObject({ ok: false, error: { code: "DELETE_BLOCKED" } });
        if (!result.ok) {
            expect(result.error.impact).toMatchObject({ fieldId: "f1", blocking: 1 });
            expect(result.error.impact!.relationships).toHaveLength(1);
        }
        expect(JSON.stringify(state.draft)).toBe(before);
        expect(state.editVersion).toBe(0);
    });

    it("被 relationship.targetFieldId 引用 → DELETE_BLOCKED", () => {
        const state = makeState({
            fields: [fieldRow(), fieldRow({ id: "f2", tableId: "t2" })],
            relationships: [relationship({ sourceFieldId: "f2", targetFieldId: "f1" })],
        });
        expect(deleteField(state, { fieldId: "f1" }))
            .toMatchObject({ ok: false, error: { code: "DELETE_BLOCKED" } });
    });

    it("被 fieldIndex 映射引用 → DELETE_BLOCKED", () => {
        const state = makeState({
            fields: [fieldRow()],
            indices: [indexRow({ id: "ix1", tableId: "t1" })],
            fieldIndices: [fieldIndex({ id: "fx1", fieldId: "f1", indexId: "ix1" })],
        });
        const result = deleteField(state, { fieldId: "f1" });
        expect(result).toMatchObject({ ok: false, error: { code: "DELETE_BLOCKED" } });
        if (!result.ok) {
            expect(result.error.impact!.fieldIndices).toHaveLength(1);
        }
    });

    it("无引用 → 移除字段行并清理 fieldDisplayNames，其余字段与元数据保留", () => {
        const state = makeState({
            fields: [fieldRow(), fieldRow({ id: "f2", tableId: "t2", name: "other" })],
            fieldDisplayNames: { f1: "主键", f2: "其他" },
        });
        const result = deleteField(state, { fieldId: "f1" });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.state.draft.catalog.fields.find((f) => f.id === "f1")).toBeUndefined();
        expect(result.state.draft.catalog.fields.find((f) => f.id === "f2")).toBeDefined();
        expect(result.state.draft.metadata.fieldDisplayNames).toEqual({ f2: "其他" });
    });

    it("无显示名键时删除不报错（hasOwnProperty 守卫）", () => {
        const state = makeState({ fields: [fieldRow(), fieldRow({ id: "f2", tableId: "t2" })] });
        const result = deleteField(state, { fieldId: "f1" });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.state.draft.catalog.fields.find((f) => f.id === "f1")).toBeUndefined();
        expect(result.state.draft.metadata.fieldDisplayNames).toEqual({});
    });

    it("仅表级 index（无 fieldIndex）不算引用 → 允许删除", () => {
        const state = makeState({
            fields: [fieldRow()],
            indices: [indexRow({ id: "ix1", tableId: "t1" })],
        });
        expect(deleteField(state, { fieldId: "f1" }).ok).toBe(true);
    });

    it("成功变更走不可变更新：editVersion+1、旧状态不变", () => {
        const state = makeState({ fields: [fieldRow()], fieldDisplayNames: { f1: "x" } });
        const before = JSON.stringify(state.draft);
        const result = deleteField(state, { fieldId: "f1" });
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.state.editVersion).toBe(state.editVersion + 1);
        expect(JSON.stringify(state.draft)).toBe(before);
        expect(result.state.draft).not.toBe(state.draft);
    });
});
