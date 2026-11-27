/**
 * G01 · T004 — upsert-plan 定向单测（纯 TS，Node 端可运行）
 *
 * 覆盖点：
 *  - 全新增 → 全部 insert（顺序 = 草稿顺序）
 *  - 无变化 → 空计划（no-op，不产生任何写入）
 *  - 改名（name 变化）→ 单个 update，稳定 id 不变
 *  - 备注/类型参数变化 → update
 *  - 删除 → deletes（顺序 = 基线顺序）
 *  - 混合场景（增/删/改共存）
 *  - 未知列差异 → 保守触发 update（只覆盖已知列）
 *  - 无稳定 id（null）行 → 跳过，永不插入/更新
 *  - 投影丢弃未知列
 */

import { describe, it, expect } from "vitest";

import { CatalogFieldRow, CatalogTableRow } from "../contracts/catalog";
import {
    computeFieldUpsertPlan,
    computeTableUpsertPlan,
    fieldInsertable,
    tableInsertable,
} from "./upsert-plan";

// ─────────────────────────────────────────────────────────────────────────────
// 合成行工厂
// ─────────────────────────────────────────────────────────────────────────────

const table = (over: Partial<CatalogTableRow> = {}): CatalogTableRow => ({
    id: "t1",
    databaseId: "d1",
    name: "accounts",
    posX: 0,
    posY: 0,
    color: null,
    width: null,
    note: null,
    sequence: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...over,
});

