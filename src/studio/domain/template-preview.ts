import type { WorkspaceState } from "../state/workspace-state";
import { stableStringify } from "../state/workspace-state";
import type { ValidationIssue } from "./rule-validation";
import type { FieldToken, ExprToken, TypeParams } from "../contracts/business";
import { validateRule } from "./rule-validation";

/**
 * Result of a template preview operation.
 */
export interface TemplatePreview {
  templateId: string;
  version: number;
  fieldIds: string[];
  baselineFingerprint: string;
  changes: {
    fieldId: string;
    before: TypeParams;
    after: TypeParams;
  }[];
  issues: ValidationIssue[];
}

/**
 * Preview the application of a template version to a set of fields.
 *
 * Does not modify the workspace state.  Returns a preview object that
 * contains the baseline fingerprint, the list of changes, and any
 * validation issues that would arise if the changes were applied.
 */
export function previewTemplateApplication(
  state: WorkspaceState,
  params: { templateId: string; version: number; fieldIds: string[] }
):
  | { ok: true; preview: TemplatePreview }
  | { ok: false; error: { code: string; message: string; issues?: ValidationIssue[] } } {
  const { templateId, version, fieldIds } = params;

  // 1. Validate business document exists
  const business = state.draft.business;
  if (!business) {
    return { ok: false, error: { code: "business_missing", message: "业务文档不存在" } };
  }

  // 2. Find template
  const template = business.templates.find((t) => t.templateId === templateId);
  if (!template) {
    return { ok: false, error: { code: "template_not_found", message: `模板 ${templateId} 未找到` } };
  }

  // 3. Find requested version
  const tmplVersion = template.versions.find((v) => v.version === version);
  if (!tmplVersion) {
    return { ok: false, error: { code: "version_not_found", message: `模板 ${templateId} 版本 ${version} 未找到` } };
  }

  // 4. Deduplicate fieldIds preserving first occurrence
  const seen = new Set<string>();
  const uniqueFieldIds: string[] = [];
  for (const fid of fieldIds) {
    if (!seen.has(fid)) {
      seen.add(fid);
      uniqueFieldIds.push(fid);
    }
  }

  if (uniqueFieldIds.length === 0) {
    return { ok: false, error: { code: "no_fields", message: "未指定字段" } };
  }

  // 5. Validate all fieldIds exist in catalog
  const catalogFields = state.draft.catalog.fields;
  const missing = uniqueFieldIds.filter((fid) => !catalogFields.find((f) => f.id === fid));
  if (missing.length > 0) {
    return {
      ok: false,
      error: { code: "field_not_found", message: `字段 ${missing.join(",")} 未找到` },
    };
  }

  // 6. Compute baseline fingerprint
  const baselineFingerprint = stableStringify({
    catalog: state.draft.catalog,
    metadata: state.draft.metadata,
    business: state.draft.business,
  });

  // 7. Compute changes
  const changes = uniqueFieldIds.map((fid) => {
    const field = catalogFields.find((f) => f.id === fid)!;
    const before: TypeParams = {
      typeId: field.typeId ?? null,
      precision: field.precision ?? null,
      scale: field.scale ?? null,
      maxLength: field.maxLength ?? null,
    };
    const after: TypeParams = {
      typeId: tmplVersion.typeId ?? null,
      precision: tmplVersion.precision ?? null,
      scale: tmplVersion.scale ?? null,
      maxLength: tmplVersion.maxLength ?? null,
    };
    return { fieldId: fid, before, after };
  });

  // 8. Build a candidate catalog with the after values applied
  const changeMap = new Map<string, TypeParams>();
  for (const c of changes) {
    changeMap.set(c.fieldId, c.after);
  }
  const candidateCatalog = {
    ...state.draft.catalog,
    fields: state.draft.catalog.fields.map((f) => {
      const after = changeMap.get(f.id);
      if (!after) return f;
      return { ...f, typeId: after.typeId, precision: after.precision, scale: after.scale, maxLength: after.maxLength };
    }),
  };

  // 9. Find rules that reference any of these fields
  const affectedRules = business.rules.filter((r) => {
    const tokens: FieldToken[] = [
      ...r.conditions.flatMap((c) => [c.left, c.right].filter((t): t is FieldToken => !!t)),
      ...r.mappings.flatMap((m) => {
        const exprTokens = m.expr.filter((t): t is ExprToken => t.kind === "field") as FieldToken[];
        return [m.target, ...exprTokens].filter((t): t is FieldToken => !!t);
      }),
    ];
    return tokens.some((t) => uniqueFieldIds.includes(t.fieldId));
  });

  // 10. Validate each affected rule against the candidate catalog
  const issues: ValidationIssue[] = [];
  for (const rule of affectedRules) {
    const ruleIssues = validateRule(rule, business, candidateCatalog);
    issues.push(...ruleIssues);
  }

  const preview: TemplatePreview = {
    templateId,
    version,
    fieldIds: uniqueFieldIds,
    baselineFingerprint,
    changes,
    issues,
  };

  return { ok: true, preview };
}
