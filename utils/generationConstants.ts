/**
 * Generation Constants — The "DNA" of the game's feel.
 *
 * Centralized location for all tunable parameters related to piece generation,
 * balancing, and difficulty.
 */

export const GENERATION_CONFIG = {
  // --- Attempt Budgets ---
  MAX_WEIGHTED_ATTEMPTS: 50,
  MAX_RESCUE_ATTEMPTS: 30,

  // --- Difficulty Thresholds ---
  // Thresholds for the 0.0-1.0 difficulty score
  TIER_THRESHOLDS: {
    EASY: 0.20,   // Below this is Easy
    NORMAL: 0.40, // Below this is Normal, above is Hard
  },

  // --- Danger Level Thresholds (Board Analysis) ---
  DANGER_THRESHOLD: {
    OCCUPANCY: {
      LOW: 0.35,
      MEDIUM: 0.55,
      HIGH: 0.72,
    },
    PLACEMENT_PRESSURE: {
      CRITICAL: 4,
      HIGH: 10,
    }
  },

  // --- Weight Modifiers (Multipliers) ---
  WEIGHTS: {
    DANGER: {
      low: { easy: 0.9, normal: 1.1, hard: 1.0 },
      medium: { easy: 1.0, normal: 1.1, hard: 0.8 },
      high: { easy: 1.5, normal: 0.9, hard: 0.4 },
      critical: { easy: 2.5, normal: 0.6, hard: 0.1 },
    },
    // Smoothing
    SMOOTHING: {
      EASY_BOOST_PER_HARD_BATCH: 0.2,
      HARD_SUPPRESS_PER_HARD_BATCH: 0.15,
    },
    // Special Bonuses
    LINE_CLEAR_OPPORTUNITY_BONUS: 0.5,
    COMPACTNESS_BONUS: 0.4,
    
    /** 
     * Hero shapes are the "true" rescues: 1x1, 1x2, 1x3.
     * These get an extra boost in critical danger to ensure the player 
     * feels like the game is trying to help them.
     */
    HERO_BONUS: 1.5, 
    
    MIN_WEIGHT: 0.05,
  },

  // --- Hero Shape Indices ---
  // These are indices into the SHAPES array that are the most flexible.
  HERO_SHAPE_INDICES: [0, 1, 2, 3, 4], 
};
