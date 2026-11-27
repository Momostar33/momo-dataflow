import type {
  WorkspaceState,
  WorkspaceSnapshot,
} from "../state/workspace-state";
import { cloneSnapshot, hasUnsavedChanges } from "../state/workspace-state";
import {
  emptyBusinessDocument,
  type Flow,
  type TableRef,
  type Rule,
} from "../contracts/business";
import { validateRule } from "./rule-validation";
import type {
  CatalogRelationshipRow,
  CatalogIndexRow,
  CatalogFieldIndexRow,
} from "../contracts/catalog";
export interface DesignColumn {
  id: string;
  name: string;
  type: string;
  note: string;
  label?: string;
  primary: boolean;
  nullable: boolean;
  unique?: boolean;
  defaultValue: string | null;
  precision: number | null;
  scale: number | null;
  maxLength: number | null;
  unsigned?: boolean;
  autoIncrement?: boolean;
  collate?: string | null;
}
export interface DesignTable {
  id: string;
  name: string;
  label: string;
  note: string;
  columns: DesignColumn[];
}
export interface DesignPackage {
  format: "stackrender-design-package";
  version: 1;
  packageId: string;
  name: string;
  capturedAt: string;
  note: string;
  database: { id: string; name: string; dialect: "mysql" };
  tables: DesignTable[];
  flows: Flow[];
  refs: TableRef[];
  rules: Rule[];
  relationships: CatalogRelationshipRow[];
  indexes: {
    id: string;
    tableId: string;
    name: string;
    unique: boolean;
    fieldIds: string[];
  }[];
}
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function need(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
function text(v: unknown, label: string) {
  need(
    typeof v === "string" && v.trim().length > 0 && v.length < 20000,
    label + "缺失或无效",
  );
  return v;
}
function list(v: unknown, label: string, max = 50000): asserts v is unknown[] {
  need(Array.isArray(v) && v.length <= max, label + "列表无效或过大");
}
function number(v: unknown, label: string, min = 0) {
  need(
    v === null ||
      (typeof v === "number" && Number.isSafeInteger(v) && v >= min),
    label + "必须是非负整数或空值",
  );
}
export function planDesignImport(state: WorkspaceState, input: unknown) {
  need(!hasUnsavedChanges(state), "请先保存当前工作区，再导入设计包");
  need(input && typeof input === "object", "设计包必须是JSON对象");
  const p = input as DesignPackage;
  need(
    p.format === "stackrender-design-package" && p.version === 1,
    "不支持此设计包版本",
  );
  text(p.packageId, "包标识");
  text(p.name, "包名称");
  text(p.capturedAt, "结构时间");
  text(p.note, "来源说明");
  need(p.database?.dialect === "mysql", "当前设计包须为MySQL结构");
  text(p.database.name, "设计库名称");
  list(p.tables, "表", 2000);
  list(p.flows, "模块", 500);
  list(p.refs, "表引用");
  list(p.rules, "规则", 10000);
  list(p.relationships, "物理关系");
  list(p.indexes, "索引");
  const ids = new Set<string>();
  const id = (v: string, label: string) => {
    need(typeof v === "string" && uuid.test(v), label + "必须为UUID");
    need(!ids.has(v), "设计包内ID重复：" + label);
    ids.add(v);
  };
  const existing = state.draft.business;
  const existingIds = new Set<string>([
    ...Object.values(state.draft.catalog)
      .flat()
      .map((r) => r.id)
      .filter((id): id is string => typeof id === "string"),
    ...(existing?.flows.map((f) => f.flowId) ?? []),
    ...(existing?.flows.flatMap((f) => f.steps.map((s) => s.stepId)) ?? []),
    ...(existing?.refs.map((r) => r.refId) ?? []),
    ...(existing?.rules.map((r) => r.ruleId) ?? []),
    ...(existing?.rules.flatMap((r) => [
      ...r.conditions.map((c) => c.id),
      ...r.mappings.map((m) => m.id),
    ]) ?? []),
    ...(existing?.templates.map((t) => t.templateId) ?? []),
  ]);
  id(p.database.id, "设计库");
  need(
    !state.draft.catalog.databases.some(
      (d) => d.id === p.database.id || d.name === p.database.name,
    ),
    "该设计库已存在，未重复导入或覆盖",
  );
  const snapshot: WorkspaceSnapshot = cloneSnapshot(state.draft);
  snapshot.business ??= emptyBusinessDocument();
  const additions = {
    databases: [] as typeof snapshot.catalog.databases,
    tables: [] as typeof snapshot.catalog.tables,
    fields: [] as typeof snapshot.catalog.fields,
    relationships: [] as CatalogRelationshipRow[],
    indices: [] as CatalogIndexRow[],
    fieldIndices: [] as CatalogFieldIndexRow[],
  };
  additions.databases.push({
    id: p.database.id,
    name: p.database.name,
    dialect: "mysql",
    numOfTables: p.tables.length,
    createdAt: new Date().toISOString(),
  });
  const tableNames = new Set<string>(),
    fieldTable = new Map<string, string>(),
    unknownTypes = new Set<string>();
  for (const [i, t] of p.tables.entries()) {
    id(t.id, "表");
    text(t.name, "表名");
    need(!tableNames.has(t.name), "设计包内表名重复");
    tableNames.add(t.name);
    need(
      typeof t.note === "string" && typeof t.label === "string",
      "表说明无效",
    );
    list(t.columns, "字段");
    need(t.columns.length > 0, "表必须包含已知字段");
    additions.tables.push({
      id: t.id,
      databaseId: p.database.id,
      name: t.name,
      posX: (i % 5) * 340,
      posY: Math.floor(i / 5) * 280,
      color: null,
      width: 300,
      note: t.note,
      sequence: i,
      createdAt: null,
    });
    snapshot.metadata.tableDisplayNames[t.id] = t.label;
    const names = new Set<string>();
    for (const [j, f] of t.columns.entries()) {
      id(f.id, "字段");
      fieldTable.set(f.id, t.id);
      text(f.name, "字段名");
      need(!names.has(f.name), "表内字段名重复");
      names.add(f.name);
      text(f.type, "SQL类型");
      need(
        typeof f.note === "string" &&
          typeof f.primary === "boolean" &&
          typeof f.nullable === "boolean",
        "字段属性无效",
      );
      need(
        f.defaultValue === null || typeof f.defaultValue === "string",
        "默认值必须是文本或空值",
      );
      number(f.precision, "精度");
      number(f.scale, "小数位");
      number(f.maxLength, "长度");
      need(
        f.scale === null || f.precision === null || f.scale <= f.precision,
        "小数位不能大于精度",
      );
      const type = snapshot.catalog.dataTypes.find(
        (d) =>
          d.dialect === "mysql" &&
          (d.name?.toLowerCase() === f.type.toLowerCase() ||
            (() => {
              try {
                const a = JSON.parse(d.synonyms ?? "[]");
                return (
                  Array.isArray(a) &&
                  a.some(
                    (v) =>
                      typeof v === "string" &&
                      v.toLowerCase() === f.type.toLowerCase(),
                  )
                );
              } catch {
                return false;
              }
            })()),
      );
      if (!type?.id) unknownTypes.add(f.type);
      additions.fields.push({
        id: f.id,
        tableId: t.id,
        name: f.name,
        isPrimary: f.primary,
        unique: !!f.unique,
        nullable: f.nullable,
        defaultValue: f.defaultValue,
        note:
          f.note + (type?.id ? "" : "\n原SQL类型未被当前类型库识别：" + f.type),
        typeId: type?.id ?? null,
        sequence: j,
        maxLength: f.maxLength,
        unsigned: !!f.unsigned,
        isForeign: false,
        zeroFill: false,
        autoIncrement: !!f.autoIncrement,
        precision: f.precision,
        scale: f.scale,
        charset: null,
        collate: f.collate ?? null,
        values: null,
      });
      if (f.label) snapshot.metadata.fieldDisplayNames[f.id] = f.label;
    }
  }
  need(additions.fields.length <= 50000, "字段数量过大");
  const newTables = new Set(additions.tables.map((t) => t.id)),
    flows = new Map<string, Flow>(),
    steps = new Map<string, { flow: string; kind: string }>();
  for (const f of p.flows) {
    id(f.flowId, "流程");
    text(f.name, "模块名");
    need(f.databaseId === p.database.id, "模块必须属于新设计库");
    need(typeof f.note === "string", "模块说明无效");
    list(f.steps, "步骤");
    if (f.transitions !== undefined) {
      list(f.transitions, "流程连线");
      need(f.transitions.length === 0, "结构包不允许引入推测的流程触发线");
    }
    for (const s of f.steps) {
      id(s.stepId, "步骤");
      text(s.name, "步骤名");
      need(
        typeof s.note === "string" &&
          [s.x, s.y, s.w, s.h].every(
            (n) => typeof n === "number" && Number.isFinite(n),
          ) &&
          s.w > 0 &&
          s.h > 0,
        "步骤布局无效",
      );
      need(!s.kind || s.kind === "step", "结构包仅支持表分组步骤");
      steps.set(s.stepId, { flow: f.flowId, kind: "step" });
    }
    flows.set(f.flowId, f);
  }
  const refs = new Map<string, TableRef>();
  for (const ref of p.refs) {
    id(ref.refId, "引用");
    need(
      flows.has(ref.flowId) &&
        steps.get(ref.stepId)?.flow === ref.flowId &&
        newTables.has(ref.tableId),
      "表引用必须属于当前包内流程与表",
    );
    need(
      [ref.x, ref.y].every(
        (n) => typeof n === "number" && Number.isFinite(n),
      ) && typeof ref.collapsed === "boolean",
      "引用布局无效",
    );
    if (ref.visibleFieldIds) {
      list(ref.visibleFieldIds, "可见字段");
      need(
        ref.visibleFieldIds.every((fid) => fieldTable.get(fid) === ref.tableId),
        "可见字段不属于引用表",
      );
    }
    refs.set(ref.refId, ref);
  }
  for (const rule of p.rules) {
    id(rule.ruleId, "规则");
    need(flows.has(rule.flowId), "规则流程不存在");
    list(rule.conditions, "条件");
    list(rule.mappings, "映射");
    need(rule.mappings.length === 0, "结构包不能导入未经单独确认的计算公式");
    need(
      ["ALL", "ANY"].includes(rule.logic) && typeof rule.note === "string",
      "规则属性无效",
    );
    for (const c of rule.conditions) {
      id(c.id, "条件");
      for (const token of [c.left, c.right])
        need(
          token &&
            refs.get(token.refId)?.flowId === rule.flowId &&
            fieldTable.get(token.fieldId) === refs.get(token.refId)?.tableId,
          "规则字段引用无效",
        );
    }
  }
  for (const rel of p.relationships) {
    id(rel.id, "外键");
    need(
      rel.databaseId === p.database.id &&
        fieldTable.get(rel.sourceFieldId) === rel.sourceTableId &&
        fieldTable.get(rel.targetFieldId) === rel.targetTableId,
      "物理外键端点无效",
    );
    need(
      ["one_to_one", "one_to_many", "many_to_one", "many_to_many"].includes(
        rel.cardinality,
      ),
      "外键基数无效",
    );
    need(
      [rel.onDelete, rel.onUpdate].every(
        (v) =>
          v === null ||
          [
            "no_action",
            "cascade",
            "set_null",
            "set_default",
            "restrict",
          ].includes(v),
      ),
      "外键动作无效",
    );
    additions.relationships.push({ ...rel, databaseId: p.database.id });
  }
  for (const idx of p.indexes) {
    id(idx.id, "索引");
    text(idx.name, "索引名");
    need(
      newTables.has(idx.tableId) && typeof idx.unique === "boolean",
      "索引属性无效",
    );
    list(idx.fieldIds, "索引字段");
    need(
      idx.fieldIds.length > 0 &&
        idx.fieldIds.every((fid) => fieldTable.get(fid) === idx.tableId),
      "索引字段无效",
    );
    additions.indices.push({
      id: idx.id,
      tableId: idx.tableId,
      name: idx.name,
      unique: idx.unique,
      createdAt: null,
    });
    for (const fid of idx.fieldIds) {
      const link = crypto.randomUUID();
      id(link, "索引字段关联");
      additions.fieldIndices.push({ id: link, fieldId: fid, indexId: idx.id });
    }
  }
  for (const newId of ids)
    need(!existingIds.has(newId), "导入ID与现有数据冲突，未覆盖");
  for (const kind of [
    "databases",
    "tables",
    "fields",
    "relationships",
    "indices",
    "fieldIndices",
  ] as const)
    (snapshot.catalog[kind] as unknown[]).push(...additions[kind]);
  snapshot.business.flows.push(...structuredClone(p.flows));
  snapshot.business.refs.push(...structuredClone(p.refs));
  snapshot.business.rules.push(...structuredClone(p.rules));
  for (const rule of p.rules) {
    const issues = validateRule(rule, snapshot.business, snapshot.catalog);
    need(
      issues.length === 0,
      rule.name + "：" + issues.map((i) => i.message).join("；"),
    );
  }
  return {
    snapshot,
    additions,
    summary: {
      databaseId: p.database.id,
      name: p.name,
      capturedAt: p.capturedAt,
      note: p.note,
      tables: p.tables.length,
      fields: additions.fields.length,
      modules: p.flows.length,
      rules: p.rules.length,
      physicalRelationships: p.relationships.length,
      indexes: p.indexes.length,
      unknownTypes: [...unknownTypes],
    },
  };
}
