import type { BusinessDocument } from "../contracts/business";

/** One simple sequence per flow, shared by module and field relationships. */
export function nextRelationName(
  business: BusinessDocument | undefined,
  flowId: string,
): string {
  const names = [
    ...(business?.rules.filter((r) => r.flowId === flowId).map((r) => r.name) ??
      []),
    ...(business?.flows
      .find((f) => f.flowId === flowId)
      ?.transitions?.map((t) => t.label) ?? []),
  ];
  let max = 0;
  for (const name of names) {
    const match = /^关系([1-9]\d*)$/.exec(name.trim());
    if (match && Number.isSafeInteger(Number(match[1])))
      max = Math.max(max, Number(match[1]));
  }
  return `关系${max + 1}`;
}
