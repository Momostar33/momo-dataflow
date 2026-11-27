import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { statSync } from "node:fs";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const input = process.argv[2];
if (!input || process.argv.length !== 3) {
  console.error(
    "Usage: npm run validate:design -- /absolute/path/to/package.json",
  );
  process.exit(2);
}
const filename = resolve(input);
try {
  const stat = statSync(filename);
  if (
    !stat.isFile() ||
    !/\.json$/i.test(filename) ||
    stat.size > 30 * 1024 * 1024
  )
    throw Error("Choose one JSON file no larger than 30 MiB.");
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}
// Reuse the project's installed Vitest; never download or execute anything from the input.
const result = spawnSync(
  process.execPath,
  [
    resolve(root, "node_modules/vitest/vitest.mjs"),
    "run",
    "src/studio/domain/design-package-files.test.ts",
    "--disableConsoleIntercept",
  ],
  {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, MOMO_DESIGN_PACKAGE: filename },
  },
);
process.exit(result.status ?? 1);
