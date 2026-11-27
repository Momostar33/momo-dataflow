import type { DesignPackage } from "./design-import";

/** Create an empty local design through the same atomic import contract. */
export function newDesignPackage(name: string): DesignPackage {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 255) throw new Error("设计库名称须为1–255个字符");
  const id = crypto.randomUUID();
  return {
    format: "stackrender-design-package", version: 1,
    packageId: "momo-dataflow-design-" + id,
    name: trimmed, capturedAt: new Date().toISOString(),
    note: "用户创建的空白本地设计；未连接外部数据库。",
    database: { id, name: trimmed, dialect: "mysql" },
    tables: [], flows: [], refs: [], rules: [], relationships: [], indexes: [],
  };
}
