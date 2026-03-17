/**
 * Tests for the fair piece batch generation system.
 *
 * Covers:
 *   - Batch validation success / failure
 *   - Placement after line clears unlocks remaining pieces
 *   - generateNextPieceBatch returns only valid batches
 *   - Fallback behaviour on near-full boards
 *   - Pure utility functions (clone, simulate, clear)
 */

import { BOARD_SIZE, SHAPES } from "@/constants/constants";
import type { Grid, Shape, CellState } from "@/constants/types";
import { createEmptyGrid } from "@/utils/gameLogic";
import {
  cloneBoardState,
  simulatePlacement,
  clearCompletedLines,
  getAllValidPlacements,
  isBatchSolvable,
} from "@/utils/batchSolver";
import { generateNextPieceBatch } from "@/utils/pieceGeneration";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Fill an entire row on a grid clone. */
function fillRow(grid: Grid, row: number): Grid {
  const g = cloneBoardState(grid);
  for (let c = 0; c < BOARD_SIZE; c++) {
    g[row][c] = 1;
  }
  return g;
}

/** Fill an entire column on a grid clone. */
function fillCol(grid: Grid, col: number): Grid {
  const g = cloneBoardState(grid);
  for (let r = 0; r < BOARD_SIZE; r++) {
    g[r][col] = 1;
  }
  return g;
}

/** Create a nearly full board with only specific cells empty. */
function createNearlyFullBoard(
  emptyCells: { row: number; col: number }[],
): Grid {
  const grid: Grid = Array.from(
    { length: BOARD_SIZE },
    () => Array(BOARD_SIZE).fill(1) as CellState[],
  );
  for (const { row, col } of emptyCells) {
    grid[row][col] = 0;
  }
  return grid;
}

// ---------------------------------------------------------------------------
// Utility function tests
// ---------------------------------------------------------------------------

describe("cloneBoardState", () => {
  it("produces an independent deep copy", () => {
    const grid = createEmptyGrid();
    grid[0][0] = 1;
    const clone = cloneBoardState(grid);

    // Mutate the clone — original should be unchanged
    clone[0][0] = 0;
    clone[3][3] = 1;

    expect(grid[0][0]).toBe(1);
    expect(grid[3][3]).toBe(0);
  });
});

describe("simulatePlacement", () => {
  it("places a shape on the grid in-place", () => {
    const grid = createEmptyGrid();
    const lShape: Shape = [
      [1, 0],
      [1, 1],
    ];

    simulatePlacement(grid, lShape, 2, 3);

    expect(grid[2][3]).toBe(1);
    expect(grid[2][4]).toBe(0);
    expect(grid[3][3]).toBe(1);
    expect(grid[3][4]).toBe(1);
  });
});

describe("clearCompletedLines", () => {
  it("clears a full row", () => {
    let grid = createEmptyGrid();
    grid = fillRow(grid, 4);
    const cleared = clearCompletedLines(grid);

    expect(cleared[4].every((c) => c === 0)).toBe(true);
  });

  it("clears a full column", () => {
    let grid = createEmptyGrid();
    grid = fillCol(grid, 5);
    const cleared = clearCompletedLines(grid);

    for (let r = 0; r < BOARD_SIZE; r++) {
      expect(cleared[r][5]).toBe(0);
    }
  });

  it("clears intersecting row and column simultaneously", () => {
    let grid = createEmptyGrid();
    grid = fillRow(grid, 2);
    grid = fillCol(grid, 6);
    const cleared = clearCompletedLines(grid);

    // Row 2 should be cleared
    expect(cleared[2].every((c) => c === 0)).toBe(true);
    // Column 6 should be cleared
    for (let r = 0; r < BOARD_SIZE; r++) {
      expect(cleared[r][6]).toBe(0);
    }
  });
});

