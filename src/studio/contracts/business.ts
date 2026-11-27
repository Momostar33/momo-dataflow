export const BUSINESS_SCHEMA_VERSION = 2 as const;

export interface TypeParams {
  typeId: string | null;
  precision: number | null;
  scale: number | null;
  maxLength: number | null;
}

export interface TemplateVersion extends TypeParams {
  version: number;
  createdAt: string;
}

export interface Template {
  templateId: string;
  name: string;
  kind: "money" | "int" | "text" | "datetime" | "custom";
  note: string;
  versions: TemplateVersion[];
}

export interface FieldTemplateAssignment {
  fieldId: string;
  templateId: string;
  appliedVersion: number;
}

export type StepKind = "step" | "start" | "end" | "decision";
export interface FlowTransition {
  transitionId: string;
  sourceStepId: string;
  targetStepId: string;
  kind: "sequence" | "trigger";
  label: string;
  condition: string;
  note: string;
}

export interface Step {
  /** Optional v2 extension: absent on saved documents means ordinary step. */
  kind?: StepKind;
  stepId: string;
  name: string;
  note: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Flow {
  flowId: string;
  databaseId: string;
  name: string;
  note: string;
  steps: Step[];
  transitions?: FlowTransition[];
}

export interface TableRef {
  refId: string;
  flowId: string;
  stepId: string;
  tableId: string;
  x: number;
  y: number;
  collapsed: boolean;
  visibleFieldIds?: string[];
}

export interface FieldToken {
  refId: string;
  fieldId: string;
}

export type ExprToken =
  | { kind: "field"; refId: string; fieldId: string }
  | { kind: "op"; value: string }
  | { kind: "num"; value: string }
  | { kind: "text"; value: string };

export interface Condition {
  id: string;
  left: FieldToken | null;
  right: FieldToken | null;
}

export interface Mapping {
  id: string;
  target: FieldToken | null;
  expr: ExprToken[];
  note: string;
}

export interface Rule {
  ruleId: string;
  flowId: string;
  name: string;
  note: string;
  logic: "ALL" | "ANY";
  conditions: Condition[];
  mappings: Mapping[];
}

export interface BusinessDocument {
  schemaVersion: 2;
  templates: Template[];
  assignments: FieldTemplateAssignment[];
  flows: Flow[];
  refs: TableRef[];
  rules: Rule[];
  settings: {
    autosaveMinutes: number;
  };
}

export function emptyBusinessDocument(): BusinessDocument {
  return {
    schemaVersion: 2,
    templates: [],
    assignments: [],
    flows: [],
    refs: [],
    rules: [],
    settings: {
      autosaveMinutes: 5,
    },
  };
}
