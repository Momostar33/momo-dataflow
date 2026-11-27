# Design package task / 设计包任务模板

Use with [AGENT_GUIDE](../AGENT_GUIDE.md), [Schema](../design-package-v1.schema.json) and the [example](../examples/design-package-v1.example.json). This is agent input, not an importable JSON file.

## 1. Goal / 本次目标

- Business module and purpose:
- Output path outside the public tool repository, unless publishing a fictional example:
- Deliverable: new design / source revision for review / separate importable library revision:
- Allowed actions and files:
- Excluded actions: no real database writes, no execution/deployment or publishing unless separately authorized.

## 2. Sources and confirmation / 来源与确认

| Source path or reference | Version / captured time | Confirmed, snapshot, or proposal | Authority / unresolved issue |
| --- | --- | --- | --- |
| Fill in | Fill in | Fill in | Fill in |

- Existing JSON path and user changes that must be preserved:
- Browser-only edits available? If not, stop before promising re-import preserves them.
- Conflicting source definitions / missing business decisions:

## 3. Table and field definitions / 表与字段

| Table technical name | Display name / notes | Field name / stable UUID | SQL base type | Precision / scale / length | Primary / nullable / default | Source / units / confirmation |
| --- | --- | --- | --- | --- | --- | --- |
| Fill in | Fill in | Fill in | Fill in | Fill in | Fill in | Fill in |

- Preserve source precision and IDs; do not infer currency, units, keys or preferred templates.
- Identify actual redundancy versus deliberate snapshots, event facts or idempotency keys before suggesting removal.

## 4. Business modules and relationships / 流程与关系

| Flow | Ordinary step | Referenced tables | Left ref/field | Right ref/field | ALL / ANY | Confirmed business meaning |
| --- | --- | --- | --- | --- | --- | --- |
| Fill in | Fill in | Fill in | Fill in | Fill in | Fill in | Fill in |

- Reuse table definitions through refs; distinguish repeated table instances in different steps.
- Physical foreign keys and indexes: evidence, complete endpoints, cardinality and actions; otherwise `[]`.
- Formula/decision/trigger requirements: document in notes for review and later UI editing. Do not encode them in package v1 mappings/transitions.

## 5. IDs and import strategy / ID与导入策略

- Existing entity IDs to preserve:
- New IDs and source→revision mapping if a new library revision is explicitly requested:
- New library name and collision checks:
- Source revision is not a browser overwrite. List unresolved merge/re-import choices.

## 6. Validation and acceptance / 校验与验收

```sh
npm run validate:design -- /absolute/path/to/output.stackrender.json
```

- All required keys/arrays, UUID uniqueness and endpoint ownership validated.
- SQL types/parameters and original units/precision preserved; unknown types reported.
- Source files remain unchanged unless explicitly targeted. No browser or business database data written by validation.
- Report actual command/result and a concise change list. Only explicit business confirmation counts as acceptance.
