import type { FieldToken } from "../contracts/business";
import { formatExpression, type FieldAlias } from "./expression-input";
export const FIELD_DRAG_TYPE = "application/x-stackrender-field";

export function decodeDraggedField(raw: string): FieldToken | null {
  try {
    const t: unknown = JSON.parse(raw);
    if (
      !t ||
      typeof t !== "object" ||
      !("refId" in t) ||
      !("fieldId" in t) ||
      typeof t.refId !== "string" ||
      typeof t.fieldId !== "string"
    )
      return null;
    return { refId: t.refId, fieldId: t.fieldId };
  } catch {
    return null;
  }
}

/** Insert at the selection without deleting unfinished operators or unrelated text. */
export function insertFieldAtSelection(
  input: string,
  token: FieldToken,
  aliases: FieldAlias[],
  start = input.length,
  end = start,
) {
  if (
    !aliases.some((a) => a.refId === token.refId && a.fieldId === token.fieldId)
  )
    throw Error("只能插入当前关系两张表内的字段");
  const from = Math.max(0, Math.min(input.length, start));
  const to = Math.max(from, Math.min(input.length, end));
  const field = formatExpression([{ kind: "field", ...token }], aliases);
  const left = input.slice(0, from),
    right = input.slice(to);
  const inserted =
    (left && !/\s$/.test(left) ? " " : "") +
    field +
    (right && !/^\s/.test(right) ? " " : "");
  return {
    value: left + inserted + right,
    caret: left.length + inserted.length,
  };
}
