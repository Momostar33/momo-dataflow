/**
 * G01 · T003/T004 — 工作区读取与手动保存（DB 层）
 *
 * 与纯状态机（src/studio/state/workspace-state.ts）分工：
 *  - T003 loadWorkspace：读全部 7 类实体的“实时行”（live rows）作为目录当前值
 *    （ERD 或 Studio 最后写入者胜），显示名等元数据取自 studio_document 的
 *    snapshot；基线 = { revision: doc.revision ?? 0, fingerprint: 被动列指纹 }。
 *  - T004 saveWorkspace：单事务内：
 *      1) 校验 studio_document.revision 与 baseRevision 一致（否则 WorkspaceConflictError）；
 *      2) 重读被动列（databases/dataTypes/relationships/indices/fieldIndices）指纹，
 *         与 baseFingerprint 不一致则冲突；
 *      3) 应用 tables/fields 的 diff 计划（删除→插入→更新；级联删除复用
 *         src/utils/cascade.ts）；
 *      4) 对齐 databases.numOfTables 与实时表数（与 ERD 的 updateDbNumTables 同口径），
 *         避免工作区保存后目录计数自相矛盾；
 *      5) studio_document 行写入 { revision: base+1, updatedAt, snapshot: JSON(draft) }；
 *      6) 返回对齐后的新状态（savedEditVersion 对齐、基线刷新为当前被动指纹）。
 *
 * 注意：
 *  - 本模块导入 db（PowerSync WASM/IndexedDB），只可在浏览器环境运行；
 *    Node 端只单测纯函数（state/ 与 persistence/upsert-plan.ts）。
 *  - tables/fields 行由草稿全量表达（last-write-wins，见 T002 头注释），
 *    其被动依赖行（relationships/indices/field_indices）变更会触发冲突。
 *  - 冲突/损坏均为显式 Error 子类，由调用方（Studio 页面）呈现并重新载入。
 */

import { eq, count, inArray } from "drizzle-orm";
import { SQLiteTransaction } from "drizzle-orm/sqlite-core";
import { QueryResult } from "@powersync/web";
import { ExtractTablesWithRelations } from "drizzle-orm";

import { db } from "@/providers/sync-provider/sync-provider";
import { databases as databasesModel } from "@/lib/schemas/database-schema";
import { tables as tablesModel } from "@/lib/schemas/table-schema";
import { fields as fieldsModel } from "@/lib/schemas/field-schema";
import { data_types as dataTypesModel } from "@/lib/schemas/data-type-schema";
import { relationships as relationshipsModel } from "@/lib/schemas/relationship-schema";
import { indices as indicesModel } from "@/lib/schemas/index-schema";
import { field_indices as fieldIndicesModel } from "@/lib/schemas/field_index-schema";
import { studio_document } from "@/lib/schemas/studio-document-schema";
import {
    deleteFieldsWithCascade,
    deleteIndicesWithCascade,
    deleteTablesWithCascade,
} from "@/utils/cascade";
import { deletedFieldIndexIds } from "./domain/field-deletion";
import { getTimestamp } from "@/utils/utils";

import { CatalogSnapshot } from "./contracts/catalog";
import {
    cloneSnapshot,
    deepFreeze,
    WorkspaceState,
    catalogFingerprint,
} from "./state/workspace-state";
import {
    computeFieldUpsertPlan,
    computeTableUpsertPlan,
    touchedDatabaseIds,
} from "./persistence/upsert-plan";
import {
    assertWorkspaceBaseline,
    initializeWorkspace,
    parseBusinessDocument,
    serializeBusinessDocument,
    StudioDocumentRow,
} from "./persistence/local-workspace";

// ─────────────────────────────────────────────────────────────────────────────
// 错误类型（定义在纯模块 persistence/local-workspace.ts，此处 re-export 保持公开接口）
// ─────────────────────────────────────────────────────────────────────────────

export {
    WorkspaceConflictError,
    WorkspaceCorruptionError,
    WorkspaceUnsupportedSchemaError,
} from "./persistence/local-workspace";

