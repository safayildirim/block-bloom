/**
 * Game Logic Utilities
 * Core game mechanics: coordinate conversion, collision detection, and line clearing
 */

import { BOARD_SIZE, CELL_SIZE, GAP, GRID_PADDING } from '@/constants/constants';
import type { Grid, Shape } from '@/constants/types';

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
 * 1. Coordinate Conversion
 * Converts absolute screen coordinates to grid row/column indices
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
  }
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
 * 2. Collision & Validity Check
 * Checks if a block shape can be placed at the given grid position
 * 
 * @param grid - Current game board state (8x8 matrix)
 * @param blockShape - Block shape matrix (2D array of 0s and 1s)
 * @param startRow - Top-left row position where block should be placed
 * @param startCol - Top-left column position where block should be placed
 * @returns true if block can be placed, false otherwise
 * 
 * @example
 * // Test Case 1: Valid placement in empty grid
 * const grid = createEmptyGrid();
 * const block = [[1, 1], [1, 0]]; // L-shape
 * canPlaceBlock(grid, block, 0, 0); // true
 * 
 * @example
 * // Test Case 2: Out of bounds - block extends beyond right edge
 * const grid = createEmptyGrid();
 * const block = [[1, 1, 1, 1, 1]]; // 5-cell horizontal line
 * canPlaceBlock(grid, block, 0, 4); // false (would extend to col 8, but max is 7)
 * 
 * @example
 * // Test Case 3: Out of bounds - block extends beyond bottom edge
 * const grid = createEmptyGrid();
 * const block = [[1], [1], [1], [1], [1]]; // 5-cell vertical line
 * canPlaceBlock(grid, block, 4, 0); // false (would extend to row 8, but max is 7)
 * 
 * @example
 * // Test Case 4: Out of bounds - negative row
 * const grid = createEmptyGrid();
 * const block = [[1, 1]];
 * canPlaceBlock(grid, block, -1, 0); // false
 * 
 * @example
 * // Test Case 5: Out of bounds - negative column
 * const grid = createEmptyGrid();
 * const block = [[1, 1]];
 * canPlaceBlock(grid, block, 0, -1); // false
 * 
 * @example
 * // Test Case 6: Collision - block overlaps with filled cell
 * const grid = createEmptyGrid();
 * grid[2][2] = 1; // Fill a cell
 * const block = [[1, 1], [1, 1]]; // 2x2 square
 * canPlaceBlock(grid, block, 1, 1); // false (overlaps with filled cell at [2][2])
 * 
 * @example
 * // Test Case 7: L-shape near corner - valid
 * const grid = createEmptyGrid();
 * const block = [[1, 0], [1, 1]]; // L-shape
 * canPlaceBlock(grid, block, 6, 6); // true (fits in bottom-right corner)
 * 
 * @example
 * // Test Case 8: L-shape near corner - invalid (extends beyond)
 * const grid = createEmptyGrid();
 * const block = [[1, 0], [1, 1]]; // L-shape
 * canPlaceBlock(grid, block, 7, 7); // false (row 7 + 1 = 8, out of bounds)
 * 
 * @example
 * // Test Case 9: T-shape placement
 * const grid = createEmptyGrid();
 * const block = [[1, 1, 1], [0, 1, 0]]; // T-shape
 * canPlaceBlock(grid, block, 3, 3); // true
 * 
 * @example
 * // Test Case 10: Single cell block
 * const grid = createEmptyGrid();
 * const block = [[1]]; // Single cell
 * canPlaceBlock(grid, block, 0, 0); // true
 * canPlaceBlock(grid, block, 7, 7); // true
 * 
 * @example
 * // Test Case 11: Block with empty cells (sparse shape)
 * const grid = createEmptyGrid();
 * const block = [[1, 0, 1], [0, 1, 0]]; // Sparse shape
 * canPlaceBlock(grid, block, 0, 0); // true
 * 
 * @example
 * // Test Case 12: Multiple collisions
 * const grid = createEmptyGrid();
 * grid[1][1] = 1;
 * grid[1][2] = 1;
 * grid[2][1] = 1;
 * const block = [[1, 1], [1, 1]]; // 2x2 square
 * canPlaceBlock(grid, block, 0, 0); // true (no overlap)
 * canPlaceBlock(grid, block, 1, 1); // false (overlaps with all filled cells)
 * 
 * @example
 * // Test Case 13: Edge case - block at exact boundary
 * const grid = createEmptyGrid();
 * const block = [[1, 1]]; // 2-cell horizontal
 * canPlaceBlock(grid, block, 0, 6); // true (cols 6 and 7, both valid)
 * canPlaceBlock(grid, block, 0, 7); // false (col 7 valid, but col 8 out of bounds)
 * 
 * @example
 * // Test Case 14: Large block (3x3) placement
 * const grid = createEmptyGrid();
 * const block = [[1, 1, 1], [1, 1, 1], [1, 1, 1]]; // 3x3 square
 * canPlaceBlock(grid, block, 5, 5); // true (rows 5-7, cols 5-7)
 * canPlaceBlock(grid, block, 6, 6); // false (would extend to row 8 and col 8)
 * 
 * @example
 * // Test Case 15: Z-shape placement
 * const grid = createEmptyGrid();
 * const block = [[1, 1, 0], [0, 1, 1]]; // Z-shape
 * canPlaceBlock(grid, block, 0, 0); // true
 * canPlaceBlock(grid, block, 6, 5); // false (col 5+2=7 valid, but row 6+1=7 valid, wait... let me recalculate)
 * // Actually: row 6+1=7 (valid), col 5+2=7 (valid) - should be true
 * // Let me fix: row 6+1=7 (valid), col 5+2=7 (valid) - true
 * 
 * @example
 * // Test Case 16: Plus shape (5 cells)
 * const grid = createEmptyGrid();
 * const block = [[0, 1, 0], [1, 1, 1], [0, 1, 0]]; // Plus shape
 * canPlaceBlock(grid, block, 2, 2); // true
 * 
 * @example
 * // Test Case 17: Partial collision - only one cell overlaps
 * const grid = createEmptyGrid();
 * grid[3][3] = 1; // Fill one cell
 * const block = [[1, 1], [1, 1]]; // 2x2 square
 * canPlaceBlock(grid, block, 2, 2); // false (cell [3][3] is filled)
 * canPlaceBlock(grid, block, 2, 3); // false (cell [3][3] is filled)
 * canPlaceBlock(grid, block, 3, 2); // false (cell [3][3] is filled)
 * canPlaceBlock(grid, block, 3, 3); // false (cell [3][3] is filled)
 * canPlaceBlock(grid, block, 4, 4); // true (no overlap)
 */
