/**
 * DraggableBlock Component
 * Handles drag gestures for block pieces with collision detection
 */

import {
  BOARD_SIZE,
  CELL_SIZE,
  DRAG_OFFSET_Y,
  DRAG_SPEED,
  GAP,
  GRID_PADDING,
  TRAY_CELL_SIZE,
  TRAY_GAP,
  getShapeDimensions,
} from "@/constants/constants";
import type { Block, BoardMeasurements } from "@/constants/types";
import { useGameStore } from "@/store/useGameStore";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { LayoutChangeEvent, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

interface DraggableBlockProps {
  block: Block;
  boardMeasurements: BoardMeasurements | null;
  onGhostUpdate: (
    ghost: {
      row: number;
      col: number;
      shape: number[][];
      isValid: boolean;
    } | null,
  ) => void;
}

export const DraggableBlock: React.FC<DraggableBlockProps> = ({
  block,
  boardMeasurements,
  onGhostUpdate,
}) => {
  const { checkCollision, placeBlock } = useGameStore();

  // Animated values for position
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  // Track where the user grabbed the block (relative to block origin)
  const touchOffsetX = useSharedValue(0);
  const touchOffsetY = useSharedValue(0);

  // Track if block is lifted via tap
  const isLifted = useSharedValue(false);

  // Track if block was successfully placed (using React state, not shared value)
  const [isPlaced, setIsPlaced] = useState(false);

  // Track the block's initial position in the tray
  const [initialPosition, setInitialPosition] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  // Get block dimensions
  const { width: shapeWidth, height: shapeHeight } = useMemo(
    () => getShapeDimensions(block.shape),
    [block.shape],
  );

  // Full-size dimensions (used for ghost preview and placement calculations)
  const blockWidthPx = shapeWidth * CELL_SIZE + (shapeWidth - 1) * GAP;
  const blockHeightPx = shapeHeight * CELL_SIZE + (shapeHeight - 1) * GAP;

  // Tray-size dimensions (smaller preview in the bottom panel)
  const trayBlockWidthPx =
    shapeWidth * TRAY_CELL_SIZE + (shapeWidth - 1) * TRAY_GAP;
  const trayBlockHeightPx =
    shapeHeight * TRAY_CELL_SIZE + (shapeHeight - 1) * TRAY_GAP;

  // Scale factor from tray size to full size
  const dragScale = CELL_SIZE / TRAY_CELL_SIZE;

  /**
   * Update ghost preview on the game board using center-based snapping
   */
  const updateGhost = useCallback(
    (
      absoluteX: number,
      absoluteY: number,
      offsetX: number,
      offsetY: number,
    ) => {
      if (!boardMeasurements || !initialPosition) {
        onGhostUpdate(null);
        return;
      }

      // Calculate the full-sized block's visual top-left position on screen.
      // The block scales from center, so: center = finger - offset + trayHalf,
      // then full-size top-left = center - fullHalf.
      const visualTopLeftX =
        absoluteX - offsetX + trayBlockWidthPx / 2 - blockWidthPx / 2;
      const visualTopLeftY =
        absoluteY -
        offsetY +
        trayBlockHeightPx / 2 -
        blockHeightPx / 2 +
        DRAG_OFFSET_Y;

      // Convert to continuous grid coordinates (where the block's top-left would land)
      const cellWithGap = CELL_SIZE + GAP;
      const relX = visualTopLeftX - boardMeasurements.x - GRID_PADDING;
      const relY = visualTopLeftY - boardMeasurements.y - GRID_PADDING;

      // Only show ghost when block is near the board
      const boardWidth = BOARD_SIZE * cellWithGap;
      const boardHeight = BOARD_SIZE * cellWithGap;
      const margin = cellWithGap * 2;
      if (
        relX < -blockWidthPx - margin ||
        relX > boardWidth + margin ||
        relY < -blockHeightPx - margin ||
        relY > boardHeight + margin
      ) {
        onGhostUpdate(null);
        return;
      }

      // Round to nearest cell and clamp to valid placement range
      const nearestRow = Math.min(
        Math.max(0, Math.round(relY / cellWithGap)),
        BOARD_SIZE - shapeHeight,
      );
      const nearestCol = Math.min(
        Math.max(0, Math.round(relX / cellWithGap)),
        BOARD_SIZE - shapeWidth,
      );

      const isValid = checkCollision(block.shape, nearestRow, nearestCol);

      onGhostUpdate({
        row: nearestRow,
        col: nearestCol,
        shape: block.shape,
        isValid,
      });
    },
    [
      boardMeasurements,
      block.shape,
      blockWidthPx,
      blockHeightPx,
      trayBlockWidthPx,
      trayBlockHeightPx,
      shapeWidth,
      shapeHeight,
      checkCollision,
      onGhostUpdate,
      initialPosition,
    ],
  );

  /**
   * Attempt to place the block on the board using nearest-position snapping
   */
  const attemptPlacement = useCallback(
    (
      absoluteX: number,
      absoluteY: number,
      offsetX: number,
      offsetY: number,
    ) => {
      // Note: we're disabling verbose logging to reduce noise during drag
      // but keeping the logic intact

      if (!boardMeasurements || !initialPosition) {
        // Invalid - spring back
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        scale.value = withSpring(1);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        return;
      }

      // Calculate the full-sized block's visual top-left position on screen.
      // The block scales from center, so: center = finger - offset + trayHalf,
      // then full-size top-left = center - fullHalf.
      const visualTopLeftX =
        absoluteX - offsetX + trayBlockWidthPx / 2 - blockWidthPx / 2;
      const visualTopLeftY =
        absoluteY -
        offsetY +
        trayBlockHeightPx / 2 -
        blockHeightPx / 2 +
        DRAG_OFFSET_Y;

      // Convert to continuous grid coordinates and round to nearest cell
      const cellWithGap = CELL_SIZE + GAP;
      const relX = visualTopLeftX - boardMeasurements.x - GRID_PADDING;
      const relY = visualTopLeftY - boardMeasurements.y - GRID_PADDING;

      // Reject placement when block is too far from the board
      const boardWidth = BOARD_SIZE * cellWithGap;
      const boardHeight = BOARD_SIZE * cellWithGap;
      const margin = cellWithGap * 2;
      if (
        relX < -blockWidthPx - margin ||
        relX > boardWidth + margin ||
        relY < -blockHeightPx - margin ||
        relY > boardHeight + margin
      ) {
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        scale.value = withSpring(1);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        return;
      }

      const nearestRow = Math.min(
        Math.max(0, Math.round(relY / cellWithGap)),
        BOARD_SIZE - shapeHeight,
      );
      const nearestCol = Math.min(
        Math.max(0, Math.round(relX / cellWithGap)),
        BOARD_SIZE - shapeWidth,
      );

      const isValid = checkCollision(block.shape, nearestRow, nearestCol);

      if (!isValid) {
        // Invalid - spring back
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        scale.value = withSpring(1);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        return;
      }

      // Collision check passed, attempt to place
      const success = placeBlock(block.id, nearestRow, nearestCol);

      if (success) {
        // Block placed successfully - fade out
        opacity.value = withSpring(0);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setIsPlaced(true);
        return;
      }

      // Invalid - spring back
      translateX.value = withSpring(0);
      translateY.value = withSpring(0);
      scale.value = withSpring(1);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [
      boardMeasurements,
      block.id,
      block.shape,
      blockWidthPx,
      blockHeightPx,
      trayBlockWidthPx,
      trayBlockHeightPx,
      shapeWidth,
      shapeHeight,
      checkCollision,
      placeBlock,
      translateX,
      translateY,
      scale,
      opacity,
      initialPosition,
    ],
  );

  /**
   * Handle layout to track initial position
   */
  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { x, y, width, height } = event.nativeEvent.layout;
      console.log("📐 Layout measured:", {
        x,
        y,
        width,
        height,
        blockId: block.id,
      });
      setInitialPosition({ x, y, width, height });
    },
    [block.id],
  );

  /**
   * Gesture handlers
   */
  // Number of pixels outside the block bounds that still trigger the drag
  const HIT_SLOP = 24;

  const tapGesture = Gesture.Tap()
    .hitSlop(HIT_SLOP)
    .onStart(() => {
      if (!initialPosition) return;

      if (isLifted.value) {
        // Already lifted - tap again to put it back down
        isLifted.value = false;
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        scale.value = withSpring(1);
      } else {
        // Lift the block up near the board
        isLifted.value = true;
        scale.value = withSpring(dragScale);
        translateY.value = withSpring(DRAG_OFFSET_Y);
      }
    });

  const panGesture = Gesture.Pan()
    .hitSlop(HIT_SLOP)
    .minDistance(1)
    .onStart((event) => {
      if (!initialPosition) return;

      // Capture where the user grabbed relative to the block's origin.
      // event.x/y includes the hitSlop area, so clamp to [0, blockSize]
      // to ensure the offset stays within valid block bounds.
      touchOffsetX.value = Math.max(0, Math.min(event.x, blockWidthPx));
      touchOffsetY.value = Math.max(0, Math.min(event.y, blockHeightPx));

      // Scale up when picked up (whether already lifted or not)
      scale.value = withSpring(dragScale);
      translateY.value = DRAG_OFFSET_Y;
      isLifted.value = false;
    })
    .onUpdate((event) => {
      // Apply translation relative to start position, with offset
      translateX.value = event.translationX * DRAG_SPEED;
      translateY.value = DRAG_OFFSET_Y + event.translationY * DRAG_SPEED;

      // Adjust absolute positions to match the speed-multiplied visual position
      const speedAdjustedX =
        event.absoluteX + event.translationX * (DRAG_SPEED - 1);
      const speedAdjustedY =
        event.absoluteY + event.translationY * (DRAG_SPEED - 1);

      // Update ghost preview using corrected calculation
      runOnJS(updateGhost)(
        speedAdjustedX,
        speedAdjustedY,
        touchOffsetX.value,
        touchOffsetY.value,
      );
    })
    .onEnd((event) => {
      // Adjust absolute positions to match the speed-multiplied visual position
      const speedAdjustedX =
        event.absoluteX + event.translationX * (DRAG_SPEED - 1);
      const speedAdjustedY =
        event.absoluteY + event.translationY * (DRAG_SPEED - 1);

      // Try to place the block
      runOnJS(attemptPlacement)(
        speedAdjustedX,
        speedAdjustedY,
        touchOffsetX.value,
        touchOffsetY.value,
      );
      runOnJS(onGhostUpdate)(null);
    });

  const composedGesture = Gesture.Race(panGesture, tapGesture);

  /**
   * Animated style for the block
   */
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));

  /**
   * Render individual cells of the block shape
   */
  const renderShape = () => {
    const cells = [];
    for (let row = 0; row < block.shape.length; row++) {
      for (let col = 0; col < block.shape[row].length; col++) {
        if (block.shape[row][col] === 1) {
          cells.push(
            <View
              key={`${row}-${col}`}
              style={[
                styles.cell,
                {
                  backgroundColor: block.color,
                  width: TRAY_CELL_SIZE,
                  height: TRAY_CELL_SIZE,
                  top: row * (TRAY_CELL_SIZE + TRAY_GAP),
                  left: col * (TRAY_CELL_SIZE + TRAY_GAP),
                },
              ]}
            />,
          );
        }
      }
    }
    return cells;
  };

  // Log on render (must be before early return)
  useEffect(() => {
    console.log("🎨 DraggableBlock rendered:", {
      blockId: block.id,
      shapeSize: `${shapeWidth}x${shapeHeight}`,
      blockSize: `${blockWidthPx}x${blockHeightPx}`,
      hasInitialPosition: !!initialPosition,
    });
  }, [
    block.id,
    shapeWidth,
    shapeHeight,
    blockWidthPx,
    blockHeightPx,
    initialPosition,
  ]);

  // Don't render if already placed
  if (isPlaced) {
    return null;
  }

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View
        onLayout={handleLayout}
        style={[
          styles.container,
          {
            width: trayBlockWidthPx,
            height: trayBlockHeightPx,
          },
          animatedStyle,
        ]}
      >
        {renderShape()}
      </Animated.View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "relative",
  },
  cell: {
    position: "absolute",
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
});
