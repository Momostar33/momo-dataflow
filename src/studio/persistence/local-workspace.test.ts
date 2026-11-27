/**
 * G01 · T003 — 本地库读取 + 业务元数据初始化（纯函数单测）
 *
 * 覆盖：
 *  - parseBusinessDocument：null/旧文档（缺 schemaVersion）/合法 v1/未知键忽略；
 *    非法 JSON、顶层非对象、schemaVersion 非整数/“1”/1.5/0、>1（显式不支持版本）、
 *    metadata 形状错误均显式报错，不静默。
 *  - initializeWorkspace：无文档空值初始化（revision 0、空元数据、无未保存变更）；
 *    实时目录优先（不导入 snapshot 存档）；data_types.id 与 field.typeId 真实
 *    可空性保留；未知列保留；基线 = { doc.revision, 被动列指纹 }；draft 冻结；
 *    损坏/更高版本文档显式抛出。
 *
 * 纯 Node 环境：不导入 db/PowerSync（浏览器专属），只测纯模块。
 */

import { describe, expect, it } from "vitest";

import {
    BUSINESS_DOCUMENT_SCHEMA_VERSION,
    initializeWorkspace,
    parseBusinessDocument,
    StudioDocumentRow,
    WorkspaceCorruptionError,
    WorkspaceUnsupportedSchemaError,
} from "./local-workspace";
import {
    hasUnsavedChanges,
    catalogFingerprint,
} from "../state/workspace-state";
import { CatalogSnapshot } from "../contracts/catalog";

// ─────────────────────────────────────────────────────────────────────────────
// 测试夹具
// ─────────────────────────────────────────────────────────────────────────────

/** 空目录快照。 */
const emptyCatalog = (): CatalogSnapshot => ({
    databases: [],
    tables: [],
    fields: [],
    dataTypes: [],
    relationships: [],
    indices: [],
    fieldIndices: [],
});

/** 含可空 id/typeId 与未知列的真实形状目录。 */
const sampleCatalog = (): CatalogSnapshot => ({
    databases: [
        { id: "db1", name: "sales", dialect: "sqlite", numOfTables: 1, createdAt: null },
    ],
    tables: [
        {
            id: "t1",
            databaseId: "db1",
            name: "orders",
            posX: 0,
            posY: 0,
            color: null,
            width: null,
            note: null,
            sequence: 1,
            createdAt: "2026-11-23T00:00:00.000Z",
        },
    ],
    fields: [
        {
            id: "f1",
            tableId: "t1",
            name: "amount",
            isPrimary: null,
            unique: null,
            nullable: true,
            defaultValue: null,
            note: null,
            typeId: null, // 真实可空：无类型引用，不得发明代理类型
            sequence: 2,
            maxLength: null,
            unsigned: null,
            isForeign: null,
            zeroFill: null,
            autoIncrement: null,
            precision: 10,
            scale: 2,
            charset: null,
            collate: null,
            values: null,
        },
        {
            id: "f2",
            tableId: "t1",
            name: "note",
            isPrimary: null,
            unique: null,
            nullable: null,
            defaultValue: null,
            note: null,
            typeId: "dt1",
            sequence: 3,
            maxLength: null,
            unsigned: null,
            isForeign: null,
            zeroFill: null,
            autoIncrement: null,
            precision: null,
            scale: null,
            charset: null,
            collate: null,
            values: null,
        },
    ],
    dataTypes: [
        { id: null, name: "text", dialect: "sqlite", type: "TEXT", modifiers: null, synonyms: null }, // data_types.id 真实可空
        { id: "dt1", name: "int", dialect: "sqlite", type: "INTEGER", modifiers: null, synonyms: null },
    ],
    relationships: [
        {
            id: "r1",
            name: null,
            sourceTableId: "t1",
            targetTableId: "t1",
            sourceFieldId: "f1",
            targetFieldId: "f2",
            cardinality: "many_to_one",
            onDelete: null,
            onUpdate: null,
            databaseId: "db1",
            sourceAliasName: null,
            targetAliasName: null,
            createdAt: null,
        },
    ],
    indices: [
        { id: "i1", tableId: "t1", name: "idx_orders_amount", unique: false, createdAt: null },
    ],
    fieldIndices: [
        { id: "fi1", fieldId: "f1", indexId: "i1" },
    ],
});

/** 构造 studio_document 行。 */
const doc = (snapshot: string | null, revision = 3): StudioDocumentRow => ({
    id: "default",
    revision,
    updatedAt: "2026-11-22T00:00:00.000Z",
    snapshot,
});

// ─────────────────────────────────────────────────────────────────────────────
// parseBusinessDocument
// ─────────────────────────────────────────────────────────────────────────────

