/**
 * Core Game Types
 */

export type CellState = 0 | 1;

export type Grid = CellState[][];

export type Shape = CellState[][];

export interface Block {
  id: string;
  shape: Shape;
  color: string;
}

export interface Position {
  row: number;
  col: number;
}

export interface GameState {
  grid: Grid;
  currentBlocks: Block[];
  score: number;
  highScore: number;
  isGameOver: boolean;
  /** Rows/cols currently animating a line-clear. Null when no animation is active. */
  clearingLines: { rows: number[]; cols: number[] } | null;
}

export interface DragPosition {
  x: number;
  y: number;
}

export interface BoardMeasurements {
  x: number;
  y: number;
  width: number;
  height: number;
}
