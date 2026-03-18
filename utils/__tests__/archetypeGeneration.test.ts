import { SHAPES } from "../../constants/constants";
import {
  computeShapeDifficulty,
  getAllShapeDifficulties,
  resetDifficultyCache,
} from "../shapeDifficulty";
import {
  recordBatch,
  getGenerationContext,
  resetGenerationContext,
} from "../generationContext";

beforeEach(() => {
  resetDifficultyCache();
  resetGenerationContext();
});

describe("Shape Difficulty: Tier Assignment", () => {
  it("assigns all shapes to correct tiers based on cell count", () => {
    const all = getAllShapeDifficulties();
    expect(all).toHaveLength(SHAPES.length);

    // Small tier: 1-3 cells (1x1, 2x1s, 3x1s, small Ls)
    const smallIndices = [0, 1, 2, 3, 4, 7, 8];
    for (const i of smallIndices) {
      expect(all[i].tier).toBe("small");
    }

    // Medium tier: 4-5 cells (2x2, T-shapes, Z-shapes, 4x1s, 5x1s)
    const mediumIndices = [5, 11, 12, 13, 14, 15, 16, 17, 18];
    for (const i of mediumIndices) {
      expect(all[i].tier).toBe("medium");
    }

    // Large tier: 6+ cells OR 5-cell awkward (3x3, large Ls)
    const largeIndices = [6, 9, 10];
    for (const i of largeIndices) {
      expect(all[i].tier).toBe("large");
    }
  });

  it("bumps 5-cell shapes with low compactness to large", () => {
    // Indices 9,10 are large L-shapes: 5 cells, 3x3 bbox, compactness ~0.56
    const shape9 = computeShapeDifficulty(SHAPES[9], 9);
    const shape10 = computeShapeDifficulty(SHAPES[10], 10);
    expect(shape9.cellCount).toBe(5);
    expect(shape9.compactness).toBeLessThan(0.6);
    expect(shape9.tier).toBe("large");
    expect(shape10.tier).toBe("large");
  });

  it("does NOT bump 5-cell compact shapes", () => {
    // 5x1 line (index 17): 5 cells, compactness = 1.0 → stays medium
    const shape17 = computeShapeDifficulty(SHAPES[17], 17);
    expect(shape17.cellCount).toBe(5);
    expect(shape17.compactness).toBe(1.0);
    expect(shape17.tier).toBe("medium");
  });
});

describe("Generation Context: shapeIndices tracking", () => {
  it("returns empty previousBatchShapeIndices when no history", () => {
    const ctx = getGenerationContext();
    expect(ctx.previousBatchShapeIndices).toEqual([]);
  });

  it("returns last batch shapeIndices", () => {
    recordBatch({ difficulty: 0.3, usedFallback: false, danger: "low", shapeIndices: [5, 13, 1] });
    const ctx = getGenerationContext();
    expect(ctx.previousBatchShapeIndices).toEqual([5, 13, 1]);
  });

  it("updates previousBatchShapeIndices on new batch", () => {
    recordBatch({ difficulty: 0.3, usedFallback: false, danger: "low", shapeIndices: [5, 13, 1] });
    recordBatch({ difficulty: 0.5, usedFallback: false, danger: "medium", shapeIndices: [8, 17, 3] });
    const ctx = getGenerationContext();
    expect(ctx.previousBatchShapeIndices).toEqual([8, 17, 3]);
  });
});

// ---- Archetype Selection Tests ----

import { selectArchetype, fillSlot, generateWeightedPieceBatch } from "../weightedGeneration";
import { createEmptyGrid } from "../gameLogic";
import { isBatchSolvable } from "../batchSolver";
import { BOARD_SIZE } from "../../constants/constants";
import type { BoardAnalysis } from "../boardAnalysis";

function makeMockAnalysis(overrides: Partial<BoardAnalysis> = {}): BoardAnalysis {
  return {
    occupiedCells: 0,
    emptyCells: 64,
    occupancy: 0,
    totalPlacementCount: 500,
    avgPlacementsPerShape: 25,
    nearCompleteRows: 0,
    nearCompleteCols: 0,
    maxRectAvailable: 5,
    danger: "low",
    ...overrides,
  };
}

