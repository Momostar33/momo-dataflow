/** Real StackRender rows store SQL name separately from the semantic type category.
 * Also accept the SQL-name values used by existing saved fixtures/documents.
 * Unknown types remain unknown; never coerce them to text or numeric.
 */
export type TypeCategory = 'numeric' | 'text' | 'temporal' | 'boolean';
const categories: Record<string, TypeCategory> = {
  NUMERIC: 'numeric', INTEGER: 'numeric', INT: 'numeric', BIGINT: 'numeric', DECIMAL: 'numeric',
  TEXT: 'text', VARCHAR: 'text', TIME: 'temporal', DATE: 'temporal', DATETIME: 'temporal', BOOLEAN: 'boolean',
};
export function typeCategory(value: string | null): TypeCategory | undefined {
  return value ? categories[value.toUpperCase()] : undefined;
}
