# Release notes

## 0.1.0-beta.1 — 2026-11-27

- First independent Momo DataFlow preview, derived from StackRender through Momo Plus.
- Business-focused interface: tables/fields, reusable type templates, business flows and read-only overview. The original StackRender ERD window is no longer routed or exposed.
- A standalone blank MySQL-design library creation path works without the removed ERD window.
- Separate local port 4327 and SQLite filename; no automatic migration from another browser origin.
- Generic package-v1 example and documentation; no private business files, browser data or automation history included.
- Formulas and trigger lines are descriptive only. JSON v1 does not import them, and complete JSON export/round-trip and merging are not implemented.

Validation: 304 tests in 19 files passed, including 3 new blank-design cases; the public application entry dependency graph passed TypeScript checks. Unused upstream legacy modules remain outside that application check. Vite production build passed. Browser smoke passed on a fresh origin: create library/table/DECIMAL(18,2) field/business flow, save/reload, redirect removed ERD route, and view attribution/license. Initialization now waits for the type catalog before loading the workspace; no production business acceptance is claimed.
