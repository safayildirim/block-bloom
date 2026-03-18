/**
 * Generation Constants — Tunable parameters for batch archetype generation.
 *
 * DangerLevel is defined here (not in boardAnalysis) to avoid circular deps.
 * boardAnalysis imports from here; weightedGeneration imports from both.
 */

// ---------------------------------------------------------------------------
// Shared Types
// ---------------------------------------------------------------------------

export type DangerLevel = "low" | "medium" | "high" | "critical";

// ---------------------------------------------------------------------------
// Danger Thresholds (used by boardAnalysis.ts)
// ---------------------------------------------------------------------------

export const DANGER_THRESHOLD = {
  OCCUPANCY: {
    LOW: 0.35,
    MEDIUM: 0.55,
    HIGH: 0.72,
  },
  PLACEMENT_PRESSURE: {
    CRITICAL: 4,
    HIGH: 10,
  },
};

// ---------------------------------------------------------------------------
// Tier Thresholds
// ---------------------------------------------------------------------------

export const TIER_THRESHOLDS = {
  /** Shapes with cellCount <= this are "small" */
  SMALL_MAX: 3,
  /** Shapes with cellCount <= this are "medium" (above SMALL_MAX) */
  MEDIUM_MAX: 5,
  /** 5-cell shapes with compactness below this bump from medium to large */
  AWKWARDNESS_BUMP_COMPACTNESS: 0.6,
};

// ---------------------------------------------------------------------------
// Batch Archetypes
// ---------------------------------------------------------------------------

export type ArchetypeName =
  | "workhorse"
  | "challenge"
  | "builder"
  | "blockbuster"
  | "line-hunter"
  | "filler";

export type SlotTier = "small" | "medium" | "large" | "line";

export interface ArchetypeDefinition {
  name: ArchetypeName;
  slots: [SlotTier, SlotTier, SlotTier];
}

export const ARCHETYPES: Record<ArchetypeName, ArchetypeDefinition> = {
  workhorse:     { name: "workhorse",     slots: ["medium", "medium", "small"] },
  challenge:     { name: "challenge",     slots: ["medium", "medium", "large"] },
  builder:       { name: "builder",       slots: ["medium", "small",  "small"] },
  blockbuster:   { name: "blockbuster",   slots: ["large",  "medium", "small"] },
  "line-hunter": { name: "line-hunter",   slots: ["line",   "line",   "medium"] },
  filler:        { name: "filler",        slots: ["small",  "small",  "small"] },
};

/** Archetype selection weights per danger level (sum to 100 per row). */
export const ARCHETYPE_WEIGHTS: Record<DangerLevel, Record<ArchetypeName, number>> = {
  low:      { workhorse: 35, challenge: 25, builder: 10, blockbuster: 20, "line-hunter": 10, filler: 0 },
  medium:   { workhorse: 40, challenge: 15, builder: 20, blockbuster: 10, "line-hunter": 15, filler: 0 },
  high:     { workhorse: 30, challenge: 5,  builder: 35, blockbuster: 5,  "line-hunter": 20, filler: 5 },
  critical: { workhorse: 15, challenge: 0,  builder: 40, blockbuster: 0,  "line-hunter": 10, filler: 35 },
};

/** Minimum near-complete lines required for line-hunter to activate */
export const LINE_HUNTER_MIN_NEAR_COMPLETE = 2;

// ---------------------------------------------------------------------------
// Smoothing
// ---------------------------------------------------------------------------

export const SMOOTHING = {
  /** Consecutive hard batches before suppressing challenge/blockbuster */
  HARD_STREAK_THRESHOLD: 2,
  /** How freed weight is redistributed */
  REDISTRIBUTION: { builder: 0.6, workhorse: 0.4 },
};

// ---------------------------------------------------------------------------
// Within-Tier Weight Modifiers
// ---------------------------------------------------------------------------

export const WITHIN_TIER = {
  /** Bonus for compact shapes at high/critical danger (was 0.4, reduced) */
  COMPACTNESS_BONUS: 0.3,
  /** Bonus per near-complete line for line shapes (was 0.5, reduced) */
  LINE_CLEAR_BONUS: 0.4,
  LINE_CLEAR_CAP: 3,
  ANTI_REPETITION_FACTOR: 0.5,
  MIN_WEIGHT: 0.1,
};

// ---------------------------------------------------------------------------
// Attempt Budgets
// ---------------------------------------------------------------------------

export const MAX_WEIGHTED_ATTEMPTS = 50;
export const MAX_RESCUE_ATTEMPTS = 30;

// ---------------------------------------------------------------------------
// Difficulty Scoring
// ---------------------------------------------------------------------------

/** Difficulty above which a batch counts as "hard" for smoothing */
export const HARD_BATCH_THRESHOLD = 0.45;
