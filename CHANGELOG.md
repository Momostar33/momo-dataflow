# Release notes

## 0.1.0-beta.3 — 2026-11-27

- Update react-router-dom/react-router from 6.30.6 to 7.18.7 to fix the remaining advisories; npm audit reports 0 known vulnerabilities for the final lockfile.
- Preserve React 18, existing BrowserRouter/Routes, local persistence and all business schema contracts.
- Clarify draft versus persisted save, deletion timing and whole-rule cleanup, package-v1 limits and Node requirements in README/user guidance.
- Preserve the beta.2 validation snapshot separately.
- Validation: reproducible npm ci, 336 tests in 24 files, public-entry typecheck and production bundle passed. Browser regression covers retained designs, navigation confirmation/cancel/save-and-leave, flow deep-link reload, overview, attribution and removed ERD redirect. Bundle/deprecation warnings remain; zero known dependency advisories does not mean full security or business acceptance.

See [beta.3 release notes](docs/releases/v0.1.0-beta.3.md) and [validation](docs/VALIDATION.md).

## 0.1.0-beta.2 — 2026-11-27

- Confirmed field deletion with dependent-rule, foreign-key and index cleanup; confirmed design-library deletion.
- JSON file selection and window drop with preview before import; field-template naming and fixed money precision.
- Connection-scoped rule editing, numbered relation names, field drag/click insertion and two-column selectors.
- Resizable/collapsible properties panel and automatic read-only overview layout.
- README rewritten around the StackRender derivative scope, original provenance and current limitations; unchanged upstream README archived.
- Security dependency updates with explicit lockfile and two scoped overrides; React 18 and business schema unchanged.
- Validation: reproducible npm ci, 336 tests in 24 files, public-entry typecheck and production bundle passed. Browser checks cover import, persistence, dependent deletion, overview, attribution and final updated-dependency save/reload. npm audit: 0 critical/high, 2 moderate React Router advisories remain; see [beta.2 validation](docs/releases/validation-v0.1.0-beta.2.md).

See [release notes](docs/releases/v0.1.0-beta.2.md) for usage and limitations. This is a preview, not a full JSON round-trip solution or business acceptance.

## 0.1.0-beta.1 — 2026-11-27

- First independent Momo DataFlow preview, derived from StackRender through Momo Plus.
- Business-focused interface: tables/fields, reusable type templates, business flows and read-only overview. The original StackRender ERD window is no longer routed or exposed.
- A standalone blank MySQL-design library creation path works without the removed ERD window.
- Separate local port 4327 and SQLite filename; no automatic migration from another browser origin.
- Generic package-v1 example and documentation; no private business files, browser data or automation history included.
- Formulas and trigger lines are descriptive only. JSON v1 does not import them, and complete JSON export/round-trip and merging are not implemented.

Validation: 304 tests in 19 files passed, including 3 new blank-design cases; the public application entry dependency graph passed TypeScript checks. Unused upstream legacy modules remain outside that application check. Vite production build passed. Browser smoke passed on a fresh origin: create library/table/DECIMAL(18,2) field/business flow, save/reload, redirect removed ERD route, and view attribution/license. Initialization now waits for the type catalog before loading the workspace; no production business acceptance is claimed.
