/**
 * Refined Board Analysis
 *
 * This version uses improved danger classification and identifies the largest 
 * available rectangle to detect "hole-rich" boards.
 */

import { BOARD_SIZE, SHAPES } from "../constants/constants";
import type { Grid, Shape } from "../constants/types";
import { canPlaceBlock } from "./gameLogic";
import { DANGER_THRESHOLD } from "./generationConstants";
export type { DangerLevel } from "./generationConstants";

export interface BoardAnalysis {
  occupiedCells: number;
  emptyCells: number;
  occupancy: number;
  totalPlacementCount: number;
  avgPlacementsPerShape: number;
  nearCompleteRows: number;
  nearCompleteCols: number;
  /** Largest square (NxN) that can fit on the board right now. */
  maxRectAvailable: number;
  danger: DangerLevel;
}

// ---------------------------------------------------------------------------
// Core analysis
// ---------------------------------------------------------------------------

/**
 * Count occupied and empty cells.
 */
function countCells(grid: Grid): { occupied: number; empty: number } {
  let occupied = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (grid[r][c] === 1) occupied++;
    }
  }
  return { occupied, empty: BOARD_SIZE * BOARD_SIZE - occupied };
}

/**
 * Find the largest NxN empty square available on the board.
 * Essential for detecting "fragmented" boards that have space but only in tiny chunks.
 */
function findMaxSquare(grid: Grid): number {
  let max = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      for (let size = 1; size <= 5; size++) {
        const dummy: Shape = Array(size).fill(0).map(() => Array(size).fill(1));
        if (canPlaceBlock(grid, dummy, r, c)) {
          max = Math.max(max, size);
        } else {
          break;
        }
      }
    }
  }
  return max;
}

/**
 * Count placements for each shape in a pool.
 */
function countValidPlacements(grid: Grid, shape: Shape): number {
  let count = 0;
  const maxRow = BOARD_SIZE - shape.length;
  const maxCol = BOARD_SIZE - (shape[0]?.length ?? 0);
  for (let r = 0; r <= maxRow; r++) {
    for (let c = 0; c <= maxCol; c++) {
      if (canPlaceBlock(grid, dummyShape(shape), r, c)) count++;
    }
  }
  return count;
}

/** 
 * Wrapper for canPlaceBlock — ensures we don't accidentally mutate 1s.
 * (The grid itself is 0/1, so we just pass shape directly)
 */
function dummyShape(s: Shape): Shape { return s; }

/**
 * Count lines that are 1-2 cells from clearing.
 */
function countNearCompleteLines(grid: Grid): {
  rows: number;
  cols: number;
} {
  let rows = 0;
  let cols = 0;
  for (let r = 0; r < BOARD_SIZE; r++) {
    if (grid[r].filter(c => c === 1).length >= 6) rows++;
  }
  for (let c = 0; c < BOARD_SIZE; c++) {
    let filled = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
      if (grid[r][c] === 1) filled++;
    }
    if (filled >= 6) cols++;
  }
  return { rows, cols };
}

/**
 * Classify danger using occupancy, pressure, and max fit area.
 */
function classifyDanger(
  occupancy: number,
  avgPlacements: number,
  maxSquare: number,
): "low" | "medium" | "high" | "critical" {
  if (avgPlacements <= DANGER_THRESHOLD.PLACEMENT_PRESSURE.CRITICAL || maxSquare < 2) {
    return "critical";
  }
  if (occupancy >= DANGER_THRESHOLD.OCCUPANCY.HIGH || avgPlacements <= DANGER_THRESHOLD.PLACEMENT_PRESSURE.HIGH) {
    return "high";
  }
  if (occupancy >= DANGER_THRESHOLD.OCCUPANCY.MEDIUM) {
    return "medium";
  }
  return "low";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function analyzeBoardState(
  grid: Grid,
  pool: Shape[] = SHAPES,
): BoardAnalysis {
  const { occupied, empty } = countCells(grid);
  const totalCells = BOARD_SIZE * BOARD_SIZE;
  const occupancy = occupied / totalCells;

  const maxSquare = findMaxSquare(grid);

  let totalPlacementCount = 0;
  for (const shape of pool) {
    let count = 0;
    const maxRow = BOARD_SIZE - shape.length;
    const maxCol = BOARD_SIZE - (shape[0]?.length ?? 0);
    for (let r = 0; r <= maxRow; r++) {
      for (let c = 0; c <= maxCol; c++) {
        if (canPlaceBlock(grid, shape, r, c)) count++;
      }
    }
    totalPlacementCount += count;
  }
  
  const avgPlacementsPerShape = pool.length > 0 ? totalPlacementCount / pool.length : 0;
  const nearComplete = countNearCompleteLines(grid);

  return {
    occupiedCells: occupied,
    emptyCells: empty,
    occupancy,
    totalPlacementCount,
    avgPlacementsPerShape,
    nearCompleteRows: nearComplete.rows,
    nearCompleteCols: nearComplete.cols,
    maxRectAvailable: maxSquare,
    danger: classifyDanger(occupancy, avgPlacementsPerShape, maxSquare),
  };
}
