/**
 * Archetype-Based Weighted Piece Generation
 *
 * Instead of sampling 3 shapes independently, selects a batch archetype
 * (e.g., "2 medium + 1 small") then fills each slot from the matching
 * tier pool using board-aware weights. The DFS solver validates solvability.
 */

import { SHAPES, BLOCK_COLORS } from "../constants/constants";
import type { Block, Grid, Shape } from "../constants/types";
import { isBatchSolvable } from "./batchSolver";
import { analyzeBoardState, type BoardAnalysis } from "./boardAnalysis";
import { getAllShapeDifficulties, computeBatchDifficulty, type ShapeDifficulty } from "./shapeDifficulty";
import { getGenerationContext, recordBatch, type GenerationContext } from "./generationContext";
import { emergencyFallback } from "./pieceGeneration";
import {
  ARCHETYPE_WEIGHTS,
  ARCHETYPES,
  LINE_HUNTER_MIN_NEAR_COMPLETE,
  MAX_RESCUE_ATTEMPTS,
  MAX_WEIGHTED_ATTEMPTS,
  SMOOTHING,
  WITHIN_TIER,
  type ArchetypeName,
  type SlotTier,
} from "./generationConstants";

// ---------------------------------------------------------------------------
// Archetype Selection
// ---------------------------------------------------------------------------

