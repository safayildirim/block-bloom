/**
 * DraggableBlock Component
 * Handles drag gestures for block pieces with collision detection
 */

import { convertToGridPosition } from "@/components/GameBoard";
import { CELL_SIZE, GAP, getShapeDimensions } from "@/constants/constants";
import type { Block, BoardMeasurements } from "@/constants/types";
import { useGameStore } from "@/store/useGameStore";
import * as Haptics from "expo-haptics";
import React, { useCallback, useMemo } from "react";
import { StyleSheet, View } from "react-native";
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
    } | null
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

  // Track if block was successfully placed (using React state, not shared value)
  const [isPlaced, setIsPlaced] = React.useState(false);

  // Get block dimensions
  const { width: shapeWidth, height: shapeHeight } = useMemo(
    () => getShapeDimensions(block.shape),
    [block.shape]
  );

  // Calculate block render size
  const blockWidth = shapeWidth * CELL_SIZE + (shapeWidth - 1) * GAP;
  const blockHeight = shapeHeight * CELL_SIZE + (shapeHeight - 1) * GAP;

  /**
   * Update ghost preview on the game board
   */
  const updateGhost = useCallback(
    (absoluteX: number, absoluteY: number) => {
      if (!boardMeasurements) {
        onGhostUpdate(null);
        return;
      }

      const gridPos = convertToGridPosition(
        absoluteX,
        absoluteY,
        boardMeasurements
      );

      if (!gridPos) {
        onGhostUpdate(null);
        return;
      }

      const isValid = checkCollision(block.shape, gridPos.row, gridPos.col);

      onGhostUpdate({
        row: gridPos.row,
        col: gridPos.col,
        shape: block.shape,
        isValid,
      });
    },
    [boardMeasurements, block.shape, checkCollision, onGhostUpdate]
  );

  /**
   * Attempt to place the block on the board
   */
  const attemptPlacement = useCallback(
    (absoluteX: number, absoluteY: number) => {
      if (!boardMeasurements) {
        // Invalid - spring back
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        scale.value = withSpring(1);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        return;
      }

      const gridPos = convertToGridPosition(
        absoluteX,
        absoluteY,
        boardMeasurements
      );

      if (!gridPos) {
        // Invalid - spring back
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        scale.value = withSpring(1);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        return;
      }

      const isValid = checkCollision(block.shape, gridPos.row, gridPos.col);

      if (isValid) {
        const success = placeBlock(block.id, gridPos.row, gridPos.col);
        if (success) {
          // Block placed successfully - fade out
          opacity.value = withSpring(0);
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setIsPlaced(true);
          return;
        }
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
      checkCollision,
      placeBlock,
      translateX,
      translateY,
      scale,
      opacity,
    ]
  );

  /**
   * Pan gesture handler
   */
  const panGesture = Gesture.Pan()
    .onStart(() => {
      // Scale up slightly when picked up
      scale.value = withSpring(1.1);
    })
    .onUpdate((event) => {
      translateX.value = event.translationX;
      translateY.value = event.translationY;

      // Calculate absolute position for collision detection
      // Note: In a real scenario, you'd need to get the block's initial position
      // For now, we'll use the translation directly
      runOnJS(updateGhost)(event.absoluteX, event.absoluteY);
    })
    .onEnd((event) => {
      // Try to place the block
      runOnJS(attemptPlacement)(event.absoluteX, event.absoluteY);
      runOnJS(onGhostUpdate)(null);
    });

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
                  top: row * (CELL_SIZE + GAP),
                  left: col * (CELL_SIZE + GAP),
                },
              ]}
            />
          );
        }
      }
    }
    return cells;
  };

  // Don't render if already placed
  if (isPlaced) {
    return null;
  }

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        style={[
          styles.container,
          {
            width: blockWidth,
            height: blockHeight,
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
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
});
