/**
 * Game Logic Utilities
 * Core game mechanics: coordinate conversion, collision detection, and line clearing
 */

import {
  BOARD_SIZE,
  CELL_SIZE,
  GAP,
  GRID_PADDING,
} from "@/constants/constants";
import type { Grid, Shape } from "@/constants/types";

/**
 * Board layout measurements
 */
export interface BoardLayout {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Block size configuration
 */
export interface BlockSize {
  cellSize: number;
  gap: number;
  padding: number;
}

/**
 * Coordinate Conversion (Top-Left Based)
 * Converts absolute screen coordinates to grid row/column indices
 * Uses top-left corner of the touch point
 *
 * @param absoluteX - Absolute X coordinate on screen
 * @param absoluteY - Absolute Y coordinate on screen
 * @param boardLayout - Board position and dimensions
 * @param blockSize - Cell size, gap, and padding configuration
 * @returns Grid position { row, col } or null if out of bounds
 */
export function getGridPosition(
  absoluteX: number,
  absoluteY: number,
  boardLayout: BoardLayout,
  blockSize: BlockSize = {
    cellSize: CELL_SIZE,
    gap: GAP,
    padding: GRID_PADDING,
  },
): { row: number; col: number } | null {
  // Convert to relative coordinates within the canvas
  const relativeX = absoluteX - boardLayout.x - blockSize.padding;
  const relativeY = absoluteY - boardLayout.y - blockSize.padding;

  // Calculate grid position
  const cellWithGap = blockSize.cellSize + blockSize.gap;
  const col = Math.floor(relativeX / cellWithGap);
  const row = Math.floor(relativeY / cellWithGap);

  // Validate bounds
  if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) {
    return null;
  }

  return { row, col };
}

/**
 * 1b. Coordinate Conversion (Center-Based)
 * Converts block center point to grid row/column indices
 * Calculates grid position based on the center of the dragged block
 *
 * @param gestureX - Absolute X coordinate of gesture (touch point)
 * @param gestureY - Absolute Y coordinate of gesture (touch point)
 * @param blockWidthPx - Width of the block in pixels
 * @param blockHeightPx - Height of the block in pixels
 * @param dragOffsetY - Visual offset applied to raise block above finger
 * @param boardLayout - Board position and dimensions
 * @param blockSize - Cell size, gap, and padding configuration
 * @returns Grid position { row, col } or null if out of bounds
 */
export function getGridPositionFromCenter(
  gestureX: number,
  gestureY: number,
  blockWidthPx: number,
  blockHeightPx: number,
  dragOffsetY: number,
  boardLayout: BoardLayout,
  blockSize: BlockSize = {
    cellSize: CELL_SIZE,
    gap: GAP,
    padding: GRID_PADDING,
  },
): { row: number; col: number } | null {
  // Calculate block center point
  // The visual block is offset by dragOffsetY above the finger
  const blockCenterX = gestureX + blockWidthPx / 2;
  const blockCenterY = gestureY + dragOffsetY + blockHeightPx / 2;

  // Convert center point to relative coordinates within the canvas
  const relativeX = blockCenterX - boardLayout.x - blockSize.padding;
  const relativeY = blockCenterY - boardLayout.y - blockSize.padding;

  // Calculate grid position based on center
  const cellWithGap = blockSize.cellSize + blockSize.gap;
  const col = Math.floor(relativeX / cellWithGap);
  const row = Math.floor(relativeY / cellWithGap);

  // Validate bounds
  if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) {
    return null;
  }

  return { row, col };
}

/**
 * 2. Collision & Validity Check
 * Checks if a block shape can be placed at the given grid position
 *
 * @param grid - Current game board state (8x8 matrix)
 * @param blockShape - Block shape matrix (2D array of 0s and 1s)
 * @param startRow - Top-left row position where block should be placed
 * @param startCol - Top-left column position where block should be placed
 * @returns true if block can be placed, false otherwise
 *
 */
export function canPlaceBlock(
  grid: Grid,
  blockShape: Shape,
  startRow: number,
  startCol: number,
): boolean {
  // Iterate through each cell in the block shape
  for (let shapeRow = 0; shapeRow < blockShape.length; shapeRow++) {
    for (let shapeCol = 0; shapeCol < blockShape[shapeRow].length; shapeCol++) {
      // Only check cells that are part of the block (value === 1)
      if (blockShape[shapeRow][shapeCol] === 1) {
        // Calculate target position on the grid
        const targetRow = startRow + shapeRow;
        const targetCol = startCol + shapeCol;

        // Check bounds - must be within grid limits
        if (
          targetRow < 0 ||
          targetRow >= BOARD_SIZE ||
          targetCol < 0 ||
          targetCol >= BOARD_SIZE
        ) {
          return false;
        }

        // Check if cell is already occupied
        if (grid[targetRow][targetCol] === 1) {
          return false;
        }
      }
    }
  }

  // All checks passed - block can be placed
  return true;
}

/**
 * 3. Line Clearing Algorithm
 * Checks all rows and columns, clears fully filled lines, and returns updated grid
 *
 * @param grid - Current game board state (8x8 matrix)
 * @returns Object with cleared grid and count of lines cleared
 *
 */
export function checkLines(grid: Grid): {
  clearedGrid: Grid;
  linesCleared: number;
  clearedRows: number[];
  clearedCols: number[];
} {
  // Create a deep copy of the grid to avoid mutating the original
  const clearedGrid: Grid = grid.map((row) => [...row]);
  let linesCleared = 0;

  // Track which rows and columns need to be cleared
  const clearedRows: number[] = [];
  const clearedCols: number[] = [];

  // Check all rows
  for (let row = 0; row < BOARD_SIZE; row++) {
    const isRowFull = clearedGrid[row].every((cell) => cell === 1);
    if (isRowFull) {
      clearedRows.push(row);
    }
  }

  // Check all columns
  for (let col = 0; col < BOARD_SIZE; col++) {
    const isColFull = clearedGrid.every((row) => row[col] === 1);
    if (isColFull) {
      clearedCols.push(col);
    }
  }

  // Clear rows
  for (const row of clearedRows) {
    clearedGrid[row] = Array(BOARD_SIZE).fill(0);
    linesCleared++;
  }

  // Clear columns
  for (const col of clearedCols) {
    for (let row = 0; row < BOARD_SIZE; row++) {
      clearedGrid[row][col] = 0;
    }
    linesCleared++;
  }

  return {
    clearedGrid,
    linesCleared,
    clearedRows,
    clearedCols,
  };
}

/**
 * Helper function to create an empty grid (for testing)
 */
export function createEmptyGrid(): Grid {
  return Array(BOARD_SIZE)
    .fill(null)
    .map(() => Array(BOARD_SIZE).fill(0));
}
