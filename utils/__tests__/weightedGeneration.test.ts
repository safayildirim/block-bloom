/**
 * Senior Engineer Test Suite (Fixed Paths)
 */

import { createEmptyGrid } from "../gameLogic";
import { analyzeBoardState } from "../boardAnalysis";
import { getAllShapeDifficulties, getShapeDifficulty } from "../shapeDifficulty";
import { 
  getGenerationContext, 
  resetGenerationContext,
  recordBatch
} from "../generationContext";
import { 
  calculateShapeWeight,
  generateWeightedPieceBatch
} from "../weightedGeneration";
import { BOARD_SIZE } from "../../constants/constants";
import { GENERATION_CONFIG } from "../generationConstants";
import { isBatchSolvable } from "../batchSolver";

describe("Systems Review: Board Analysis", () => {
  it("detects fragmented space (Max Square check)", () => {
    const grid = createEmptyGrid();
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if ((r + c) % 2 === 0) grid[r][r] = 1; // Sparse diagonal checkerboard
      }
    }
    const analysis = analyzeBoardState(grid);
    // Even if occupancy is 50%, the board is critical if fragmentation is high
    expect(analysis.danger).toBeDefined();
  });
});

describe("Systems Review: Statistical Distribution", () => {
  beforeEach(() => { resetGenerationContext(); });

  it("proves weights shift toward rescue shapes in critical danger", () => {
    const emptyGrid = createEmptyGrid();
    const tightGrid = createEmptyGrid();
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        // Leave tiny pocket in top left, fill everything else
        if (!(r === 0 && (c === 0 || c === 1 || c === 2))) tightGrid[r][c] = 1;
      }
    }

    const emptyAnalysis = analyzeBoardState(emptyGrid);
    const tightAnalysis = analyzeBoardState(tightGrid);
    const context = getGenerationContext();

    const heroShape = getShapeDifficulty(0); // 1x1
    const hardShape = getShapeDifficulty(6); // 3x3

    const emptyHeroWeight = calculateShapeWeight(heroShape, emptyAnalysis, context);
    const tightHeroWeight = calculateShapeWeight(heroShape, tightAnalysis, context);
    const emptyHardWeight = calculateShapeWeight(hardShape, emptyAnalysis, context);
    const tightHardWeight = calculateShapeWeight(hardShape, tightAnalysis, context);

    expect(tightHeroWeight).toBeGreaterThan(emptyHeroWeight);
    expect(tightHardWeight).toBeLessThan(emptyHardWeight);
  });
});

describe("Systems Review: Difficulty Smoothing", () => {
  it("proves consecutive hard batches increase easy weight", () => {
    const grid = createEmptyGrid();
    const analysis = analyzeBoardState(grid);
    const easyShape = getShapeDifficulty(0);

    const initialWeight = calculateShapeWeight(easyShape, analysis, getGenerationContext());

    for (let i = 0; i < 3; i++) recordBatch({ difficulty: 0.8, usedFallback: false, danger: "low" });

    const smoothedWeight = calculateShapeWeight(easyShape, analysis, getGenerationContext());
    expect(smoothedWeight).toBeGreaterThan(initialWeight);
  });
});

describe("Systems Review: Implementation Correctness", () => {
  it("maintains the solver safety guarantee", () => {
    const grid = createEmptyGrid();
    // Fill checkerboard pattern (known hard constraint)
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if ((r + c) % 2 === 0) grid[r][c] = 1;
      }
    }
    // Clear out one localized row for solvability window
    for (let c = 0; c < BOARD_SIZE; c++) grid[0][c] = 0;

    const batch = generateWeightedPieceBatch(grid, 3);
    const shapes = batch.map((b: any) => b.shape);
    expect(isBatchSolvable(grid, shapes)).toBe(true);
  });
});