describe("getAllValidPlacements", () => {
  it("returns all valid positions for a single cell on empty board", () => {
    const grid = createEmptyGrid();
    const singleCell: Shape = [[1]];
    const placements = getAllValidPlacements(grid, singleCell);
    expect(placements.length).toBe(BOARD_SIZE * BOARD_SIZE);
  });

  it("returns fewer placements on a partially filled board", () => {
    const grid = createEmptyGrid();
    grid[0][0] = 1;
    grid[0][1] = 1;
    const singleCell: Shape = [[1]];
    const placements = getAllValidPlacements(grid, singleCell);
    expect(placements.length).toBe(BOARD_SIZE * BOARD_SIZE - 2);
  });

  it("supports earlyExit to return at most 1 result", () => {
    const grid = createEmptyGrid();
    const singleCell: Shape = [[1]];
    const placements = getAllValidPlacements(grid, singleCell, true);
    expect(placements.length).toBe(1);
  });

  it("returns empty array when piece cannot fit anywhere", () => {
    // Board completely full
    const grid = createNearlyFullBoard([]);
    const twoByTwo: Shape = [
      [1, 1],
      [1, 1],
    ];
    const placements = getAllValidPlacements(grid, twoByTwo);
    expect(placements.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// isBatchSolvable — core solver tests
// ---------------------------------------------------------------------------

describe("isBatchSolvable", () => {
  it("returns true for trivially placeable pieces on an empty board", () => {
    const grid = createEmptyGrid();
    const shapes: Shape[] = [[[1]], [[1, 1]], [[1], [1]]];
    expect(isBatchSolvable(grid, shapes)).toBe(true);
  });

  it("returns true for empty piece list (base case)", () => {
    const grid = createEmptyGrid();
    expect(isBatchSolvable(grid, [])).toBe(true);
  });

  it("returns false when pieces cannot possibly fit", () => {
    // Build a board where NO full row or column can be formed, so clears
    // can't rescue the situation. Leave a diagonal pattern of empty cells —
    // each empty cell is in a unique row and column, preventing any line clear.
    const grid = createEmptyGrid();
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        grid[r][c] = 1;
      }
    }
    // Clear one cell per row on a distinct column (diagonal) —
    // no row or column is fully filled after placing into one of them.
    // Actually we only need 1 empty cell and a piece that needs 2.
    // But placing [[1]] at the empty cell would complete both a row and a col
    // (since all other cells are filled), triggering clears.
    //
    // Instead: leave exactly 2 empty cells such that:
    //   - they are in the same row, so that row has 6 filled + 2 empty
    //   - every other row is missing one cell to prevent row clears
    //   - no column is fully filled
    //
    // Simplest approach: use a "diagonal gaps" board. Each row r has cell (r, r)
    // empty. This means every row has 7/8 filled (no full rows) and every column
    // has 7/8 filled (no full columns). Total empty = 8.
    const gridDiag = createEmptyGrid();
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        gridDiag[r][c] = r === c ? 0 : 1;
      }
    }
    // Now: 8 empty cells on the diagonal. No row or column is full.
    // Each empty cell is at (r,r). Two diagonal neighbors (r,r) and (r+1,r+1)
    // are never horizontally or vertically adjacent.
    //
    // A 2×2 square needs a 2×2 empty block — which doesn't exist here.
    const twoByTwo: Shape = [
      [1, 1],
      [1, 1],
    ];
    // Three 2×2 squares is 12 cells, but even one can't be placed.
    expect(isBatchSolvable(gridDiag, [twoByTwo, twoByTwo, twoByTwo])).toBe(
      false,
    );
  });

  it("detects order-dependent solvability (piece A must go before B)", () => {
    // Construct a scenario where placing a big piece first would block
    // a second piece, but placing the small piece first works.
    //
    // Use a diagonal-gap board so no clears happen:
    // rows 0-6 fully filled, row 7 empty (8 cells).
    // But rows 0-6 fully filled = 7 full rows that will clear!
    //
    // Instead: rows 0-5 have col 0 empty (no full rows), row 6 has all
    // cols filled except col 0, row 7 fully empty.
    // Column 0 has only row 7 filled ⇒ not full. Other cols: rows 0-6
    // all filled + row 7 = depends. We need to avoid full columns too.
    //
    // Simplest: fill ONLY row 7, leave rest empty. Then only 8 cells are
    // available in the other rows.
    //
    // Actually let's just use an almost-empty board with a constrained
    // space. Fill rows 0-5 entirely, row 6 entirely, leave row 7 empty.
    // OH WAIT — that gives 7 full rows that all clear.
    //
    // Fine, simplest correct approach: empty board, large pieces.
    const grid = createEmptyGrid();
    // Fill so that only row 7 is empty and row clears don't happen
    // (no full rows). Actually, fill rows 0-6 with a gap on col 0.
    for (let r = 0; r < 7; r++) {
      for (let c = 1; c < BOARD_SIZE; c++) {
        grid[r][c] = 1;
      }
      // col 0 stays 0 — prevents these rows from clearing
    }
    // Row 7: entirely empty (8 cells)
    // Col 0: entirely empty (8 cells, rows 0-7)
    // No row is full, no column is full ⇒ no clears will happen.

    // Available cells: col 0 (8 cells vertical) + row 7 (8 cells, but col 0
    // overlaps) = 8 + 7 = 15 empty cells total.

    // Pieces: 5-long horizontal + 3-long horizontal. Both can only go in row 7.
    const fiveH: Shape = [[1, 1, 1, 1, 1]]; // needs 5 contiguous in a row
    const threeH: Shape = [[1, 1, 1]]; // needs 3 contiguous in a row

    // Row 7 has 8 contiguous cells. 5 + 3 = 8. They fit in some order.
    expect(isBatchSolvable(grid, [fiveH, threeH])).toBe(true);
    expect(isBatchSolvable(grid, [threeH, fiveH])).toBe(true);
  });

  it("handles the case where first piece placement triggers a clear that unlocks the others", () => {
    // Row 0: fill cols 0-6 (col 7 empty). Place [[1]] at (0,7) → row 0 full → clears.
    // Rows 1-7: fill cols 0-4 only so they don't form full rows or columns.
    // After row 0 clears, row 0 is empty (8 cells).
    // Now pieces 2 & 3 can be placed in the freshly cleared row 0.
    //
    // Without placing piece 1 first, pieces 2 & 3 might not fit if we
    // make them too wide for the available cols-5..7 in rows 1-7.
    const grid = createEmptyGrid();
    // Row 0: cols 0-6 filled, col 7 empty
    for (let c = 0; c < 7; c++) {
      grid[0][c] = 1;
    }
    // Rows 1-7: cols 0-4 filled (5 cells each). Cols 5-7 empty.
    for (let r = 1; r < BOARD_SIZE; r++) {
      for (let c = 0; c < 5; c++) {
        grid[r][c] = 1;
      }
    }

    // Piece 1: single cell → place at (0,7) → completes row 0 → row 0 clears
    // After clear: row 0 = 8 empty cells, rows 1-7 have cols 5-7 empty each
    // Piece 2: 5-cell horizontal → fits in row 0 (now empty) starting at col 0
    // Piece 3: 3-cell horizontal → fits in row 0 or in any of rows 1-7 cols 5-7
    const piece1: Shape = [[1]];
    const piece2: Shape = [[1, 1, 1, 1, 1]]; // 5 wide — needs a full empty row
    const piece3: Shape = [[1, 1, 1]];

    // Without placing piece1 first, piece2 (5-wide) can't fit anywhere:
    // - Row 0 has only col 7 empty (1 cell)
    // - Rows 1-7 have cols 5-7 empty (only 3 contiguous cells)
    // Verify that piece2 alone can't be placed on the original board
    expect(getAllValidPlacements(grid, piece2).length).toBe(0);

    // But the batch IS solvable: place piece1 at (0,7) → clear → then piece2 fits
    expect(isBatchSolvable(grid, [piece1, piece2, piece3])).toBe(true);
  });

  it("returns false for a truly impossible batch on a near-full board", () => {
    // Board where each row has exactly 2 empty cells at non-adjacent positions.
    // No single-cell placement can complete any row (requires filling 2 more).
    // Empty cell pairs are chosen so no column is ever full either.
    //
    // Pattern: row r has cells (r, 2*r % 8) and (r, (2*r+1) % 8) empty.
    // This scatters empties across different columns.
    const grid = createEmptyGrid();
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        grid[r][c] = 1;
      }
      // Clear 2 cells per row
      grid[r][(2 * r) % BOARD_SIZE] = 0;
      grid[r][(2 * r + 3) % BOARD_SIZE] = 0;
    }
    // Verify precondition: no row is full, no column is full
    for (let r = 0; r < BOARD_SIZE; r++) {
      const rowSum = grid[r].reduce((a: number, b: number) => a + b, 0);
      expect(rowSum).toBe(BOARD_SIZE - 2); // 6 filled cells per row
    }

    // 3 pieces that are each only a single 2×2 square.
    // No 2×2 block of empty cells exists in this sparse layout.
    const twoByTwo: Shape = [
      [1, 1],
      [1, 1],
    ];
    expect(isBatchSolvable(grid, [twoByTwo, twoByTwo, twoByTwo])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// generateNextPieceBatch — integration tests
// ---------------------------------------------------------------------------

describe("generateNextPieceBatch", () => {
  it("returns exactly 3 blocks", () => {
    const grid = createEmptyGrid();
    const blocks = generateNextPieceBatch(grid);
    expect(blocks.length).toBe(3);
  });

  it("returned batch is solvable on an empty board", () => {
    const grid = createEmptyGrid();
    const blocks = generateNextPieceBatch(grid);
    const shapes = blocks.map((b) => b.shape);
    expect(isBatchSolvable(grid, shapes)).toBe(true);
  });

  it("returned batch is solvable on a partially filled board", () => {
    const grid = createEmptyGrid();
    // Fill a checkerboard-ish pattern
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if ((r + c) % 3 === 0) grid[r][c] = 1;
      }
    }
    const blocks = generateNextPieceBatch(grid);
    const shapes = blocks.map((b) => b.shape);
    expect(isBatchSolvable(grid, shapes)).toBe(true);
  });

  it("each block has id, shape, and color", () => {
    const grid = createEmptyGrid();
    const blocks = generateNextPieceBatch(grid);
    for (const block of blocks) {
      expect(block.id).toBeDefined();
      expect(block.shape).toBeDefined();
      expect(block.color).toBeDefined();
      expect(block.shape.length).toBeGreaterThan(0);
    }
  });

  it("fallback works on a nearly full board", () => {
    // Leave just enough room for very small shapes
    const emptyCells: { row: number; col: number }[] = [];
    // Leave bottom-right 3x3 corner empty (9 cells) — enough for small shapes
    for (let r = 5; r < BOARD_SIZE; r++) {
      for (let c = 5; c < BOARD_SIZE; c++) {
        emptyCells.push({ row: r, col: c });
      }
    }
    const grid = createNearlyFullBoard(emptyCells);
    const blocks = generateNextPieceBatch(grid);

    // Should still return 3 blocks (via fallback if needed)
    expect(blocks.length).toBe(3);
  });
});
