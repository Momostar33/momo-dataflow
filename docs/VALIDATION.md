# Preview validation — 2026-11-27

- `npm test`: 19 files / 304 assertions passed, including three independent blank-design cases. Test caching is disabled so a read-only shared dependency cache is not written.
- `npm run typecheck`: passed for the public application's main-entry dependency graph, including Vite client types. Unused inherited ERD modules are outside that graph; no claim of a clean full historical tree is made.
- `npm run build`: passed. Vite reports a large application chunk and an existing mixed static/dynamic import; these are disclosed bundle warnings, not functional acceptance of real business rules.
- Fresh Chromium origin smoke: type initialization finishes before the first workspace load; create an empty design, a table, a decimal(18,2) field and a business flow; save and reload retains them. Original ERD URLs redirect to the table catalog. About links to upstream/source and the unchanged AGPL text.
- LICENSE matches the inherited original byte-for-byte; public LICENSE.txt is identical. Generic JSON example is unchanged from the previously validated import example. Markdown file links checked.
- Only selected source/assets, generic documentation and tests are included. No Git history, automation runs, private business designs, browser databases, credentials or internal host paths are shipped.

This is a local-first preview, not a production business calculation service or a full JSON round-trip/export solution. Browser smoke uses fictional data in a separate origin, never the author's daily workspace.