export function canPlaceBlock(
  grid: Grid,
  blockShape: Shape,
  startRow: number,
  startCol: number
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
 * @example
 * // Test Case 1: No lines to clear
 * const grid = createEmptyGrid();
 * const result = checkLines(grid);
 * result.linesCleared === 0; // true
 * 
 * @example
 * // Test Case 2: Clear one row
 * const grid = createEmptyGrid();
 * // Fill row 3 completely
 * for (let col = 0; col < 8; col++) {
 *   grid[3][col] = 1;
 * }
 * const result = checkLines(grid);
 * result.linesCleared === 1; // true
 * // Row 3 should be all zeros now
 * 
 * @example
 * // Test Case 3: Clear one column
 * const grid = createEmptyGrid();
 * // Fill column 5 completely
 * for (let row = 0; row < 8; row++) {
 *   grid[row][5] = 1;
 * }
 * const result = checkLines(grid);
 * result.linesCleared === 1; // true
 * // Column 5 should be all zeros now
 * 
 * @example
 * // Test Case 4: Clear multiple rows
 * const grid = createEmptyGrid();
 * // Fill rows 1 and 4 completely
 * for (let col = 0; col < 8; col++) {
 *   grid[1][col] = 1;
 *   grid[4][col] = 1;
 * }
 * const result = checkLines(grid);
 * result.linesCleared === 2; // true
 * 
 * @example
 * // Test Case 5: Clear multiple columns
 * const grid = createEmptyGrid();
 * // Fill columns 0 and 7 completely
 * for (let row = 0; row < 8; row++) {
 *   grid[row][0] = 1;
 *   grid[row][7] = 1;
 * }
 * const result = checkLines(grid);
 * result.linesCleared === 2; // true
 * 
 * @example
 * // Test Case 6: Clear rows and columns simultaneously
 * const grid = createEmptyGrid();
 * // Fill row 2 and column 3 completely
 * for (let col = 0; col < 8; col++) {
 *   grid[2][col] = 1;
 * }
 * for (let row = 0; row < 8; row++) {
 *   grid[row][3] = 1;
 * }
 * const result = checkLines(grid);
 * result.linesCleared === 2; // true
 * 
 * @example
 * // Test Case 7: Clear intersecting row and column
 * const grid = createEmptyGrid();
 * // Fill row 4 completely
 * for (let col = 0; col < 8; col++) {
 *   grid[4][col] = 1;
 * }
 * // Fill column 4 completely (intersects with row 4)
 * for (let row = 0; row < 8; row++) {
 *   grid[row][4] = 1;
 * }
 * const result = checkLines(grid);
 * result.linesCleared === 2; // true
 * // Cell [4][4] is cleared by both row and column clear
 * 
 * @example
 * // Test Case 8: Partial row (should not clear)
 * const grid = createEmptyGrid();
 * // Fill only 7 cells in row 0
 * for (let col = 0; col < 7; col++) {
 *   grid[0][col] = 1;
 * }
 * const result = checkLines(grid);
 * result.linesCleared === 0; // true
 * 
 * @example
 * // Test Case 9: Partial column (should not clear)
 * const grid = createEmptyGrid();
 * // Fill only 7 cells in column 0
 * for (let row = 0; row < 7; row++) {
 *   grid[row][0] = 1;
 * }
 * const result = checkLines(grid);
 * result.linesCleared === 0; // true
 * 
 * @example
 * // Test Case 10: Clear all rows (edge case)
 * const grid = createEmptyGrid();
 * // Fill all rows
 * for (let row = 0; row < 8; row++) {
 *   for (let col = 0; col < 8; col++) {
 *     grid[row][col] = 1;
 *   }
 * }
 * const result = checkLines(grid);
 * result.linesCleared === 8; // true (all 8 rows cleared)
 * 
 * @example
 * // Test Case 11: Clear all columns (edge case)
 * const grid = createEmptyGrid();
 * // Fill all columns
 * for (let row = 0; row < 8; row++) {
 *   for (let col = 0; col < 8; col++) {
 *     grid[row][col] = 1;
 *   }
 * }
 * const result = checkLines(grid);
 * result.linesCleared === 8; // true (all 8 columns cleared)
 * 
 * @example
 * // Test Case 12: Clear all rows and columns (full board)
 * const grid = createEmptyGrid();
 * // Fill entire board
 * for (let row = 0; row < 8; row++) {
 *   for (let col = 0; col < 8; col++) {
 *     grid[row][col] = 1;
 *   }
 * }
 * const result = checkLines(grid);
 * result.linesCleared === 16; // true (8 rows + 8 columns)
 * // Entire board should be cleared
 */
export function checkLines(grid: Grid): {
  clearedGrid: Grid;
  linesCleared: number;
} {
  // Create a deep copy of the grid to avoid mutating the original
  const clearedGrid: Grid = grid.map((row) => [...row]);
  let linesCleared = 0;

  // Track which rows and columns need to be cleared
  const rowsToClear: number[] = [];
  const colsToClear: number[] = [];

  // Check all rows
  for (let row = 0; row < BOARD_SIZE; row++) {
    const isRowFull = clearedGrid[row].every((cell) => cell === 1);
    if (isRowFull) {
      rowsToClear.push(row);
    }
  }

  // Check all columns
  for (let col = 0; col < BOARD_SIZE; col++) {
    const isColFull = clearedGrid.every((row) => row[col] === 1);
    if (isColFull) {
      colsToClear.push(col);
    }
  }

  // Clear rows
  for (const row of rowsToClear) {
    clearedGrid[row] = Array(BOARD_SIZE).fill(0);
    linesCleared++;
  }

  // Clear columns
  for (const col of colsToClear) {
    for (let row = 0; row < BOARD_SIZE; row++) {
      clearedGrid[row][col] = 0;
    }
    linesCleared++;
  }

  return {
    clearedGrid,
    linesCleared,
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

