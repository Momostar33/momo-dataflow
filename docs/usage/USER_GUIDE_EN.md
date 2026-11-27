# Momo DataFlow user guide

v0.1.0-beta.4 · 2026-11-27. An independent StackRender derivative; see [NOTICE](../../NOTICE.md) and [LICENSE](../../LICENSE).

## Start and choose a language

Follow the root README, then open `http://127.0.0.1:4327`. The header language selector offers **中文** and **English**. Chinese is the initial default; your selection is remembered for this browser origin. Changing it does not translate or modify your own names, notes, expressions or IDs, and does not intentionally discard open editor drafts.

Choose **New design library**, or import an example from this repository. Libraries use MySQL design metadata, without a real database connection. The four sections are **Tables and fields**, **Field templates**, **Business flows**, and **Relationship overview**. The original ERD window is absent.

## Tables and templates

A table has a technical name, display name and notes. Define fields once and reuse them through table references. Field templates standardize SQL types and parameters; money uses `DECIMAL(18,2)`. Preview and confirm before applying template changes to existing fields. Importing a source snapshot retains its actual source precision.

Deleting a field previews dependent relationships, indexes and rules. Affected business rules are removed whole rather than silently dropping one condition. Other fields, tables, flows and shared templates remain. Hiding a canvas field is only a display change.

## Flows and formulas

Create a separate flow for each business module, such as Purchasing or Receiving. Add steps/start/end/decision nodes, then drag existing tables into business steps. A table can be referenced in multiple places without copying its definition.

Connecting two steps fixes the endpoints; edit its name and notes on the right. Connecting two fields prefills the participating table references. Add conditions or mappings only within that scope. Sequential relationship names are editable; switching language does not rename existing relationships.

Conditions support match-all (AND) and match-any (OR). A mapping describes `target = source expression`, with direct assignment, arithmetic and parentheses. Choose a table and field, drag a field from an expanded table into the formula, or use ⌘-click on Mac / Ctrl-click elsewhere. Type operators yourself. Validation still checks references and syntax. Nothing is calculated, and Excel functions are not supported.

Resize the properties panel using its left edge, or collapse it. Use **Save relationship** to apply editor changes to the workspace draft, then the header **Save** to persist.

## Overview and local data

The overview reads the last saved snapshot, automatically arranges tables and can filter by business flow. It does not edit field relationships or write overview positions back into the flow canvas. Open the owning flow to make changes.

Data lives in this browser profile and origin, in `momo-dataflow.sqlite`. Keep the same address and profile. `localhost`, `127.0.0.1` and different ports are separate origins. Check for **Saved** before closing the service. Clearing site data deletes designs.

Autosave defaults to five minutes and is adjustable. Form **Apply** / **Save relationship** updates the draft first; successful header Save/autosave persists it. Deleting a field follows draft/save behavior. **Delete library** asks for confirmation and persists immediately, with no trash; it keeps other libraries, shared templates and source JSON files. Handle existing unsaved edits before deleting.

## JSON and agents

Choose a JSON file or drop one into the window/import dialog. Maximum size: 30 MiB. Preview before confirmation. Package v1 appends a new library; duplicates are rejected instead of merged. JSON source files and browser edits do not synchronize, and complete design-package export is not implemented.

Package v1 supports ordinary steps, table references and field equality conditions. It cannot import formula mappings, decision nodes or flow transitions. Use [the JSON guide](DESIGN_PACKAGE_JSON_EN.md), [agent guide](AGENT_GUIDE.md), [Schema](design-package-v1.schema.json) and [task template](templates/design-package-task.md). The native `npm run validate:design -- /path/file.json` command is read-only and is not browser import or business acceptance.

## Report an issue

Include the action, expected/actual behavior, browser version and a minimal fictional example. Never submit credentials, real business designs or browser database dumps. If saving fails, retain the draft and inspect the error; do not clear site data as a recovery step.
