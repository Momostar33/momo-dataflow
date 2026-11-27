# Momo DataFlow contributor instructions

This is an independent local-first business/data relationship design app derived from StackRender. Read README.md, NOTICE.md, docs/usage/USER_GUIDE.md and docs/usage/DESIGN_PACKAGE_JSON.md before editing the user flow or package format.

- Product scope: catalogs, type templates, business steps, table references, descriptive mappings and a read-only overview. The original ERD window is intentionally absent. Preserve the standalone blank-design creation path.
- This repository contains no operational Mini/Dagu task authorization. Do not add or recover coding queues, model credentials or private business projects.
- Preserve user data and stable IDs. JSON source files and browser SQLite are separate; current package v1 appends isolated libraries and does not merge or overwrite. Internal business schema v2 is not package v1.
- Keep original copyright and AGPL notices. Describe significant modifications and their dates. Use fictional examples, never private designs, auth/config files or browser data.
- Use the existing state operations and atomic persistence; a failed edit or import must not partially change saved data. Do not silently evaluate formulas or infer business contracts.
- Keep tests targeted to changed behavior, then run the relevant existing suite and build. Report typecheck, tests, bundling and human acceptance separately.
- Development port is 4327, separate from the author's daily workspace. Do not open or modify another site's saved data.
