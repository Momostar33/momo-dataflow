import { typeCategory } from './type-category';
import type {
  Rule,
  BusinessDocument,
  ExprToken,
  FieldToken,
} from "../contracts/business";
import type {
  CatalogSnapshot,
  CatalogDataTypeRow,
  CatalogTableRow,
  CatalogFieldRow,
} from "../contracts/catalog";

/* eslint-disable @typescript-eslint/no-unused-vars */
export interface ValidationIssue {
  code: string;
  message: string;
  flowId?: string;
  ruleId?: string;
  refId?: string;
  fieldId?: string;
  path?: string;
}

// Map data type id to type name via catalog dataTypes
function resolveDataTypeName(catalog: CatalogSnapshot, typeId: string | null): string | null {
  if (!typeId) return null;
  const dt = catalog.dataTypes.find((d: CatalogDataTypeRow) => d.id === typeId);
  return dt?.type ?? null;
}

export function validateRule(rule: Rule, business: BusinessDocument, catalog: CatalogSnapshot): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const flow = business.flows.find((f) => f.flowId === rule.flowId);
  if (!flow) {
    issues.push({ code: "rule_error", message: `无效流程：${rule.flowId}`, ruleId: rule.ruleId });
    return issues;
  }
  // name
  if (!rule.name.trim()) {
    issues.push({ code: "rule_error", message: "规则名称不能为空", ruleId: rule.ruleId });
  }
  if (rule.conditions.length === 0 && rule.mappings.length === 0) {
    issues.push({ code: "rule_error", message: "完全空的规则不能保存：至少需要一条匹配条件或字段映射", ruleId: rule.ruleId });
  }
  // conditions presence
  rule.conditions.forEach((c, idx) => {
    if (!c.left || !c.right) {
      issues.push({ code: "rule_error", message: `匹配条件第 ${idx + 1} 行两侧字段都必须选择`, ruleId: rule.ruleId });
      return;
    }
  });
  // mappings
  rule.mappings.forEach((m, idx) => {
    if (!m.target) {
      issues.push({ code: "rule_error", message: `映射第 ${idx + 1} 行目标字段不能为空`, ruleId: rule.ruleId });
    }
    if (m.expr.length === 0) {
      issues.push({ code: "rule_error", message: `映射第 ${idx + 1} 行来源表达式不能为空`, ruleId: rule.ruleId });
    }
  });
  // duplicate target
  const seen = new Set<string>();
  rule.mappings.forEach((m) => {
    if (m.target) {
      const k = `${m.target.refId}|${m.target.fieldId}`;
      if (seen.has(k)) {
        issues.push({ code: "rule_error", message: "同一规则内存在重复的映射目标字段", ruleId: rule.ruleId });
      }
      seen.add(k);
    }
  });

  // token existence and flow consistency
  const tokens: FieldToken[] = [];
  rule.conditions.forEach((c) => {
    if (c.left) tokens.push(c.left);
    if (c.right) tokens.push(c.right);
  });
  rule.mappings.forEach((m) => {
    if (m.target) tokens.push(m.target);
    m.expr.forEach((t) => {
      if (t.kind === "field") tokens.push({ refId: t.refId, fieldId: t.fieldId });
    });
  });
  tokens.forEach((t) => {
    const ref = business.refs.find((r) => r.refId === t.refId);
    if (!ref) {
      issues.push({ code: "rule_error", message: `失效引用：表引用 ${t.refId} 已不存在`, ruleId: rule.ruleId });
      return;
    }
    if (ref.flowId !== rule.flowId) {
      issues.push({ code: "rule_error", message: `不支持跨流程引用：${ref.refId} 属于其他流程`, ruleId: rule.ruleId });
    }
    const table = catalog.tables.find((tbl: CatalogTableRow) => tbl.id === ref.tableId);
    if (!table) {
      issues.push({ code: "rule_error", message: `表不存在：${ref.tableId}`, ruleId: rule.ruleId });
      return;
    }
    const field = catalog.fields.find((f: CatalogFieldRow) => f.id === t.fieldId && f.tableId === ref.tableId);
    if (!field) {
      issues.push({ code: "rule_error", message: `字段不存在：${t.fieldId}`, ruleId: rule.ruleId });
      return;
    }
  });

  // type compatibility for conditions
  rule.conditions.forEach((c, idx) => {
    if (!c.left || !c.right) return;
    const leftRef = c.left;
    const rightRef = c.right;
    const leftField = catalog.fields.find((f: CatalogFieldRow) =>
      f.id === leftRef.fieldId &&
      f.tableId === business.refs.find((r: any) => r.refId === leftRef.refId)?.tableId
    );
    const rightField = catalog.fields.find((f: CatalogFieldRow) =>
      f.id === rightRef.fieldId &&
      f.tableId === business.refs.find((r: any) => r.refId === rightRef.refId)?.tableId
    );
    if (!leftField || !rightField) return;
    const leftCat = typeCategory(resolveDataTypeName(catalog, leftField.typeId));
    const rightCat = typeCategory(resolveDataTypeName(catalog, rightField.typeId));
    if (leftCat && rightCat && leftCat !== rightCat) {
      issues.push({
        code: "rule_error",
        message: `规则「${rule.name}」匹配条件第 ${idx + 1} 行类型不兼容：${leftCat} ↔ ${rightCat}`,
        ruleId: rule.ruleId,
      });
    }
  });

  // type compatibility for mappings
  rule.mappings.forEach((m, idx) => {
    if (!m.target || m.expr.length === 0) return;
    const target = m.target;
    const targetField = catalog.fields.find(
      (f: CatalogFieldRow) =>
        f.id === target.fieldId &&
        f.tableId === business.refs.find((r: any) => r.refId === target.refId)?.tableId
    );
    if (!targetField) return;
    const targetCat = typeCategory(resolveDataTypeName(catalog, targetField.typeId));
    const hasOp = m.expr.some((t) => t.kind === "op");
    if (hasOp && targetCat !== "numeric") {
      issues.push({ code: "rule_error", message: `映射第 ${idx + 1} 行算术公式只能映射到数值字段`, ruleId: rule.ruleId });
    }
    const hasUnbalancedParentheses = (expr: ExprToken[]): boolean => {
      let depth = 0;
      for (const tok of expr) {
        if (tok.kind === "op") {
          if (tok.value === "(") depth++;
          else if (tok.value === ")") {
            depth--;
            if (depth < 0) return true;
          }
        }
      }
      return depth !== 0;
    };
    if (hasUnbalancedParentheses(m.expr)) {
      issues.push({ code: "rule_error", message: `括号不平衡`, ruleId: rule.ruleId });
    }
    m.expr.forEach((t) => {
      if (t.kind === "field") {
        const srcField = catalog.fields.find(
          (f: CatalogFieldRow) =>
            f.id === t.fieldId &&
            f.tableId === business.refs.find((r: any) => r.refId === t.refId)?.tableId
        );
        if (!srcField) return;
        const srcCat = typeCategory(resolveDataTypeName(catalog, srcField.typeId));
        if (srcCat && targetCat && srcCat !== targetCat) {
          issues.push({ code: "rule_error", message: `映射第 ${idx + 1} 行类型不兼容：来源 ${srcCat} ↔ 目标 ${targetCat}`, ruleId: rule.ruleId });
        }
        if (hasOp && srcCat !== "numeric") {
          issues.push({ code: "rule_error", message: `算术公式中的字段不是数值类型`, ruleId: rule.ruleId });
        }
      } else if (t.kind === "num" && targetCat !== "numeric") {
        issues.push({ code: "rule_error", message: `数字常量只能用于数值目标`, ruleId: rule.ruleId });
      } else if (t.kind === "text") {
        if (targetCat !== "text" || hasOp) {
          issues.push({ code: "rule_error", message: `文本常量只能用于文本目标`, ruleId: rule.ruleId });
        }
      }
    });
  });

  return issues;
}

