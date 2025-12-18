import { Canvas, Group, RoundedRect } from '@shopify/react-native-skia';
import React, { useCallback, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { BOARD_SIZE, CELL_SIZE, GAP, GRID_PADDING } from '../constants/constants';
import { useGameStore } from '@/store/useGameStore';
import type { BoardMeasurements } from '../constants/types';

interface GameBoardProps {
  onLayout?: (measurements: BoardMeasurements) => void;
  ghostPreview?: {
    row: number;
    col: number;
    shape: number[][];
    isValid: boolean;
  } | null;
}

const CANVAS_SIZE = BOARD_SIZE * CELL_SIZE + (BOARD_SIZE - 1) * GAP + GRID_PADDING * 2;
const GRID_BG_COLOR = '#1a1a2e';
const EMPTY_CELL_COLOR = '#0f3460';
const ACTIVE_CELL_COLOR = '#e94560';
const GHOST_VALID_COLOR = 'rgba(76, 209, 196, 0.5)';
const GHOST_INVALID_COLOR = 'rgba(255, 107, 107, 0.5)';

export const GameBoard: React.FC<GameBoardProps> = ({ onLayout, ghostPreview }) => {
  const grid = useGameStore((state: any) => state.grid);
  const [, setMeasurements] = useState<BoardMeasurements>({
    x: 0,
    y: 0,
    width: CANVAS_SIZE,
    height: CANVAS_SIZE,
  });

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { x, y, width, height } = event.nativeEvent.layout;
      const newMeasurements = { x, y, width, height };
      setMeasurements(newMeasurements);
      onLayout?.(newMeasurements);
    },
    [onLayout]
  );

  /**
   * Calculate cell position on canvas
   */
  const getCellPosition = (row: number, col: number) => {
    return {
      x: GRID_PADDING + col * (CELL_SIZE + GAP),
      y: GRID_PADDING + row * (CELL_SIZE + GAP),
    };
  };

  /**
   * Render a single cell
   */
  const renderCell = (row: number, col: number, color: string) => {
    const { x, y } = getCellPosition(row, col);
    return (
      <RoundedRect
        key={`cell-${row}-${col}`}
        x={x}
        y={y}
        width={CELL_SIZE}
        height={CELL_SIZE}
        r={4}
        color={color}
      />
    );
  };

  /**
   * Render the background grid (empty cells)
   */
  const renderBackgroundGrid = () => {
    const cells = [];
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        cells.push(renderCell(row, col, EMPTY_CELL_COLOR));
      }
    }
    return cells;
  };

  /**
   * Render filled cells from the game state
   */
  const renderFilledCells = () => {
    const cells = [];
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (grid[row][col] === 1) {
          cells.push(renderCell(row, col, ACTIVE_CELL_COLOR));
        }
      }
    }
    return cells;
  };

  /**
   * Render ghost preview of the dragging block
   */
  const renderGhostPreview = () => {
    if (!ghostPreview) return null;

    const { row, col, shape, isValid } = ghostPreview;
    const ghostColor = isValid ? GHOST_VALID_COLOR : GHOST_INVALID_COLOR;
    const cells = [];

    for (let shapeRow = 0; shapeRow < shape.length; shapeRow++) {
      for (let shapeCol = 0; shapeCol < shape[shapeRow].length; shapeCol++) {
        if (shape[shapeRow][shapeCol] === 1) {
          const targetRow = row + shapeRow;
          const targetCol = col + shapeCol;

          // Only render if within bounds
          if (
            targetRow >= 0 &&
            targetRow < BOARD_SIZE &&
            targetCol >= 0 &&
            targetCol < BOARD_SIZE
          ) {
            const { x, y } = getCellPosition(targetRow, targetCol);
            cells.push(
              <RoundedRect
                key={`ghost-${targetRow}-${targetCol}`}
                x={x}
                y={y}
                width={CELL_SIZE}
                height={CELL_SIZE}
                r={4}
                color={ghostColor}
              />
            );
          }
        }
      }
    }

    return cells;
  };

  return (
    <View style={styles.container} onLayout={handleLayout}>
      <Canvas style={styles.canvas}>
        {/* Background */}
        <RoundedRect
          x={0}
          y={0}
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
          r={12}
          color={GRID_BG_COLOR}
        />

        {/* Grid cells (empty state) */}
        <Group>{renderBackgroundGrid()}</Group>

        {/* Filled cells from game state */}
        <Group>{renderFilledCells()}</Group>

        {/* Ghost preview during drag */}
        <Group>{renderGhostPreview()}</Group>
      </Canvas>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  canvas: {
    width: CANVAS_SIZE,
    height: CANVAS_SIZE,
  },
});

/**
 * Utility function to convert absolute coordinates to grid position
 * @param x - Absolute X coordinate
 * @param y - Absolute Y coordinate
 * @param boardMeasurements - The board's position and dimensions
 * @returns Grid row and column indices, or null if outside bounds
 */
export const convertToGridPosition = (
  x: number,
  y: number,
  boardMeasurements: BoardMeasurements
): { row: number; col: number } | null => {
  // Convert to relative coordinates within the canvas
  const relativeX = x - boardMeasurements.x - GRID_PADDING;
  const relativeY = y - boardMeasurements.y - GRID_PADDING;

  // Calculate grid position
  const col = Math.floor(relativeX / (CELL_SIZE + GAP));
  const row = Math.floor(relativeY / (CELL_SIZE + GAP));

  // Validate bounds
  if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) {
    return null;
  }

  return { row, col };
};

