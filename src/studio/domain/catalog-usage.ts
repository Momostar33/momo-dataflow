// src/studio/domain/catalog-usage.ts
import type { WorkspaceSnapshot } from '../state/workspace-state';
import type { BusinessDocument } from '../contracts/business';

/**
 * Usage record returned by catalogUsage.
 */
export interface Usage {
    kind: string;
    id: string;
    label: string;
    flowId?: string;
    ruleId?: string;
    refId?: string;
    fieldId?: string;
}

/**
 * Helper to collect all field tokens referenced by a rule.
 * Tokens include:
 *   - conditions[].left
 *   - conditions[].right
 *   - mappings[].target
 *   - mappings[].expr where kind === 'field'
 * Each token retains its refId and fieldId.
 */
function collectRuleFieldTokens(rule: any): { refId: string; fieldId: string }[] {
    const tokens: { refId: string; fieldId: string }[] = [];
    // mappings
    for (const m of rule.mappings ?? []) {
        if (m.target?.fieldId) {
            tokens.push({ refId: m.target.refId, fieldId: m.target.fieldId });
        }
        if (Array.isArray(m.expr)) {
            for (const e of m.expr) {
                if (e.kind === 'field') {
                    tokens.push({ refId: e.refId, fieldId: e.fieldId });
                }
            }
        }
    }
    // conditions
    for (const c of rule.conditions ?? []) {
        if (c.left?.fieldId) {
            tokens.push({ refId: c.left.refId, fieldId: c.left.fieldId });
        }
        if (c.right?.fieldId) {
            tokens.push({ refId: c.right.refId, fieldId: c.right.fieldId });
        }
    }
    return tokens;
}

/**
 * Pure query that returns all usages for a target entity.
 * @param snapshot WorkspaceSnapshot (draft)
 * @param target {kind:'table'|'field'|'database', id:string}
 */