describe("Archetype Selection", () => {
  it("never selects filler at low danger", () => {
    const analysis = makeMockAnalysis({ danger: "low" });
    const ctx = getGenerationContext();
    const counts: Record<string, number> = {};
    for (let i = 0; i < 500; i++) {
      const name = selectArchetype(analysis, ctx);
      counts[name] = (counts[name] ?? 0) + 1;
    }
    expect(counts["filler"] ?? 0).toBe(0);
  });

  it("never selects challenge or blockbuster at critical danger", () => {
    const analysis = makeMockAnalysis({ danger: "critical" });
    const ctx = getGenerationContext();
    const counts: Record<string, number> = {};
    for (let i = 0; i < 500; i++) {
      const name = selectArchetype(analysis, ctx);
      counts[name] = (counts[name] ?? 0) + 1;
    }
    expect(counts["challenge"] ?? 0).toBe(0);
    expect(counts["blockbuster"] ?? 0).toBe(0);
  });

  it("redistributes line-hunter weight when no near-complete lines", () => {
    const analysis = makeMockAnalysis({ danger: "low", nearCompleteRows: 0, nearCompleteCols: 0 });
    const ctx = getGenerationContext();
    const counts: Record<string, number> = {};
    for (let i = 0; i < 1000; i++) {
      const name = selectArchetype(analysis, ctx);
      counts[name] = (counts[name] ?? 0) + 1;
    }
    expect(counts["line-hunter"] ?? 0).toBe(0);
  });

  it("suppresses challenge and blockbuster after consecutive hard batches", () => {
    for (let i = 0; i < 3; i++) {
      recordBatch({ difficulty: 0.8, usedFallback: false, danger: "low", shapeIndices: [6, 9, 10] });
    }
    const analysis = makeMockAnalysis({ danger: "low" });
    const ctx = getGenerationContext();
    const counts: Record<string, number> = {};
    for (let i = 0; i < 500; i++) {
      const name = selectArchetype(analysis, ctx);
      counts[name] = (counts[name] ?? 0) + 1;
    }
    expect(counts["challenge"] ?? 0).toBe(0);
    expect(counts["blockbuster"] ?? 0).toBe(0);
  });
});

// ---- Within-Tier Slot Filling Tests ----

describe("Within-Tier Slot Filling", () => {
  it("fillSlot('small') returns a shape from the small tier", () => {
    const analysis = makeMockAnalysis({ danger: "low" });
    const smallIndices = [0, 1, 2, 3, 4, 7, 8];
    for (let i = 0; i < 100; i++) {
      const idx = fillSlot("small", analysis, []);
      expect(smallIndices).toContain(idx);
    }
  });

  it("fillSlot('medium') returns a shape from the medium tier", () => {
    const analysis = makeMockAnalysis({ danger: "low" });
    const mediumIndices = [5, 11, 12, 13, 14, 15, 16, 17, 18];
    for (let i = 0; i < 100; i++) {
      const idx = fillSlot("medium", analysis, []);
      expect(mediumIndices).toContain(idx);
    }
  });

  it("fillSlot('large') returns a shape from the large tier", () => {
    const analysis = makeMockAnalysis({ danger: "low" });
    const largeIndices = [6, 9, 10];
    for (let i = 0; i < 100; i++) {
      const idx = fillSlot("large", analysis, []);
      expect(largeIndices).toContain(idx);
    }
  });

  it("fillSlot('line') returns only line shapes", () => {
    const analysis = makeMockAnalysis({ danger: "low" });
    const allMeta = getAllShapeDifficulties();
    const lineIndices = allMeta.filter((m) => m.isLine).map((m) => m.shapeIndex);
    for (let i = 0; i < 100; i++) {
      const idx = fillSlot("line", analysis, []);
      expect(lineIndices).toContain(idx);
    }
  });

  it("anti-repetition reduces weight of previous batch shapes", () => {
    const analysis = makeMockAnalysis({ danger: "low" });
    const prevIndices = [1, 2, 3];
    const counts: Record<number, number> = {};
    for (let i = 0; i < 2000; i++) {
      const idx = fillSlot("small", analysis, prevIndices);
      counts[idx] = (counts[idx] ?? 0) + 1;
    }
    const prevTotal = prevIndices.reduce((sum, i) => sum + (counts[i] ?? 0), 0);
    const otherSmall = [0, 4, 7, 8];
    const otherTotal = otherSmall.reduce((sum, i) => sum + (counts[i] ?? 0), 0);
    expect(otherTotal).toBeGreaterThan(prevTotal);
  });

  it("compactness bonus activates at high danger", () => {
    const lowAnalysis = makeMockAnalysis({ danger: "low" });
    const highAnalysis = makeMockAnalysis({ danger: "high" });
    const countsLow: Record<number, number> = {};
    const countsHigh: Record<number, number> = {};
    for (let i = 0; i < 5000; i++) {
      const idxLow = fillSlot("medium", lowAnalysis, []);
      const idxHigh = fillSlot("medium", highAnalysis, []);
      countsLow[idxLow] = (countsLow[idxLow] ?? 0) + 1;
      countsHigh[idxHigh] = (countsHigh[idxHigh] ?? 0) + 1;
    }
    // 2x2 (index 5, compactness 1.0) vs T-shape (index 11, compactness ~0.67)
    const ratioLow = (countsLow[5] ?? 1) / (countsLow[11] ?? 1);
    const ratioHigh = (countsHigh[5] ?? 1) / (countsHigh[11] ?? 1);
    expect(ratioHigh).toBeGreaterThan(ratioLow);
  });

  it("empty tier pool does not throw", () => {
    const analysis = makeMockAnalysis({ danger: "low" });
    expect(() => fillSlot("large", analysis, [])).not.toThrow();
    expect(() => fillSlot("medium", analysis, [])).not.toThrow();
    expect(() => fillSlot("small", analysis, [])).not.toThrow();
    expect(() => fillSlot("line", analysis, [])).not.toThrow();
  });
});

