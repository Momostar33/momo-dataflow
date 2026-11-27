import { typeCategory } from "./type-category";
import type { WorkspaceState } from "../state/workspace-state";
import { withDraftMutations } from "../state/workspace-state";
import type { Template, TemplateVersion } from "../contracts/business";
import { emptyBusinessDocument } from "../contracts/business";
import { v4 as uuidv4 } from "uuid";

/**
 * Category mapping for data type names to generic categories.
 * Used for compatibility checks between template kind and underlying data type.
 */
/**
 * Map template kind to expected data type category.
 * `custom` accepts any type.
 */
const KIND_CATEGORY: Record<
  Template["kind"],
  "numeric" | "text" | "temporal" | "boolean" | "any"
> = {
  money: "numeric",
  int: "numeric",
  text: "text",
  datetime: "temporal",
  custom: "any",
};

/**
 * Validate that a number is a positive integer.
 */
function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/**
 * Validate that a number is a non‑negative integer.
 */
function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/**
 * Create a new template in the workspace.
 */
export function createTemplate(
  state: WorkspaceState,
  params: {
    name: string;
    kind: Template["kind"];
    typeId: string;
    note?: string;
    precision?: number;
    scale?: number;
    maxLength?: number;
  },
):
  | { ok: true; state: WorkspaceState; templateId: string }
  | { ok: false; error: { code: string; message: string; issues?: any[] } } {
  const trimmedName = params.name.trim();
  if (!trimmedName) {
    return {
      ok: false,
      error: { code: "name_empty", message: "模板名称不能为空" },
    };
  }

  // Ensure business exists; if not, initialize it.
  const ensureBusiness = (draft: WorkspaceState["draft"]) => {
    if (!draft.business) {
      draft.business = emptyBusinessDocument();
    }
  };

  // Validate uniqueness of name
  const nameDuplicate = state.draft.business?.templates?.some(
    (t) => t.name === trimmedName,
  );
  if (nameDuplicate) {
    return {
      ok: false,
      error: { code: "name_duplicate", message: "模板名称已存在" },
    };
  }

  // Validate typeId exists
  const typeRow = state.draft.catalog.dataTypes.find(
    (d) => d.id === params.typeId,
  );
  if (!typeRow) {
    return {
      ok: false,
      error: {
        code: "type_not_found",
        message: `类型 ${params.typeId} 未找到`,
      },
    };
  }

  // Determine type category
  const typeCat = typeCategory(typeRow.type);
  const expectedCat = KIND_CATEGORY[params.kind];
  if (expectedCat !== "any" && (!typeCat || typeCat !== expectedCat)) {
    return {
      ok: false,
      error: {
        code: "type_mismatch",
        message: `类型 ${params.typeId} 与模板种类 ${params.kind} 不兼容`,
      },
    };
  }

  if (
    params.kind === "money" &&
    ((typeRow.name ?? typeRow.type).toUpperCase() !== "DECIMAL" ||
      (params.scale !== undefined && params.scale !== 2))
  ) {
    return {
      ok: false,
      error: {
        code: "MONEY_TYPE",
        message: "金额模板固定使用 DECIMAL，且小数位必须为 2",
      },
    };
  }

  // Validate numeric parameters
  const issues: any[] = [];
  const precision = params.precision ?? null;
  const scale = params.scale ?? null;
  const maxLength = params.maxLength ?? null;

  if (precision !== null) {
    if (!isPositiveInteger(precision)) {
      issues.push({ field: "precision", message: "精度必须为正整数" });
    }
  }
  if (scale !== null) {
    if (!isNonNegativeInteger(scale)) {
      issues.push({ field: "scale", message: "小数位必须为非负整数" });
    } else if (precision !== null && scale > precision) {
      issues.push({ field: "scale", message: "小数位不能大于精度" });
    }
  }
  if (maxLength !== null) {
    if (!isPositiveInteger(maxLength)) {
      issues.push({ field: "maxLength", message: "最大长度必须为正整数" });
    }
  }

  if (issues.length) {
    return {
      ok: false,
      error: { code: "invalid_params", message: "参数校验失败", issues },
    };
  }

  // Apply defaults for money kind
  const finalPrecision =
    params.kind === "money" ? (precision ?? 18) : precision;
  const finalScale = params.kind === "money" ? (scale ?? 2) : scale;
  const finalMaxLength = params.kind === "money" ? null : maxLength;

  const templateId = uuidv4();
  const version: TemplateVersion = {
    version: 1,
    createdAt: new Date().toISOString(),
    typeId: params.typeId,
    precision: finalPrecision,
    scale: finalScale,
    maxLength: finalMaxLength,
  };

  const template: Template = {
    templateId,
    name: trimmedName,
    kind: params.kind,
    note: params.note ?? "",
    versions: [version],
  };

  const newState = withDraftMutations(state, (draft) => {
    ensureBusiness(draft);
    draft.business!.templates.push(template);
  });

  return { ok: true, state: newState, templateId };
}

/**
 * Update an existing template's name or note.
 * No new version is added; only the template metadata is updated.
 */
