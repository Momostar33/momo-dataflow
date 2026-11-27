import { uiError, uiText, useUiLanguage } from "../i18n";
import { useState, useEffect, useCallback } from "react";
import { useWorkspace } from "../state/workspace-provider";
import { useAutosave } from "../state/use-autosave";
import { withDraftMutations } from "../state/workspace-state";
/**
 * SaveSettings component allows the user to configure the autosave interval.
 *
 * - Reads the current autosaveMinutes from the workspace business settings
 *   (default 5 minutes if not set).
 * - Provides an input (data-testid="autosave-minutes") and an apply button
 *   (data-testid="autosave-settings-apply").
 * - Validates that the entered value is a positive whole number and does not
 *   exceed the maximum timer value supported by the browser.
 * - On apply, updates the business.settings.autosaveMinutes via a single
 *   atomic workspace operation (ctx.applyOperation) that uses withDraftMutations
 *   to increment the editVersion.
 * - The component calls useAutosave at the top level with the current
 *   autosaveMinutes, ensuring that changing the interval cancels the old
 *   timer and does not create duplicate submissions.
 */
export function SaveSettings({
  manageAutosave = true,
}: {
  manageAutosave?: boolean;
} = {}): JSX.Element {
  useUiLanguage();
  const ctx = useWorkspace();
  // Current autosave minutes from business settings (default 5)
  const currentMinutes =
    ctx.state.draft.business?.settings?.autosaveMinutes ?? 5;
  // Local input state (string to allow empty input)
  const [input, setInput] = useState<string>(String(currentMinutes));
  // Local error state for invalid input
  const [error, setError] = useState<string | null>(null);
  // Sync local input when context changes
  useEffect(() => {
    setInput(String(currentMinutes));
    setError(null);
  }, [currentMinutes]);
  // Maximum minutes allowed by the browser timer (2^31-1 ms)
  const MAX_MINUTES = Math.floor(2147483647 / 60000);
  // Apply the new autosave interval
  const apply = useCallback(() => {
    const parsed = Number(input);
    if (
      !Number.isFinite(parsed) ||
      parsed <= 0 ||
      !Number.isInteger(parsed) ||
      parsed > MAX_MINUTES
    ) {
      setError("Invalid minutes");
      return;
    }
    setError(null);
    ctx.applyOperation((state) => {
      const newState = withDraftMutations(state, (draft) => {
        if (!draft.business) {
          draft.business = {
            schemaVersion: 2,
            templates: [],
            assignments: [],
            flows: [],
            refs: [],
            rules: [],
            settings: { autosaveMinutes: parsed },
          };
        } else {
          draft.business.settings.autosaveMinutes = parsed;
        }
      });
      return { ok: true, state: newState };
    });
  }, [input, ctx]);
  // Hook the autosave logic with the current interval
  useAutosave({
    isDirty: manageAutosave && ctx.isDirty,
    editVersion: ctx.state.editVersion,
    minutes: currentMinutes,
    save: ctx.save,
  });
  return (
    <div data-testid="autosave-settings">
      <label>
        {uiText("自动保存间隔（分钟）:")}
        <input
          type="number"
          data-testid="autosave-minutes"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          min={1}
          max={MAX_MINUTES}
        />
      </label>
      {error && <span style={{ color: "red" }}>{uiError(error)}</span>}
      <button
        type="button"
        data-testid="autosave-settings-apply"
        onClick={apply}
      >
        {uiText("应用设置")}
      </button>
    </div>
  );
}
