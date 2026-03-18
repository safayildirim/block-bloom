/**
 * Refined Weighted Piece Generation
 * 
 * Uses the Hero Shape concept and probability normalization to avoid 
 * "Fake Balancing" and "Over-rescuing" issues.
 */

import { SHAPES, BLOCK_COLORS } from "../constants/constants";
import type { Block, Grid, Shape } from "../constants/types";
import { isBatchSolvable } from "./batchSolver";
import { analyzeBoardState, type BoardAnalysis } from "./boardAnalysis";
import {
  getAllShapeDifficulties,
  computeBatchDifficulty,
  type ShapeDifficulty,
} from "./shapeDifficulty";
import {
  getGenerationContext,
  recordBatch,
  type GenerationContext,
} from "./generationContext";
import { emergencyFallback } from "./pieceGeneration";
import { GENERATION_CONFIG } from "./generationConstants";

// ╔═════════════════════════════════════════════════════════════════════════╗
// ║  Weight Calculation                                                    ║
// ╚═════════════════════════════════════════════════════════════════════════╝

/**
 * Calculate the selection weight for a single shape given the current context.
 */
export function calculateShapeWeight(
  shapeMeta: ShapeDifficulty,
  analysis: BoardAnalysis,
  context: GenerationContext,
): number {
  const config = GENERATION_CONFIG.WEIGHTS;
  let weight = 1.0;

  // 1. Danger-tier modifier
  const dangerMods = config.DANGER[analysis.danger] || config.DANGER.low;
  weight *= dangerMods[shapeMeta.tier];

  // 2. Hero Bonus (the "true" rescue)
  // Only applies in high/critical danger to ensure the player gets a rescue.
  if ((analysis.danger === "high" || analysis.danger === "critical") && 
      GENERATION_CONFIG.HERO_SHAPE_INDICES.includes(shapeMeta.shapeIndex)) {
    weight *= config.HERO_BONUS;
  }

  // 3. Difficulty-smoothing
  if (context.consecutiveHardBatches > 0) {
    const streak = context.consecutiveHardBatches;
    if (shapeMeta.tier === "easy") {
      weight *= (1 + config.SMOOTHING.EASY_BOOST_PER_HARD_BATCH * streak);
    } else if (shapeMeta.tier === "hard") {
      weight *= Math.max(0.1, 1 - config.SMOOTHING.HARD_SUPPRESS_PER_HARD_BATCH * streak);
    }
  }

  // 4. Line-shape bonus (more nuance)
  if (shapeMeta.isLine) {
    const nearCompleteCount = analysis.nearCompleteRows + analysis.nearCompleteCols;
    if (nearCompleteCount > 0) {
      weight += config.LINE_CLEAR_OPPORTUNITY_BONUS * Math.min(nearCompleteCount, 3);
    }
  }

  // 5. Compactness bonus at high danger
  // Compact shapes are easier to fit in fragments.
  if (analysis.danger === "high" || analysis.danger === "critical") {
    weight += shapeMeta.compactness * config.COMPACTNESS_BONUS;
  }

  // 6. Anti-triviality floor
  return Math.max(weight, config.MIN_WEIGHT);
}

// ╔═════════════════════════════════════════════════════════════════════════╗
// ║  Weighted Sampling & Normalization                                      ║
// ╚═════════════════════════════════════════════════════════════════════════╝

function weightedSampleIndex(weights: number[]): number {
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) return Math.floor(Math.random() * weights.length);

  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

// ╔═════════════════════════════════════════════════════════════════════════╗
// ║  Main Entry Point                                                      ║
// ╚═════════════════════════════════════════════════════════════════════════╝

function makeBlocks(shapes: Shape[]): Block[] {
  return shapes.map((shape, i) => ({
    id: `block-${Date.now()}-${i}`,
    shape,
    color: BLOCK_COLORS[Math.floor(Math.random() * BLOCK_COLORS.length)],
  }));
}

/**
 * Generate a fair, weighted batch of pieces that is solvable on the given board.
 */
export function generateWeightedPieceBatch(grid: Grid, count = 3): Block[] {
  const analysis = analyzeBoardState(grid);
  const context = getGenerationContext();
  const allMeta = getAllShapeDifficulties();

  // Phase 1: Normal weighted generation
  for (let attempt = 0; attempt < GENERATION_CONFIG.MAX_WEIGHTED_ATTEMPTS; attempt++) {
    const weights = allMeta.map(m => calculateShapeWeight(m, analysis, context));
    const indices: number[] = Array.from({ length: count }, () => weightedSampleIndex(weights));
    const shapes = indices.map(i => SHAPES[i]);

    if (isBatchSolvable(grid, shapes)) {
      recordBatch({
        difficulty: computeBatchDifficulty(indices),
        usedFallback: false,
        danger: analysis.danger,
      });
      return makeBlocks(shapes);
    }
  }

  // Phase 2: Rescue mode (more aggressive rescue shapes)
  const rescueAnalysis: BoardAnalysis = { ...analysis, danger: "critical" };
  for (let attempt = 0; attempt < GENERATION_CONFIG.MAX_RESCUE_ATTEMPTS; attempt++) {
    const weights = allMeta.map(m => calculateShapeWeight(m, rescueAnalysis, context));
    const indices: number[] = Array.from({ length: count }, () => weightedSampleIndex(weights));
    const shapes = indices.map(i => SHAPES[i]);

    if (isBatchSolvable(grid, shapes)) {
      recordBatch({
        difficulty: computeBatchDifficulty(indices),
        usedFallback: false,
        danger: analysis.danger,
      });
      return makeBlocks(shapes);
    }
  }

  // Phase 3: Emergency
  const blocks = emergencyFallback(grid, count);
  recordBatch({ difficulty: 0.1, usedFallback: true, danger: analysis.danger });
  return blocks;
}