// ---- Integration Tests ----

describe("generateWeightedPieceBatch: Integration", () => {
  it("returns 3 blocks with id, shape, color on empty board", () => {
    const grid = createEmptyGrid();
    const batch = generateWeightedPieceBatch(grid);
    expect(batch).toHaveLength(3);
    for (const block of batch) {
      expect(block.id).toBeDefined();
      expect(block.shape).toBeDefined();
      expect(block.color).toBeDefined();
    }
  });

  it("all generated batches pass solver validation (empty board)", () => {
    const grid = createEmptyGrid();
    for (let i = 0; i < 20; i++) {
      const batch = generateWeightedPieceBatch(grid);
      const shapes = batch.map((b) => b.shape);
      expect(isBatchSolvable(grid, shapes)).toBe(true);
    }
  });

  it("all generated batches pass solver validation (tight board)", () => {
    const grid = createEmptyGrid();
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if ((r + c) % 2 === 0) grid[r][c] = 1;
      }
    }
    for (let c = 0; c < BOARD_SIZE; c++) grid[0][c] = 0;

    for (let i = 0; i < 10; i++) {
      const batch = generateWeightedPieceBatch(grid);
      const shapes = batch.map((b) => b.shape);
      expect(isBatchSolvable(grid, shapes)).toBe(true);
    }
  });

  it("fallback works on near-full board", () => {
    const grid = createEmptyGrid();
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (!(r === 0 && c <= 2)) grid[r][c] = 1;
      }
    }
    const batch = generateWeightedPieceBatch(grid);
    expect(batch).toHaveLength(3);
  });

  it("batch composition matches archetype tier slots", () => {
    const grid = createEmptyGrid();
    const allMeta = getAllShapeDifficulties();
    let matchedWorkhorse = false;

    for (let i = 0; i < 50; i++) {
      const batch = generateWeightedPieceBatch(grid);
      const tiers = batch.map((b) => {
        const idx = SHAPES.indexOf(b.shape);
        return allMeta[idx].tier;
      });
      const tierCounts = { small: 0, medium: 0, large: 0 };
      for (const t of tiers) tierCounts[t]++;

      if (tierCounts.medium === 2 && tierCounts.small === 1) {
        matchedWorkhorse = true;
      }
    }
    expect(matchedWorkhorse).toBe(true);
  });
});
