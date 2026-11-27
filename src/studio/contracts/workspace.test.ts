import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

import type { WorkspaceContextValue, WorkspaceSaveError } from "./workspace";
import {
    applySaveSuccess,
    createInitialWorkspace,
    hasUnsavedChanges,
    withDraftMutations,
    type WorkspaceSnapshot,
    type WorkspaceState,
} from "../state/workspace-state";
import { WorkspaceProvider, useWorkspace } from "../state/workspace-provider";

/** 合成快照：1 数据库 / 1 表 / 1 类型（id 为 null 保留可空）/ 元数据。 */
const makeSnapshot = (): WorkspaceSnapshot => ({
    catalog: {
        databases: [
            { id: "d1", name: "db one", dialect: "postgres", numOfTables: 1, createdAt: null },
        ],
        tables: [
            {
                id: "t1", databaseId: "d1", name: "accounts", posX: 0, posY: 0,
                color: null, width: null, note: null, sequence: 0, createdAt: null,
            },
        ],
        fields: [],
        dataTypes: [
            { id: null, name: "int", dialect: "postgres", type: "int4", modifiers: null, synonyms: null },
        ],
        relationships: [],
        indices: [],
        fieldIndices: [],
    },
    metadata: { tableDisplayNames: { t1: "账户" }, fieldDisplayNames: {} },
});

const baseState = (): WorkspaceState =>
    createInitialWorkspace(makeSnapshot(), { revision: 0, fingerprint: "fp0" });

describe("applySaveSuccess（in-flight-safe 保存成功合并）", () => {
    it("保留保存期间产生的更新编辑，不把它们标记为已保存", () => {
        const started = baseState(); // v0
        const saved: WorkspaceState = {
            ...started,
            lastSavedSnapshot: started.lastSavedSnapshot, // 实际持久化的是 v0 草稿
            savedEditVersion: started.editVersion, // = 0
            baseRevision: started.baseRevision + 1, // 基线前进
            baseFingerprint: "fp-after",
        };
        // 保存进行期间，用户又做了 2 次编辑（v1、v2）。
        const current = withDraftMutations(
            withDraftMutations(started, (d) => {
                d.metadata.tableDisplayNames = { ...d.metadata.tableDisplayNames, t1: "账户(改)" };
            }),
            (d) => {
                d.metadata.tableDisplayNames = { ...d.metadata.tableDisplayNames, t1: "账户(改2)" };
            }
        );

        const merged = applySaveSuccess(current, saved);
        expect(merged.editVersion).toBe(2); // in-flight 编辑保留
        expect(merged.savedEditVersion).toBe(0); // 只有 v0 被保存
        expect(hasUnsavedChanges(merged)).toBe(true); // 仍 dirty
        expect(merged.draft).toBe(current.draft); // 实时草稿未被清除
        expect(merged.baseRevision).toBe(1); // 采用新基线
        expect(merged.baseFingerprint).toBe("fp-after");
    });

    it("保存期间无新编辑时，标记为已保存（不 dirty）", () => {
        const started = baseState(); // v0
        const saved: WorkspaceState = {
            ...started,
            savedEditVersion: started.editVersion,
            baseRevision: 1,
            baseFingerprint: "fp-after",
        };
        const merged = applySaveSuccess(started, saved);
        expect(hasUnsavedChanges(merged)).toBe(false);
        expect(merged.savedEditVersion).toBe(0);
        expect(merged.baseRevision).toBe(1);
        expect(merged.baseFingerprint).toBe("fp-after");
    });

    it("不修改入参并返回全新状态对象", () => {
        const started = baseState();
        const saved: WorkspaceState = {
            ...started,
            savedEditVersion: 0,
            baseRevision: 1,
            baseFingerprint: "fp-after",
        };
        const before = JSON.stringify(started);
        const merged = applySaveSuccess(started, saved);
        expect(merged).not.toBe(started);
        expect(JSON.stringify(started)).toBe(before); // 入参不变
    });
});

describe("WorkspaceSaveError（形状）", () => {
    it("携带 kind / message / 可选 cause", () => {
        const cause = new Error("boom");
        const err: WorkspaceSaveError = {
            kind: "save_failed",
            message: "工作区已被外部修改",
            cause,
        };
        expect(err.kind).toBe("save_failed");
        expect(err.message).toBe("工作区已被外部修改");
        expect(err.cause).toBe(cause);
    });

    it("支持 no_saver（可无 cause）", () => {
        const err: WorkspaceSaveError = { kind: "no_saver", message: "未配置保存处理器" };
        expect(err.kind).toBe("no_saver");
        expect(err.cause).toBeUndefined();
    });
});

describe("WorkspaceProvider（SSR 冒烟）", () => {
    // 注意：通过对象持有 `seen`，在渲染"之后"读取；若解构则会在渲染前固化旧值。
    const capture = () => {
        let seen: WorkspaceContextValue | null = null;
        function Consumer() {
            seen = useWorkspace();
            return createElement("div", null, "ok");
        }
        return { Consumer, get seen() { return seen; } };
    };

    it("挂载并暴露稳定的上下文值（干净状态、无错误）", () => {
        const cap = capture();
        const html = renderToString(
            createElement(WorkspaceProvider, null, createElement(cap.Consumer, null))
        );
        expect(html).toContain("ok");
        expect(cap.seen).not.toBeNull();
        expect(cap.seen!.isDirty).toBe(false);
        expect(cap.seen!.lastSaveError).toBeNull();
        expect(typeof cap.seen!.mutate).toBe("function");
        expect(typeof cap.seen!.save).toBe("function");
        expect(typeof cap.seen!.restore).toBe("function");
        expect(cap.seen!.state).toBeTypeOf("object");
        expect(cap.seen!.state.editVersion).toBe(0);
    });

    it("初始状态含未保存编辑时 isDirty=true", () => {
        const dirty = withDraftMutations(baseState(), (d) => {
            d.metadata.tableDisplayNames = { ...d.metadata.tableDisplayNames, t1: "改" };
        });
        const cap = capture();
        const html = renderToString(
            createElement(WorkspaceProvider, { initialState: dirty }, createElement(cap.Consumer, null))
        );
        expect(html).toContain("ok");
        expect(cap.seen!.isDirty).toBe(true);
        expect(cap.seen!.state.editVersion).toBe(1);
    });

    it("提供保存处理器时仍能干净挂载", () => {
        const saveFn = async (s: WorkspaceState): Promise<WorkspaceState> => s; // 恒等保存器
        const cap = capture();
        const html = renderToString(
            createElement(WorkspaceProvider, { saveFn }, createElement(cap.Consumer, null))
        );
        expect(html).toContain("ok");
        expect(typeof cap.seen!.save).toBe("function");
    });
});
