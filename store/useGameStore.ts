import {
  BOARD_SIZE,
  generateRandomBlocks,
  POINTS_PER_CELL,
  POINTS_PER_LINE,
} from "@/constants/constants";
import type { GameState, Grid, Shape } from "@/constants/types";
import { canPlaceBlock, checkLines, createEmptyGrid } from "@/utils/gameLogic";
import { generateWeightedPieceBatch } from "@/utils/weightedGeneration";
import { resetGenerationContext } from "@/utils/generationContext";
import { create } from "zustand";

interface GameActions {
  checkCollision: (shape: Shape, gridRow: number, gridCol: number) => boolean;
  placeBlock: (blockId: string, gridRow: number, gridCol: number) => boolean;
  removeBlockFromHand: (blockId: string) => void;
  resetGame: () => void;
  spawnNewBlocks: () => void;
  canPlaceAnyBlock: () => boolean;
}

type GameStore = GameState & GameActions;

// Game logic functions are now imported from utils/gameLogic.ts

/**
 * Place a shape on the grid and return the new grid
 */
const placeShapeOnGrid = (
  grid: Grid,
  shape: Shape,
  gridRow: number,
  gridCol: number,
): Grid => {
  const newGrid = grid.map((row) => [...row]);

  for (let row = 0; row < shape.length; row++) {
    for (let col = 0; col < shape[row].length; col++) {
      if (shape[row][col] === 1) {
        const targetRow = gridRow + row;
        const targetCol = gridCol + col;
        newGrid[targetRow][targetCol] = 1;
      }
    }
  }

  return newGrid;
};

// Line clearing logic is now imported from utils/gameLogic.ts

/**
 * Calculate score based on cells placed and lines cleared
 */
const calculateScore = (cellsPlaced: number, linesCleared: number): number => {
  let score = cellsPlaced * POINTS_PER_CELL;

  if (linesCleared > 0) {
    score += linesCleared * POINTS_PER_LINE;

    // Combo bonus for multiple lines
    if (linesCleared > 1) {
      score = Math.floor(score * (1 + (linesCleared - 1) * 0.5));
    }
  }

  return score;
};

/**
 * Count the number of filled cells in a shape
 */
const countShapeCells = (shape: Shape): number => {
  return shape.reduce((sum: number, row) => {
    return sum + row.reduce((rowSum: number, cell) => rowSum + cell, 0);
  }, 0);
};

export const useGameStore = create<GameStore>((set: any, get: any) => ({
  grid: createEmptyGrid(),
  currentBlocks: generateRandomBlocks(3),
  score: 0,
  highScore: 0,
  isGameOver: false,
  clearingLines: null,

  checkCollision: (shape: Shape, gridRow: number, gridCol: number) => {
    const { grid } = get();
    return canPlaceBlock(grid, shape, gridRow, gridCol);
  },

  placeBlock: (blockId: string, gridRow: number, gridCol: number) => {
    const { grid, currentBlocks, score, highScore } = get();

    // Find the block being placed
    const block = currentBlocks.find((b: any) => b.id === blockId);
    if (!block) return false;

    // Check if placement is valid
    if (!canPlaceBlock(grid, block.shape, gridRow, gridCol)) {
      return false;
    }

    // Place the block on the grid
    let newGrid = placeShapeOnGrid(grid, block.shape, gridRow, gridCol);

    // Calculate cells placed
    const cellsPlaced = countShapeCells(block.shape);

    // Check and clear lines
    const { clearedGrid, linesCleared, clearedRows, clearedCols } =
      checkLines(newGrid);

    // Calculate new score
    const earnedScore = calculateScore(cellsPlaced, linesCleared);
    const newScore = score + earnedScore;
    const newHighScore = Math.max(newScore, highScore);

    // Remove the placed block
    const newBlocks = currentBlocks.filter((b: any) => b.id !== blockId);

    // If no blocks left, spawn new ones
    // When all pieces placed, generate a fair new batch using the post-clear board
    const finalBlocks =
      newBlocks.length === 0 ? generateWeightedPieceBatch(clearedGrid) : newBlocks;

    const hasLineClear = clearedRows.length > 0 || clearedCols.length > 0;

    if (hasLineClear) {
      // Phase 1: show the filled grid with animation markers – do NOT wipe yet
      set({
        grid: newGrid, // still fully lit up
        currentBlocks: finalBlocks,
        score: newScore,
        highScore: newHighScore,
        clearingLines: { rows: clearedRows, cols: clearedCols },
      });

      // Phase 2: after animation, apply cleared grid
      setTimeout(() => {
        set({ grid: clearedGrid, clearingLines: null });

        // Check if game is over after clearing
        setTimeout(() => {
          if (!get().canPlaceAnyBlock()) {
            set({ isGameOver: true });
          }
        }, 50);
      }, 420); // match animation duration in GameBoard
    } else {
      set({
        grid: clearedGrid,
        currentBlocks: finalBlocks,
        score: newScore,
        highScore: newHighScore,
        clearingLines: null,
      });

      // Check if game is over
      setTimeout(() => {
        if (!get().canPlaceAnyBlock()) {
          set({ isGameOver: true });
        }
      }, 100);
    }

    return true;
  },

  removeBlockFromHand: (blockId: string) => {
    const { currentBlocks } = get();
    const newBlocks = currentBlocks.filter((b: any) => b.id !== blockId);

    // If no blocks left, generate a fair batch against current board
    const { grid } = get();
    const finalBlocks =
      newBlocks.length === 0 ? generateWeightedPieceBatch(grid) : newBlocks;

    set({ currentBlocks: finalBlocks });
  },

  spawnNewBlocks: () => {
    const { grid } = get();
    set({ currentBlocks: generateWeightedPieceBatch(grid) });
  },

  canPlaceAnyBlock: () => {
    const { grid, currentBlocks } = get();

    // Check if any current block can be placed anywhere on the grid
    for (const block of currentBlocks) {
      for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
          if (canPlaceBlock(grid, block.shape, row, col)) {
            return true;
          }
        }
      }
    }

    return false;
  },

  resetGame: () => {
    resetGenerationContext();
    set({
      grid: createEmptyGrid(),
      currentBlocks: generateRandomBlocks(3),
      score: 0,
      isGameOver: false,
      clearingLines: null,
    });
  },
}));
