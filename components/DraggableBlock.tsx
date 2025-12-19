/**
 * DraggableBlock Component
 * Handles drag gestures for block pieces with collision detection
 */

import { CELL_SIZE, DRAG_OFFSET_Y, GAP, getShapeDimensions } from "@/constants/constants";
import type { Block, BoardMeasurements } from "@/constants/types";
import { useGameStore } from "@/store/useGameStore";
import { getGridPosition } from "@/utils/gameLogic";
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
    [block.shape]
  );

  // Calculate block render size in pixels
  const blockWidthPx = shapeWidth * CELL_SIZE + (shapeWidth - 1) * GAP;
  const blockHeightPx = shapeHeight * CELL_SIZE + (shapeHeight - 1) * GAP;

  /**
   * Update ghost preview on the game board using center-based snapping
   */
  const updateGhost = useCallback(
    (absoluteX: number, absoluteY: number) => {
      console.log('👻 updateGhost CALLED:', {
        absoluteX,
        absoluteY,
        hasBoardMeasurements: !!boardMeasurements,
        hasInitialPosition: !!initialPosition,
        boardMeasurements,
        initialPosition,
      });

      if (!boardMeasurements || !initialPosition) {
        console.warn('❌ Cannot update ghost: missing boardMeasurements or initialPosition');
        onGhostUpdate(null);
        return;
      }

      // Calculate the visual block's center position
      // The block is visually offset by DRAG_OFFSET_Y above the finger
      // So the center is: finger position + offset + half block size
      const visualBlockCenterX = absoluteX + blockWidthPx / 2;
      const visualBlockCenterY = absoluteY + DRAG_OFFSET_Y + blockHeightPx / 2;

      // Get grid position based on visual block center
      const centerGridPos = getGridPosition(
        visualBlockCenterX,
        visualBlockCenterY,
        boardMeasurements
      );

      if (!centerGridPos) {
        onGhostUpdate(null);
        return;
      }

      // Convert center-based grid position to top-left placement position
      // Shapes are placed starting from their top-left corner
      const topLeftRow = centerGridPos.row - Math.floor(shapeHeight / 2);
      const topLeftCol = centerGridPos.col - Math.floor(shapeWidth / 2);

      // Check bounds - top-left must be valid
      if (topLeftRow < 0 || topLeftCol < 0) {
        onGhostUpdate(null);
        return;
      }

      const isValid = checkCollision(block.shape, topLeftRow, topLeftCol);

      onGhostUpdate({
        row: topLeftRow,
        col: topLeftCol,
        shape: block.shape,
        isValid,
      });
    },
    [boardMeasurements, block.shape, blockWidthPx, blockHeightPx, shapeWidth, shapeHeight, checkCollision, onGhostUpdate, initialPosition]
  );

  /**
   * Attempt to place the block on the board using center-based snapping
   */
  const attemptPlacement = useCallback(
    (translationX: number, translationY: number, absoluteX: number, absoluteY: number) => {
      console.log('🎯 attemptPlacement CALLED:', {
        translationX,
        translationY,
        absoluteX,
        absoluteY,
        hasBoardMeasurements: !!boardMeasurements,
        hasInitialPosition: !!initialPosition,
        boardMeasurements,
        initialPosition,
      });

      if (!boardMeasurements || !initialPosition) {
        console.warn('❌ Cannot place: missing boardMeasurements or initialPosition');
        // Invalid - spring back
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        scale.value = withSpring(1);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        return;
      }

      // Calculate the visual block's center position
      // The block is visually offset by DRAG_OFFSET_Y above the finger
      // So the center is: finger position + offset + half block size
      const visualBlockCenterX = absoluteX + blockWidthPx / 2;
      const visualBlockCenterY = absoluteY + DRAG_OFFSET_Y + blockHeightPx / 2;

      console.log('📍 Visual block center calculated:', {
        visualBlockCenterX,
        visualBlockCenterY,
        initialX: initialPosition.x,
        initialY: initialPosition.y,
        blockWidthPx,
        blockHeightPx,
        translationX,
        translationY,
        dragOffsetY: DRAG_OFFSET_Y,
        boardMeasurements,
      });

      // Get grid position based on visual block center
      const centerGridPos = getGridPosition(
        visualBlockCenterX,
        visualBlockCenterY,
        boardMeasurements
      );

      console.log('🎯 getGridPosition result:', centerGridPos);

      if (!centerGridPos) {
        console.warn('❌ Center position is out of bounds - cannot place block');
        // Invalid - spring back
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        scale.value = withSpring(1);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        return;
      }

      // Convert center-based grid position to top-left placement position
      // Shapes are placed starting from their top-left corner
      const topLeftRow = centerGridPos.row - Math.floor(shapeHeight / 2);
      const topLeftCol = centerGridPos.col - Math.floor(shapeWidth / 2);

      // Debug logging
      if (__DEV__) {
        console.log('Placement attempt:', {
          centerGridPos,
          topLeftRow,
          topLeftCol,
          shapeSize: `${shapeWidth}x${shapeHeight}`,
          blockId: block.id,
        });
      }

      // Check bounds first - top-left must be valid
      if (topLeftRow < 0 || topLeftCol < 0) {
        if (__DEV__) {
          console.log('Placement failed: top-left out of bounds (negative)');
        }
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        scale.value = withSpring(1);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        return;
      }

      const isValid = checkCollision(block.shape, topLeftRow, topLeftCol);

      if (__DEV__) {
        console.log('Collision check result:', isValid);
        if (!isValid) {
          console.log('Collision check failed - block cannot be placed at this position');
        }
      }

      if (!isValid) {
        // Invalid - spring back
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        scale.value = withSpring(1);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        return;
      }

      // Collision check passed, attempt to place
      const success = placeBlock(block.id, topLeftRow, topLeftCol);
      if (__DEV__) {
        console.log('Place block result:', success);
        if (!success) {
          console.log('PlaceBlock returned false even though collision check passed');
        }
      }

      if (success) {
        // Block placed successfully - fade out
        opacity.value = withSpring(0);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setIsPlaced(true);
        return;
      }

      // Placement failed even though collision check passed
      if (__DEV__) {
        console.warn('Placement failed unexpectedly');
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
      shapeWidth,
      shapeHeight,
      checkCollision,
      placeBlock,
      translateX,
      translateY,
      scale,
      opacity,
      initialPosition,
    ]
  );

  /**
   * Handle layout to track initial position
   */
  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { x, y, width, height } = event.nativeEvent.layout;
      console.log('📐 Layout measured:', { x, y, width, height, blockId: block.id });
      setInitialPosition({ x, y, width, height });
    },
    [block.id]
  );

  /**
   * Pan gesture handler with center-based snapping
   */
  const panGesture = Gesture.Pan()
    .onStart(() => {
      console.log('🟢 Gesture STARTED - initialPosition:', initialPosition);
      if (!initialPosition) {
        console.warn('⚠️ Cannot start drag: initialPosition not set');
        return;
      }
      console.log('✅ Starting drag with initialPosition:', initialPosition);
      // Scale up slightly when picked up
      scale.value = withSpring(1.1);
      // Apply visual offset to raise block above finger
      translateY.value = DRAG_OFFSET_Y;
    })
    .onUpdate((event) => {
      console.log('👻 onUpdate CALLED:', {
        translationX: event.translationX,
        translationY: event.translationY,
        absoluteX: event.absoluteX,
        absoluteY: event.absoluteY,
      });

      // Apply translation relative to start position, with offset
      translateX.value = event.translationX;
      translateY.value = DRAG_OFFSET_Y + event.translationY;

      // Update ghost preview using center-based calculation with absolute positions
      runOnJS(updateGhost)(event.absoluteX, event.absoluteY);
    })
    .onEnd((event) => {
      console.log('🔴 Gesture ENDED - translation:', {
        x: event.translationX,
        y: event.translationY,
        absoluteX: event.absoluteX,
        absoluteY: event.absoluteY,
      });
      console.log('📞 About to call attemptPlacement via runOnJS');
      // Try to place the block using center-based calculation
      // Pass both translation and absolute positions
      runOnJS(attemptPlacement)(
        event.translationX,
        event.translationY,
        event.absoluteX,
        event.absoluteY
      );
      console.log('📞 Called attemptPlacement, now calling onGhostUpdate');
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

  // Log on render (must be before early return)
  useEffect(() => {
    console.log('🎨 DraggableBlock rendered:', {
      blockId: block.id,
      shapeSize: `${shapeWidth}x${shapeHeight}`,
      blockSize: `${blockWidthPx}x${blockHeightPx}`,
      hasInitialPosition: !!initialPosition,
    });
  }, [block.id, shapeWidth, shapeHeight, blockWidthPx, blockHeightPx, initialPosition]);

  // Don't render if already placed
  if (isPlaced) {
    return null;
  }

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        onLayout={handleLayout}
        style={[
          styles.container,
          {
            width: blockWidthPx,
            height: blockHeightPx,
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
