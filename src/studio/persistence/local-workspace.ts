/**
 * G01 · T003 — 本地库读取 + 业务元数据初始化（纯函数，无 db/DOM 依赖，可 Node 单测）
 *
 * 与 DB 门面（src/studio/local-workspace.ts）分工：
 *  - 本模块只做“snapshot JSON → 业务元数据”的解析与“实时目录 + 文档行 →
 *    工作区状态”的初始化，全部为纯函数，可脱离 PowerSync 在 Node 中单测。
 *  - 门面保留 db 事务内的实时行读取（readLiveCatalog / readStudioDocument）
 *    与保存事务（T004）；两者共用本模块的解析与错误类型，避免双套定义。
 *
 * 业务文档（studio_document.snapshot）的 schema 规则：
 *  - `BUSINESS_DOCUMENT_SCHEMA_VERSION = 1`（初版）。
 *  - 顶层为对象；`schemaVersion` 缺省视为旧文档（v1 兼容读取）。
 *  - `metadata` 为显示名业务元数据（tableDisplayNames / fieldDisplayNames，
 *    键为稳定行 id，值必须为字符串）；缺省视为空元数据。
 *  - `catalog` 部分（7 类实体行）仅存档用于快照展示/审计；工作区载入时
 *    目录当前值一律以“实时行”为准（last-write-wins，ERD 或 Studio 最后
 *    写入者胜），不反向导入替代用户数据；未知顶层键/未知列忽略。
 *  - `schemaVersion > 1`：显式抛 WorkspaceUnsupportedSchemaError，
 *    绝不静默覆盖或忽略（读取层与保存层都先解析再写，因此保存也不会
 *    覆盖更新版本文档）。
 *  - 非法 JSON / 顶层非对象 / schemaVersion 非整数或 < 1 / metadata 形状
 *    错误 → WorkspaceCorruptionError。
 *
 * 无新增依赖；无 any / ts-ignore；不执行公式计算。
 */

import { CatalogMetadata, CatalogSnapshot } from "../contracts/catalog";
import {
    createInitialWorkspace,
    emptyMetadata,
    LoadBaseline,
    catalogFingerprint,
    WorkspaceSnapshot,
    WorkspaceState,
} from "../state/workspace-state";
import { emptyBusinessDocument, BusinessDocument } from "../contracts/business";

/** 序列化业务文档快照为 JSON 字符串。 */
export function serializeBusinessDocument(
    snapshot: {catalog?: CatalogSnapshot; metadata: CatalogMetadata; business?: BusinessDocument}
): string {
    const business = snapshot.business ?? emptyBusinessDocument();
    const obj = {
        schemaVersion: 2,
        metadata: snapshot.metadata,
        business,
    };
    return JSON.stringify(obj);
}

/** 业务文档 snapshot 的当前 schema 版本（初版 = 1）。 */
export const BUSINESS_DOCUMENT_SCHEMA_VERSION = 1;

/** studio_document 单行（与 src/lib/schemas/studio-document-schema.ts 对齐）。 */
export interface StudioDocumentRow {
    id: string;
    revision: number;
    updatedAt: string | null;
    snapshot: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 错误类型（纯定义，门面复用；保持既有类名与 name 不变）
// ─────────────────────────────────────────────────────────────────────────────

/** 保存冲突：工作区载入后，外部（ERD/其它页）改动了受保护数据。 */
export class WorkspaceConflictError extends Error {
    constructor(
        public readonly kind: "revision" | "catalog",
        message: string
    ) {
        super(message);
        this.name = "WorkspaceConflictError";
    }
}

/** 持久化数据损坏（如 studio_document.snapshot 不是合法 JSON 或形状错误）。 */
export class WorkspaceCorruptionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "WorkspaceCorruptionError";
    }
}

/**
 * 文档 schema 版本高于本实现支持的版本：显式报告，禁止静默读取或覆盖。
 */
