/**
 * G01 · T003/T004 — studio_document 本地业务元数据表
 *
 * 存放 Studio 工作区的显示名等元数据（以 JSON snapshot 保存），
 * 与目录原始行（tables/fields 等）同库，但不属于 StackRender 同步模型：
 *  - `localOnly: true` —— 仅在注册处（app-schema.ts）声明，不进入远端同步。
 *  - 单行约定：id = 'default'，revision 由保存方在事务内自增（基线冲突检测）。
 *  - snapshot：WorkspaceSnapshot 的 JSON（catalog + metadata）；
 *    catalog 部分仅作审计/恢复用途，目录原始行的当前值以实时行（live rows）为准。
 *
 * 不新增依赖、不修改既有表定义。
 */

import { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const studio_document = sqliteTable('studio_document', {
    id: text('id')
        .primaryKey()
        .notNull()
        .default('default'),

    revision: integer('revision')
        .notNull()
        .default(0),

    updatedAt: text('updatedAt'),

    snapshot: text('snapshot'),
});

export interface StudioDocumentType extends InferSelectModel<typeof studio_document> {
};

export interface StudioDocumentInsertType extends InferInsertModel<typeof studio_document> {
};
