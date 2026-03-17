/**
 * Batch Solver — Fair 3-Piece Generation System
 *
 * Validates that a candidate set of 3 pieces is "solvable" against the current
 * board: there must exist at least one ordering + placement sequence where all
 * 3 pieces can be placed, with line/column clears applied after each placement
 * exactly as in real gameplay.
 *
 * Uses recursive backtracking / DFS — acceptable for a small 8×8 board with
 * only 3 pieces per batch.
 */

import { BOARD_SIZE } from "@/constants/constants";
import type { Grid, Shape, CellState } from "@/constants/types";
import { canPlaceBlock, checkLines } from "./gameLogic";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Placement {
  row: number;
  col: number;
}

// ---------------------------------------------------------------------------
// Pure utility functions
// ---------------------------------------------------------------------------

/**
 * Deep-clone an 8×8 board. Avoids JSON round-trip for speed.
 */
export function cloneBoardState(grid: Grid): Grid {
  const clone: Grid = new Array(BOARD_SIZE);
  for (let r = 0; r < BOARD_SIZE; r++) {
    clone[r] = new Array(BOARD_SIZE) as CellState[];
    for (let c = 0; c < BOARD_SIZE; c++) {
      clone[r][c] = grid[r][c];
    }
  }
  return clone;
}

/**
 * Place a shape onto a grid clone (mutates the clone in-place for speed).
 * Caller must ensure the placement is valid beforehand.
 */
export function simulatePlacement(
  grid: Grid,
  shape: Shape,
  row: number,
  col: number,
): Grid {
  for (let sr = 0; sr < shape.length; sr++) {
    for (let sc = 0; sc < shape[sr].length; sc++) {
      if (shape[sr][sc] === 1) {
        grid[row + sr][col + sc] = 1;
      }
    }
  }
  return grid;
}

/**
 * Wrapper around checkLines that returns only the cleared grid.
 * Useful when we don't care about animation metadata.
 */
export function clearCompletedLines(grid: Grid): Grid {
  return checkLines(grid).clearedGrid;
}

/**
 * Enumerate every valid (row, col) placement for `shape` on `grid`.
 * Stops early if `earlyExit` is true and at least one placement is found,
 * which is useful for the "can this piece be placed at all?" fast-check.
 */
export function getAllValidPlacements(
  grid: Grid,
  shape: Shape,
  earlyExit = false,
): Placement[] {
  const placements: Placement[] = [];
  const maxRow = BOARD_SIZE - shape.length;
  const maxCol = BOARD_SIZE - (shape[0]?.length ?? 0);

  for (let row = 0; row <= maxRow; row++) {
    for (let col = 0; col <= maxCol; col++) {
      if (canPlaceBlock(grid, shape, row, col)) {
        placements.push({ row, col });
        if (earlyExit) return placements;
      }
    }
  }
  return placements;
}

// ---------------------------------------------------------------------------
// Core DFS solver
// ---------------------------------------------------------------------------

/**
 * Determines whether a candidate batch of shapes is solvable on the given
 * board by recursive backtracking.
 *
 * Algorithm:
 *   1. Try each remaining piece (permutation order).
 *   2. For each piece, try all valid placements.
 *   3. After placement → apply line/column clearing.
 *   4. Recurse with the remaining pieces.
 *   5. If all pieces placed → return true.
 *   6. Otherwise, backtrack (we work on cloned grids so no undo is needed).
 *
 * Performance: worst-case explores 3! × P₁ × P₂ × P₃ branches where Pₙ is
 * the number of valid placements for piece n. With an 8×8 board the upper
 * bound per piece is ~64 placements, so ≈ 6 × 64³ ≈ 1.5M iterations.
 * In practice most branches prune far earlier.
 */
export function isBatchSolvable(grid: Grid, shapes: Shape[]): boolean {
  // Base case: all pieces placed successfully
  if (shapes.length === 0) return true;

  // Try each remaining piece in every possible order
  for (let i = 0; i < shapes.length; i++) {
    const shape = shapes[i];
    const placements = getAllValidPlacements(grid, shape);

    for (const { row, col } of placements) {
      // Clone → place → clear
      const boardAfterPlace = simulatePlacement(
        cloneBoardState(grid),
        shape,
        row,
        col,
      );
      const boardAfterClear = clearCompletedLines(boardAfterPlace);

      // Build remaining pieces list (without index i)
      const remaining = [...shapes.slice(0, i), ...shapes.slice(i + 1)];

      if (isBatchSolvable(boardAfterClear, remaining)) {
        return true; // Found a valid sequence — short-circuit
      }
    }
  }

  return false; // No valid sequence exists
}
