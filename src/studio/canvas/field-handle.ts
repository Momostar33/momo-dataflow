export interface FieldHandle {
    refId: string;
    fieldId: string;
}

/**
 * Encode a field handle tuple into a URL‑safe string.
 *
 * The tuple is JSON stringified and then URI‑encoded so it can be safely
 * used as a React Flow handle id.
 */
export function encodeFieldHandle(handle: FieldHandle): string {
    return encodeURIComponent(JSON.stringify(handle));
}

/**
 * Decode a previously encoded field handle.
 *
 * Returns the original tuple or `null` if the input is malformed,
 * missing required properties, or contains empty strings.
 */
export function decodeFieldHandle(str: string): FieldHandle | null {
    try {
        const decoded = decodeURIComponent(str);
        const obj = JSON.parse(decoded);
        if (typeof obj !== 'object' || obj === null) return null;
        const { refId, fieldId } = obj as any;
        if (
            typeof refId !== 'string' ||
            typeof fieldId !== 'string' ||
            !refId ||
            !fieldId
        ) {
            return null;
        }
        return { refId, fieldId };
    } catch {
        return null;
    }
}