export function validateFieldTypeChange(
  snapshot: { catalog: CatalogSnapshot; business?: BusinessDocument },
  change: {
    fieldId: string;
    typeId: string | null;
    precision?: number | null;
    scale?: number | null;
    maxLength?: number | null;
  }
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const { catalog, business } = snapshot;
  const field = catalog.fields.find((f) => f.id === change.fieldId);
  if (!field) {
    issues.push({ code: "type_error", message: `字段不存在：${change.fieldId}` });
    return issues;
  }
  
  const originalCat = typeCategory(resolveDataTypeName(catalog, field.typeId));
  const newTypeName = resolveDataTypeName(catalog, change.typeId);
  
  if (!newTypeName) {
    issues.push({ code: "type_error", message: `未知类型：${change.typeId}` });
    return issues;
  }
  const newCat = typeCategory(newTypeName);
  if (!newCat) {
    issues.push({ code: "type_error", message: `无法识别类型类别：${newTypeName}` });
    return issues;
  }
  // check numeric fields for precision/scale
  if ((newCat === "numeric")) {
    if (change.precision !== undefined && change.precision !== null && typeof change.precision !== "number") {
      issues.push({ code: "type_error", message: `精度必须为数字` });
    }
    if (change.scale !== undefined && change.scale !== null && typeof change.scale !== "number") {
      issues.push({ code: "type_error", message: `小数位必须为数字` });
    }
  } else if (newCat === "text") {
    if (change.maxLength !== undefined && change.maxLength !== null && typeof change.maxLength !== "number") {
      issues.push({ code: "type_error", message: `最大长度必须为数字` });
    }
  }

  // check rule compatibility if business provided
  if (business) {
    business.rules.forEach((r) => {
      r.conditions.forEach((c) => {
        const refs: Array<FieldToken | null> = [c.left, c.right];
        refs.forEach((t) => {
          if (!t) return;
          if (t.fieldId === change.fieldId) {
            const other = t === c.left ? c.right : c.left;
            if (!other) return;
            const otherField = catalog.fields.find((f: CatalogFieldRow) => f.id === other.fieldId && f.tableId === business.refs.find((ref: any) => ref.refId === other.refId)?.tableId);
            if (!otherField) return;
            const otherCat = typeCategory(resolveDataTypeName(catalog, otherField.typeId));
            if (otherCat && otherCat !== originalCat) {
              issues.push({
                code: "rule_error",
                message: `规则「${r.name}」匹配条件中字段类型不兼容：${newCat} ↔ ${otherCat}`,
                ruleId: r.ruleId,
              });
            }
          }
        });
  // source field change impact regardless of target mapping
  r.mappings.forEach((m) => {
    const hasOp = m.expr.some((t) => t.kind === "op");
    m.expr.forEach((t) => {
      if (t.kind === "field" && t.fieldId === change.fieldId) {
        const srcField = catalog.fields.find(
          (f: CatalogFieldRow) =>
            f.id === t.fieldId &&
            f.tableId === business.refs.find((ref: any) => ref.refId === t.refId)?.tableId
        );
        if (!srcField) return;
        const srcCat = typeCategory(resolveDataTypeName(catalog, srcField.typeId));
        if (srcCat && srcCat !== newCat) {
          issues.push({
            code: "rule_error",
            message: `映射字段类型不兼容：${srcCat} ↔ ${newCat}`,
            ruleId: r.ruleId,
          });
        }
        if (hasOp && srcCat !== "numeric") {
          issues.push({
            code: "rule_error",
            message: `算术公式中的字段不是数值类型`,
            ruleId: r.ruleId,
          });
        }
      }
    });
  });
      });
    r.mappings.forEach((m) => {
  const hasOp = m.expr.some((t) => t.kind === "op");
  if (m.target && m.target.fieldId === change.fieldId) {
    const targetCat = newCat;
    if (hasOp && targetCat !== "numeric") {
      issues.push({ code: "rule_error", message: `算术公式只能映射到数值字段`, ruleId: r.ruleId });
    }
    m.expr.forEach((t) => {
      if (t.kind === "field") {
        const srcField = catalog.fields.find((f: CatalogFieldRow) => f.id === t.fieldId && f.tableId === business.refs.find((ref: any) => ref.refId === t.refId)?.tableId);
        if (!srcField) return;
        const srcCat = typeCategory(resolveDataTypeName(catalog, srcField.typeId));
        if (srcCat && srcCat !== targetCat) {
          issues.push({ code: "rule_error", message: `映射字段类型不兼容：${srcCat} ↔ ${targetCat}`, ruleId: r.ruleId });
        }
        if (hasOp && srcCat !== "numeric") {
          issues.push({ code: "rule_error", message: `算术公式中的字段不是数值类型`, ruleId: r.ruleId });
        }
      }
    });
  }
  // source field check regardless of target
  m.expr.forEach((t) => {
    if (t.kind === "field" && t.fieldId === change.fieldId) {
      const srcField = catalog.fields.find((f: CatalogFieldRow) => f.id === t.fieldId && f.tableId === business.refs.find((ref: any) => ref.refId === t.refId)?.tableId);
      if (!srcField) return;
      const srcCat = typeCategory(resolveDataTypeName(catalog, srcField.typeId));
      if (srcCat && srcCat !== newCat) {
        issues.push({ code: "rule_error", message: `映射字段类型不兼容：${srcCat} ↔ ${newCat}`, ruleId: r.ruleId });
      }
      if (hasOp && srcCat !== "numeric") {
        issues.push({ code: "rule_error", message: `算术公式中的字段不是数值类型`, ruleId: r.ruleId });
      }
    }
  });
});
    });
  }

  return issues;
}

