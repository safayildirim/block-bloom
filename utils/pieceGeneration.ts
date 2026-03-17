/**
 * Fair Piece Batch Generation
 *
 * Generates sets of 3 pieces that are guaranteed to be solvable against the
 * current board state. Uses progressive fallback:
 *
 *   Phase 1 — Random batch with validation (up to MAX_RANDOM_ATTEMPTS)
 *   Phase 2 — Weighted smaller/easier shapes with validation
 *   Phase 3 — Emergency: brute-force from easiest shapes guaranteed to fit
 *
 * This replaces the old `generateRandomBlocks()` as the primary generation
 * entry point when board state is available.
 */

import { BLOCK_COLORS, SHAPES } from "@/constants/constants";
import type { Block, Grid, Shape } from "@/constants/types";
import { isBatchSolvable, getAllValidPlacements } from "./batchSolver";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Maximum random batch attempts before falling back to weighted selection.
 * 50 is generous — most boards will find a valid batch within 5–10 attempts.
 */
const MAX_RANDOM_ATTEMPTS = 50;

/**
 * Maximum weighted-easy attempts before emergency fallback.
 */
const MAX_EASY_ATTEMPTS = 30;

/**
 * Indices into SHAPES that are considered "easy" / small.
 * These are shapes that fit almost anywhere:
 *   0: single cell       [[1]]
 *   1: 2×1 horizontal    [[1,1]]
 *   2: 2×1 vertical      [[1],[1]]
 *   3: 3×1 horizontal    [[1,1,1]]
 *   4: 3×1 vertical      [[1],[1],[1]]
 *   7: small L            [[1,0],[1,1]]
 *   8: small L flipped    [[0,1],[1,1]]
 */
const EASY_SHAPE_INDICES = [0, 1, 2, 3, 4, 7, 8];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function randomIndex(length: number): number {
  return Math.floor(Math.random() * length);
}

function randomColor(): string {
  return BLOCK_COLORS[randomIndex(BLOCK_COLORS.length)];
}

function randomShape(): Shape {
  return SHAPES[randomIndex(SHAPES.length)];
}

function randomEasyShape(): Shape {
  return SHAPES[EASY_SHAPE_INDICES[randomIndex(EASY_SHAPE_INDICES.length)]];
}

function makeBlock(shape: Shape, index: number): Block {
  return {
    id: `block-${Date.now()}-${index}`,
    shape,
    color: randomColor(),
  };
}

function makeBlocks(shapes: Shape[]): Block[] {
  return shapes.map((shape, i) => makeBlock(shape, i));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a fair batch of 3 pieces that is solvable on the given board.
 *
 * Falls back through increasingly lenient strategies:
 *   1. Random selection with full DFS validation
 *   2. Easy/small shapes with full DFS validation
 *   3. Emergency — pick shapes individually guaranteed to fit right now
 *
 * @param grid    Current board state (never mutated)
 * @param count   Number of pieces in the batch (default 3)
 */
export function generateNextPieceBatch(grid: Grid, count = 3): Block[] {
  // --- Phase 1: Random batches with validation ---
  for (let attempt = 0; attempt < MAX_RANDOM_ATTEMPTS; attempt++) {
    const shapes = Array.from({ length: count }, () => randomShape());

    if (isBatchSolvable(grid, shapes)) {
      return makeBlocks(shapes);
    }
  }

  // --- Phase 2: Weighted easy shapes with validation ---
  for (let attempt = 0; attempt < MAX_EASY_ATTEMPTS; attempt++) {
    const shapes = Array.from({ length: count }, () => randomEasyShape());

    if (isBatchSolvable(grid, shapes)) {
      return makeBlocks(shapes);
    }
  }

  // --- Phase 3: Emergency fallback ---
  // Pick shapes that can individually be placed on the current board right now.
  // This is the weakest guarantee (no sequential simulation) but ensures
  // the player gets something playable rather than an instant game-over.
  return emergencyFallback(grid, count);
}

/**
 * Emergency fallback: select shapes that can each independently be placed
 * on the current board. Tries easy shapes first, then all shapes.
 * As a last resort, fills remaining slots with the single-cell shape.
 */
function emergencyFallback(grid: Grid, count: number): Block[] {
  const selected: Shape[] = [];

  // Try easy shapes first
  const easyShapes = EASY_SHAPE_INDICES.map((i) => SHAPES[i]);
  const shuffledEasy = [...easyShapes].sort(() => Math.random() - 0.5);

  for (const shape of shuffledEasy) {
    if (selected.length >= count) break;
    if (getAllValidPlacements(grid, shape, true).length > 0) {
      selected.push(shape);
    }
  }

  // If still not enough, try all shapes
  if (selected.length < count) {
    const shuffledAll = [...SHAPES].sort(() => Math.random() - 0.5);
    for (const shape of shuffledAll) {
      if (selected.length >= count) break;
      if (getAllValidPlacements(grid, shape, true).length > 0) {
        selected.push(shape);
      }
    }
  }

  // Absolute last resort: fill with single cells
  while (selected.length < count) {
    selected.push(SHAPES[0]); // [[1]] — single cell
  }

  return makeBlocks(selected);
}
