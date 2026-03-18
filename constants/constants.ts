import type { Block, Shape } from "./types";

/**
 * Game Configuration Constants
 */
export const BOARD_SIZE = 8;
export const CELL_SIZE = 40;
export const TRAY_CELL_SIZE = 24; // Smaller cell size for blocks in the bottom tray
export const GAP = 2;
export const TRAY_GAP = 1; // Smaller gap for tray blocks
export const GRID_PADDING = 16;
export const DRAG_OFFSET_Y = -200; // Visual offset to raise block above finger during drag

/**
 * Colors for different block types
 */
export const BLOCK_COLORS = [
  "#FF6B6B", // Red
  "#4ECDC4", // Teal
  "#45B7D1", // Blue
  "#FFA07A", // Light Salmon
  "#98D8C8", // Mint
  "#F7DC6F", // Yellow
  "#BB8FCE", // Purple
  "#85C1E2", // Sky Blue
];

/**
 * Standard Block Bloom Shapes
 * Each shape is a 2D matrix where 1 represents a filled cell
 */
export const SHAPES: Shape[] = [
  // Single cell
  [[1]],

  // 2x1 horizontal
  [[1, 1]],

  // 2x1 vertical
  [[1], [1]],

  // 3x1 horizontal
  [[1, 1, 1]],

  // 3x1 vertical
  [[1], [1], [1]],

  // 2x2 square
  [
    [1, 1],
    [1, 1],
  ],

  // 3x3 square
  [
    [1, 1, 1],
    [1, 1, 1],
    [1, 1, 1],
  ],

  // L-shape (small)
  [
    [1, 0],
    [1, 1],
  ],

  // L-shape (flipped)
  [
    [0, 1],
    [1, 1],
  ],

  // L-shape (large)
  [
    [1, 0, 0],
    [1, 0, 0],
    [1, 1, 1],
  ],

  // L-shape (large flipped)
  [
    [0, 0, 1],
    [0, 0, 1],
    [1, 1, 1],
  ],

  // T-shape
  [
    [1, 1, 1],
    [0, 1, 0],
  ],

  // T-shape (inverted)
  [
    [0, 1, 0],
    [1, 1, 1],
  ],

  // Z-shape
  [
    [1, 1, 0],
    [0, 1, 1],
  ],

  // Z-shape (reversed)
  [
    [0, 1, 1],
    [1, 1, 0],
  ],

  // 4x1 horizontal
  [[1, 1, 1, 1]],

  // 4x1 vertical
  [[1], [1], [1], [1]],

  // 5x1 horizontal
  [[1, 1, 1, 1, 1]],

  // 5x1 vertical
  [[1], [1], [1], [1], [1]],
];

/**
 * Utility function to generate random blocks
 */
export const generateRandomBlocks = (count: number = 3): Block[] => {
  const blocks: Block[] = [];

  for (let i = 0; i < count; i++) {
    const randomShape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    const randomColor =
      BLOCK_COLORS[Math.floor(Math.random() * BLOCK_COLORS.length)];

    blocks.push({
      id: `block-${Date.now()}-${i}`,
      shape: randomShape,
      color: randomColor,
    });
  }

  return blocks;
};

/**
 * Calculate the dimensions of a shape
 */
export const getShapeDimensions = (
  shape: Shape
): { width: number; height: number } => {
  return {
    height: shape.length,
    width: shape[0]?.length || 0,
  };
};

/**
 * Scoring constants
 */
export const POINTS_PER_CELL = 10;
export const POINTS_PER_LINE = 100;
export const COMBO_MULTIPLIER = 1.5;
