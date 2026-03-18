import { SHAPES } from "../../constants/constants";
import {
  computeShapeDifficulty,
  getAllShapeDifficulties,
  resetDifficultyCache,
} from "../shapeDifficulty";

beforeEach(() => {
  resetDifficultyCache();
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
