import { useEffect, useRef } from "react";

/**
 * Hook that automatically triggers a save operation after a configurable
 * interval when the workspace is dirty.  It respects the current
 * `editVersion` so that a failed save is not retried indefinitely for
 * the same version.  A new edit or an explicit manual save will
 * trigger a new attempt.
 *
 * @param params
 * @param params.isDirty   - true when the workspace has unsaved changes.
 * @param params.editVersion - the current edit version number.
 * @param params.minutes   - optional autosave interval in minutes (default 5).
 * @param params.save      - async function that performs the actual save.
 */
export function useAutosave({
    isDirty,
    editVersion,
    minutes = 5,
    save,
}: {
    isDirty: boolean;
    editVersion: number;
    minutes?: number;
    save: () => Promise<void>;
}): void {
    // Ref to hold the latest save function so that a change in the
    // function identity does not reset the timer.
    const saveRef = useRef<() => Promise<void>>(save);
    useEffect(() => {
        saveRef.current = save;
    }, [save]);

    // Timer id ref
    const timerIdRef = useRef<NodeJS.Timeout | null>(null);

    // In‑flight flag
    const inFlightRef = useRef(false);

    // Last editVersion that we attempted to save
    const lastAttemptedRef = useRef<number | null>(null);

    // Helper that actually performs the save if conditions allow
    const attemptSave = () => {
        if (inFlightRef.current) return;
        // Only try if we haven't already attempted this version
        if (editVersion === lastAttemptedRef.current) return;

        inFlightRef.current = true;
        lastAttemptedRef.current = editVersion;

        // Call the latest save function
        saveRef.current()
            .catch(() => {
                /* failure is intentionally ignored – the draft remains
                   untouched and we simply wait for the next interval or
                   a new editVersion to trigger another attempt. */
            })
            .finally(() => {
                inFlightRef.current = false;
            });
    };

    // Effect that manages the timer based on dirty state, interval and
    // editVersion.  Including editVersion ensures that a new edit
    // (or a failed save that increments editVersion) restarts the
    // autosave timer.
    useEffect(() => {
        // Clear any existing timer
        if (timerIdRef.current !== null) {
            clearTimeout(timerIdRef.current);
            timerIdRef.current = null;
        }

        if (!isDirty) {
            // No dirty changes – nothing to schedule
            return;
        }

        const intervalMs = Math.max(0, minutes * 60 * 1000);

        // Schedule the next autosave attempt
        timerIdRef.current = setTimeout(attemptSave, intervalMs);

        // Cleanup on unmount or when dependencies change
        return () => {
            if (timerIdRef.current !== null) {
                clearTimeout(timerIdRef.current);
                timerIdRef.current = null;
            }
        };
    }, [isDirty, minutes, editVersion]); // editVersion added to restart timer on new version

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (timerIdRef.current !== null) {
                clearTimeout(timerIdRef.current);
                timerIdRef.current = null;
            }
        };
    }, []);
}
