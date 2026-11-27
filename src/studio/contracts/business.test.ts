import { describe, it, expect } from "vitest";
import { emptyBusinessDocument, BusinessDocument } from "./business";

describe("emptyBusinessDocument", () => {
    it("returns a BusinessDocument with default values", () => {
        const doc: BusinessDocument = emptyBusinessDocument();
        expect(doc).toBeTypeOf("object");
        expect(doc.schemaVersion).toBe(2);
        expect(doc.settings.autosaveMinutes).toBe(5);
        expect(Array.isArray(doc.templates)).toBe(true);
        expect(Array.isArray(doc.assignments)).toBe(true);
        expect(Array.isArray(doc.flows)).toBe(true);
        expect(Array.isArray(doc.refs)).toBe(true);
        expect(Array.isArray(doc.rules)).toBe(true);
    });
});
