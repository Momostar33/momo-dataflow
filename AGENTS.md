# Momo DataFlow contributor instructions

This is an independent local-first business/data relationship design app derived from StackRender. Read README.md, NOTICE.md, docs/usage/USER_GUIDE.md and docs/usage/DESIGN_PACKAGE_JSON.md before editing the user flow or package format.

- Product scope: catalogs, type templates, business steps, table references, descriptive mappings and a read-only overview. The original ERD window is intentionally absent. Preserve the standalone blank-design creation path.
- This repository contains no operational Mini/Dagu task authorization. Do not add or recover coding queues, model credentials or private business projects.
- Preserve user data and stable IDs. JSON source files and browser SQLite are separate; current package v1 appends isolated libraries and does not merge or overwrite. Internal business schema v2 is not package v1.
- Keep original copyright and AGPL notices. Describe significant modifications and their dates. Use fictional examples, never private designs, auth/config files or browser data.
- Use the existing state operations and atomic persistence; a failed edit or import must not partially change saved data. Do not silently evaluate formulas or infer business contracts.
- Keep tests targeted to changed behavior, then run the relevant existing suite and build. Report typecheck, tests, bundling and human acceptance separately.
- Development port is 4327, separate from the author's daily workspace. Do not open or modify another site's saved data.

## Interface language and agent JSON entry

- Chinese/English interface resources live in src/studio/i18n. Translate only source-owned UI text and system messages; do not run translations over business names, labels, notes, IDs or expression data. Preserve open editor state when language changes.
- Before generating design JSON, read docs/usage/AGENT_GUIDE.md, DESIGN_PACKAGE_JSON_EN.md (or the Chinese reference), design-package-v1.schema.json, templates/design-package-task.md and the existing examples. Read the business project's confirmed sources separately.
- Use `npm run validate:design -- /absolute/path/to/file.json` for read-only native planner validation. It is not browser import, business acceptance, database migration or model execution. Package v1 cannot import formulas/transitions or merge/overwrite existing libraries.
- Keep actual private designs outside public examples. Preserve user edits/stable IDs for source revisions; do not mint a new import revision without resolving append-only behavior and the user's intent.