/** 事务执行器（与 src/utils/cascade.ts 的事务类型同口径）。 */
type WorkspaceExecutor = SQLiteTransaction<
    "async",
    QueryResult,
    any,
    ExtractTablesWithRelations<any>
>;

const DEFAULT_DOCUMENT_ID = "default";

// ─────────────────────────────────────────────────────────────────────────────
// 读取
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 读取全部 7 类实体的实时行（目录当前值，last-write-wins）。
 * 行按合同接口返回；未知列自然保留在行对象中。
 */
async function readLiveCatalog(
    tx: WorkspaceExecutor,
): Promise<CatalogSnapshot> {
    const [
        databases,
        tables,
        fields,
        dataTypes,
        relationships,
        indices,
        fieldIndices,
    ] = await Promise.all([
        tx.select().from(databasesModel),
        tx.select().from(tablesModel),
        tx.select().from(fieldsModel),
        tx.select().from(dataTypesModel),
        tx.select().from(relationshipsModel),
        tx.select().from(indicesModel),
        tx.select().from(fieldIndicesModel),
    ]);
    return {
        databases,
        tables,
        fields,
        dataTypes,
        relationships,
        indices,
        fieldIndices,
    };
}

/** 读取 studio_document 单行（不存在返回 null）。 */
async function readStudioDocument(
    tx: WorkspaceExecutor,
): Promise<StudioDocumentRow | null> {
    const rows = await tx
        .select()
        .from(studio_document)
        .where(eq(studio_document.id, DEFAULT_DOCUMENT_ID));
    const row = rows[0];
    if (!row) return null;
    return {
        id: row.id,
        revision: row.revision,
        updatedAt: row.updatedAt,
        snapshot: row.snapshot,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// T003 — 载入
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 载入工作区（读取/初始化纯逻辑见 persistence/local-workspace.ts）：
 *  - catalog：实时行（当前库中目录的真实值，不导入 snapshot 存档）；
 *  - metadata：studio_document.snapshot 中的显示名（无文档/旧文档为空）；
 *  - 基线：{ revision: doc.revision ?? 0, fingerprint: 被动列指纹 }；
 *  - schemaVersion 高于支持版本 → WorkspaceUnsupportedSchemaError（显式报告）；
 *    snapshot 损坏 → WorkspaceCorruptionError。
 * 初始 draft 与 lastSavedSnapshot 内容一致 → hasUnsavedChanges === false。
 */
export async function loadWorkspace(): Promise<WorkspaceState> {
    return await db.transaction(async (tx) => {
        const catalog = await readLiveCatalog(tx);
        const doc = await readStudioDocument(tx);
        return initializeWorkspace(catalog, doc);
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// T004 — 手动保存
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 对齐 databases.numOfTables 与实时表数（与 ERD 的 updateDbNumTables 同口径），
 * 仅更新发生变化的行。
 */
async function updateTouchedTableCounts(
    tx: WorkspaceExecutor,
    databaseIds: string[],
): Promise<void> {
    for (const databaseId of databaseIds) {
        const [{ count: numOfTables }] = await tx
            .select({ count: count() })
            .from(tablesModel)
            .where(eq(tablesModel.databaseId, databaseId));

        const rows = await tx
            .select()
            .from(databasesModel)
            .where(eq(databasesModel.id, databaseId));
        const row = rows[0];
        if (row && (row.numOfTables ?? 0) !== numOfTables) {
            await tx
                .update(databasesModel)
                .set({ numOfTables })
                .where(eq(databasesModel.id, databaseId));
        }
    }
}

/**
 * 手动保存工作区（单事务、显式冲突检测）。
 *
 * 成功：返回对齐后的新状态（lastSavedSnapshot=draft、savedEditVersion 对齐、
 *       baseRevision=base+1、baseFingerprint 刷新为当前被动列指纹）。
 * 失败：抛 WorkspaceConflictError（外部改动）或 WorkspaceCorruptionError，
 *       事务回滚，状态不变；调用方应重新 loadWorkspace() 再呈现。
 */
export async function saveWorkspace(
    state: WorkspaceState,
): Promise<WorkspaceState> {
    return await db.transaction(async (tx) => {
        // 1) revision 基线校验
        const doc = await readStudioDocument(tx);
        // 1a) 若现有文档 schemaVersion 高于本实现支持版本，显式拒绝写入，
        //     绝不静默覆盖更新版本（与 load 同一解析规则）。
        parseBusinessDocument(doc?.snapshot ?? null);
        const currentRevision = doc?.revision ?? 0;
        // Guard using full fingerprint comparison
        const live = await readLiveCatalog(tx);
        assertWorkspaceBaseline(state, live, currentRevision);

        // 3) diff 计划（草稿 vs 载入基线）
        const savedCatalog = state.lastSavedSnapshot?.catalog;
        const tablePlan = computeTableUpsertPlan(
            state.draft.catalog.tables,
            savedCatalog?.tables ?? [],
        );
        const fieldPlan = computeFieldUpsertPlan(
            state.draft.catalog.fields,
            savedCatalog?.fields ?? [],
        );

        // 3a) 删除（表级联会带走其内部字段；字段级联覆盖表外的孤立字段）
        if (tablePlan.deletes.length > 0) {
            await deleteTablesWithCascade(tablePlan.deletes, tx);
        }
        if (fieldPlan.deletes.length > 0) {
            // Confirmed field deletion removes entire affected indices, including all member links.
            const indexIds = deletedFieldIndexIds(savedCatalog ?? live, state.draft.catalog, fieldPlan.deletes);
            if (indexIds.length) await deleteIndicesWithCascade(indexIds, tx);
            await deleteFieldsWithCascade(fieldPlan.deletes, tx);
        }

        // 3b) 插入（表先于字段，字段引用 tableId）
        for (const row of tablePlan.inserts) {
            await tx.insert(tablesModel).values(row);
        }
        for (const row of fieldPlan.inserts) {
            await tx.insert(fieldsModel).values(row);
        }

        // 3c) 更新（全量已知列覆盖，稳定 id 不变）
        for (const row of tablePlan.updates) {
            await tx
                .update(tablesModel)
                .set(row.changes)
                .where(eq(tablesModel.id, row.id));
        }
        for (const row of fieldPlan.updates) {
            await tx
                .update(fieldsModel)
                .set(row.changes)
                .where(eq(fieldsModel.id, row.id));
        }

        // 4) 对齐目录计数（保持与 ERD 行为一致）
        const touched = touchedDatabaseIds(
            savedCatalog?.tables ?? [],
            state.draft.catalog.tables,
        );
        await updateTouchedTableCounts(tx, touched);

        // 5) studio_document 前进（snapshot 记录当前 schema 版本；
        //    草稿只含 catalog/metadata，版本字段由本实现显式写入）
        const nextRevision = state.baseRevision + 1;
        const updatedAt = getTimestamp();
        const snapshot = serializeBusinessDocument(state.draft);
        if (doc) {
            await tx
                .update(studio_document)
                .set({ revision: nextRevision, updatedAt, snapshot })
                .where(eq(studio_document.id, DEFAULT_DOCUMENT_ID));
        } else {
            await tx.insert(studio_document).values({
                id: DEFAULT_DOCUMENT_ID,
                revision: nextRevision,
                updatedAt,
                snapshot,
            });
        }

        // 6) 返回对齐后的状态（基线刷新为“写入后的被动列指纹”）。
        //    注意：第 4 步可能改写了 databases.numOfTables（被动列），
        //    因此必须在写入完成后重读被动列指纹，否则下一次保存会误报冲突。
        const fresh = await readLiveCatalog(tx);
        return {
            ...state,
            lastSavedSnapshot: deepFreeze(cloneSnapshot(state.draft)),
            savedEditVersion: state.editVersion,
            baseRevision: nextRevision,
            baseFingerprint: catalogFingerprint(fresh),
        };
    });
}

/** Add a validated design package atomically. Never replaces existing catalog/business entities. */
export async function importDesignPackage(
    state: WorkspaceState,
    input: unknown,
): Promise<WorkspaceState> {
    const { planDesignImport } = await import("./domain/design-import");
    return db.transaction(async (tx) => {
        const doc = await readStudioDocument(tx);
        parseBusinessDocument(doc?.snapshot ?? null);
        const live = await readLiveCatalog(tx);
        assertWorkspaceBaseline(state, live, doc?.revision ?? 0);
        const plan = planDesignImport(state, input);
        const added = plan.additions;
        for (const row of added.databases)
            await tx.insert(databasesModel).values(row);
        for (let i = 0; i < added.tables.length; i += 25)
            await tx.insert(tablesModel).values(added.tables.slice(i, i + 25));
        for (let i = 0; i < added.fields.length; i += 25)
            await tx.insert(fieldsModel).values(added.fields.slice(i, i + 25));
        for (let i = 0; i < added.relationships.length; i += 25)
            await tx
                .insert(relationshipsModel)
                .values(added.relationships.slice(i, i + 25));
        for (let i = 0; i < added.indices.length; i += 25)
            await tx
                .insert(indicesModel)
                .values(added.indices.slice(i, i + 25));
        for (let i = 0; i < added.fieldIndices.length; i += 25)
            await tx
                .insert(fieldIndicesModel)
                .values(added.fieldIndices.slice(i, i + 25));
        const nextDoc = {
            id: DEFAULT_DOCUMENT_ID,
            revision: (doc?.revision ?? 0) + 1,
            updatedAt: getTimestamp(),
            snapshot: serializeBusinessDocument(plan.snapshot),
        };
        if (doc)
            await tx
                .update(studio_document)
                .set(nextDoc)
                .where(eq(studio_document.id, DEFAULT_DOCUMENT_ID));
        else await tx.insert(studio_document).values(nextDoc);
        const fresh = await readLiveCatalog(tx);
        return initializeWorkspace(fresh, nextDoc);
    });
}

/** Explicitly confirmed library removal: one transaction, same revision/fingerprint guards as save/import. */
export async function deleteDesignLibrary(state: WorkspaceState, databaseId: string): Promise<WorkspaceState> {
    const { planDesignLibraryDeletion } = await import("./domain/design-library");
    return db.transaction(async tx => {
        const doc = await readStudioDocument(tx);
        parseBusinessDocument(doc?.snapshot ?? null);
        const live = await readLiveCatalog(tx);
        assertWorkspaceBaseline(state, live, doc?.revision ?? 0);
        const plan = planDesignLibraryDeletion(state, databaseId);
        const r = plan.removed;
        const chunks = (ids: string[]) => Array.from({length: Math.ceil(ids.length / 200)}, (_, i) => ids.slice(i * 200, i * 200 + 200));
        for (const ids of chunks(r.fieldIndices)) await tx.delete(fieldIndicesModel).where(inArray(fieldIndicesModel.id, ids));
        for (const ids of chunks(r.relationships)) await tx.delete(relationshipsModel).where(inArray(relationshipsModel.id, ids));
        for (const ids of chunks(r.fields)) await tx.delete(fieldsModel).where(inArray(fieldsModel.id, ids));
        for (const ids of chunks(r.indices)) await tx.delete(indicesModel).where(inArray(indicesModel.id, ids));
        for (const ids of chunks(r.tables)) await tx.delete(tablesModel).where(inArray(tablesModel.id, ids));
        await tx.delete(databasesModel).where(eq(databasesModel.id, databaseId));
        // Preserve other fields, but clear foreign flags if their last cross-library relation was removed.
        const fieldPlan = computeFieldUpsertPlan(plan.snapshot.catalog.fields, state.draft.catalog.fields);
        for (const row of fieldPlan.updates) await tx.update(fieldsModel).set(row.changes).where(eq(fieldsModel.id, row.id));
        const nextDoc = {id: DEFAULT_DOCUMENT_ID, revision: (doc?.revision ?? 0) + 1, updatedAt: getTimestamp(), snapshot: serializeBusinessDocument(plan.snapshot)};
        if (doc) await tx.update(studio_document).set(nextDoc).where(eq(studio_document.id, DEFAULT_DOCUMENT_ID));
        else await tx.insert(studio_document).values(nextDoc);
        return initializeWorkspace(await readLiveCatalog(tx), nextDoc);
    });
}
