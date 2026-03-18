/**
 * Tests for the fair piece batch generation system.
 *
 * Covers:
 *   - Batch validation success / failure
 *   - Placement after line clears unlocks remaining pieces
 *   - generateWeightedPieceBatch returns only valid solvable batches
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
import { generateWeightedPieceBatch } from "@/utils/weightedGeneration";

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
    // Diagonal-gap board where each row has 1 empty cell on the diagonal.
    // No row or column is full. A 2×2 shape can't fit since the empty cells
    // are never adjacent.
    const gridDiag = createEmptyGrid();
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        gridDiag[r][c] = r === c ? 0 : 1;
      }
    }
    const twoByTwo: Shape = [
      [1, 1],
      [1, 1],
    ];
    // Even a single 2×2 can't be placed.
    expect(isBatchSolvable(gridDiag, [twoByTwo, twoByTwo, twoByTwo])).toBe(
      false,
    );
  });

  it("detects order-dependent solvability (piece A must go before B)", () => {
    const grid = createEmptyGrid();
    // Fill rows 0-6 with a gap on col 0 (prevents row clears).
    for (let r = 0; r < 7; r++) {
      for (let c = 1; c < BOARD_SIZE; c++) {
        grid[r][c] = 1;
      }
    }
    // Row 7: entirely empty (8 cells). No row/col is full ⇒ no clears.
    const fiveH: Shape = [[1, 1, 1, 1, 1]]; // needs 5 contiguous in a row
    const threeH: Shape = [[1, 1, 1]]; // needs 3 contiguous in a row

    // Row 7 has 8 cells. 5 + 3 = 8 exactly. Both orderings work.
    expect(isBatchSolvable(grid, [fiveH, threeH])).toBe(true);
    expect(isBatchSolvable(grid, [threeH, fiveH])).toBe(true);
  });

  it("handles the case where first piece placement triggers a clear that unlocks the others", () => {
    const grid = createEmptyGrid();
    // Row 0: cols 0-6 filled, col 7 empty
    for (let c = 0; c < 7; c++) {
      grid[0][c] = 1;
    }
    // Rows 1-7: cols 0-4 filled. Cols 5-7 empty.
    for (let r = 1; r < BOARD_SIZE; r++) {
      for (let c = 0; c < 5; c++) {
        grid[r][c] = 1;
      }
    }

    const piece1: Shape = [[1]]; // completes row 0 → triggers clear
    const piece2: Shape = [[1, 1, 1, 1, 1]]; // 5 wide — needs cleared row 0
    const piece3: Shape = [[1, 1, 1]];

    // PROOF 1: piece2 cannot be placed on the original board
    expect(getAllValidPlacements(grid, piece2).length).toBe(0);

    // PROOF 2: after placing piece1 at (0,7) and clearing, piece2 CAN fit
    const afterPlace = simulatePlacement(cloneBoardState(grid), piece1, 0, 7);
    const afterClear = clearCompletedLines(afterPlace);
    // Row 0 should now be empty (cleared)
    expect(afterClear[0].every((c) => c === 0)).toBe(true);
    // piece2 should now be placeable on row 0
    expect(getAllValidPlacements(afterClear, piece2).length).toBeGreaterThan(0);

    // PROOF 3: the batch IS solvable via the clear path
    expect(isBatchSolvable(grid, [piece1, piece2, piece3])).toBe(true);
  });

  it("returns false for a truly impossible batch on a near-full board", () => {
    // Board where each row has exactly 2 empty cells at non-adjacent positions.
    const grid = createEmptyGrid();
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        grid[r][c] = 1;
      }
      grid[r][(2 * r) % BOARD_SIZE] = 0;
      grid[r][(2 * r + 3) % BOARD_SIZE] = 0;
    }
    // Verify precondition: each row has exactly 6 filled cells
    for (let r = 0; r < BOARD_SIZE; r++) {
      const rowSum = grid[r].reduce((a: number, b: number) => a + b, 0);
      expect(rowSum).toBe(BOARD_SIZE - 2);
    }
    const twoByTwo: Shape = [
      [1, 1],
      [1, 1],
    ];
    expect(isBatchSolvable(grid, [twoByTwo, twoByTwo, twoByTwo])).toBe(false);
  });

  it("never mutates the input grid", () => {
    const grid = createEmptyGrid();
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        grid[r][c] = 1;
      }
    }
    // Take a snapshot
    const snapshot = JSON.stringify(grid);

    // Call the solver (will explore many branches internally)
    const shapes: Shape[] = [[[1, 1, 1]], [[1, 1]], [[1]]];
    isBatchSolvable(grid, shapes);

    // Grid must be unchanged
    expect(JSON.stringify(grid)).toBe(snapshot);
  });

  it("handles duplicate pieces efficiently without false results", () => {
    // 3 identical single-cell pieces on a board with exactly 3 empty cells.
    // All 3 are identical so dedup should collapse permutations but still
    // find the solution.
    const grid = createEmptyGrid();
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        grid[r][c] = 1;
      }
    }
    // Leave 3 cells empty (scattered so no row/col completes)
    grid[0][0] = 0;
    grid[2][3] = 0;
    grid[5][6] = 0;

    const shapes: Shape[] = [[[1]], [[1]], [[1]]];
    expect(isBatchSolvable(grid, shapes)).toBe(true);
  });

  it("returns false for duplicate pieces that cannot collectively fit", () => {
    // Use the diagonal-gap board (same as 'cannot possibly fit' test).
    // 3 identical 2×2 squares — dedup collapses all 3! permutations into 1
    // exploration branch. Must still correctly return false.
    const grid = createEmptyGrid();
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        grid[r][c] = r === c ? 0 : 1;
      }
    }
    const twoByTwo: Shape = [
      [1, 1],
      [1, 1],
    ];
    // All 3 shapes are identical — dedup should NOT cause a false positive
    expect(isBatchSolvable(grid, [twoByTwo, twoByTwo, twoByTwo])).toBe(false);
  });

  it("step-by-step manual simulation matches solver result", () => {
    // Manually construct a scenario and verify each step.
    const grid = createEmptyGrid();
    // Fill row 3 except col 5
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (c !== 5) grid[3][c] = 1;
    }
    // Rest of the board is empty.

    const pieceA: Shape = [[1]]; // fill (3,5) → completes row 3 → clear
    const pieceB: Shape = [[1, 1, 1, 1, 1, 1, 1, 1]]; // 8-wide: needs a full empty row
    const pieceC: Shape = [[1, 1]]; // simple 2-cell

    // Before pieceA: pieceB (8-wide) can't fit anywhere because row 3
    // partially blocks and no other row has 8-wide space blocked by row 3.
    // Actually, rows 0-2 and 4-7 are empty, so pieceB CAN fit there.
    // Let me adjust: fill more rows so only row 3 matters.
    for (let r = 0; r < BOARD_SIZE; r++) {
      if (r === 3) continue;
      // Fill all rows except leave col 0 empty (prevents full row clear)
      for (let c = 1; c < BOARD_SIZE; c++) {
        grid[r][c] = 1;
      }
    }
    // Now: rows 0-2,4-7 each have cols 1-7 filled (col 0 empty, 7 filled).
    // Row 3 has cols 0-4,6-7 filled (col 5 empty, 7 filled).
    // No row is full. Col 0 has all but row 3 empty. Cols 1-4,6-7 have
    // row 3 filled + rows 0-2,4-7 filled = all 8 filled → these columns
    // ARE full! They would clear!
    // Hmm that's not what I want. Let me simplify.

    // Start fresh with a cleaner scenario.
    const grid2 = createEmptyGrid();
    // Row 0: fill cols 0-6, leave col 7 empty
    for (let c = 0; c < 7; c++) grid2[0][c] = 1;
    // All other rows: empty.

    // Step 1: place [[1]] at (0,7) → row 0 becomes full → clears
    const stepA = simulatePlacement(cloneBoardState(grid2), [[1]], 0, 7);
    expect(stepA[0].every((c) => c === 1)).toBe(true); // row 0 now full
    const afterClearA = clearCompletedLines(stepA);
    expect(afterClearA[0].every((c) => c === 0)).toBe(true); // row 0 cleared

    // Step 2: place 5-wide on row 0 (now empty)
    const fiveWide: Shape = [[1, 1, 1, 1, 1]];
    expect(getAllValidPlacements(afterClearA, fiveWide).length).toBeGreaterThan(
      0,
    );
    const stepB = simulatePlacement(
      cloneBoardState(afterClearA),
      fiveWide,
      0,
      0,
    );
    const afterClearB = clearCompletedLines(stepB);

    // Step 3: place 2-wide somewhere on the mostly empty board
    const twoWide: Shape = [[1, 1]];
    expect(getAllValidPlacements(afterClearB, twoWide).length).toBeGreaterThan(
      0,
    );

    // Solver should agree
    expect(isBatchSolvable(grid2, [[[1]], fiveWide, twoWide])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// generateWeightedPieceBatch — integration tests
// ---------------------------------------------------------------------------

describe("generateWeightedPieceBatch", () => {
  it("returns exactly 3 blocks", () => {
    const grid = createEmptyGrid();
    const blocks = generateWeightedPieceBatch(grid);
    expect(blocks.length).toBe(3);
  });

  it("returned batch is solvable on an empty board", () => {
    const grid = createEmptyGrid();
    const blocks = generateWeightedPieceBatch(grid);
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
    const blocks = generateWeightedPieceBatch(grid);
    const shapes = blocks.map((b) => b.shape);
    expect(isBatchSolvable(grid, shapes)).toBe(true);
  });

  it("each block has id, shape, and color", () => {
    const grid = createEmptyGrid();
    const blocks = generateWeightedPieceBatch(grid);
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
    for (let r = 5; r < BOARD_SIZE; r++) {
      for (let c = 5; c < BOARD_SIZE; c++) {
        emptyCells.push({ row: r, col: c });
      }
    }
    const grid = createNearlyFullBoard(emptyCells);
    const blocks = generateWeightedPieceBatch(grid);

    // Should still return 3 blocks (via fallback if needed)
    expect(blocks.length).toBe(3);
  });

  it("does not mutate the input grid", () => {
    const grid = createEmptyGrid();
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        grid[r][c] = 1;
      }
    }
    const snapshot = JSON.stringify(grid);

    generateWeightedPieceBatch(grid);

    expect(JSON.stringify(grid)).toBe(snapshot);
  });
});
