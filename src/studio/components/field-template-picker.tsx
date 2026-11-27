import { uiError, uiText, useUiLanguage } from "../i18n";
import React, { useEffect, useState } from "react";
import { useWorkspace } from "../state/workspace-provider";
import { previewTemplateApplication } from "../domain/template-preview";
import type { Template } from "../contracts/business";
import type { ValidationIssue } from "../domain/rule-validation";
/**
 * Props for the FieldTemplatePicker component.
 *
 * - `fieldId` (optional): the id of the field for which a template is being selected.
 *   If omitted, the component will still render the list of templates but will not
 *   attempt to compute a preview or read an existing assignment.
 *
 * - `onSelect` (optional): callback invoked when the user selects a template.
 *   The callback receives the chosen `templateId` and the latest `version` number
 *   of that template.
 *
 * The component reads the current workspace state via `useWorkspace`.  It
 * displays a `<select>` element containing all available templates.  Each
 * option shows the template name, the currently applied version (if any) and
 * whether a newer version is available.  When a template is selected the
 * component calls `onSelect` with the template id and the latest version.
 *
 * If `fieldId` is provided the component also computes a preview of the
 * template application and renders any validation issues returned by
 * `previewTemplateApplication`.  The preview is recomputed whenever the
 * selected template changes or the workspace state changes.
 *
 * The component never mutates the workspace state; it only reads from it.
 */
export interface FieldTemplatePickerProps {
  fieldId?: string;
  onClear?: () => void;
  onSelect?: (templateId: string, version: number) => void;
}
export function FieldTemplatePicker({
  fieldId,
  onSelect,
  onClear,
}: FieldTemplatePickerProps) {
  useUiLanguage();
  const { state } = useWorkspace();
  // Extract templates and assignments from the business document.
  const templates: Template[] = state.draft.business?.templates ?? [];
  const assignments = state.draft.business?.assignments ?? [];
  // Find the assignment for the current field (if any).
  const assignment = fieldId
    ? assignments.find((a) => a.fieldId === fieldId)
    : undefined;
  // State for the currently selected template id.
  const [selectedTemplateId, setSelectedTemplateId] = useState<
    string | undefined
  >(assignment?.templateId);
  // State for the preview result (if fieldId is present).
  const [previewResult, setPreviewResult] = useState<
    | {
        ok: true;
        preview: import("../domain/template-preview").TemplatePreview;
      }
    | {
        ok: false;
        error: {
          code: string;
          message: string;
          issues?: ValidationIssue[];
        };
      }
    | undefined
  >(undefined);
  // Compute the latest version for a template.
  const latestVersion = (template: Template) =>
    Math.max(...template.versions.map((v) => v.version), 0);
  // Recompute preview whenever the selected template or workspace state changes.
  useEffect(() => {
    if (!fieldId || !selectedTemplateId) {
      setPreviewResult(undefined);
      return;
    }
    const template = templates.find((t) => t.templateId === selectedTemplateId);
    if (!template) {
      setPreviewResult(undefined);
      return;
    }
    const result = previewTemplateApplication(state, {
      templateId: selectedTemplateId,
      version: latestVersion(template),
      fieldIds: [fieldId],
    });
    setPreviewResult(result);
  }, [state, selectedTemplateId, fieldId, templates]);
  // Handle selection change.
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newId = e.target.value || undefined;
    setSelectedTemplateId(newId);
    if (!newId) onClear?.();
    if (newId && onSelect) {
      const tmpl = templates.find((t) => t.templateId === newId);
      if (tmpl) {
        onSelect(newId, latestVersion(tmpl));
      }
    }
  };
  // Render the select options.
  const renderOptions = () => {
    if (templates.length === 0) {
      return <option value="">No templates available</option>;
    }
    return templates.map((tmpl) => {
      const tmplLatest = latestVersion(tmpl);
      const assigned = assignment?.templateId === tmpl.templateId;
      const appliedVer = assignment?.appliedVersion ?? 0;
      const hasUpdate = assigned && appliedVer < tmplLatest;
      return (
        <option key={tmpl.templateId} value={tmpl.templateId}>
          {tmpl.name}
          {assigned
            ? ` (applied v${appliedVer}${hasUpdate ? " → v" + tmplLatest : ""})`
            : ""}
        </option>
      );
    });
  };
  return (
    <div>
      <label>
        {uiText("字段模板:")}
        <select
          data-testid="field-template-picker"
          value={selectedTemplateId ?? ""}
          onChange={handleChange}
          disabled={templates.length === 0}
        >
          <option value="">{uiText("请选择字段模板（或自定义）")}</option>
          {renderOptions()}
        </select>
      </label>

      {/* Show preview issues if any */}
      {previewResult &&
        previewResult.ok &&
        previewResult.preview.issues.length > 0 && (
          <div className="preview-issues">
            <h4>Validation Issues</h4>
            <ul>
              {previewResult.preview.issues.map((issue, idx) => (
                <li key={idx}>{uiError(issue.message)}</li>
              ))}
            </ul>
          </div>
        )}

      {/* If preview failed, show error message */}
      {previewResult && !previewResult.ok && (
        <div className="preview-error">
          <strong>Error:</strong> {uiError(previewResult.error.message)}
        </div>
      )}
    </div>
  );
}
