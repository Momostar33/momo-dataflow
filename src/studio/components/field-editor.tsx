import { uiError, uiText, useUiLanguage } from "../i18n";
import { useState, useEffect } from "react";
import { useMomoWorkspace } from "../state/momo-view";
import { addField } from "../domain/catalog-fields";
import {
  applyFieldPatch,
  FieldPatchChanges,
} from "../projection/catalog-patch";
import { validateFieldTypeChange } from "../domain/rule-validation";
import { FieldTemplatePicker } from "./field-template-picker";
import { deepFreeze } from "../state/workspace-state";
import { emptyBusinessDocument } from "../contracts/business";
/**
 * Props for {@link FieldEditor}.
 *
 * @param tableId   The table that the field belongs to.
 * @param fieldId   Optional field id. If omitted a new field will be created.
 * @param onApplied Called with the field id when the operation succeeds.
 * @param onCancel  Called when the user cancels the edit.
 */
export interface FieldEditorProps {
  tableId: string;
  fieldId?: string;
  onApplied?: (id: string) => void;
  onCancel?: () => void;
}
/**
 * FieldEditor renders a form for creating or editing a field.
 *
 * The form contains all editable properties of a field:
 * name, displayName, note, typeId, precision, scale, maxLength,
 * nullable, isPrimary, unique, defaultValue.
 *
 * On apply the component validates the final type configuration
 * with {@link validateFieldTypeChange} before committing the change.
 * For new fields the component performs an addField followed by
 * an applyFieldPatch inside a single {@link ctx.applyOperation} call.
 *
 * Test IDs:
 * - edit-field
 * - field-name
 * - field-label
 * - field-note
 * - field-type
 * - field-precision
 * - field-scale
 * - field-length
 * - field-apply
 * - field-cancel
 */