const field = (over: Partial<CatalogFieldRow> = {}): CatalogFieldRow => ({
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

// ─────────────────────────────────────────────────────────────────────────────
// 投影
// ─────────────────────────────────────────────────────────────────────────────

describe("tableInsertable", () => {
    it("projects exactly the known writable columns", () => {
        const row = table({ name: "orders" });
        expect(tableInsertable(row)).toEqual({
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
        });
    });

    it("drops unknown future columns", () => {
        // 未知未来列（合同允许 string 索引签名承载）
        const row = {
            ...table(),
            unknownCol: "x",
        } as CatalogTableRow;
        const out = tableInsertable(row);
        const knownKeys = [
            "id", "databaseId", "name", "posX", "posY", "color",
            "width", "note", "sequence", "createdAt",
        ].sort();
        expect(Object.keys(out).sort()).toEqual(knownKeys);
        expect(out).not.toHaveProperty("unknownCol");
    });
});

describe("fieldInsertable", () => {
    it("projects exactly the known writable columns (incl. native type params)", () => {
        const row = field({ maxLength: 255, precision: 10, scale: 2 });
        const out = fieldInsertable(row);
        expect(Object.keys(out).sort()).toEqual([
            "id", "tableId", "name", "isPrimary", "unique", "nullable",
            "defaultValue", "note", "typeId", "sequence", "maxLength",
            "unsigned", "isForeign", "zeroFill", "autoIncrement",
            "precision", "scale", "charset", "collate", "values",
        ].sort());
        expect(out.maxLength).toBe(255);
        expect(out.precision).toBe(10);
        expect(out.scale).toBe(2);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// tables diff
// ─────────────────────────────────────────────────────────────────────────────

describe("computeTableUpsertPlan", () => {
    it("inserts all rows when the baseline is empty (draft order kept)", () => {
        const a = table({ id: "tA", name: "a" });
        const b = table({ id: "tB", name: "b" });
        const plan = computeTableUpsertPlan([a, b], []);
        expect(plan.inserts.map((r) => r.id)).toEqual(["tA", "tB"]);
        expect(plan.updates).toEqual([]);
        expect(plan.deletes).toEqual([]);
    });

    it("produces an empty plan when nothing changed", () => {
        const rows = [table({ id: "t1" }), table({ id: "t2", name: "orders" })];
        const plan = computeTableUpsertPlan(rows, rows.map((r) => ({ ...r })));
        expect(plan.inserts).toEqual([]);
        expect(plan.updates).toEqual([]);
        expect(plan.deletes).toEqual([]);
    });

    it("treats a rename as an update on the same stable id", () => {
        const saved = table({ id: "t1", name: "accounts" });
        const draft = table({ id: "t1", name: "customer_accounts" });
        const plan = computeTableUpsertPlan([draft], [saved]);
        expect(plan.inserts).toEqual([]);
        expect(plan.deletes).toEqual([]);
        expect(plan.updates).toHaveLength(1);
        expect(plan.updates[0].id).toBe("t1");
        expect(plan.updates[0].changes.name).toBe("customer_accounts");
    });

    it("treats a note change as an update", () => {
        const saved = table({ id: "t1", note: null });
        const draft = table({ id: "t1", note: "核心表" });
        const plan = computeTableUpsertPlan([draft], [saved]);
        expect(plan.updates).toHaveLength(1);
        expect(plan.updates[0].changes.note).toBe("核心表");
        // expect(plan.updates[0].changes.id).toBe("t1");
    });

    it("deletes rows removed from the draft (baseline order kept)", () => {
        const saved = [
            table({ id: "t1", name: "a" }),
            table({ id: "t2", name: "b" }),
            table({ id: "t3", name: "c" }),
        ];
        const draft = [table({ id: "t1", name: "a" })];
        const plan = computeTableUpsertPlan(draft, saved);
        expect(plan.deletes).toEqual(["t2", "t3"]);
        expect(plan.inserts).toEqual([]);
        expect(plan.updates).toEqual([]);
    });

    it("handles a mixed add / delete / rename in one plan", () => {
        const saved = [
            table({ id: "t1", name: "old-name" }),
            table({ id: "t2", name: "gone" }),
            table({ id: "t3", name: "keep" }),
        ];
        const draft = [
            table({ id: "t3", name: "keep" }),
            table({ id: "t1", name: "renamed" }),
            table({ id: "t4", name: "brand-new" }),
        ];
        const plan = computeTableUpsertPlan(draft, saved);
        expect(plan.inserts.map((r) => r.id)).toEqual(["t4"]);
        expect(plan.updates.map((u) => u.id)).toEqual(["t1"]);
        expect(plan.deletes).toEqual(["t2"]);
    });

    it("skips rows without a stable id (null id) instead of writing them", () => {
        const ghost = { ...table({ id: "tG" }), id: null } as unknown as CatalogTableRow;
        const saved = [table({ id: "t1" })];
        const plan = computeTableUpsertPlan([ghost, table({ id: "t1" })], saved);
        expect(plan.inserts).toEqual([]);
        expect(plan.updates).toEqual([]);
        expect(plan.deletes).toEqual([]);
    });

    it("still reports deletes for baseline rows when the draft only contains id-less rows", () => {
        const ghost = { ...table({ id: "tG" }), id: null } as unknown as CatalogTableRow;
        const plan = computeTableUpsertPlan([ghost], [table({ id: "t1" })]);
        expect(plan.deletes).toEqual(["t1"]);
        expect(plan.inserts).toEqual([]);
    });

    it("flags an update when only an unknown future column differs (conservative)", () => {
        const saved = table({ id: "t1" });
        const draft = {
            ...table({ id: "t1" }),
            futureColumn: "v1",
        } as unknown as CatalogTableRow;
        const plan = computeTableUpsertPlan([draft], [saved]);
        // 未知列差异 → 触发 update（已知列覆盖，未知列保持原值）
        expect(plan.updates).toHaveLength(1);
        expect(plan.updates[0].id).toBe("t1");
        expect(plan.updates[0].changes).not.toHaveProperty("futureColumn");
    });

    it("does not flag an update when only key ordering differs", () => {
        // stableStringify 对对象键排序 → 同内容不同键序应判等
        const saved = table({ id: "t1" });
        const reversed = Object.fromEntries(
            Object.keys(saved)
                .reverse()
                .map((k) => [k, (saved as Record<string, unknown>)[k]])
        ) as unknown as CatalogTableRow;
        const plan = computeTableUpsertPlan([reversed], [saved]);
        expect(plan.updates).toEqual([]);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// fields diff
// ─────────────────────────────────────────────────────────────────────────────

describe("computeFieldUpsertPlan", () => {
    it("inserts all rows when the baseline is empty", () => {
        const a = field({ id: "fA", name: "a" });
        const b = field({ id: "fB", name: "b" });
        const plan = computeFieldUpsertPlan([a, b], []);
        expect(plan.inserts.map((r) => r.id)).toEqual(["fA", "fB"]);
        expect(plan.updates).toEqual([]);
        expect(plan.deletes).toEqual([]);
    });

    it("treats a type-parameter change (maxLength) as an update", () => {
        const saved = field({ id: "f1", name: "email", maxLength: 100 });
        const draft = field({ id: "f1", name: "email", maxLength: 255 });
        const plan = computeFieldUpsertPlan([draft], [saved]);
        expect(plan.updates).toHaveLength(1);
        expect(plan.updates[0].id).toBe("f1");
        expect(plan.updates[0].changes.maxLength).toBe(255);
    });

    it("treats precision/scale changes as an update", () => {
        const saved = field({ id: "f1", precision: 10, scale: 2 });
        const draft = field({ id: "f1", precision: 12, scale: 4 });
        const plan = computeFieldUpsertPlan([draft], [saved]);
        expect(plan.updates).toHaveLength(1);
        expect(plan.updates[0].changes.precision).toBe(12);
        expect(plan.updates[0].changes.scale).toBe(4);
    });

    it("treats a type id change as an update", () => {
        const saved = field({ id: "f1", typeId: "ty1" });
        const draft = field({ id: "f1", typeId: "ty2" });
        const plan = computeFieldUpsertPlan([draft], [saved]);
        expect(plan.updates).toHaveLength(1);
        expect(plan.updates[0].changes.typeId).toBe("ty2");
    });

    it("treats a rename as an update with a stable id", () => {
        const saved = field({ id: "f1", name: "email" });
        const draft = field({ id: "f1", name: "email_address" });
        const plan = computeFieldUpsertPlan([draft], [saved]);
        expect(plan.updates).toHaveLength(1);
        expect(plan.updates[0].id).toBe("f1");
        expect(plan.updates[0].changes.name).toBe("email_address");
    });

    it("produces an empty plan when nothing changed", () => {
        const rows = [field({ id: "f1" }), field({ id: "f2", name: "x" })];
        const plan = computeFieldUpsertPlan(rows, rows.map((r) => ({ ...r })));
        expect(plan.inserts).toEqual([]);
        expect(plan.updates).toEqual([]);
        expect(plan.deletes).toEqual([]);
    });

    it("deletes removed fields (baseline order kept)", () => {
        const saved = [
            field({ id: "f1", name: "a" }),
            field({ id: "f2", name: "b" }),
        ];
        const plan = computeFieldUpsertPlan([field({ id: "f1", name: "a" })], saved);
        expect(plan.deletes).toEqual(["f2"]);
    });

    it("handles a mixed add / delete / update in one plan", () => {
        const saved = [
            field({ id: "f1", name: "a" }),
            field({ id: "f2", name: "gone" }),
        ];
        const draft = [
            field({ id: "f1", name: "a-renamed" }),
            field({ id: "f3", name: "new-one" }),
        ];
        const plan = computeFieldUpsertPlan(draft, saved);
        expect(plan.inserts.map((r) => r.id)).toEqual(["f3"]);
        expect(plan.updates.map((u) => u.id)).toEqual(["f1"]);
        expect(plan.deletes).toEqual(["f2"]);
    });

    it("skips rows without a stable id (null id)", () => {
        const ghost = { ...field({ id: "fG" }), id: null } as unknown as CatalogFieldRow;
        const plan = computeFieldUpsertPlan([ghost], [field({ id: "f1" })]);
        expect(plan.inserts).toEqual([]);
        expect(plan.updates).toEqual([]);
        expect(plan.deletes).toEqual(["f1"]);
    });
});
