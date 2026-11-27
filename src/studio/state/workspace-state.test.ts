import { describe, it, expect } from "vitest";

import {
    CatalogMetadata,
    CatalogRelationshipRow,
    CatalogRow,
    CatalogSnapshot,
    CatalogTableRow,
} from "../contracts/catalog";
import {
    catalogFingerprint,
    createInitialWorkspace,
    deepFreeze,
    emptyCatalog,
    hasUnsavedChanges,
    isDuplicateName,
    markSaved,
    newStableId,
    passiveFingerprint,
    siblingNames,
    stableStringify,
    trimName,
    withDraftMutations,
    WorkspaceSnapshot,
    WorkspaceState,
} from "./workspace-state";

/** 构造一个包含 2 个数据库 / 2 张表 / 2 个字段 / 1 个类型的合成快照。 */
const makeSnapshot = (): WorkspaceSnapshot => ({
    catalog: {
        databases: [
            { id: "d1", name: "db one", dialect: "postgres", numOfTables: 2, createdAt: null },
            { id: "d2", name: "db two", dialect: "mysql", numOfTables: 0, createdAt: null },
        ],
        tables: [
            {
                id: "t1", databaseId: "d1", name: "accounts", posX: 0, posY: 0,
                color: null, width: null, note: null, sequence: 0, createdAt: null,
            },
            {
                id: "t2", databaseId: "d1", name: "orders", posX: 10, posY: 10,
                color: "#fff", width: null, note: "orders note", sequence: 1, createdAt: null,
            },
        ],
        fields: [
            {
                id: "f1", tableId: "t1", name: "id", isPrimary: true, unique: true,
                nullable: false, defaultValue: null, note: null, typeId: "ty1",
                sequence: 0, maxLength: null, unsigned: null, isForeign: null,
                zeroFill: null, autoIncrement: null, precision: null, scale: null,
                charset: null, collate: null, values: null,
            },
            {
                id: "f2", tableId: "t1", name: "email", isPrimary: false, unique: null,
                nullable: true, defaultValue: null, note: null, typeId: "ty1",
                sequence: 1, maxLength: 255, unsigned: null, isForeign: null,
                zeroFill: null, autoIncrement: null, precision: null, scale: null,
                charset: null, collate: null, values: null,
            },
        ],
        // data_types.id 允许为 null（真实 schema 无 PK），保持 string | null。
        dataTypes: [
            { id: "ty1", name: "text", dialect: "postgres", type: "text", modifiers: null, synonyms: null },
            { id: null, name: "int", dialect: "postgres", type: "int4", modifiers: null, synonyms: null },
        ],
        relationships: [],
        indices: [],
        fieldIndices: [],
    } as CatalogSnapshot,
    metadata: {
        tableDisplayNames: { t1: "账户表" },
        fieldDisplayNames: { f1: "主键" },
    } as CatalogMetadata,
});

const makeState = (): WorkspaceState =>
    createInitialWorkspace(makeSnapshot(), { revision: 0, fingerprint: "fp0" });

describe("createInitialWorkspace", () => {
    it("starts with no unsaved changes and zero versions", () => {
        const state = makeState();
        expect(state.editVersion).toBe(0);
        expect(state.savedEditVersion).toBe(0);
        expect(state.lastSavedSnapshot).not.toBeNull();
        expect(hasUnsavedChanges(state)).toBe(false);
        expect(state.baseRevision).toBe(0);
        expect(state.baseFingerprint).toBe("fp0");
    });

    it("records the provided load baseline", () => {
        const state = createInitialWorkspace(makeSnapshot(), { revision: 7, fingerprint: "fp7" });
        expect(state.baseRevision).toBe(7);
        expect(state.baseFingerprint).toBe("fp7");
    });

    it("keeps draft and saved snapshot content-equal but structurally separate", () => {
        const state = makeState();
        expect(state.draft).not.toBe(state.lastSavedSnapshot);
        expect(state.draft.catalog).not.toBe(state.lastSavedSnapshot!.catalog);
        expect(JSON.stringify(state.draft)).toBe(JSON.stringify(state.lastSavedSnapshot));
    });

    it("deep-freezes the draft so accidental mutation throws", () => {
        const state = makeState();
        const frozenTable = state.draft.catalog.tables[0];
        expect(Object.isFrozen(frozenTable)).toBe(true);
        // ESM is strict mode: assignment to a frozen property throws.
        expect(() => {
            (frozenTable as { name: string }).name = "hacked";
        }).toThrow();
        // Nested metadata record is frozen too.
        expect(Object.isFrozen(state.draft.metadata.tableDisplayNames)).toBe(true);
    });

    it("preserves nullability and unknown columns from the loaded snapshot", () => {
        const state = makeState();
        const dt = state.draft.catalog.dataTypes[1];
        expect(dt.id).toBeNull();
        const extra = (state.draft.catalog.tables[0] as Record<string, unknown>);
        expect(extra.unknownFutureCol).toBeUndefined(); // 未知列可缺省存在
    });
});

