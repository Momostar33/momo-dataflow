import type {
  BusinessDocument,
  FieldToken,
  ExprToken,
} from "../contracts/business";
import type { CatalogSnapshot } from "../contracts/catalog";
export interface FieldAlias extends FieldToken {
  label: string;
}
export function fieldAliases(
  business: BusinessDocument,
  catalog: CatalogSnapshot,
): FieldAlias[] {
  const result: FieldAlias[] = [],
    counts = new Map<string, number>();
  for (const ref of business.refs) {
    const table = catalog.tables.find((t) => t.id === ref.tableId);
    const flow = business.flows.find((f) => f.flowId === ref.flowId);
    const step = flow?.steps.find((s) => s.stepId === ref.stepId);
    if (!table || !step) continue;
    for (const f of catalog.fields.filter((f) => f.tableId === table.id)) {
      const base = `${step.name}/${table.name}.${f.name}`,
        n = (counts.get(base) ?? 0) + 1;
      counts.set(base, n);
      result.push({
        refId: ref.refId,
        fieldId: f.id,
        label: base + (n > 1 ? ` #${n}` : ""),
      });
    }
  }
  return result;
}
const escaped = (s: string) =>
  s.replaceAll("\\", "\\\\").replaceAll("]", "\\]");
export function formatExpression(
  tokens: ExprToken[],
  aliases: FieldAlias[],
): string {
  return tokens
    .map((t) =>
      t.kind === "field"
        ? "[" +
          escaped(
            aliases.find((a) => a.refId === t.refId && a.fieldId === t.fieldId)
              ?.label ?? "失效字段",
          ) +
          "]"
        : t.value,
    )
    .join(" ");
}
/** A descriptive tokenizer only. Never evaluates or executes formulas. */
export function parseExpressionInput(
  input: string,
  aliases: FieldAlias[],
): { tokens: ExprToken[]; error?: string } {
  const tokens: ExprToken[] = [];
  let i = 0;
  const fail = (error: string) => ({ tokens: [] as ExprToken[], error });
  while (i < input.length) {
    const c = input[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === "[") {
      let label = "",
        closed = false;
      i++;
      while (i < input.length) {
        if (input.charCodeAt(i) === 92 && i + 1 < input.length) {
          label += input[i + 1];
          i += 2;
          continue;
        }
        if (input[i] === "]") {
          i++;
          closed = true;
          break;
        }
        label += input[i++];
      }
      if (!closed) return fail("字段引用缺少右方括号");
      const a = aliases.find((a) => a.label === label);
      if (!a) return fail("字段引用不存在，请从本流程字段中重新选择");
      tokens.push({ kind: "field", refId: a.refId, fieldId: a.fieldId });
      continue;
    }
    const number = input.slice(i).match(/^(?:\d+(?:\.\d*)?|\.\d+)/);
    if (number) {
      tokens.push({ kind: "num", value: number[0] });
      i += number[0].length;
      continue;
    }
    if ("+-*/()×÷".includes(c)) {
      tokens.push({ kind: "op", value: c === "×" ? "*" : c === "÷" ? "/" : c });
      i++;
      continue;
    }
    return fail(`第${i + 1}个字符不支持；使用字段、数字、加减乘除及括号`);
  }
  return { tokens };
}