export function FieldEditor({
  tableId,
  fieldId,
  onApplied,
  onCancel,
}: FieldEditorProps): JSX.Element {
  useUiLanguage();
  const ctx = useMomoWorkspace();
  const { state } = ctx;
  const { catalog } = state.draft;
  // Find existing field if editing
  const existingField = fieldId
    ? catalog.fields.find((f) => f.id === fieldId)
    : undefined;
  // Local form state
  const [name, setName] = useState(existingField?.name ?? "");
  const [displayName, setDisplayName] = useState(
    fieldId ? (state.draft.metadata.fieldDisplayNames[fieldId] ?? "") : "",
  );
  const [note, setNote] = useState(existingField?.note ?? "");
  const [typeId, setTypeId] = useState(existingField?.typeId ?? null);
  const [precision, setPrecision] = useState<number | null>(
    existingField?.precision ?? null,
  );
  const [scale, setScale] = useState<number | null>(
    existingField?.scale ?? null,
  );
  const [maxLength, setMaxLength] = useState<number | null>(
    existingField?.maxLength ?? null,
  );
  const [nullable, setNullable] = useState<boolean | null>(
    existingField?.nullable ?? null,
  );
  const [isPrimary, setIsPrimary] = useState<boolean | null>(
    existingField?.isPrimary ?? null,
  );
  const [unique, setUnique] = useState<boolean | null>(
    existingField?.unique ?? null,
  );
  const [defaultValue, setDefaultValue] = useState<string | null>(
    existingField?.defaultValue ?? null,
  );
  const [error, setError] = useState<string | null>(null);
  const assignment = state.draft.business?.assignments.find(
    (a) => a.fieldId === fieldId,
  );
  // Template selection state
  const [selectedTemplateId, setSelectedTemplateId] = useState<
    string | undefined
  >(assignment?.templateId);
  const [selectedTemplateVersion, setSelectedTemplateVersion] = useState<
    number | undefined
  >(assignment?.appliedVersion);
  // Reset form when fieldId changes
  useEffect(() => {
    const f = fieldId
      ? catalog.fields.find((ff) => ff.id === fieldId)
      : undefined;
    setName(f?.name ?? "");
    setDisplayName(
      fieldId ? (state.draft.metadata.fieldDisplayNames[fieldId] ?? "") : "",
    );
    setNote(f?.note ?? "");
    setTypeId(f?.typeId ?? null);
    setPrecision(f?.precision ?? null);
    setScale(f?.scale ?? null);
    setMaxLength(f?.maxLength ?? null);
    setNullable(f?.nullable ?? null);
    setIsPrimary(f?.isPrimary ?? null);
    setUnique(f?.unique ?? null);
    setDefaultValue(f?.defaultValue ?? null);
    setSelectedTemplateId(assignment?.templateId);
    setSelectedTemplateVersion(assignment?.appliedVersion);
    setError(null);
  }, [fieldId, catalog.fields, state.draft.metadata]);
  const handleApply = () => {
    // Determine if type validation is needed
    let typeValidationNeeded = false;
    if (fieldId && existingField) {
      // Only validate when typeId actually changes
      typeValidationNeeded =
        typeId !== existingField.typeId ||
        precision !== existingField.precision ||
        scale !== existingField.scale ||
        maxLength !== existingField.maxLength;
    }
    if (typeValidationNeeded) {
      const finalChange = {
        fieldId: fieldId ?? "",
        typeId,
        precision,
        scale,
        maxLength,
      };
      const issues = validateFieldTypeChange(
        { catalog, business: state.draft.business },
        finalChange,
      );
      if (issues.length > 0) {
        setError(issues[0].message);
        return;
      }
    }
    // Validate selected template existence
    if (selectedTemplateId && selectedTemplateVersion !== undefined) {
      const tmpl = state.draft.business?.templates.find(
        (t) => t.templateId === selectedTemplateId,
      );
      if (!tmpl) {
        setError("Template not found");
        return;
      }
      const tmplVer = tmpl.versions.find(
        (v) => v.version === selectedTemplateVersion,
      );
      if (!tmplVer) {
        setError("Template version not found");
        return;
      }
    }
    // Prepare patch changes
    const patchChanges: FieldPatchChanges = {
      name,
      displayName,
      note,
      typeId,
      precision,
      scale,
      maxLength,
      nullable,
      isPrimary,
      unique,
      defaultValue,
    };
    // Perform operation in a single callback
    const result = ctx.applyOperation((state) => {
      if (!fieldId) {
        // New field
        const addResult = addField(state, {
          tableId,
          name,
          note,
          displayName,
          typeId,
          precision,
          scale,
          // maxLength is not part of AddFieldArgs; it will be set via patch
        });
        if (!addResult.ok) return addResult;
        const newFieldId = addResult.fieldId;
        const patchResult = applyFieldPatch(addResult.state, {
          fieldId: newFieldId,
          changes: {
            nullable,
            isPrimary,
            unique,
            defaultValue,
            maxLength, // apply maxLength via patch
          },
        });
        if (!patchResult.ok) return patchResult;
        // Assignment handling
        if (selectedTemplateId && selectedTemplateVersion !== undefined) {
          const existingAssignments =
            patchResult.state.draft.business?.assignments ?? [];
          const newAssignments = [...existingAssignments];
          newAssignments.push({
            fieldId: newFieldId,
            templateId: selectedTemplateId,
            appliedVersion: selectedTemplateVersion,
          });
          const existingBusiness =
            patchResult.state.draft.business ?? emptyBusinessDocument();
          const newBusiness = {
            ...existingBusiness,
            assignments: newAssignments,
          };
          const newDraft = {
            ...patchResult.state.draft,
            business: newBusiness,
          };
          deepFreeze(newDraft);
          const newState = { ...patchResult.state, draft: newDraft };
          onApplied?.(newFieldId);
          return { ok: true, state: newState };
        }
        onApplied?.(newFieldId);
        return { ok: true, state: patchResult.state };
      } else {
        // Edit existing field
        const patchResult = applyFieldPatch(state, {
          fieldId,
          changes: patchChanges,
        });
        if (!patchResult.ok) return patchResult;
        if (
          assignment &&
          !selectedTemplateId &&
          patchResult.state.draft.business
        ) {
          const nextDraft = {
            ...patchResult.state.draft,
            business: {
              ...patchResult.state.draft.business,
              assignments: patchResult.state.draft.business.assignments.filter(
                (a) => a.fieldId !== fieldId,
              ),
            },
          };
          deepFreeze(nextDraft);
          onApplied?.(fieldId);
          return {
            ok: true,
            state: { ...patchResult.state, draft: nextDraft },
          };
        }
        // Assignment handling
        if (selectedTemplateId && selectedTemplateVersion !== undefined) {
          const existingAssignments =
            patchResult.state.draft.business?.assignments ?? [];
          const idx = existingAssignments.findIndex(
            (a) => a.fieldId === fieldId,
          );
          const newAssignments = [...existingAssignments];
          if (idx >= 0) {
            newAssignments[idx] = {
              fieldId,
              templateId: selectedTemplateId,
              appliedVersion: selectedTemplateVersion,
            };
          } else {
            newAssignments.push({
              fieldId,
              templateId: selectedTemplateId,
              appliedVersion: selectedTemplateVersion,
            });
          }
          const existingBusiness =
            patchResult.state.draft.business ?? emptyBusinessDocument();
          const newBusiness = {
            ...existingBusiness,
            assignments: newAssignments,
          };
          const newDraft = {
            ...patchResult.state.draft,
            business: newBusiness,
          };
          deepFreeze(newDraft);
          const newState = { ...patchResult.state, draft: newDraft };
          onApplied?.(fieldId);
          return { ok: true, state: newState };
        }
        onApplied?.(fieldId);
        return { ok: true, state: patchResult.state };
      }
    });
    if (!result.ok) setError(result.error.message);
  };
  // Build type options
  const typeOptions = [
    { value: "", label: "None" },
    ...catalog.dataTypes
      .filter((dt) => dt.id !== null)
      .map((dt) => ({ value: dt.id!, label: dt.name ?? dt.type })),
  ];
  // Include current unknown type if not in list
  if (typeId && !catalog.dataTypes.some((dt) => dt.id === typeId)) {
    const current = catalog.dataTypes.find((dt) => dt.id === typeId);
    if (current) {
      typeOptions.push({ value: current.id!, label: current.type });
    }
  }
  const handleTemplateSelect = (templateId: string, version: number) => {
    const template = state.draft.business?.templates.find(
      (t) => t.templateId === templateId,
    );
    const defaults = template?.versions.find((v) => v.version === version);
    if (!defaults) {
      setError(uiText("字段模板版本不存在"));
      return;
    }
    setTypeId(defaults.typeId);
    setPrecision(defaults.precision);
    setScale(defaults.scale);
    setMaxLength(defaults.maxLength);
    setSelectedTemplateId(templateId);
    setSelectedTemplateVersion(version);
    setError(null);
  };
  return (
    <div
      data-testid="edit-field"
      style={{ border: "1px solid #ddd", padding: "8px", marginTop: "8px" }}
    >
      <h4>{fieldId ? uiText("编辑字段") : uiText("新建字段")}</h4>
      {error && <div style={{ color: "red" }}>{uiError(error)}</div>}
      <div>
        <label>
          {uiText("技术字段名:")}
          <input
            data-testid="field-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
      </div>
      <div>
        <label>
          {uiText("说明名称:")}
          <input
            data-testid="field-label"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </label>
      </div>
      <div>
        <label>
          {uiText("备注:")}
          <input
            data-testid="field-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
      </div>
      <div>
        <label>
          {uiText("技术类型:")}
          <select
            data-testid="field-type"
            disabled={!!selectedTemplateId}
            value={typeId ?? ""}
            onChange={(e) => setTypeId(e.target.value || null)}
          >
            {typeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div>
        <label>
          {uiText("总精度:")}
          <input
            data-testid="field-precision"
            disabled={!!selectedTemplateId}
            type="number"
            value={precision ?? ""}
            onChange={(e) =>
              setPrecision(e.target.value ? Number(e.target.value) : null)
            }
          />
        </label>
      </div>
      <div>
        <label>
          {uiText("小数位:")}
          <input
            data-testid="field-scale"
            disabled={!!selectedTemplateId}
            type="number"
            value={scale ?? ""}
            onChange={(e) =>
              setScale(e.target.value ? Number(e.target.value) : null)
            }
          />
        </label>
      </div>
      <div>
        <label>
          {uiText("字符长度:")}
          <input
            data-testid="field-length"
            disabled={!!selectedTemplateId}
            type="number"
            value={maxLength ?? ""}
            onChange={(e) =>
              setMaxLength(e.target.value ? Number(e.target.value) : null)
            }
          />
        </label>
      </div>
      <div>
        <label>
          {uiText("允许为空:")}
          <input
            type="checkbox"
            checked={nullable ?? false}
            onChange={(e) => setNullable(e.target.checked)}
          />
        </label>
      </div>
      <div>
        <label>
          {uiText("主键:")}
          <input
            type="checkbox"
            checked={isPrimary ?? false}
            onChange={(e) => setIsPrimary(e.target.checked)}
          />
        </label>
      </div>
      <div>
        <label>
          {uiText("唯一:")}
          <input
            type="checkbox"
            checked={unique ?? false}
            onChange={(e) => setUnique(e.target.checked)}
          />
        </label>
      </div>
      <div>
        <label>
          {uiText("默认值:")}
          <input
            data-testid="field-default"
            value={defaultValue ?? ""}
            onChange={(e) => setDefaultValue(e.target.value || null)}
          />
        </label>
      </div>
      <div style={{ marginTop: "8px" }}>
        <button data-testid="field-apply" onClick={handleApply}>
          {uiText("应用")}
        </button>
        <button
          data-testid="field-cancel"
          onClick={onCancel}
          style={{ marginLeft: "8px" }}
        >
          {uiText("取消")}
        </button>
      </div>
      <div style={{ marginTop: "12px" }}>
        <FieldTemplatePicker
          fieldId={fieldId}
          onSelect={handleTemplateSelect}
          onClear={() => {
            setSelectedTemplateId(undefined);
            setSelectedTemplateVersion(undefined);
          }}
        />
        {selectedTemplateId && (
          <p>
            {uiText(
              "已采用字段模板；技术类型、精度和小数位由模板统一设置。模板新版须预览确认后批量更新。",
            )}
          </p>
        )}
      </div>
    </div>
  );
}