describe("withDraftMutations", () => {
    it("applies mutations to the new draft only (old state untouched)", () => {
        const before = makeState();
        const beforeTables = before.draft.catalog.tables.length;

        const after = withDraftMutations(before, (draft) => {
            draft.catalog.tables.push({
                id: "t3", databaseId: "d2", name: "new table", posX: 0, posY: 0,
                color: null, width: null, note: null, sequence: 2, createdAt: null,
            } as unknown as CatalogTableRow);
            draft.metadata.tableDisplayNames.t3 = "新表";
        });

        // 旧状态保持不变
        expect(before.draft.catalog.tables.length).toBe(beforeTables);
        expect(before.editVersion).toBe(0);
        // 新状态包含变更
        expect(after.draft.catalog.tables.length).toBe(beforeTables + 1);
        expect(after.draft.metadata.tableDisplayNames.t3).toBe("新表");
        // 新草稿已冻结
        expect(Object.isFrozen(after.draft.catalog.tables)).toBe(true);
    });

    it("bumps editVersion by one per mutation call", () => {
        const s1 = makeState();
        const s2 = withDraftMutations(s1, (draft) => {
            draft.metadata.fieldDisplayNames.f2 = "邮箱";
        });
        const s3 = withDraftMutations(s2, (draft) => {
            draft.metadata.fieldDisplayNames.f2 = "邮件地址";
        });
        expect(s2.editVersion).toBe(1);
        expect(s3.editVersion).toBe(2);
        expect(s1.editVersion).toBe(0);
    });

    it("flags unsaved changes after a mutation", () => {
        const s1 = makeState();
        const s2 = withDraftMutations(s1, (draft) => {
            draft.metadata.fieldDisplayNames.f1 = "主键 id";
        });
        expect(hasUnsavedChanges(s1)).toBe(false);
        expect(hasUnsavedChanges(s2)).toBe(true);
    });

    it("does not share references between previous and next drafts", () => {
        const s1 = makeState();
        const s2 = withDraftMutations(s1, (draft) => {
            draft.metadata.tableDisplayNames.t2 = "订单表";
        });
        // 修改 s2 的 metadata 记录对象不应影响 s1（s1 的该记录是冻结的独立副本）
        expect(s2.draft.metadata).not.toBe(s1.draft.metadata);
        expect(s2.draft.metadata.tableDisplayNames).not.toBe(s1.draft.metadata.tableDisplayNames);
        expect(s1.draft.metadata.tableDisplayNames.t2).toBeUndefined();
        expect(s2.draft.metadata.tableDisplayNames.t2).toBe("订单表");
    });
});

describe("markSaved", () => {
    it("aligns savedEditVersion with editVersion and clears unsaved flag", () => {
        const s1 = makeState();
        const s2 = withDraftMutations(s1, (draft) => {
            draft.metadata.tableDisplayNames.t2 = "订单表";
        });
        expect(hasUnsavedChanges(s2)).toBe(true);

        const s3 = markSaved(s2);
        expect(s3.savedEditVersion).toBe(s2.editVersion);
        expect(hasUnsavedChanges(s3)).toBe(false);
        expect(JSON.stringify(s3.lastSavedSnapshot)).toBe(JSON.stringify(s2.draft));
    });

    it("lastSavedSnapshot is a separate frozen copy (later draft edits don't leak)", () => {
        const s1 = makeState();
        const s2 = markSaved(s1);
        const s3 = withDraftMutations(s2, (draft) => {
            draft.metadata.fieldDisplayNames.f2 = "改后的字段名";
        });
        // 保存时的快照不受后续草稿编辑影响
        expect(s2.lastSavedSnapshot!.metadata.fieldDisplayNames.f2).toBeUndefined();
        expect(s3.lastSavedSnapshot!.metadata.fieldDisplayNames.f2).toBeUndefined();
        expect(s3.draft.metadata.fieldDisplayNames.f2).toBe("改后的字段名");
        expect(Object.isFrozen(s2.lastSavedSnapshot!.metadata.tableDisplayNames)).toBe(true);
    });

    it("markSaved without prior edits keeps versions at zero", () => {
        const s1 = makeState();
        const s2 = markSaved(s1);
        expect(s2.editVersion).toBe(0);
        expect(s2.savedEditVersion).toBe(0);
    });
});

