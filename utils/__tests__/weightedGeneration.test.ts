/**
 * Legacy weighted generation tests — replaced by archetypeGeneration.test.ts
 */

import { generateWeightedPieceBatch } from "../weightedGeneration";
import { createEmptyGrid } from "../gameLogic";
import { isBatchSolvable } from "../batchSolver";
import { resetGenerationContext } from "../generationContext";
import { resetDifficultyCache } from "../shapeDifficulty";

describe("Weighted Generation: Backward Compatibility", () => {
  beforeEach(() => {
    resetGenerationContext();
    resetDifficultyCache();
  });

  it("generateWeightedPieceBatch still returns valid batches", () => {
    const grid = createEmptyGrid();
    const batch = generateWeightedPieceBatch(grid);
    expect(batch).toHaveLength(3);
    const shapes = batch.map((b) => b.shape);
    expect(isBatchSolvable(grid, shapes)).toBe(true);
  });
});
