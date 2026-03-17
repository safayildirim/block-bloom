/**
 * Block Bloom - Main Game Screen
 * Expo Router: app/(tabs)/index.tsx
 */

import { GameBoard } from "@/components/GameBoard";
import type { BoardMeasurements } from "@/constants/types";
import { DraggableBlock } from "@/components/DraggableBlock";
import { useGameStore } from "@/store/useGameStore";
import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

export default function GameScreen() {
  const { score, highScore, isGameOver, resetGame, currentBlocks } =
    useGameStore();
  const [boardMeasurements, setBoardMeasurements] =
    useState<BoardMeasurements | null>(null);
  const [ghostPreview, setGhostPreview] = useState<{
    row: number;
    col: number;
    shape: number[][];
    isValid: boolean;
  } | null>(null);

  const handleBoardLayout = (measurements: BoardMeasurements) => {
    setBoardMeasurements(measurements);
    if (__DEV__) {
      console.log("Board positioned at:", measurements);
    }
  };

  return (
    <GestureHandlerRootView style={styles.flex}>
      <View style={styles.container}>
        {/* Header - Score Display */}
        <View style={styles.header}>
          <View style={styles.scoreContainer}>
            <Text style={styles.scoreLabel}>SCORE</Text>
            <Text style={styles.scoreValue}>{score}</Text>
          </View>
          <View style={styles.scoreContainer}>
            <Text style={styles.scoreLabel}>BEST</Text>
            <Text style={styles.scoreValue}>{highScore}</Text>
          </View>
        </View>

        {/* Game Board */}
        <View style={styles.boardContainer}>
          <GameBoard onLayout={handleBoardLayout} ghostPreview={ghostPreview} />
        </View>

        {/* Block Tray with Draggable Blocks */}
        <View style={styles.tray}>
          <Text style={styles.trayLabel}>Drag blocks to the grid</Text>
          <View style={styles.blockContainer}>
            {currentBlocks.map((block) => (
              <View key={block.id} style={styles.blockWrapper}>
                <DraggableBlock
                  block={block}
                  boardMeasurements={boardMeasurements}
                  onGhostUpdate={setGhostPreview}
                />
              </View>
            ))}
          </View>
        </View>

        {/* Game Over Modal */}
        {isGameOver && (
          <View style={styles.gameOverModal}>
            <View style={styles.modalContent}>
              <Text style={styles.gameOverText}>Game Over!</Text>
              <Text style={styles.finalScore}>Final Score: {score}</Text>
              {score === highScore && score > 0 && (
                <Text style={styles.newRecord}>🎉 New Record!</Text>
              )}
              <Pressable style={styles.resetButton} onPress={resetGame}>
                <Text style={styles.resetButtonText}>Play Again</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Debug Info (Development only) */}
        {__DEV__ && boardMeasurements && (
          <View style={styles.debug}>
            <Text style={styles.debugText}>
              Board: {Math.round(boardMeasurements.x)},{" "}
              {Math.round(boardMeasurements.y)}
            </Text>
            <Text style={styles.debugText}>Blocks: {currentBlocks.length}</Text>
          </View>
        )}
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: "#0a0a15",
    paddingTop: 60,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingHorizontal: 40,
    marginBottom: 20,
  },
  scoreContainer: {
    alignItems: "center",
  },
  scoreLabel: {
    color: "#666",
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1,
    marginBottom: 4,
  },
  scoreValue: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "bold",
  },
  boardContainer: {
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  tray: {
    backgroundColor: "#16162a",
    paddingVertical: 20,
    paddingHorizontal: 20,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    minHeight: 180,
  },
  trayLabel: {
    color: "#888",
    fontSize: 12,
    textAlign: "center",
    marginBottom: 16,
  },
  blockContainer: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
  },
  blockWrapper: {
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
  },
  gameOverModal: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.85)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalContent: {
    backgroundColor: "#1a1a2e",
    padding: 40,
    borderRadius: 20,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#e94560",
    minWidth: 280,
  },
  gameOverText: {
    color: "#e94560",
    fontSize: 32,
    fontWeight: "bold",
    marginBottom: 16,
  },
  finalScore: {
    color: "#fff",
    fontSize: 24,
    marginBottom: 8,
  },
  newRecord: {
    color: "#4ECDC4",
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 16,
  },
  resetButton: {
    backgroundColor: "#e94560",
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  resetButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  debug: {
    position: "absolute",
    bottom: 200,
    left: 10,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    padding: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#0f0",
  },
  debugText: {
    color: "#0f0",
    fontSize: 10,
    fontFamily: "Courier",
  },
});