describe("stableStringify", () => {
    it("is independent of object key order", () => {
        expect(stableStringify({ a: 1, b: 2 })).toBe(stableStringify({ b: 2, a: 1 }));
        expect(
            stableStringify({ x: { m: 1, n: 2 }, y: 3 })
        ).toBe(
            stableStringify({ y: 3, x: { n: 2, m: 1 } })
        );
    });

    it("is sensitive to array order (row order matters in a catalog)", () => {
        expect(stableStringify([1, 2, 3])).not.toBe(stableStringify([3, 2, 1]));
        expect(stableStringify([{ a: 1 }, { a: 2 }])).not.toBe(stableStringify([{ a: 2 }, { a: 1 }]));
    });

    it("handles null, undefined-in-object and primitives", () => {
        expect(stableStringify(null)).toBe("null");
        expect(stableStringify(undefined)).toBe("undefined");
        expect(stableStringify("s")).toBe('"s"');
        expect(stableStringify(42)).toBe("42");
        // undefined 值被跳过（与 JSON.stringify 的对象语义一致）
        expect(stableStringify({ a: 1, b: undefined })).toBe(stableStringify({ a: 1 }));
    });

    it("handles nested null entries and empty containers", () => {
        expect(stableStringify([null, { id: null }])).toBe('[null,{"id":null}]');
        expect(stableStringify([])).toBe("[]");
        expect(stableStringify({})).toBe("{}");
    });
});

describe("fingerprints", () => {
    it("catalogFingerprint is stable across object key order, unstable across content", () => {
        const base = makeSnapshot();
        expect(catalogFingerprint(base.catalog)).toBe(catalogFingerprint(base.catalog));

        // 重排行序 → 指纹变化（行序是快照的一部分）
        const reordered = makeSnapshot();
        reordered.catalog.tables.reverse();
        expect(catalogFingerprint(base.catalog)).not.toBe(catalogFingerprint(reordered.catalog));

        // 相同内容、仅对象键序不同 → 指纹一致
        const flipped = makeSnapshot();
        for (const list of [
            flipped.catalog.tables, flipped.catalog.fields,
            flipped.catalog.databases, flipped.catalog.dataTypes,
        ] as { [column: string]: unknown }[][]) {
            for (const row of list) {
                const keys = Object.keys(row).reverse();
                const rebuiltRow = Object.fromEntries(keys.map((k) => [k, (row as Record<string, unknown>)[k]]));
                for (const k of Object.keys(row)) delete (row as Record<string, unknown>)[k];
                Object.assign(row, rebuiltRow);
            }
        }
        expect(catalogFingerprint(flipped.catalog)).toBe(catalogFingerprint(base.catalog));
    });

    it("passiveFingerprint ignores tables/fields (draft-owned) changes", () => {
        const base = makeSnapshot();
        const edited = makeSnapshot();
        edited.catalog.tables.push({
            id: "t9", databaseId: "d1", name: "extra", posX: 0, posY: 0,
            color: null, width: null, note: null, sequence: 9, createdAt: null,
        } as unknown as CatalogTableRow);
        edited.catalog.fields = [];
        expect(passiveFingerprint(base.catalog)).toBe(passiveFingerprint(edited.catalog));
    });

    it("passiveFingerprint detects external changes to passive lists", () => {
        const base = makeSnapshot();
        const edited = makeSnapshot();
        // 外部新增一条关系 → 冲突指纹变化
        edited.catalog.relationships.push({
            id: "r1", name: "rel", sourceTableId: "t1", targetTableId: "t2",
            sourceFieldId: "f1", targetFieldId: "f2",
            cardinality: "many_to_one", onDelete: null, onUpdate: null,
            databaseId: "d1", sourceAliasName: null, targetAliasName: null, createdAt: null,
        } as unknown as CatalogRelationshipRow);
        expect(passiveFingerprint(base.catalog)).not.toBe(passiveFingerprint(edited.catalog));

        const edited2 = makeSnapshot();
        (edited2.catalog.dataTypes[0] as { name: string }).name = "renamed type";
        expect(passiveFingerprint(base.catalog)).not.toBe(passiveFingerprint(edited2.catalog));
    });

    it("empty catalog fingerprints are deterministic", () => {
        expect(passiveFingerprint(emptyCatalog())).toBe(passiveFingerprint(emptyCatalog()));
        expect(passiveFingerprint(emptyCatalog())).toBe(
            stableStringify({ databases: [], dataTypes: [], relationships: [], indices: [], fieldIndices: [] })
        );
    });
});