export function selectArchetype(
  analysis: BoardAnalysis,
  context: GenerationContext,
): ArchetypeName {
  const danger = analysis.danger as keyof typeof ARCHETYPE_WEIGHTS;
  const baseWeights: Record<ArchetypeName, number> = { ...ARCHETYPE_WEIGHTS[danger] };

  // Line-hunter gate: redistribute if not enough near-complete lines
  const nearComplete = analysis.nearCompleteRows + analysis.nearCompleteCols;
  if (nearComplete < LINE_HUNTER_MIN_NEAR_COMPLETE) {
    const freed = baseWeights["line-hunter"];
    baseWeights["line-hunter"] = 0;
    const remaining = (Object.entries(baseWeights) as [ArchetypeName, number][]).filter(
      ([name]) => name !== "line-hunter" && baseWeights[name] > 0,
    );
    const remainingTotal = remaining.reduce((sum, [, w]) => sum + w, 0);
    if (remainingTotal > 0) {
      for (const [name] of remaining) {
        baseWeights[name as ArchetypeName] +=
          freed * (baseWeights[name as ArchetypeName] / remainingTotal);
      }
    }
  }

  // Smoothing override: suppress challenge + blockbuster after hard streaks
  if (context.consecutiveHardBatches >= SMOOTHING.HARD_STREAK_THRESHOLD) {
    const freed = baseWeights.challenge + baseWeights.blockbuster;
    baseWeights.challenge = 0;
    baseWeights.blockbuster = 0;
    baseWeights.builder += freed * SMOOTHING.REDISTRIBUTION.builder;
    baseWeights.workhorse += freed * SMOOTHING.REDISTRIBUTION.workhorse;
  }

  // Weighted random selection
  const entries = Object.entries(baseWeights) as [ArchetypeName, number][];
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = Math.random() * total;
  for (const [name, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return name;
  }
  return "workhorse";
}

// ---------------------------------------------------------------------------
// Within-Tier Slot Filling
// ---------------------------------------------------------------------------

function getPoolForSlot(slotTier: SlotTier): ShapeDifficulty[] {
  const all = getAllShapeDifficulties();
  if (slotTier === "line") {
    return all.filter((m) => m.isLine);
  }
  const pool = all.filter((m) => m.tier === slotTier);
  // Empty tier fallback: large → medium → small
  if (pool.length === 0) {
    if (slotTier === "large") return all.filter((m) => m.tier === "medium");
    if (slotTier === "medium") return all.filter((m) => m.tier === "small");
  }
  return pool;
}

export function fillSlot(
  slotTier: SlotTier,
  analysis: BoardAnalysis,
  previousShapeIndices: number[],
): number {
  const pool = getPoolForSlot(slotTier);
  if (pool.length === 0) return 0; // absolute fallback to 1x1

  const weights = pool.map((meta) => {
    let weight = 1.0;

    // Compactness bonus at high/critical danger
    if (analysis.danger === "high" || analysis.danger === "critical") {
      weight += WITHIN_TIER.COMPACTNESS_BONUS * meta.compactness;
    }

    // Line-clear opportunity
    if (meta.isLine) {
      const nearComplete = analysis.nearCompleteRows + analysis.nearCompleteCols;
      weight += WITHIN_TIER.LINE_CLEAR_BONUS * Math.min(nearComplete, WITHIN_TIER.LINE_CLEAR_CAP);
    }

    // Anti-repetition
    if (previousShapeIndices.includes(meta.shapeIndex)) {
      weight *= WITHIN_TIER.ANTI_REPETITION_FACTOR;
    }

    return Math.max(weight, WITHIN_TIER.MIN_WEIGHT);
  });

  // Weighted random selection
  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return pool[i].shapeIndex;
  }
  return pool[pool.length - 1].shapeIndex;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBlocks(shapes: Shape[]): Block[] {
  return shapes.map((shape, i) => ({
    id: `block-${Date.now()}-${i}`,
    shape,
    color: BLOCK_COLORS[Math.floor(Math.random() * BLOCK_COLORS.length)],
  }));
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

export function generateWeightedPieceBatch(grid: Grid, count = 3): Block[] {
  const analysis = analyzeBoardState(grid);
  const context = getGenerationContext();

  // Phase 1: Archetype generation
  for (let attempt = 0; attempt < MAX_WEIGHTED_ATTEMPTS; attempt++) {
    const archetypeName = selectArchetype(analysis, context);
    const archetype = ARCHETYPES[archetypeName];
    const slots = count < 3 ? archetype.slots.slice(0, count) : archetype.slots;

    const indices = slots.map((slotTier) =>
      fillSlot(slotTier, analysis, context.previousBatchShapeIndices),
    );
    const shuffledIndices = shuffle(indices);
    const shapes = shuffledIndices.map((i) => SHAPES[i]);

    if (isBatchSolvable(grid, shapes)) {
      recordBatch({
        difficulty: computeBatchDifficulty(shuffledIndices),
        usedFallback: false,
        danger: analysis.danger,
        shapeIndices: shuffledIndices,
      });
      return makeBlocks(shapes);
    }
  }

  // Phase 2: Rescue mode (force critical danger)
  const rescueAnalysis: BoardAnalysis = { ...analysis, danger: "critical" };
  const rescueContext = getGenerationContext();
  for (let attempt = 0; attempt < MAX_RESCUE_ATTEMPTS; attempt++) {
    const archetypeName = selectArchetype(rescueAnalysis, rescueContext);
    const archetype = ARCHETYPES[archetypeName];
    const slots = count < 3 ? archetype.slots.slice(0, count) : archetype.slots;

    const indices = slots.map((slotTier) =>
      fillSlot(slotTier, rescueAnalysis, rescueContext.previousBatchShapeIndices),
    );
    const shuffledIndices = shuffle(indices);
    const shapes = shuffledIndices.map((i) => SHAPES[i]);

    if (isBatchSolvable(grid, shapes)) {
      recordBatch({
        difficulty: computeBatchDifficulty(shuffledIndices),
        usedFallback: false,
        danger: analysis.danger,
        shapeIndices: shuffledIndices,
      });
      return makeBlocks(shapes);
    }
  }

  // Phase 3: Emergency fallback
  const blocks = emergencyFallback(grid, count);
  recordBatch({
    difficulty: 0.1,
    usedFallback: true,
    danger: analysis.danger,
    shapeIndices: [],
  });
  return blocks;
}
