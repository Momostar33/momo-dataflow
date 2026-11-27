import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

/**
 * Hook to guard navigation when there are unsaved changes.
 *
 * @param isDirty   Whether the current workspace has unsaved changes.
 * @param save      Function that persists the current workspace. Should return a Promise.
 * @param discard   Function that discards the current workspace (e.g., reset state).
 * @param onLeave   Optional callback invoked when navigation actually occurs.
 *
 * @returns
 *   requestLeave(to)   – call when a navigation is requested.
 *   pendingTo          – the target path that navigation is pending on.
 *   saveAndLeave()     – persist and navigate to pending target.
 *   discardAndLeave()  – discard and navigate to pending target.
 *   cancel()           – cancel the pending navigation.
 */
export function useUnsavedNavigation({
    isDirty,
    save,
    discard,
    onLeave,
}: {
    isDirty: boolean;
    save: () => Promise<void>;
    discard: () => void;
    onLeave?: (to: string) => void;
}) {
    const navigate = useNavigate();
    const location = useLocation();
    const [pendingTo, setPendingTo] = useState<string | null>(null);

    const navigateTo = useCallback(
        (to: string) => {
            navigate(to, { replace: false });
        },
        [navigate]
    );

    const requestLeave = useCallback(
        (to: string) => {
            if (!isDirty) {
                navigateTo(to);
                return;
            }
            setPendingTo(to);
        },
        [isDirty, navigateTo]
    );

    const saveAndLeave = useCallback(async () => {
        try {
            await save();
            if (pendingTo) {
                navigateTo(pendingTo);
            }
        } catch (e) {
            // keep pendingTo so user can retry or cancel
            throw e;
        }
    }, [save, pendingTo, navigateTo]);

    const discardAndLeave = useCallback(() => {
        discard();
        if (pendingTo) {
            navigateTo(pendingTo);
        }
    }, [discard, pendingTo, navigateTo]);

    const cancel = useCallback(() => {
        setPendingTo(null);
    }, []);

    // Native beforeunload guard
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (isDirty) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        if (isDirty) {
            window.addEventListener('beforeunload', handleBeforeUnload);
        } else {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        }
        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
        };
    }, [isDirty]);

    // Intercept back/forward navigation
    useEffect(() => {
        const handlePopState = () => {
            if (isDirty && !pendingTo) {
                // Prevent navigation by pushing back current location
                navigateTo(location.pathname);
                setPendingTo(location.pathname);
            }
        };
        window.addEventListener('popstate', handlePopState);
        return () => {
            window.removeEventListener('popstate', handlePopState);
        };
    }, [isDirty, pendingTo, navigateTo, location.pathname]);

    // Notify when navigation actually occurs
    useEffect(() => {
        if (pendingTo && !isDirty) {
            onLeave?.(pendingTo);
        }
    }, [pendingTo, isDirty, onLeave]);

    return { requestLeave, pendingTo, saveAndLeave, discardAndLeave, cancel };
}
