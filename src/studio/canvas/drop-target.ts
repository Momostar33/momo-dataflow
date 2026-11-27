export interface Viewport {
    x: number;
    y: number;
    zoom: number;
}

export interface Step {
    stepId: string;
    x: number;
    y: number;
    w: number;
    h: number;
}

/**
 * Resolve a drop target within a canvas.
 *
 * @param clientX - X coordinate relative to the canvas container.
 * @param clientY - Y coordinate relative to the canvas container.
 * @param viewport - Current viewport translation and zoom.
 * @param steps - Array of step rectangles (render order).
 *
 * @returns {stepId, x, y} where x/y are the coordinates relative to the step,
 *   or null if the point is outside all steps or input is invalid.
 */
export function resolveDropTarget({
    clientX,
    clientY,
    viewport,
    steps,
}: {
    clientX: number;
    clientY: number;
    viewport: Viewport;
    steps: Step[];
}): { stepId: string; x: number; y: number } | null {
    // Validate input
    if (
        !Number.isFinite(clientX) ||
        !Number.isFinite(clientY) ||
        !Number.isFinite(viewport.zoom) ||
        viewport.zoom <= 0
    ) {
        return null;
    }

    // Convert client coordinates to world coordinates
    const worldX = (clientX - viewport.x) / viewport.zoom;
    const worldY = (clientY - viewport.y) / viewport.zoom;

    // Find the last rendered step that contains the point
    for (let i = steps.length - 1; i >= 0; i--) {
        const s = steps[i];
        if (
            worldX >= s.x &&
            worldX < s.x + s.w &&
            worldY >= s.y &&
            worldY < s.y + s.h
        ) {
            return {
                stepId: s.stepId,
                x: worldX - s.x,
                y: worldY - s.y,
            };
        }
    }

    return null;
}
