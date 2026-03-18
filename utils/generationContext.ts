/**
 * Generation Context — Tracks recent generation history for difficulty smoothing.
 *
 * Maintains a small rolling window of generation metadata so the weighted
 * generator can avoid streaks of overly hard or overly easy batches.
 *
 * Usage:
 *   - Create once per game session (or reset on game restart).
 *   - Call `recordBatch()` after each successful generation.
 *   - Pass the context into the weighted generator each turn.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Snapshot of a single generated batch. */
export interface BatchRecord {
  /** Average difficulty score of the batch (0–1). */
  difficulty: number;
  /** Whether the batch required fallback to succeed. */
  usedFallback: boolean;
  /** Danger level at the time of generation. */
  danger: "low" | "medium" | "high" | "critical";
}

/** Full generation context passed to the weighted generator. */
export interface GenerationContext {
  /** Rolling history of recent batches (newest last). */
  history: BatchRecord[];
  /** Average difficulty of the last N batches. */
  recentAvgDifficulty: number;
  /** How many of the last N batches were "hard" (difficulty > 0.45). */
  consecutiveHardBatches: number;
  /** How many of the last N batches required fallback. */
  recentFallbackCount: number;
}

// ---------------------------------------------------------------------------
// Configuration (tunable)
// ---------------------------------------------------------------------------

/** Maximum number of historical batches to retain. */
const MAX_HISTORY = 5;

/** Difficulty threshold above which a batch is considered "hard". */
const HARD_BATCH_THRESHOLD = 0.45;

// ---------------------------------------------------------------------------
// Mutable context (one per game session)
// ---------------------------------------------------------------------------

let _history: BatchRecord[] = [];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Record a newly generated batch into the context.
 */
export function recordBatch(record: BatchRecord): void {
  _history.push(record);
  if (_history.length > MAX_HISTORY) {
    _history.shift();
  }
}

/**
 * Build the current GenerationContext snapshot.
 * The returned object is a fresh value (not a reference to internal state).
 */
export function getGenerationContext(): GenerationContext {
  const history = [..._history];

  const recentAvgDifficulty =
    history.length > 0
      ? history.reduce((sum, r) => sum + r.difficulty, 0) / history.length
      : 0;

  // Count consecutive hard batches from the end
  let consecutiveHardBatches = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].difficulty > HARD_BATCH_THRESHOLD) {
      consecutiveHardBatches++;
    } else {
      break;
    }
  }

  const recentFallbackCount = history.filter((r) => r.usedFallback).length;

  return {
    history,
    recentAvgDifficulty,
    consecutiveHardBatches,
    recentFallbackCount,
  };
}

/**
 * Reset generation history — call on game restart.
 */
export function resetGenerationContext(): void {
  _history = [];
}
