/**
 * Generation Context — Tracks recent generation history for difficulty smoothing.
 */

import { HARD_BATCH_THRESHOLD } from "./generationConstants";

export interface BatchRecord {
  difficulty: number;
  usedFallback: boolean;
  danger: "low" | "medium" | "high" | "critical";
  shapeIndices: number[];
}

export interface GenerationContext {
  history: BatchRecord[];
  recentAvgDifficulty: number;
  consecutiveHardBatches: number;
  recentFallbackCount: number;
  previousBatchShapeIndices: number[];
}

const MAX_HISTORY = 5;

let _history: BatchRecord[] = [];

export function recordBatch(record: BatchRecord): void {
  _history.push(record);
  if (_history.length > MAX_HISTORY) {
    _history.shift();
  }
}

export function getGenerationContext(): GenerationContext {
  const history = [..._history];

  const recentAvgDifficulty =
    history.length > 0
      ? history.reduce((sum, r) => sum + r.difficulty, 0) / history.length
      : 0;

  let consecutiveHardBatches = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].difficulty > HARD_BATCH_THRESHOLD) {
      consecutiveHardBatches++;
    } else {
      break;
    }
  }

  const recentFallbackCount = history.filter((r) => r.usedFallback).length;
  const lastBatch = history[history.length - 1];
  const previousBatchShapeIndices = lastBatch?.shapeIndices ?? [];

  return {
    history,
    recentAvgDifficulty,
    consecutiveHardBatches,
    recentFallbackCount,
    previousBatchShapeIndices,
  };
}

export function resetGenerationContext(): void {
  _history = [];
}
