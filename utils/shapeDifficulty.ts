/**
 * Refined Shape Difficulty Metadata
 *
 * This version uses the centralized configuration and a continuous difficulty 
 * model that ensures consistent tiering.
 */

import { SHAPES } from "../constants/constants";
import type { Shape } from "../constants/types";
import { GENERATION_CONFIG } from "./generationConstants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DifficultyTier = "easy" | "normal" | "hard";

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

// ---------------------------------------------------------------------------
// Computation Logic
// ---------------------------------------------------------------------------

/**
 * Compute difficulty metadata for a single shape.
 */
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

  // --- 1. Continuous Difficulty Calculation ---
  // Size: 1-9 cells → 0-0.7 (logarithmic scale)
  const sizeScore = Math.log2(cellCount) / Math.log2(10) * 0.7;
  
  // Compactness: Penalize sparse shapes (less than 1.0)
  const awkwardnessScore = (1 - compactness) * 0.25;
  
  // Bounding scale: Max dimension matters (3x1 vs 2x2 vs 3x3)
  const dimensionScore = Math.max(width, height) / 10 * 0.15;
  
  const difficulty = Math.min(sizeScore + awkwardnessScore + dimensionScore, 1);

  // --- 2. Tier classification (Dynamic from constants) ---
  let tier: DifficultyTier;
  if (difficulty <= GENERATION_CONFIG.TIER_THRESHOLDS.EASY) {
    tier = "easy";
  } else if (difficulty <= GENERATION_CONFIG.TIER_THRESHOLDS.NORMAL) {
    tier = "normal";
  } else {
    tier = "hard";
  }

  return {
    shapeIndex,
    cellCount,
    width,
    height,
    boundingArea,
    compactness,
    isLine,
    tier,
    difficulty,
  };
}

// ---------------------------------------------------------------------------
// Precomputed metadata cache
// ---------------------------------------------------------------------------

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
  const total = shapeIndices.reduce(
    (sum, idx) => sum + (all[idx]?.difficulty ?? 0),
    0,
  );
  return total / shapeIndices.length;
}

export function resetDifficultyCache(): void {
  _cache = null;
}