describe("deepFreeze", () => {
    it("freezes nested structures recursively", () => {
        const value = { a: { b: [{ c: 1 }] }, d: null, e: "s" };
        const frozen = deepFreeze(value);
        expect(Object.isFrozen(frozen)).toBe(true);
        expect(Object.isFrozen(frozen.a)).toBe(true);
        expect(Object.isFrozen(frozen.a.b)).toBe(true);
        expect(Object.isFrozen(frozen.a.b[0])).toBe(true);
        expect(frozen).toBe(value);
    });

    it("leaves primitives untouched", () => {
        expect(deepFreeze(1)).toBe(1);
        expect(deepFreeze("x")).toBe("x");
        expect(deepFreeze(null)).toBeNull();
    });
});

describe("newStableId", () => {
    it("produces uuid v4 shaped, unique ids", () => {
        const id = newStableId();
        expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
        const set = new Set<string>();
        for (let i = 0; i < 100; i += 1) set.add(newStableId());
        expect(set.size).toBe(100);
    });
});

describe("name helpers", () => {
    const tableRows: (Pick<CatalogRow, "id" | "name"> & { databaseId: string })[] = [
        { id: "t1", name: "accounts", databaseId: "d1" },
        { id: "t2", name: "orders", databaseId: "d1" },
        { id: "t3", name: "accounts", databaseId: "d2" },
    ];

    it("trimName trims and is safe on non-strings", () => {
        expect(trimName("  x y ")).toBe("x y");
        expect(trimName("")).toBe("");
        expect(trimName(undefined as unknown as string)).toBe("");
    });

    it("isDuplicateName matches on trimmed name within the given sibling list", () => {
        expect(isDuplicateName("  accounts  ", tableRows)).toBe(true);
        expect(isDuplicateName("nope", tableRows)).toBe(false);
        // 空名称不算重名（由调用方报“名称为空”）
        expect(isDuplicateName("   ", tableRows)).toBe(false);
        // 大小写敏感（数据库名一般区分大小写，保持严格匹配）
        expect(isDuplicateName("Accounts", tableRows)).toBe(false);
    });

    it("isDuplicateName checks only the given (scope-filtered) sibling list and excludes the row being renamed", () => {
        // 作用域由调用方过滤（见 siblingNames）：d1 作用域内排除自身后无重名
        const d1 = tableRows.filter((r) => r.databaseId === "d1");
        expect(isDuplicateName("accounts", d1, "t1")).toBe(false);
        expect(isDuplicateName("orders", d1, "t1")).toBe(true);
        // d2 作用域内 "accounts" 无冲突（t1 不在该作用域）
        const d2 = tableRows.filter((r) => r.databaseId === "d2");
        expect(isDuplicateName("accounts", d2)).toBe(true);
        expect(isDuplicateName("accounts", d2, "t3")).toBe(false);
        // 未过滤的完整列表仍会命中（证明函数不做隐式作用域过滤，责任在调用方）
        expect(isDuplicateName("accounts", tableRows, "t1")).toBe(true);
    });

    it("ignores sibling rows with non-string names", () => {
        expect(isDuplicateName("x", [{ id: "t", name: null } as unknown as Pick<CatalogRow, "id" | "name">])).toBe(false);
        expect(isDuplicateName("x", [{ id: "t", name: "x" } as unknown as Pick<CatalogRow, "id" | "name">])).toBe(true);
    });

    it("siblingNames scopes by databaseId or tableId", () => {
        expect(siblingNames(tableRows, "databaseId", "d1")).toEqual(["accounts", "orders"]);
        expect(siblingNames(tableRows, "databaseId", "d2")).toEqual(["accounts"]);
        const fieldRows = [
            { id: "f1", name: "id", tableId: "t1" },
            { id: "f2", name: "email", tableId: "t1" },
            { id: "f3", name: "id", tableId: "t2" },
        ];
        expect(siblingNames(fieldRows, "tableId", "t1")).toEqual(["id", "email"]);
        expect(siblingNames(fieldRows, "tableId", "t2")).toEqual(["id"]);
    });
});
