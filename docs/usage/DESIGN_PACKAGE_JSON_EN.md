# Importable design package JSON v1

This is the public import format, not the application's internal `BusinessDocument` schema v2. Preserve the compatibility identifier `stackrender-design-package` even though the product is called Momo DataFlow.

Use UTF-8 JSON without comments or trailing commas, with a `.json` or `.stackrender.json` filename and a maximum size of 30 MiB. Start with [the minimal example](examples/design-package-v1.example.json) or [showcase](examples/showcase-purchase.stackrender.json). [JSON Schema](design-package-v1.schema.json) describes the supported generation shape; [the native importer](../../src/studio/domain/design-import.ts) is the semantic authority.

## Root fields

| Field | Required value / role |
| --- | --- |
| `format`, `version` | `"stackrender-design-package"`, `1` |
| `packageId`, `name` | Nonempty package/version identifier and display name; packageId is not an overwrite key |
| `capturedAt`, `note` | Source capture time and source/scope/confirmation notes; do not invent confirmation |
| `database` | `{id, name, dialect:"mysql"}` for a new library |
| `tables` | Definitions: `id, name, label, note, columns` |
| `flows` | Business modules: `flowId, databaseId, name, note, steps` |
| `refs` | Table instances placed in a flow step |
| `rules` | Flow-local field equality conditions, with `logic:"ALL"` or `"ANY"` and `mappings:[]` |
| `relationships` | Evidenced physical foreign-key metadata, or `[]`; a business rule is not automatically a foreign key |
| `indexes` | `{id, tableId, name, unique, fieldIds}`, or `[]` |

Provide all collections, including empty arrays. Unknown properties are excluded from the published Schema. It is a conservative generation contract; legacy importer tolerance of extra fields is not a supported extension mechanism.

## Entities and field settings

Use UUIDs for every entity ID, including steps, references, rules and conditions. IDs must be globally unique across entity categories and must not collide with the target workspace. Keep stable IDs for the same entity when editing source for review. One table is defined once; repeated appearances use new `refs`.

Each column requires `id, name, type, note, primary, nullable, defaultValue, precision, scale, maxLength`. Optional properties: `label, unique, unsigned, autoIncrement, collate`. Default values are strings or null, never JSON numbers. Precision/scale/length are non-negative safe integers or null; when both exist, scale must not exceed precision.

For `DECIMAL(18,2)`, use `type:"decimal", precision:18, scale:2, maxLength:null`. For `VARCHAR(100)`, use `type:"varchar", maxLength:100, precision:null, scale:null`. Base type names match the MySQL type catalog or its synonyms; unknown source types remain documented rather than silently becoming text. Preserve actual source precision; money-template defaults do not authorize rewriting source snapshots.

## Flow-local references and conditions

`steps[]` needs `stepId, name, note, x, y, w, h`; `kind` is omitted or `"step"`, positive dimensions and finite coordinates. `transitions` is omitted or `[]`. Package v1 does not import decisions/start/end/trigger lines; describe any intended logic in notes for review, then edit it in the UI.

`refs[]` needs `refId, flowId, stepId, tableId, x, y, collapsed`. Positions are relative to the parent step. Optional `visibleFieldIds` contains only fields of the referenced table; omitting it shows all fields, while `[]` hides all fields. Visibility is not deletion.

A rule needs `ruleId, flowId, name, note, logic, conditions, mappings:[]`. Each condition is `{id, left:{refId,fieldId}, right:{refId,fieldId}}`. Both endpoints belong to this rule's flow, and each field belongs to the table resolved through its reference. At least one condition is required; nonempty mappings are unsupported in v1.

## Validation and re-import

```sh
npm ci
npm run validate:design -- /absolute/path/to/design.stackrender.json
```

Validation uses the native pure import planner and an in-memory MySQL type catalog; it writes no design data. Schema alone cannot check global ID uniqueness, endpoint ownership, type compatibility, aggregate field count or conflicts with the live browser workspace. The planner checks semantic rules; browser import still checks actual existing IDs, library names and persistence revision.

The format only appends a new library. Source revisions do not overwrite browser edits. If a separate revision must be re-imported, first confirm that intent, reconcile user changes, then allocate a new library name and new entity IDs with a complete endpoint remap. Changing packageId alone is insufficient. Do not promise merging, full export/round-trip or automatic synchronization.

For agent input requirements and review status, see [AGENT_GUIDE](AGENT_GUIDE.md) and [the task template](templates/design-package-task.md). The [Chinese reference](DESIGN_PACKAGE_JSON.md) contains further field-by-field detail.
