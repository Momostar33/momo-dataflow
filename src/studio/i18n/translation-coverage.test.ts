import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { studioEnglish } from "./messages";

describe("English workbench resource coverage", () => {
  it("provides a translation for every source-owned uiText key", () => {
    const folders = [
      "src/studio/components",
      "src/studio/canvas",
      "src/studio/overview",
    ];
    const files = folders.flatMap((folder) =>
      readdirSync(resolve(folder))
        .filter((f) => /\.tsx?$/.test(f) && !f.includes(".test."))
        .map((f) => `${folder}/${f}`),
    );
    files.push("src/providers/sync-provider/sync-provider.tsx");
    const missing: string[] = [];
    for (const file of files) {
      const source = ts.createSourceFile(
        file,
        readFileSync(resolve(file), "utf8"),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      function visit(node: ts.Node) {
        if (
          ts.isCallExpression(node) &&
          ts.isIdentifier(node.expression) &&
          node.expression.text === "uiText" &&
          node.arguments[0] &&
          ts.isStringLiteral(node.arguments[0])
        ) {
          const key = node.arguments[0].text;
          if (!studioEnglish[key]) missing.push(`${file}: ${key}`);
        }
        ts.forEachChild(node, visit);
      }
      visit(source);
    }
    expect(missing).toEqual([]);
  });
});
