import { create } from 'zustand';
import {
    BOARD_SIZE,
    generateRandomBlocks,
    POINTS_PER_CELL,
    POINTS_PER_LINE,
} from '../constants/constants';
import type { GameState, Grid, Shape } from '../constants/types';

interface GameActions {
  checkCollision: (shape: Shape, gridRow: number, gridCol: number) => boolean;
  placeBlock: (blockId: string, gridRow: number, gridCol: number) => boolean;
  removeBlockFromHand: (blockId: string) => void;
  resetGame: () => void;
  spawnNewBlocks: () => void;
  canPlaceAnyBlock: () => boolean;
}

type GameStore = GameState & GameActions;

/**
 * Creates an empty 8x8 grid
 */
const createEmptyGrid = (): Grid => {
  return Array(BOARD_SIZE)
    .fill(null)
    .map(() => Array(BOARD_SIZE).fill(0));
};

/**
 * Check if a shape can be placed at the given grid position
 */
const checkCollision = (grid: Grid, shape: Shape, gridRow: number, gridCol: number): boolean => {
  for (let row = 0; row < shape.length; row++) {
    for (let col = 0; col < shape[row].length; col++) {
      if (shape[row][col] === 1) {
        const targetRow = gridRow + row;
        const targetCol = gridCol + col;

        // Check bounds
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

  return true;
};

/**
 * Place a shape on the grid and return the new grid
 */
const placeShapeOnGrid = (grid: Grid, shape: Shape, gridRow: number, gridCol: number): Grid => {
  const newGrid = grid.map(row => [...row]);

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

/**
 * Check and clear completed lines (rows and columns)
 * Returns the new grid and the number of lines cleared
 */
const clearLines = (grid: Grid): { newGrid: Grid; linesCleared: number } => {
  let newGrid = grid.map(row => [...row]);
  let linesCleared = 0;

  // Check rows
  for (let row = 0; row < BOARD_SIZE; row++) {
    const isRowFull = newGrid[row].every(cell => cell === 1);
    if (isRowFull) {
      // Clear the row
      newGrid[row] = Array(BOARD_SIZE).fill(0);
      linesCleared++;
    }
  }

  // Check columns
  for (let col = 0; col < BOARD_SIZE; col++) {
    const isColFull = newGrid.every(row => row[col] === 1);
    if (isColFull) {
      // Clear the column
      for (let row = 0; row < BOARD_SIZE; row++) {
        newGrid[row][col] = 0;
      }
      linesCleared++;
    }
  }

  return { newGrid, linesCleared };
};

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
  // Initial state
  grid: createEmptyGrid(),
  currentBlocks: generateRandomBlocks(3),
  score: 0,
  highScore: 0,
  isGameOver: false,

  // Actions
  checkCollision: (shape: Shape, gridRow: number, gridCol: number) => {
    const { grid } = get();
    return checkCollision(grid, shape, gridRow, gridCol);
  },

  placeBlock: (blockId: string, gridRow: number, gridCol: number) => {
    const { grid, currentBlocks, score, highScore } = get();
    
    // Find the block being placed
    const block = currentBlocks.find((b: any) => b.id === blockId);
    if (!block) return false;

    // Check if placement is valid
    if (!checkCollision(grid, block.shape, gridRow, gridCol)) {
      return false;
    }

    // Place the block on the grid
    let newGrid = placeShapeOnGrid(grid, block.shape, gridRow, gridCol);

    // Calculate cells placed
    const cellsPlaced = countShapeCells(block.shape);

    // Check and clear lines
    const { newGrid: clearedGrid, linesCleared } = clearLines(newGrid);

    // Calculate new score
    const earnedScore = calculateScore(cellsPlaced, linesCleared);
    const newScore = score + earnedScore;
    const newHighScore = Math.max(newScore, highScore);

    // Remove the placed block
    const newBlocks = currentBlocks.filter((b: any) => b.id !== blockId);

    // If no blocks left, spawn new ones
    const finalBlocks = newBlocks.length === 0 ? generateRandomBlocks(3) : newBlocks;

    set({
      grid: clearedGrid,
      currentBlocks: finalBlocks,
      score: newScore,
      highScore: newHighScore,
    });

    // Check if game is over (after spawning new blocks if needed)
    setTimeout(() => {
      if (!get().canPlaceAnyBlock()) {
        set({ isGameOver: true });
      }
    }, 100);

    return true;
  },

  removeBlockFromHand: (blockId: string) => {
    const { currentBlocks } = get();
    const newBlocks = currentBlocks.filter((b: any) => b.id !== blockId);
    
    // If no blocks left, spawn new ones
    const finalBlocks = newBlocks.length === 0 ? generateRandomBlocks(3) : newBlocks;
    
    set({ currentBlocks: finalBlocks });
  },

  spawnNewBlocks: () => {
    set({ currentBlocks: generateRandomBlocks(3) });
  },

  canPlaceAnyBlock: () => {
    const { grid, currentBlocks } = get();
    
    // Check if any current block can be placed anywhere on the grid
    for (const block of currentBlocks) {
      for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
          if (checkCollision(grid, block.shape, row, col)) {
            return true;
          }
        }
      }
    }
    
    return false;
  },

  resetGame: () => {
    set({
      grid: createEmptyGrid(),
      currentBlocks: generateRandomBlocks(3),
      score: 0,
      isGameOver: false,
    });
  },
}));