export function updateTemplate(
  state: WorkspaceState,
  params: { templateId: string; name?: string; note?: string },
):
  | { ok: true; state: WorkspaceState; templateId: string }
  | { ok: false; error: { code: string; message: string; issues?: any[] } } {
  if (!state.draft.business) {
    return {
      ok: false,
      error: { code: "business_missing", message: "业务文档不存在" },
    };
  }

  const template = state.draft.business.templates.find(
    (t) => t.templateId === params.templateId,
  );
  if (!template) {
    return {
      ok: false,
      error: {
        code: "template_not_found",
        message: `模板 ${params.templateId} 未找到`,
      },
    };
  }

  const trimmedName = params.name?.trim();
  if (params.name !== undefined) {
    if (!trimmedName) {
      return {
        ok: false,
        error: { code: "name_empty", message: "模板名称不能为空" },
      };
    }
    const duplicate = state.draft.business.templates.some(
      (t) => t.templateId !== params.templateId && t.name === trimmedName,
    );
    if (duplicate) {
      return {
        ok: false,
        error: { code: "name_duplicate", message: "模板名称已存在" },
      };
    }
  }

  const newState = withDraftMutations(state, (draft) => {
    const tmpl = draft.business!.templates.find(
      (t) => t.templateId === params.templateId,
    )!;
    if (params.name !== undefined) tmpl.name = trimmedName!;
    if (params.note !== undefined) tmpl.note = params.note;
    // No new version is added on metadata edit
  });

  return { ok: true, state: newState, templateId: params.templateId };
}

/**
 * Publish a new version for an existing template.
 * Reuses the same parameter validation logic as createTemplate.
 * Does not modify template metadata or existing versions.
 */
export function publishTemplateVersion(
  state: WorkspaceState,
  params: {
    templateId: string;
    typeId: string;
    precision?: number;
    scale?: number;
    maxLength?: number;
  },
):
  | { ok: true; state: WorkspaceState; templateId: string }
  | { ok: false; error: { code: string; message: string; issues?: any[] } } {
  // Ensure business exists
  if (!state.draft.business) {
    return {
      ok: false,
      error: { code: "business_missing", message: "业务文档不存在" },
    };
  }

  // Find the template
  const template = state.draft.business.templates.find(
    (t) => t.templateId === params.templateId,
  );
  if (!template) {
    return {
      ok: false,
      error: {
        code: "template_not_found",
        message: `模板 ${params.templateId} 未找到`,
      },
    };
  }

  // Validate typeId exists
  const typeRow = state.draft.catalog.dataTypes.find(
    (d) => d.id === params.typeId,
  );
  if (!typeRow) {
    return {
      ok: false,
      error: {
        code: "type_not_found",
        message: `类型 ${params.typeId} 未找到`,
      },
    };
  }

  // Determine type category
  const typeCat = typeCategory(typeRow.type);
  const expectedCat = KIND_CATEGORY[template.kind];
  if (expectedCat !== "any" && (!typeCat || typeCat !== expectedCat)) {
    return {
      ok: false,
      error: {
        code: "type_mismatch",
        message: `类型 ${params.typeId} 与模板种类 ${template.kind} 不兼容`,
      },
    };
  }

  if (
    template.kind === "money" &&
    ((typeRow.name ?? typeRow.type).toUpperCase() !== "DECIMAL" ||
      (params.scale !== undefined && params.scale !== 2))
  ) {
    return {
      ok: false,
      error: {
        code: "MONEY_TYPE",
        message: "金额模板固定使用 DECIMAL，且小数位必须为 2",
      },
    };
  }

  // Validate numeric parameters (same logic as createTemplate)
  const issues: any[] = [];
  const precision = params.precision ?? null;
  const scale = params.scale ?? null;
  const maxLength = params.maxLength ?? null;

  if (precision !== null) {
    if (!isPositiveInteger(precision)) {
      issues.push({ field: "precision", message: "精度必须为正整数" });
    }
  }
  if (scale !== null) {
    if (!isNonNegativeInteger(scale)) {
      issues.push({ field: "scale", message: "小数位必须为非负整数" });
    } else if (precision !== null && scale > precision) {
      issues.push({ field: "scale", message: "小数位不能大于精度" });
    }
  }
  if (maxLength !== null) {
    if (!isPositiveInteger(maxLength)) {
      issues.push({ field: "maxLength", message: "最大长度必须为正整数" });
    }
  }

  if (issues.length) {
    return {
      ok: false,
      error: { code: "invalid_params", message: "参数校验失败", issues },
    };
  }

  // Apply defaults for money kind (same as createTemplate)
  const finalPrecision =
    template.kind === "money" ? (precision ?? 18) : precision;
  const finalScale = template.kind === "money" ? (scale ?? 2) : scale;
  const finalMaxLength = template.kind === "money" ? null : maxLength;

  // Determine new version number
  const maxExisting = template.versions.reduce(
    (max, v) => (v.version > max ? v.version : max),
    0,
  );
  const newVersionNumber = maxExisting + 1;

  const newVersion: TemplateVersion = {
    version: newVersionNumber,
    createdAt: new Date().toISOString(),
    typeId: params.typeId,
    precision: finalPrecision,
    scale: finalScale,
    maxLength: finalMaxLength,
  };

  const newState = withDraftMutations(state, (draft) => {
    const tmpl = draft.business!.templates.find(
      (t) => t.templateId === params.templateId,
    )!;
    tmpl.versions.push(newVersion);
  });

  return { ok: true, state: newState, templateId: params.templateId };
}

export function deleteTemplate(state: WorkspaceState, templateId: string) {
  const t = state.draft.business?.templates.find(
    (t) => t.templateId === templateId,
  );
  if (!t)
    return {
      ok: false as const,
      error: { code: "TEMPLATE_NOT_FOUND", message: "模板不存在" },
    };
  if (t.kind === "money")
    return {
      ok: false as const,
      error: { code: "MONEY_TEMPLATE", message: "金额基础模板不能删除" },
    };
  if (
    state.draft.business!.assignments.some((a) => a.templateId === templateId)
  )
    return {
      ok: false as const,
      error: {
        code: "TEMPLATE_IN_USE",
        message: "仍有字段采用此模板（包括旧版本），请先解除采用关系",
      },
    };
  return {
    ok: true as const,
    state: withDraftMutations(state, (d) => {
      d.business!.templates = d.business!.templates.filter(
        (t) => t.templateId !== templateId,
      );
    }),
  };
}