describe("parseBusinessDocument", () => {
    it("无文档（null）→ 初版 + 空元数据", () => {
        const parsed = parseBusinessDocument(null);
        expect(parsed.schemaVersion).toBe(BUSINESS_DOCUMENT_SCHEMA_VERSION);
        expect(parsed.metadata.tableDisplayNames).toEqual({});
        expect(parsed.metadata.fieldDisplayNames).toEqual({});
    });

    it("空对象 {} → 初版 + 空元数据（旧文档缺 schemaVersion 兼容读取）", () => {
        const parsed = parseBusinessDocument("{}");
        expect(parsed.schemaVersion).toBe(BUSINESS_DOCUMENT_SCHEMA_VERSION);
        expect(parsed.metadata).toEqual({ tableDisplayNames: {}, fieldDisplayNames: {} });
    });

    it("旧文档（缺 schemaVersion）带元数据 → 按 v1 读取", () => {
        const json = JSON.stringify({
            metadata: {
                tableDisplayNames: { t1: "订单表" },
                fieldDisplayNames: { f1: "金额" },
            },
        });
        const parsed = parseBusinessDocument(json);
        expect(parsed.schemaVersion).toBe(1);
        expect(parsed.metadata.tableDisplayNames).toEqual({ t1: "订单表" });
        expect(parsed.metadata.fieldDisplayNames).toEqual({ f1: "金额" });
    });

    it("合法 v1 文档 → 解析元数据；未知顶层键（catalog 存档等）忽略", () => {
        const json = JSON.stringify({
            schemaVersion: 1,
            catalog: { tables: [{ id: "ghost" }] }, // 存档用途，忽略
            metadata: { tableDisplayNames: { t1: "订单表" } },
            someFutureKey: "x",
        });
        const parsed = parseBusinessDocument(json);
        expect(parsed.schemaVersion).toBe(1);
        expect(parsed.metadata.tableDisplayNames).toEqual({ t1: "订单表" });
        expect(parsed.metadata.fieldDisplayNames).toEqual({});
    });

    it("非法 JSON → WorkspaceCorruptionError", () => {
        expect(() => parseBusinessDocument("not json {")).toThrow(WorkspaceCorruptionError);
    });

    it.each([
        ["数组顶层", "[1,2,3]"],
        ["字符串顶层", '"x"'],
        ["数字顶层", "42"],
        ["null 字面量", "null"],
    ])("顶层非对象（%s）→ WorkspaceCorruptionError", (_label, json) => {
        expect(() => parseBusinessDocument(json)).toThrow(WorkspaceCorruptionError);
    });

    it.each([
        ["字符串 '1'", "1"],
        ["小数 1.5", 1.5],
        ["0", 0],
        ["负数 -3", -3],
    ])("schemaVersion 非法（%s）→ WorkspaceCorruptionError", (_label, version) => {
        expect(() =>
            parseBusinessDocument(JSON.stringify({ schemaVersion: version }))
        ).toThrow(WorkspaceCorruptionError);
    });

    it("schemaVersion 高于支持版本（99）→ WorkspaceUnsupportedSchemaError（显式报告，不静默）", () => {
        let thrown: unknown;
        try {
            parseBusinessDocument(JSON.stringify({ schemaVersion: 99 }));
        } catch (e) {
            thrown = e;
        }
        expect(thrown).toBeInstanceOf(WorkspaceUnsupportedSchemaError);
        expect((thrown as WorkspaceUnsupportedSchemaError).name).toBe(
            "WorkspaceUnsupportedSchemaError"
        );
        expect((thrown as WorkspaceUnsupportedSchemaError).schemaVersion).toBe(99);
    });

    it.each([
        ["metadata 为字符串", "str"],
        ["metadata 为数组", "[1]"],
        ["metadata 为 null", null],
        ["tableDisplayNames 为字符串", "t1"],
        ["fieldDisplayNames 为数组", ["f1"]],
    ])("metadata 形状错误（%s）→ WorkspaceCorruptionError", (_label, bad) => {
        expect(() =>
            parseBusinessDocument(JSON.stringify({ schemaVersion: 1, metadata: bad }))
        ).toThrow(WorkspaceCorruptionError);
    });

    it("metadata 记录值非字符串 → WorkspaceCorruptionError", () => {
        expect(() =>
            parseBusinessDocument(
                JSON.stringify({
                    schemaVersion: 1,
                    metadata: { tableDisplayNames: { t1: 42 } },
                })
            )
        ).toThrow(WorkspaceCorruptionError);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// initializeWorkspace
// ─────────────────────────────────────────────────────────────────────────────

describe("initializeWorkspace", () => {
    it("无文档 + 空目录 → 空值初始化（revision 0、无未保存变更）", () => {
        const state = initializeWorkspace(emptyCatalog(), null);
        expect(state.baseRevision).toBe(0);
        expect(state.baseFingerprint).toBe(catalogFingerprint(emptyCatalog()));
        expect(state.editVersion).toBe(0);
        expect(state.savedEditVersion).toBe(0);
        expect(hasUnsavedChanges(state)).toBe(false);
        expect(state.draft.catalog).toEqual(emptyCatalog());
        expect(state.draft.metadata).toEqual({ tableDisplayNames: {}, fieldDisplayNames: {} });
    });

    it("实时目录优先：draft.catalog 采用实时行，不导入 snapshot 存档的 catalog", () => {
        const live = sampleCatalog();
        const json = JSON.stringify({
            schemaVersion: 1,
            catalog: {
                tables: [{ id: "ghost-table", name: "不应出现" }],
                fields: [],
                databases: [],
                dataTypes: [],
                relationships: [],
                indices: [],
                fieldIndices: [],
            },
            metadata: { tableDisplayNames: { t1: "订单表" } },
        });
        const state = initializeWorkspace(live, doc(json, 7));
        const ids = state.draft.catalog.tables.map((r) => r.id);
        expect(ids).toEqual(["t1"]);
        expect(state.draft.metadata.tableDisplayNames).toEqual({ t1: "订单表" });
        expect(state.baseRevision).toBe(7);
    });

    it("data_types.id 真实可空性保留（null 不改成代理值）", () => {
        const state = initializeWorkspace(sampleCatalog(), null);
        const dt = state.draft.catalog.dataTypes.find((r) => r.name === "text");
        expect(dt?.id).toBeNull();
    });

    it("field.typeId 真实可空性保留（无类型引用保持 null）", () => {
        const state = initializeWorkspace(sampleCatalog(), null);
        const f = state.draft.catalog.fields.find((r) => r.id === "f1");
        expect(f?.typeId).toBeNull();
    });

    it("未知列保留（行透传，不裁剪）", () => {
        const live = sampleCatalog();
        (live.tables[0] as Record<string, unknown>)["futureCol"] = "kept";
        (live.dataTypes[1] as Record<string, unknown>)["legacyCol"] = 42;
        const state = initializeWorkspace(live, null);
        expect((state.draft.catalog.tables[0] as Record<string, unknown>)["futureCol"]).toBe("kept");
        expect((state.draft.catalog.dataTypes[1] as Record<string, unknown>)["legacyCol"]).toBe(42);
    });

    it("关系/索引/字段索引保留", () => {
        const state = initializeWorkspace(sampleCatalog(), null);
        expect(state.draft.catalog.relationships).toHaveLength(1);
        expect(state.draft.catalog.relationships[0].cardinality).toBe("many_to_one");
        expect(state.draft.catalog.indices).toHaveLength(1);
        expect(state.draft.catalog.fieldIndices).toHaveLength(1);
    });

    it("基线 = { doc.revision, 实时目录被动列指纹 }", () => {
        const live = sampleCatalog();
        const state = initializeWorkspace(live, doc(null, 12));
        expect(state.baseRevision).toBe(12);
        expect(state.baseFingerprint).toBe(catalogFingerprint(live));
    });

    it("draft 与 lastSavedSnapshot 内容一致且冻结", () => {
        const state = initializeWorkspace(sampleCatalog(), null);
        expect(state.draft).toEqual(state.lastSavedSnapshot);
        expect(Object.isFrozen(state.draft)).toBe(true);
        expect(Object.isFrozen(state.draft.catalog.tables)).toBe(true);
        expect(Object.isFrozen(state.draft.catalog.tables[0])).toBe(true);
        expect(state.lastSavedSnapshot).not.toBe(state.draft);
    });

    it("旧文档（缺 schemaVersion）仍可载入，元数据保留", () => {
        const json = JSON.stringify({ metadata: { fieldDisplayNames: { f1: "金额" } } });
        const state = initializeWorkspace(sampleCatalog(), doc(json, 1));
        expect(state.draft.metadata.fieldDisplayNames).toEqual({ f1: "金额" });
        expect(state.baseRevision).toBe(1);
    });

    it("损坏文档（非法 JSON）→ WorkspaceCorruptionError，不得静默初始化", () => {
        expect(() => initializeWorkspace(sampleCatalog(), doc("{bad"))).toThrow(
            WorkspaceCorruptionError
        );
    });

    it("更高版本文档（schemaVersion 99）→ WorkspaceUnsupportedSchemaError", () => {
        expect(() =>
            initializeWorkspace(sampleCatalog(), doc(JSON.stringify({ schemaVersion: 99 })))
        ).toThrow(WorkspaceUnsupportedSchemaError);
    });
});