export function catalogUsage(
    snapshot: WorkspaceSnapshot,
    target: { kind: 'table' | 'field' | 'database'; id: string }
): Usage[] {
    const catalog = snapshot.catalog;
    const business: BusinessDocument = snapshot.business ?? {
        schemaVersion: 2,
        templates: [],
        assignments: [],
        flows: [],
        refs: [],
        rules: [],
        settings: { autosaveMinutes: 5 },
    };

    const usages: Usage[] = [];

    // Helper to add usage if not already present
    const addUsage = (u: Usage) => {
        const exists = usages.some((x) => {
            if (x.kind !== u.kind || x.id !== u.id) return false;
            if (u.kind === 'rule') {
                // allow multiple rule usages with same id if fieldId differs
                return x.fieldId === u.fieldId;
            }
            return true;
        });
        if (!exists) {
            usages.push(u);
        }
    };

    // ---------- Table level ----------
    if (target.kind === 'table') {
        const table = catalog.tables.find((t) => t.id === target.id);
        if (!table) return [];

        // FK relationships involving this table
        catalog.relationships
            .filter(
                (r) =>
                    r.sourceTableId === table.id || r.targetTableId === table.id
            )
            .forEach((r) => {
                addUsage({
                    kind: 'fk',
                    id: r.id,
                    label: r.name ?? '',
                    fieldId: r.sourceFieldId,
                });
            });

        // Indexes on this table
        catalog.indices
            .filter((i) => i.tableId === table.id)
            .forEach((i) => {
                addUsage({
                    kind: 'index',
                    id: i.id,
                    label: i.name,
                });
            });

        // Business refs to this table
        business.refs
            .filter((r) => r.tableId === table.id)
            .forEach((r) => {
                addUsage({
                    kind: 'ref',
                    id: r.refId,
                    label: r.flowId,
                    flowId: r.flowId,
                    refId: r.refId,
                });
            });

        // Collect field ids of this table
        const tableFieldIds = catalog.fields
            .filter((f) => f.tableId === table.id)
            .map((f) => f.id);

        // Business rules that touch any field of this table
        business.rules.forEach((rule) => {
            const tokens = collectRuleFieldTokens(rule);
            const touchesField = tokens.some((t) => tableFieldIds.includes(t.fieldId));
            if (touchesField) {
                addUsage({
                    kind: 'rule',
                    id: rule.ruleId,
                    label: rule.name,
                    ruleId: rule.ruleId,
                });
            }
        });

        // Field-level usages for each field in this table
        catalog.fields
            .filter((f) => f.tableId === table.id)
            .forEach((f) => {
                // FK relationships involving this field
                catalog.relationships
                    .filter(
                        (r) =>
                            r.sourceFieldId === f.id || r.targetFieldId === f.id
                    )
                    .forEach((r) => {
                        addUsage({
                            kind: 'fk',
                            id: r.id,
                            label: r.name ?? '',
                            fieldId: f.id,
                        });
                    });

                // Business rules that reference this field
                business.rules.forEach((rule) => {
                    const tokens = collectRuleFieldTokens(rule);
                    const touchesField = tokens.some((t) => t.fieldId === f.id);
                    if (touchesField) {
                        addUsage({
                            kind: 'rule',
                            id: rule.ruleId,
                            label: rule.name,
                            ruleId: rule.ruleId,
                            fieldId: f.id,
                        });
                    }
                });

                // Add field usage itself
                addUsage({
                    kind: 'field',
                    id: f.id,
                    label: f.name,
                    fieldId: f.id,
                });
            });
    }

    // ---------- Field level ----------
    if (target.kind === 'field') {
        const field = catalog.fields.find((f) => f.id === target.id);
        if (!field) return [];

        // FK relationships involving this field
        catalog.relationships
            .filter(
                (r) =>
                    r.sourceFieldId === field.id || r.targetFieldId === field.id
            )
            .forEach((r) => {
                addUsage({
                    kind: 'fk',
                    id: r.id,
                    label: r.name ?? '',
                    fieldId: field.id,
                });
            });

        // Business rules that reference this field
        business.rules.forEach((rule) => {
            const tokens = collectRuleFieldTokens(rule);
            const touchesField = tokens.some((t) => t.fieldId === field.id);
            if (touchesField) {
                addUsage({
                    kind: 'rule',
                    id: rule.ruleId,
                    label: rule.name,
                    ruleId: rule.ruleId,
                    fieldId: field.id,
                });
            }
        });

        // Add field usage itself
        addUsage({
            kind: 'field',
            id: field.id,
            label: field.name,
            fieldId: field.id,
        });
    }

    // ---------- Database level ----------
    if (target.kind === 'database') {
        const database = catalog.databases.find((d) => d.id === target.id);
        if (!database) return [];

        const tablesInDb = catalog.tables.filter((t) => t.databaseId === database.id);
        const tableIds = tablesInDb.map((t) => t.id);
        const fieldsInDb = catalog.fields.filter((f) => tableIds.includes(f.tableId));
        const fieldIds = fieldsInDb.map((f) => f.id);

        // Reuse table logic for each table
        tablesInDb.forEach((t) => {
            // FK relationships involving this table
            catalog.relationships
                .filter(
                    (r) =>
                        r.sourceTableId === t.id || r.targetTableId === t.id
                )
                .forEach((r) => {
                    addUsage({
                        kind: 'fk',
                        id: r.id,
                        label: r.name ?? '',
                        fieldId: r.sourceFieldId,
                    });
                });

            // Indexes on this table
            catalog.indices
                .filter((i) => i.tableId === t.id)
                .forEach((i) => {
                    addUsage({
                        kind: 'index',
                        id: i.id,
                        label: i.name,
                    });
                });

            // Business refs to this table
            business.refs
                .filter((r) => r.tableId === t.id)
                .forEach((r) => {
                    addUsage({
                        kind: 'ref',
                        id: r.refId,
                        label: r.flowId,
                        flowId: r.flowId,
                        refId: r.refId,
                    });
                });

            // Business rules that touch any field of this table
            const tableFieldIds = catalog.fields
                .filter((f) => f.tableId === t.id)
                .map((f) => f.id);

            business.rules.forEach((rule) => {
                const tokens = collectRuleFieldTokens(rule);
                const touchesField = tokens.some((tkn) => tableFieldIds.includes(tkn.fieldId));
                if (touchesField) {
                    addUsage({
                        kind: 'rule',
                        id: rule.ruleId,
                        label: rule.name,
                        ruleId: rule.ruleId,
                    });
                }
            });

            // Field-level usages for each field in this table
            catalog.fields
                .filter((f) => f.tableId === t.id)
                .forEach((f) => {
                    // FK relationships involving this field
                    catalog.relationships
                        .filter(
                            (r) =>
                                r.sourceFieldId === f.id || r.targetFieldId === f.id
                        )
                        .forEach((r) => {
                            addUsage({
                                kind: 'fk',
                                id: r.id,
                                label: r.name ?? '',
                                fieldId: f.id,
                            });
                        });

                    // Business rules that reference this field
                    business.rules.forEach((rule) => {
                        const tokens = collectRuleFieldTokens(rule);
                        const touchesField = tokens.some((tkn) => tkn.fieldId === f.id);
                        if (touchesField) {
                            addUsage({
                                kind: 'rule',
                                id: rule.ruleId,
                                label: rule.name,
                                ruleId: rule.ruleId,
                                fieldId: f.id,
                            });
                        }
                    });

                    // Add field usage itself
                    addUsage({
                        kind: 'field',
                        id: f.id,
                        label: f.name,
                        fieldId: f.id,
                    });
                });
        });

        // Business rules that reference any field in the database
        business.rules.forEach((rule) => {
            const tokens = collectRuleFieldTokens(rule);
            const touchesField = tokens.some((tkn) => fieldIds.includes(tkn.fieldId));
            if (touchesField) {
                addUsage({
                    kind: 'rule',
                    id: rule.ruleId,
                    label: rule.name,
                    ruleId: rule.ruleId,
                });
            }
        });

        // Business refs that reference any table in the database
        business.refs
            .filter((r) => tableIds.includes(r.tableId))
            .forEach((r) => {
                addUsage({
                    kind: 'ref',
                    id: r.refId,
                    label: r.flowId,
                    flowId: r.flowId,
                    refId: r.refId,
                });
            });
    }

    // Deterministic ordering: kind then id
    usages.sort((a, b) => {
        if (a.kind < b.kind) return -1;
        if (a.kind > b.kind) return 1;
        if (a.id < b.id) return -1;
        if (a.id > b.id) return 1;
        return 0;
    });

    return usages;
}

/**
 * Legacy API that returns blocked flag and usages array.
 */
export function getCatalogUsage(
    snapshot: WorkspaceSnapshot,
    kind: 'table' | 'field' | 'database',
    id: string
): { blocked: boolean; usages: Usage[] } {
    const usages = catalogUsage(snapshot, { kind, id });
    // Blocked if any usage other than the entity's own field record exists.
    const blocked = usages.some(u => u.kind !== 'field');
    return { blocked, usages };
}

/**
 * Throws if deletion is blocked.
 */
export function assertCatalogDeletionAllowed(
    snapshot: WorkspaceSnapshot,
    kind: 'table' | 'field' | 'database',
    id: string
): void {
    const { blocked } = getCatalogUsage(snapshot, kind, id);
    if (blocked) {
        throw new Error(`Deletion blocked for ${kind} ${id}`);
    }
}
