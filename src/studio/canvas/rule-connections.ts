import { nextRelationName } from "../domain/relation-names";
import { encodeFieldHandle, decodeFieldHandle } from "./field-handle";
import type {
  Rule,
  BusinessDocument,
  ExprToken,
  Mapping,
} from "../contracts/business";
import type { CatalogSnapshot } from "../contracts/catalog";

/**
 * Re‑export the pure field‑handle helpers so FlowCanvas can use them
 * without pulling in React.
 */
export { encodeFieldHandle, decodeFieldHandle };

/**
 * Create a private, fully‑qualified Rule candidate from a connection
 * drawn on the canvas.
 *
 * @param params
 *   - sourceHandle: encoded field handle for the source field
 *   - targetHandle: encoded field handle for the target field
 *   - flowId: the flow that the connection belongs to
 *   - kind: either 'mapping' or 'matching'
 * @param business   the current business document
 * @param catalog    the current catalog snapshot
 *
 * @returns a new Rule object (with a fresh UUID) or null if the
 *          connection is invalid (missing refs/fields or cross‑flow).
 *
 * The returned Rule is *private* – it has a sequential default name and uses the
 * default logic.  It is never persisted; the caller is responsible for
 * passing it to the UI for confirmation.
 */
export function connectionToRuleCandidate(
  params: {
    sourceHandle: string;
    targetHandle: string;
    flowId: string;
    kind: "mapping" | "matching";
  },
  business: BusinessDocument,
  catalog: CatalogSnapshot,
  namePrefix = "关系",
): Rule | null {
  const { sourceHandle, targetHandle, flowId, kind } = params;

  // Decode handles into field tuples
  const source = decodeFieldHandle(sourceHandle);
  const target = decodeFieldHandle(targetHandle);
  if (!source || !target) return null;

  // Find the referenced TableRefs
  const sourceRef = business.refs.find((r) => r.refId === source.refId);
  const targetRef = business.refs.find((r) => r.refId === target.refId);
  if (!sourceRef || !targetRef) return null;

  // Ensure both refs belong to the same flow
  if (sourceRef.flowId !== flowId || targetRef.flowId !== flowId) return null;

  // Validate that the fields exist in the catalog and belong to the correct tables
  const sourceField = catalog.fields.find(
    (f) => f.id === source.fieldId && f.tableId === sourceRef.tableId,
  );
  const targetField = catalog.fields.find(
    (f) => f.id === target.fieldId && f.tableId === targetRef.tableId,
  );
  if (!sourceField || !targetField) return null;

  // Build a new private Rule
  const ruleId = crypto.randomUUID();
  const baseRule: Omit<Rule, "mappings" | "conditions"> = {
    ruleId,
    flowId,
    name: nextRelationName(business, flowId, namePrefix),
    note: "",
    logic: "ALL",
  };

  if (kind === "mapping") {
    const mapping: Mapping = {
      id: crypto.randomUUID(),
      target,
      expr: [
        {
          kind: "field",
          refId: source.refId,
          fieldId: source.fieldId,
        } as ExprToken,
      ],
      note: "",
    };
    return {
      ...baseRule,
      conditions: [],
      mappings: [mapping],
    };
  } else {
    const condition = {
      id: crypto.randomUUID(),
      left: source,
      right: target,
    };
    return {
      ...baseRule,
      conditions: [condition],
      mappings: [],
    };
  }
}
