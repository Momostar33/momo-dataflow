import { describe, it, expect } from "vitest";
import {
  layoutOverview,
  OVERVIEW_TABLE_WIDTH,
  OVERVIEW_TABLE_HEIGHT,
} from "./overview-layout";
import type { OverviewNode, OverviewEdge } from "./derive-overview";
const node = (tableId: string): OverviewNode => ({
  tableId,
  name: tableId,
  displayName: tableId,
  note: "",
});
const edge = (
  source: string,
  target: string,
  id = source + target,
  kind: "mapping" | "matching" = "mapping",
): OverviewEdge => ({
  id,
  sourceTableId: source,
  targetTableId: target,
  kind,
  flowIds: ["flow"],
  flowNames: ["虚构模块"],
});
describe("read-only relationship-driven overview layout", () => {
  it("places a directed chain left to right regardless of catalog order", async () => {
    const nodes = ["c", "a", "b"].map(node),
      edges = [edge("a", "b"), edge("b", "c")];
    const before = JSON.stringify({ nodes, edges });
    const p = await layoutOverview(nodes, edges);
    expect(p.a.x + OVERVIEW_TABLE_WIDTH).toBeLessThan(p.b.x);
    expect(p.b.x + OVERVIEW_TABLE_WIDTH).toBeLessThan(p.c.x);
    expect(JSON.stringify({ nodes, edges })).toBe(before);
    expect(
      await layoutOverview([...nodes].reverse(), [...edges].reverse()),
    ).toEqual(p);
  });
  it("keeps branches, separate components, matching links and isolated tables from overlapping", async () => {
    const ids = ["a", "b", "c", "d", "e", "isolated"];
    const p = await layoutOverview(ids.map(node), [
      edge("a", "b"),
      edge("a", "c"),
      edge("d", "e", "match", "matching"),
    ]);
    expect(Object.keys(p).sort()).toEqual([...ids].sort());
    for (let i = 0; i < ids.length; i++)
      for (let j = i + 1; j < ids.length; j++) {
        const a = p[ids[i]],
          b = p[ids[j]];
        expect(
          a.x + OVERVIEW_TABLE_WIDTH <= b.x ||
            b.x + OVERVIEW_TABLE_WIDTH <= a.x ||
            a.y + OVERVIEW_TABLE_HEIGHT <= b.y ||
            b.y + OVERVIEW_TABLE_HEIGHT <= a.y,
        ).toBe(true);
      }
  });
  it("handles cycles/self-links and ignores filtered endpoints without dropping valid tables", async () => {
    const p = await layoutOverview(["a", "b", "c"].map(node), [
      edge("a", "b"),
      edge("b", "c"),
      edge("c", "a"),
      edge("a", "a"),
      edge("a", "missing"),
      edge("a", "b", "parallel"),
    ]);
    expect(Object.keys(p).sort()).toEqual(["a", "b", "c"]);
    for (const value of Object.values(p)) {
      expect(Number.isFinite(value.x)).toBe(true);
      expect(Number.isFinite(value.y)).toBe(true);
    }
  });
  it("does not let undirected matching reverse a directed mapping", async () => {
    const p = await layoutOverview(["z", "a"].map(node), [
      edge("a", "z", "match", "matching"),
      edge("z", "a", "map"),
    ]);
    expect(p.z.x + OVERVIEW_TABLE_WIDTH).toBeLessThan(p.a.x);
  });
  it("supports empty and single-table views", async () => {
    expect(await layoutOverview([], [])).toEqual({});
    expect(Object.keys(await layoutOverview([node("only")], []))).toEqual([
      "only",
    ]);
  });
});
