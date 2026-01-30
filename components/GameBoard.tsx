/**
 * GameBoard - Fallback Version (Standard React Native)
 * Use this temporarily if Skia has issues
 * Performance is good enough for an 8x8 grid
 */

import {
  BOARD_SIZE,
  CELL_SIZE,
  GAP,
  GRID_PADDING,
} from "@/constants/constants";
import type { BoardMeasurements } from "@/constants/types";
import { useGameStore } from "@/store/useGameStore";
import { getGridPosition } from "@/utils/gameLogic";
import React, { useCallback, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";

interface GameBoardProps {
  onLayout?: (measurements: BoardMeasurements) => void;
  ghostPreview?: {
    row: number;
    col: number;
    shape: number[][];
    isValid: boolean;
  } | null;
}

const GRID_BG_COLOR = "#1a1a2e";
const EMPTY_CELL_COLOR = "#0f3460";
const ACTIVE_CELL_COLOR = "#e94560";
const GHOST_VALID_COLOR = "rgba(76, 209, 196, 0.5)";
const GHOST_INVALID_COLOR = "rgba(255, 107, 107, 0.5)";

export const GameBoard: React.FC<GameBoardProps> = ({
  onLayout,
  ghostPreview,
}) => {
  const grid = useGameStore((state: any) => state.grid);
  const viewRef = useRef<View>(null);
  const [, setMeasurements] = useState<BoardMeasurements>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });

  const handleLayout = useCallback(() => {
    viewRef.current?.measure((_x, _y, width, height, pageX, pageY) => {
      const newMeasurements = { x: pageX, y: pageY, width, height };
      setMeasurements(newMeasurements);
      onLayout?.(newMeasurements);
    });
  }, [onLayout]);

  /**
   * Check if a cell should show ghost preview
   */
  const isGhostCell = (
    row: number,
    col: number
  ): { isGhost: boolean; isValid: boolean } => {
    if (!ghostPreview) return { isGhost: false, isValid: false };

    const { row: ghostRow, col: ghostCol, shape, isValid } = ghostPreview;

    for (let shapeRow = 0; shapeRow < shape.length; shapeRow++) {
      for (let shapeCol = 0; shapeCol < shape[shapeRow].length; shapeCol++) {
        if (shape[shapeRow][shapeCol] === 1) {
          const targetRow = ghostRow + shapeRow;
          const targetCol = ghostCol + shapeCol;

          if (targetRow === row && targetCol === col) {
            return { isGhost: true, isValid };
          }
        }
      }
    }

    return { isGhost: false, isValid: false };
  };

  /**
   * Render a single cell
   */
  const renderCell = (row: number, col: number) => {
    const isFilled = grid[row][col] === 1;
    const { isGhost, isValid } = isGhostCell(row, col);

    let cellColor = EMPTY_CELL_COLOR;
    if (isFilled) {
      cellColor = ACTIVE_CELL_COLOR;
    } else if (isGhost) {
      cellColor = isValid ? GHOST_VALID_COLOR : GHOST_INVALID_COLOR;
    }

    return (
      <View
        key={`cell-${row}-${col}`}
        style={[
          styles.cell,
          {
            backgroundColor: cellColor,
            marginRight: col < BOARD_SIZE - 1 ? GAP : 0,
            marginBottom: row < BOARD_SIZE - 1 ? GAP : 0,
          },
        ]}
      />
    );
  };

  /**
   * Render all cells
   */
  const renderGrid = () => {
    const rows = [];
    for (let row = 0; row < BOARD_SIZE; row++) {
      const cells = [];
      for (let col = 0; col < BOARD_SIZE; col++) {
        cells.push(renderCell(row, col));
      }
      rows.push(
        <View key={`row-${row}`} style={styles.row}>
          {cells}
        </View>
      );
    }
    return rows;
  };

  return (
    <View ref={viewRef} style={styles.container} onLayout={handleLayout}>
      <View style={styles.board}>{renderGrid()}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  board: {
    backgroundColor: GRID_BG_COLOR,
    padding: GRID_PADDING,
    borderRadius: 12,
  },
  row: {
    flexDirection: "row",
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderRadius: 4,
  },
});

/**
 * Utility function to convert absolute coordinates to grid position
 * Re-exports getGridPosition from utils for backward compatibility
 */
export const convertToGridPosition = (
  x: number,
  y: number,
  boardMeasurements: BoardMeasurements
): { row: number; col: number } | null => {
  return getGridPosition(x, y, boardMeasurements);
};
