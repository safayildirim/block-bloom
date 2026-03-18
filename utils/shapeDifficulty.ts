/**
 * Shape Difficulty Metadata
 *
 * 3-tier model: small (1-3 cells), medium (4-5 cells), large (6+ cells).
 * 5-cell shapes with low compactness (< 0.6) bump to large.
 */

import { SHAPES } from "../constants/constants";
import type { Shape } from "../constants/types";
import { TIER_THRESHOLDS } from "./generationConstants";

export type DifficultyTier = "small" | "medium" | "large";

export interface ShapeDifficulty {
  shapeIndex: number;
  cellCount: number;
  width: number;
  height: number;
  boundingArea: number;
  compactness: number;
  isLine: boolean;
  tier: DifficultyTier;
  difficulty: number;
}

export function computeShapeDifficulty(
  shape: Shape,
  shapeIndex: number,
): ShapeDifficulty {
  const height = shape.length;
  const width = shape[0]?.length ?? 0;
  const boundingArea = width * height;

  let cellCount = 0;
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (shape[r][c] === 1) cellCount++;
    }
  }

  const compactness = boundingArea > 0 ? cellCount / boundingArea : 1;
  const isLine = width === 1 || height === 1;

  // Continuous difficulty for batch scoring
  const sizeScore = (Math.log2(cellCount) / Math.log2(10)) * 0.7;
  const awkwardnessScore = (1 - compactness) * 0.25;
  const dimensionScore = (Math.max(width, height) / 10) * 0.15;
  const difficulty = Math.min(sizeScore + awkwardnessScore + dimensionScore, 1);

  // Cell-count-based tier assignment
  let tier: DifficultyTier;
  if (cellCount <= TIER_THRESHOLDS.SMALL_MAX) {
    tier = "small";
  } else if (cellCount <= TIER_THRESHOLDS.MEDIUM_MAX) {
    tier = "medium";
  } else {
    tier = "large";
  }

  // Awkwardness bump: 5-cell shapes with low compactness go to large
  if (
    cellCount === TIER_THRESHOLDS.MEDIUM_MAX &&
    compactness < TIER_THRESHOLDS.AWKWARDNESS_BUMP_COMPACTNESS
  ) {
    tier = "large";
  }

  return { shapeIndex, cellCount, width, height, boundingArea, compactness, isLine, tier, difficulty };
}

let _cache: ShapeDifficulty[] | null = null;

export function getAllShapeDifficulties(): ShapeDifficulty[] {
  if (!_cache) {
    _cache = SHAPES.map((shape, i) => computeShapeDifficulty(shape, i));
  }
  return _cache;
}

export function getShapeDifficulty(shapeIndex: number): ShapeDifficulty {
  return getAllShapeDifficulties()[shapeIndex];
}

export function getShapesByTier(tier: DifficultyTier): ShapeDifficulty[] {
  return getAllShapeDifficulties().filter((d) => d.tier === tier);
}

export function computeBatchDifficulty(shapeIndices: number[]): number {
  if (shapeIndices.length === 0) return 0;
  const all = getAllShapeDifficulties();
  return shapeIndices.reduce((sum, idx) => sum + (all[idx]?.difficulty ?? 0), 0) / shapeIndices.length;
}

export function resetDifficultyCache(): void {
  _cache = null;
}