export class WorkspaceUnsupportedSchemaError extends Error {
    constructor(
        public readonly schemaVersion: number,
        message: string
    ) {
        super(message);
        this.name = "WorkspaceUnsupportedSchemaError";
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// T003 — snapshot 解析（纯函数）
// ─────────────────────────────────────────────────────────────────────────────

/** 解析结果：文档 schema 版本 + 显示名业务元数据。 */
export interface ParsedBusinessDocument {
    schemaVersion: number;
    metadata: CatalogMetadata;
    business: BusinessDocument;
}

/**
 * 从 studio_document.snapshot JSON 中解析业务文档（纯函数）。
 *
 *  - null（无文档）→ 按初版空文档处理：{ schemaVersion: 1, 空元数据 }。
 *  - 旧文档缺 `schemaVersion` → 视为 v1（兼容读取）。
 *  - 非法 JSON / 顶层非对象 → WorkspaceCorruptionError。
 *  - `schemaVersion` 非整数或 < 1 → WorkspaceCorruptionError。
 *  - `schemaVersion > BUSINESS_DOCUMENT_SCHEMA_VERSION` →
 *    WorkspaceUnsupportedSchemaError（显式报告，不静默）。
 *  - `metadata` 缺省 → 空元数据；形状错误（非对象/值非字符串）→
 *    WorkspaceCorruptionError。
 *  - 未知顶层键（catalog 部分等）忽略，仅存档用途。
 */
export function parseBusinessDocument(
    snapshotJson: string | null
): ParsedBusinessDocument {
    if (snapshotJson === null) {
        return {
            schemaVersion: BUSINESS_DOCUMENT_SCHEMA_VERSION,
            metadata: emptyMetadata(),
            business: emptyBusinessDocument(),
        };
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(snapshotJson);
    } catch (e) {
        throw new WorkspaceCorruptionError(
            `studio_document.snapshot 不是合法 JSON：${(e as Error).message}`
        );
    }

    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new WorkspaceCorruptionError("studio_document.snapshot 顶层必须是对象");
    }
    const doc = parsed as Record<string, unknown>;

    // schemaVersion：缺省 = 旧文档 v1；必须是 >=1 的整数；高于当前版本显式报错。
    if (doc.schemaVersion === undefined) {
        return {
            schemaVersion: BUSINESS_DOCUMENT_SCHEMA_VERSION,
            metadata: parseMetadata(doc.metadata),
            business: emptyBusinessDocument(),
        };
    }
    if (
        typeof doc.schemaVersion !== "number" ||
        !Number.isInteger(doc.schemaVersion) ||
        doc.schemaVersion < 1
    ) {
        throw new WorkspaceCorruptionError(
            `studio_document.snapshot.schemaVersion 必须是 >=1 的整数，实际为 ${String(doc.schemaVersion)}`
        );
    }
    if (doc.schemaVersion > 2) {
        throw new WorkspaceUnsupportedSchemaError(
            doc.schemaVersion,
            `studio_document.snapshot.schemaVersion=${doc.schemaVersion} 高于本实现支持的 2， 请升级后再读取；不会静默覆盖`
        );
    }
    if (doc.schemaVersion === 2) {
        if (typeof doc.business !== "object" || doc.business === null) {
            throw new WorkspaceCorruptionError("studio_document.snapshot.business 必须是对象");
        }
        return {
            schemaVersion: 2,
            metadata: parseMetadata(doc.metadata),
            business: doc.business as BusinessDocument,
        };
    }
    // v1 fallback
    return {
        schemaVersion: doc.schemaVersion,
        metadata: parseMetadata(doc.metadata),
        business: emptyBusinessDocument(),
    };
}

/** 解析显示名元数据；缺省为空元数据，形状错误抛 WorkspaceCorruptionError。 */
function parseMetadata(meta: unknown): CatalogMetadata {
    if (meta === undefined) return emptyMetadata();
    if (meta === null || typeof meta !== "object" || Array.isArray(meta)) {
        throw new WorkspaceCorruptionError("studio_document.snapshot.metadata 必须是对象");
    }

    const readStringRecord = (
        value: unknown,
        field: "tableDisplayNames" | "fieldDisplayNames"
    ): Record<string, string> => {
        if (value === undefined) return {};
        if (value === null || typeof value !== "object" || Array.isArray(value)) {
            throw new WorkspaceCorruptionError(`metadata.${field} 必须是对象`);
        }
        const out: Record<string, string> = {};
        for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
            if (typeof entry !== "string") {
                throw new WorkspaceCorruptionError(`metadata.${field}.${key} 必须是字符串`);
            }
            out[key] = entry;
        }
        return out;
    };

    const m = meta as Record<string, unknown>;
    return {
        tableDisplayNames: readStringRecord(m.tableDisplayNames, "tableDisplayNames"),
        fieldDisplayNames: readStringRecord(m.fieldDisplayNames, "fieldDisplayNames"),
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// T003 — 工作区初始化（纯函数）
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 由“实时目录 + studio_document 行”初始化工作区状态（纯函数）。
 *
 *  - catalog：直接采用入参的实时行（当前库中目录的真实值，last-write-wins）；
 *    不读取 snapshot 中存档的 catalog，从而绝不导入替代用户数据。
 *  - metadata：只取 snapshot 中的显示名业务元数据（无文档/旧文档为空）。
 *  - 基线：{ revision: doc?.revision ?? 0, fingerprint: 实时目录被动列指纹 }。
 *  - 初始 draft 与 lastSavedSnapshot 内容一致 → hasUnsavedChanges === false。
 *
 * 若 doc 存在且版本高于支持范围 / 损坏，此处显式抛出对应错误
 * （load 与 save 共用，任何写入都不会覆盖更新版本或损坏文档）。
 */
export function initializeWorkspace(
    catalog: CatalogSnapshot,
    doc: StudioDocumentRow | null
): WorkspaceState {
    const parsed = parseBusinessDocument(doc?.snapshot ?? null);
    const snapshot: WorkspaceSnapshot = {
        catalog,
        metadata: parsed.metadata,
        business: parsed.business,
    };
    const baseline: LoadBaseline = {
        revision: doc?.revision ?? 0,
        fingerprint: catalogFingerprint(catalog),
    };
    return createInitialWorkspace(snapshot, baseline);
}

export function assertWorkspaceBaseline(state: WorkspaceState, live: CatalogSnapshot, revision: number): void {
    if (revision !== state.baseRevision) {
        throw new WorkspaceConflictError("revision", `revision mismatch: expected ${state.baseRevision} but got ${revision}`);
    }
    const liveFingerprint = catalogFingerprint(live);
    if (liveFingerprint !== state.baseFingerprint) {
        throw new WorkspaceConflictError("catalog", `catalog fingerprint mismatch: expected ${state.baseFingerprint} but got ${liveFingerprint}`);
    }
}
