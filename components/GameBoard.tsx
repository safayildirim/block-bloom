/**
 * GameBoard - React Native Implementation with Line-Clear Animation
 * Cells in completed rows/columns flash and scale before being cleared.
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
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

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
// Flash color during crash animation
const CRASH_FLASH_COLOR = "#ffffff";

/** Duration of the crash animation in ms – must match the store's 420ms timeout */
const ANIM_DURATION = 400;

type CellAnimValues = {
  scale: Animated.Value;
  opacity: Animated.Value;
  flashProgress: Animated.Value; // 0 = normal, 1 = white flash
};

export const GameBoard: React.FC<GameBoardProps> = ({
  onLayout,
  ghostPreview,
}) => {
  const grid = useGameStore((state: any) => state.grid);
  const clearingLines = useGameStore((state: any) => state.clearingLines) as {
    rows: number[];
    cols: number[];
  } | null;

  const viewRef = useRef<View>(null);
  const [, setMeasurements] = useState<BoardMeasurements>({
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });

  // Per-cell animated values keyed by "row-col"
  const cellAnims = useRef<Map<string, CellAnimValues>>(new Map());

  const getCellAnims = (row: number, col: number): CellAnimValues => {
    const key = `${row}-${col}`;
    if (!cellAnims.current.has(key)) {
      cellAnims.current.set(key, {
        scale: new Animated.Value(1),
        opacity: new Animated.Value(1),
        flashProgress: new Animated.Value(0),
      });
    }
    return cellAnims.current.get(key)!;
  };

  // Pre-initialise all cell anims on mount
  useEffect(() => {
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        getCellAnims(r, c);
      }
    }
  }, []);

  // Reset all cell animated values the moment clearingLines is cleared by the store.
  // This is the correct place to reset — it fires at the same time the cleared grid
  // is applied, so cells snap back to visible exactly when they become empty.
  useEffect(() => {
    if (clearingLines !== null) return;
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const { scale, opacity, flashProgress } = getCellAnims(r, c);
        scale.setValue(1);
        opacity.setValue(1);
        flashProgress.setValue(0);
      }
    }
  }, [clearingLines]);

  // Fire crash animation whenever clearingLines changes to a non-null value
  useEffect(() => {
    if (!clearingLines) return;

    const { rows, cols } = clearingLines;

    const animations: Animated.CompositeAnimation[] = [];

    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const inRow = rows.includes(r);
        const inCol = cols.includes(c);
        if (!inRow && !inCol) continue;

        const { scale, opacity, flashProgress } = getCellAnims(r, c);

        // Reset to base state before animating
        scale.setValue(1);
        opacity.setValue(1);
        flashProgress.setValue(0);

        // Sequence: flash white → scale pulse → fade out
        const anim = Animated.sequence([
          // 1. Instant flash to white (very short)
          Animated.timing(flashProgress, {
            toValue: 1,
            duration: 60,
            easing: Easing.out(Easing.quad),
            useNativeDriver: false,
          }),
          // 2. Scale up while fading flash back
          Animated.parallel([
            Animated.timing(scale, {
              toValue: 1.2,
              duration: 120,
              easing: Easing.out(Easing.back(1.5)),
              useNativeDriver: false,
            }),
            Animated.timing(flashProgress, {
              toValue: 0,
              duration: 120,
              useNativeDriver: false,
            }),
          ]),
          // 3. Scale down + fade out
          Animated.parallel([
            Animated.timing(scale, {
              toValue: 0,
              duration: 200,
              easing: Easing.in(Easing.quad),
              useNativeDriver: false,
            }),
            Animated.timing(opacity, {
              toValue: 0,
              duration: 200,
              easing: Easing.in(Easing.quad),
              useNativeDriver: false,
            }),
          ]),
        ]);

        animations.push(anim);
      }
    }

    // Run all cell animations in parallel.
    // No reset in finished callback — the clearingLines=null effect handles it.
    Animated.parallel(animations).start();
  }, [clearingLines]);

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
    col: number,
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
   * Render a single cell with animation support
   */
  const renderCell = (row: number, col: number) => {
    const isFilled = grid[row][col] === 1;
    const { isGhost, isValid } = isGhostCell(row, col);

    const isClearing =
      clearingLines !== null &&
      (clearingLines.rows.includes(row) || clearingLines.cols.includes(col));

    let baseCellColor = EMPTY_CELL_COLOR;
    if (isFilled || isClearing) {
      baseCellColor = ACTIVE_CELL_COLOR;
    } else if (isGhost) {
      baseCellColor = isValid ? GHOST_VALID_COLOR : GHOST_INVALID_COLOR;
    }

    const { scale, opacity, flashProgress } = getCellAnims(row, col);

    // Interpolate background color: baseCellColor → CRASH_FLASH_COLOR
    const backgroundColor = flashProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [
        isClearing ? ACTIVE_CELL_COLOR : baseCellColor,
        CRASH_FLASH_COLOR,
      ],
    });

    // Always use animated values — never switch to static props on the same
    // Animated.View, which can cause values to visually freeze.
    return (
      <Animated.View
        key={`cell-${row}-${col}`}
        style={[
          styles.cell,
          {
            marginRight: col < BOARD_SIZE - 1 ? GAP : 0,
            marginBottom: row < BOARD_SIZE - 1 ? GAP : 0,
            backgroundColor: isClearing
              ? (backgroundColor as any)
              : baseCellColor,
            transform: [{ scale }],
            opacity,
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
        </View>,
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
  boardMeasurements: BoardMeasurements,
): { row: number; col: number } | null => {
  return getGridPosition(x, y, boardMeasurements);
};
