/**
 * Block Blast - Main Game Screen
 * Expo Router: app/(tabs)/index.tsx
 */

import {GameBoard} from "@/components/GameBoard";
import {useGameStore} from "@/store/useGameStore";
import type {BoardMeasurements} from "@/constants/types";
import React, {useState} from "react";
import {Pressable, StyleSheet, Text, View} from "react-native";

export default function GameScreen() {
  const {score, highScore, isGameOver, resetGame, currentBlocks} =
    useGameStore();
  const [boardMeasurements, setBoardMeasurements] =
    useState<BoardMeasurements | null>(null);

  const handleBoardLayout = (measurements: BoardMeasurements) => {
    setBoardMeasurements(measurements);
    if (__DEV__) {
      console.log("Board positioned at:", measurements);
    }
  };

  return (
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
        <GameBoard onLayout={handleBoardLayout} ghostPreview={null}/>
      </View>

      {/* Block Tray (Placeholder - will add DraggableBlock components) */}
      <View style={styles.tray}>
        <Text style={styles.trayLabel}>
          Available Blocks: {currentBlocks.length}
        </Text>
        <View style={styles.blockContainer}>
          {currentBlocks.map((block, index) => (
            <View
              key={block.id}
              style={[
                styles.blockPlaceholder,
                {backgroundColor: block.color},
              ]}
            >
              <Text style={styles.blockText}>{index + 1}</Text>
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
  );
}

const styles = StyleSheet.create({
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
  blockPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#ffffff20",
    opacity: 0.8,
  },
  blockText: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "bold",
    textShadowColor: "#000",
    textShadowOffset: {width: 1, height: 1},
    textShadowRadius: 2,
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
