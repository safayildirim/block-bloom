# Batch Archetype Piece Generation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace independent weighted shape sampling with a batch archetype system that produces interesting, designed 3-piece batches.

**Architecture:** Archetype templates define the tier composition of each batch (e.g., "2 medium + 1 small"). Board state selects the archetype, within-tier weights pick specific shapes, and the existing DFS solver validates solvability. This layers on top of the existing board analysis and solver infrastructure.

**Tech Stack:** TypeScript, Jest, React Native (no new dependencies)

**Spec:** `docs/superpowers/specs/2026-03-19-batch-archetype-generation-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `utils/generationConstants.ts` | Rewrite | All tunable constants: tier thresholds, archetype definitions, within-tier modifier values, smoothing params. Also re-exports `DangerLevel` type and danger thresholds so `boardAnalysis.ts` import stays valid. |
| `utils/shapeDifficulty.ts` | Modify | 3-tier model (small/medium/large), cell-count-based assignment, awkwardness bump |
| `utils/generationContext.ts` | Modify | Add `shapeIndices` to BatchRecord, add `previousBatchShapeIndices` to context, import `HARD_BATCH_THRESHOLD` from constants |
| `utils/weightedGeneration.ts` | Rewrite | Archetype selection, slot filling, within-tier weighting, main entry point |
| `utils/pieceGeneration.ts` | Modify | Remove dead code, retain `emergencyFallback` |
| `utils/__tests__/archetypeGeneration.test.ts` | Create | All tests for the new system |
| `utils/__tests__/weightedGeneration.test.ts` | Modify | Replace old tests that import removed functions |
| `utils/__tests__/batchSolver.test.ts` | Modify | Update imports that reference removed `generateNextPieceBatch` |

---

### Task 1: Update Generation Constants

**Files:**
- Modify: `utils/generationConstants.ts`

- [ ] **Step 1: Write the new constants file**

Replace the entire file. Key change: define `DangerLevel` here (not imported from `boardAnalysis`) to avoid circular dependency, and retain `DANGER_THRESHOLD` so `boardAnalysis.ts` keeps working.

```typescript
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
```

- [ ] **Step 2: Update boardAnalysis.ts imports**

Change `boardAnalysis.ts` to import from the new constants structure. Replace:
```typescript
import { GENERATION_CONFIG } from "./generationConstants";
```
With:
```typescript
import { DANGER_THRESHOLD, type DangerLevel } from "./generationConstants";
```

And update `classifyDanger` to use `DANGER_THRESHOLD` directly instead of `GENERATION_CONFIG.DANGER_THRESHOLD`:
```typescript
function classifyDanger(
  occupancy: number,
  avgPlacements: number,
  maxSquare: number,
): DangerLevel {
  if (avgPlacements <= DANGER_THRESHOLD.PLACEMENT_PRESSURE.CRITICAL || maxSquare < 2) {
    return "critical";
  }
  if (occupancy >= DANGER_THRESHOLD.OCCUPANCY.HIGH || avgPlacements <= DANGER_THRESHOLD.PLACEMENT_PRESSURE.HIGH) {
    return "high";
  }
  if (occupancy >= DANGER_THRESHOLD.OCCUPANCY.MEDIUM) {
    return "medium";
  }
  return "low";
}
```

Also remove the locally defined `DangerLevel` type from `boardAnalysis.ts` and re-export it from the import:
```typescript
export type { DangerLevel } from "./generationConstants";
```

- [ ] **Step 3: Verify compilation**

Run: `npx jest --passWithNoTests`
Expected: May still have failures from old `GENERATION_CONFIG` references in test files — those are fixed in later tasks. But `boardAnalysis.ts` and `generationConstants.ts` should compile.

- [ ] **Step 4: Commit**

```bash
git add utils/generationConstants.ts utils/boardAnalysis.ts
git commit -m "refactor: replace generation constants with archetype-based config"
```

---

### Task 2: Update Shape Difficulty Tiers

**Files:**
- Modify: `utils/shapeDifficulty.ts`
- Create: `utils/__tests__/archetypeGeneration.test.ts`

- [ ] **Step 1: Write failing tests for tier assignment**

Create `utils/__tests__/archetypeGeneration.test.ts`:

```typescript
import { SHAPES } from "../../constants/constants";
import {
  computeShapeDifficulty,
  getAllShapeDifficulties,
  resetDifficultyCache,
} from "../shapeDifficulty";

beforeEach(() => {
  resetDifficultyCache();
});

describe("Shape Difficulty: Tier Assignment", () => {
  it("assigns all 23 shapes to correct tiers based on cell count", () => {
    const all = getAllShapeDifficulties();
    expect(all).toHaveLength(SHAPES.length);

    const smallIndices = [0, 1, 2, 3, 4, 9, 10];
    for (const i of smallIndices) {
      expect(all[i].tier).toBe("small");
    }

    const mediumIndices = [5, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];
    for (const i of mediumIndices) {
      expect(all[i].tier).toBe("medium");
    }

    const largeIndices = [6, 7, 8, 11, 12];
    for (const i of largeIndices) {
      expect(all[i].tier).toBe("large");
    }
  });

  it("bumps 5-cell shapes with low compactness to large", () => {
    const shape11 = computeShapeDifficulty(SHAPES[11], 11);
    const shape12 = computeShapeDifficulty(SHAPES[12], 12);
    expect(shape11.cellCount).toBe(5);
    expect(shape11.compactness).toBeLessThan(0.6);
    expect(shape11.tier).toBe("large");
    expect(shape12.tier).toBe("large");
  });

  it("does NOT bump 5-cell compact shapes", () => {
    const shape21 = computeShapeDifficulty(SHAPES[21], 21);
    expect(shape21.cellCount).toBe(5);
    expect(shape21.compactness).toBe(1.0);
    expect(shape21.tier).toBe("medium");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest archetypeGeneration --verbose`
Expected: FAIL — `tier` values don't match because `shapeDifficulty.ts` still uses old tier model.

- [ ] **Step 3: Update shapeDifficulty.ts**

Replace the full file:

```typescript
/**
 * Shape Difficulty Metadata
 *
 * 3-tier model: small (1-3 cells), medium (4-5 cells), large (6+ cells).
 * 5-cell shapes with low compactness (< 0.6) bump to large.
 */

import { SHAPES } from "../constants/constants";
import type { Shape } from "../constants/types";
import { TIER_THRESHOLDS } from "./generationConstants";

export type DifficultyTier = "small" | "medium" | "large";

export interface ShapeDifficulty {
  shapeIndex: number;
  cellCount: number;
  width: number;
  height: number;
  boundingArea: number;
  compactness: number;
  isLine: boolean;
  tier: DifficultyTier;
  difficulty: number;
}

export function computeShapeDifficulty(
  shape: Shape,
  shapeIndex: number,
): ShapeDifficulty {
  const height = shape.length;
  const width = shape[0]?.length ?? 0;
  const boundingArea = width * height;

  let cellCount = 0;
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (shape[r][c] === 1) cellCount++;
    }
  }

  const compactness = boundingArea > 0 ? cellCount / boundingArea : 1;
  const isLine = width === 1 || height === 1;

  // Continuous difficulty for batch scoring
  const sizeScore = (Math.log2(cellCount) / Math.log2(10)) * 0.7;
  const awkwardnessScore = (1 - compactness) * 0.25;
  const dimensionScore = (Math.max(width, height) / 10) * 0.15;
  const difficulty = Math.min(sizeScore + awkwardnessScore + dimensionScore, 1);

  // Cell-count-based tier assignment
  let tier: DifficultyTier;
  if (cellCount <= TIER_THRESHOLDS.SMALL_MAX) {
    tier = "small";
  } else if (cellCount <= TIER_THRESHOLDS.MEDIUM_MAX) {
    tier = "medium";
  } else {
    tier = "large";
  }

  // Awkwardness bump: 5-cell shapes with low compactness go to large
  if (
    cellCount === TIER_THRESHOLDS.MEDIUM_MAX &&
    compactness < TIER_THRESHOLDS.AWKWARDNESS_BUMP_COMPACTNESS
  ) {
    tier = "large";
  }

  return { shapeIndex, cellCount, width, height, boundingArea, compactness, isLine, tier, difficulty };
}

let _cache: ShapeDifficulty[] | null = null;

export function getAllShapeDifficulties(): ShapeDifficulty[] {
  if (!_cache) {
    _cache = SHAPES.map((shape, i) => computeShapeDifficulty(shape, i));
  }
  return _cache;
}

export function getShapeDifficulty(shapeIndex: number): ShapeDifficulty {
  return getAllShapeDifficulties()[shapeIndex];
}

export function getShapesByTier(tier: DifficultyTier): ShapeDifficulty[] {
  return getAllShapeDifficulties().filter((d) => d.tier === tier);
}

export function computeBatchDifficulty(shapeIndices: number[]): number {
  if (shapeIndices.length === 0) return 0;
  const all = getAllShapeDifficulties();
  return shapeIndices.reduce((sum, idx) => sum + (all[idx]?.difficulty ?? 0), 0) / shapeIndices.length;
}

export function resetDifficultyCache(): void {
  _cache = null;
}
```

- [ ] **Step 4: Run tier tests to verify they pass**

Run: `npx jest archetypeGeneration --verbose`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add utils/shapeDifficulty.ts utils/__tests__/archetypeGeneration.test.ts
git commit -m "refactor: update shape difficulty to 3-tier cell-count model"
```

---

### Task 3: Update Generation Context

**Files:**
- Modify: `utils/generationContext.ts`
- Modify: `utils/__tests__/archetypeGeneration.test.ts`

- [ ] **Step 1: Update generationContext.ts first (interface + implementation)**

This task updates the interface before writing tests, because TypeScript won't compile tests that pass `shapeIndices` to a function whose type doesn't accept it.

Replace the full file:

```typescript
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
```

- [ ] **Step 2: Write tests for context changes**

Add to `utils/__tests__/archetypeGeneration.test.ts`:

```typescript
import {
  recordBatch,
  getGenerationContext,
  resetGenerationContext,
} from "../generationContext";

describe("Generation Context: shapeIndices tracking", () => {
  beforeEach(() => {
    resetGenerationContext();
  });

  it("returns empty previousBatchShapeIndices when no history", () => {
    const ctx = getGenerationContext();
    expect(ctx.previousBatchShapeIndices).toEqual([]);
  });

  it("returns last batch shapeIndices", () => {
    recordBatch({ difficulty: 0.3, usedFallback: false, danger: "low", shapeIndices: [5, 13, 1] });
    const ctx = getGenerationContext();
    expect(ctx.previousBatchShapeIndices).toEqual([5, 13, 1]);
  });

  it("updates previousBatchShapeIndices on new batch", () => {
    recordBatch({ difficulty: 0.3, usedFallback: false, danger: "low", shapeIndices: [5, 13, 1] });
    recordBatch({ difficulty: 0.5, usedFallback: false, danger: "medium", shapeIndices: [8, 17, 3] });
    const ctx = getGenerationContext();
    expect(ctx.previousBatchShapeIndices).toEqual([8, 17, 3]);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `npx jest archetypeGeneration --verbose`
Expected: PASS — all tier tests and context tests green.

- [ ] **Step 4: Commit**

```bash
git add utils/generationContext.ts utils/__tests__/archetypeGeneration.test.ts
git commit -m "feat: add shapeIndices to BatchRecord for anti-repetition tracking"
```

---

### Task 4: Implement Archetype Selection

**Files:**
- Modify: `utils/weightedGeneration.ts`
- Modify: `utils/__tests__/archetypeGeneration.test.ts`

- [ ] **Step 1: Write failing tests for archetype selection**

Add to `utils/__tests__/archetypeGeneration.test.ts`:

```typescript
import { selectArchetype } from "../weightedGeneration";
import type { BoardAnalysis } from "../boardAnalysis";

function makeMockAnalysis(overrides: Partial<BoardAnalysis> = {}): BoardAnalysis {
  return {
    occupiedCells: 0,
    emptyCells: 64,
    occupancy: 0,
    totalPlacementCount: 500,
    avgPlacementsPerShape: 25,
    nearCompleteRows: 0,
    nearCompleteCols: 0,
    maxRectAvailable: 5,
    danger: "low",
    ...overrides,
  };
}

describe("Archetype Selection", () => {
  beforeEach(() => {
    resetGenerationContext();
  });

  it("never selects filler at low danger", () => {
    const analysis = makeMockAnalysis({ danger: "low" });
    const ctx = getGenerationContext();
    const counts: Record<string, number> = {};
    for (let i = 0; i < 500; i++) {
      const name = selectArchetype(analysis, ctx);
      counts[name] = (counts[name] ?? 0) + 1;
    }
    expect(counts["filler"] ?? 0).toBe(0);
  });

  it("never selects challenge or blockbuster at critical danger", () => {
    const analysis = makeMockAnalysis({ danger: "critical" });
    const ctx = getGenerationContext();
    const counts: Record<string, number> = {};
    for (let i = 0; i < 500; i++) {
      const name = selectArchetype(analysis, ctx);
      counts[name] = (counts[name] ?? 0) + 1;
    }
    expect(counts["challenge"] ?? 0).toBe(0);
    expect(counts["blockbuster"] ?? 0).toBe(0);
  });

  it("redistributes line-hunter weight when no near-complete lines", () => {
    const analysis = makeMockAnalysis({ danger: "low", nearCompleteRows: 0, nearCompleteCols: 0 });
    const ctx = getGenerationContext();
    const counts: Record<string, number> = {};
    for (let i = 0; i < 1000; i++) {
      const name = selectArchetype(analysis, ctx);
      counts[name] = (counts[name] ?? 0) + 1;
    }
    expect(counts["line-hunter"] ?? 0).toBe(0);
  });

  it("suppresses challenge and blockbuster after consecutive hard batches", () => {
    for (let i = 0; i < 3; i++) {
      recordBatch({ difficulty: 0.8, usedFallback: false, danger: "low", shapeIndices: [8, 6, 7] });
    }
    const analysis = makeMockAnalysis({ danger: "low" });
    const ctx = getGenerationContext();
    const counts: Record<string, number> = {};
    for (let i = 0; i < 500; i++) {
      const name = selectArchetype(analysis, ctx);
      counts[name] = (counts[name] ?? 0) + 1;
    }
    expect(counts["challenge"] ?? 0).toBe(0);
    expect(counts["blockbuster"] ?? 0).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest archetypeGeneration --verbose -t "Archetype Selection"`
Expected: FAIL — `selectArchetype` does not exist.

- [ ] **Step 3: Implement selectArchetype in weightedGeneration.ts**

Start rewriting `utils/weightedGeneration.ts`. For now, implement just `selectArchetype`:

```typescript
/**
 * Archetype-Based Weighted Piece Generation
 */

import type { BoardAnalysis } from "./boardAnalysis";
import type { GenerationContext } from "./generationContext";
import {
  ARCHETYPE_WEIGHTS,
  LINE_HUNTER_MIN_NEAR_COMPLETE,
  SMOOTHING,
  type ArchetypeName,
} from "./generationConstants";

export function selectArchetype(
  analysis: BoardAnalysis,
  context: GenerationContext,
): ArchetypeName {
  const baseWeights = { ...ARCHETYPE_WEIGHTS[analysis.danger] };

  // Line-hunter gate
  const nearComplete = analysis.nearCompleteRows + analysis.nearCompleteCols;
  if (nearComplete < LINE_HUNTER_MIN_NEAR_COMPLETE) {
    const freed = baseWeights["line-hunter"];
    baseWeights["line-hunter"] = 0;
    const remaining = Object.entries(baseWeights).filter(
      ([name]) => name !== "line-hunter" && baseWeights[name as ArchetypeName] > 0,
    );
    const remainingTotal = remaining.reduce((sum, [, w]) => sum + w, 0);
    if (remainingTotal > 0) {
      for (const [name] of remaining) {
        baseWeights[name as ArchetypeName] +=
          freed * (baseWeights[name as ArchetypeName] / remainingTotal);
      }
    }
  }

  // Smoothing override
  if (context.consecutiveHardBatches >= SMOOTHING.HARD_STREAK_THRESHOLD) {
    const freed = baseWeights.challenge + baseWeights.blockbuster;
    baseWeights.challenge = 0;
    baseWeights.blockbuster = 0;
    baseWeights.builder += freed * SMOOTHING.REDISTRIBUTION.builder;
    baseWeights.workhorse += freed * SMOOTHING.REDISTRIBUTION.workhorse;
  }

  // Weighted random selection
  const entries = Object.entries(baseWeights) as [ArchetypeName, number][];
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = Math.random() * total;
  for (const [name, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return name;
  }
  return "workhorse";
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest archetypeGeneration --verbose -t "Archetype Selection"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add utils/weightedGeneration.ts utils/__tests__/archetypeGeneration.test.ts
git commit -m "feat: implement archetype selection with danger-based weights and smoothing"
```

---

### Task 5: Implement Within-Tier Slot Filling

**Files:**
- Modify: `utils/weightedGeneration.ts`
- Modify: `utils/__tests__/archetypeGeneration.test.ts`

- [ ] **Step 1: Write failing tests for slot filling**

Add to test file:

```typescript
import { fillSlot } from "../weightedGeneration";
import { getAllShapeDifficulties, resetDifficultyCache } from "../shapeDifficulty";

describe("Within-Tier Slot Filling", () => {
  beforeEach(() => {
    resetDifficultyCache();
    resetGenerationContext();
  });

  it("fillSlot('small') returns a shape from the small tier", () => {
    const analysis = makeMockAnalysis({ danger: "low" });
    const smallIndices = [0, 1, 2, 3, 4, 9, 10];
    for (let i = 0; i < 100; i++) {
      const idx = fillSlot("small", analysis, []);
      expect(smallIndices).toContain(idx);
    }
  });

  it("fillSlot('medium') returns a shape from the medium tier", () => {
    const analysis = makeMockAnalysis({ danger: "low" });
    const mediumIndices = [5, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];
    for (let i = 0; i < 100; i++) {
      const idx = fillSlot("medium", analysis, []);
      expect(mediumIndices).toContain(idx);
    }
  });

  it("fillSlot('large') returns a shape from the large tier", () => {
    const analysis = makeMockAnalysis({ danger: "low" });
    const largeIndices = [6, 7, 8, 11, 12];
    for (let i = 0; i < 100; i++) {
      const idx = fillSlot("large", analysis, []);
      expect(largeIndices).toContain(idx);
    }
  });

  it("fillSlot('line') returns only line shapes", () => {
    const analysis = makeMockAnalysis({ danger: "low" });
    const allMeta = getAllShapeDifficulties();
    const lineIndices = allMeta.filter((m) => m.isLine).map((m) => m.shapeIndex);
    for (let i = 0; i < 100; i++) {
      const idx = fillSlot("line", analysis, []);
      expect(lineIndices).toContain(idx);
    }
  });

  it("anti-repetition reduces weight of previous batch shapes", () => {
    const analysis = makeMockAnalysis({ danger: "low" });
    const prevIndices = [1, 2, 3];
    const counts: Record<number, number> = {};
    for (let i = 0; i < 2000; i++) {
      const idx = fillSlot("small", analysis, prevIndices);
      counts[idx] = (counts[idx] ?? 0) + 1;
    }
    const prevTotal = prevIndices.reduce((sum, i) => sum + (counts[i] ?? 0), 0);
    const otherSmall = [0, 4, 9, 10];
    const otherTotal = otherSmall.reduce((sum, i) => sum + (counts[i] ?? 0), 0);
    expect(otherTotal).toBeGreaterThan(prevTotal);
  });

  it("compactness bonus activates at high danger", () => {
    const lowAnalysis = makeMockAnalysis({ danger: "low" });
    const highAnalysis = makeMockAnalysis({ danger: "high" });
    const countsLow: Record<number, number> = {};
    const countsHigh: Record<number, number> = {};
    for (let i = 0; i < 3000; i++) {
      countsLow[fillSlot("medium", lowAnalysis, [])] = (countsLow[fillSlot("medium", lowAnalysis, [])] ?? 0) + 1;
      countsHigh[fillSlot("medium", highAnalysis, [])] = (countsHigh[fillSlot("medium", highAnalysis, [])] ?? 0) + 1;
    }
    // 2x2 (index 5, compactness 1.0) vs T-shape (index 13, compactness ~0.67)
    const ratioLow = (countsLow[5] ?? 1) / (countsLow[13] ?? 1);
    const ratioHigh = (countsHigh[5] ?? 1) / (countsHigh[13] ?? 1);
    expect(ratioHigh).toBeGreaterThan(ratioLow);
  });

  it("empty tier pool falls back to next-easier tier", () => {
    // This is a defensive test. With 23 shapes no pool should be empty,
    // but we can test the fallback logic directly via getPoolForSlot if exported,
    // or indirectly by verifying fillSlot never throws.
    const analysis = makeMockAnalysis({ danger: "low" });
    expect(() => fillSlot("large", analysis, [])).not.toThrow();
    expect(() => fillSlot("medium", analysis, [])).not.toThrow();
    expect(() => fillSlot("small", analysis, [])).not.toThrow();
    expect(() => fillSlot("line", analysis, [])).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest archetypeGeneration --verbose -t "Within-Tier"`
Expected: FAIL — `fillSlot` does not exist.

- [ ] **Step 3: Implement fillSlot in weightedGeneration.ts**

Add to `utils/weightedGeneration.ts`:

```typescript
import { getAllShapeDifficulties, type ShapeDifficulty } from "./shapeDifficulty";
import { WITHIN_TIER, type SlotTier } from "./generationConstants";

function getPoolForSlot(slotTier: SlotTier): ShapeDifficulty[] {
  const all = getAllShapeDifficulties();
  if (slotTier === "line") {
    return all.filter((m) => m.isLine);
  }
  const pool = all.filter((m) => m.tier === slotTier);
  if (pool.length === 0) {
    if (slotTier === "large") return all.filter((m) => m.tier === "medium");
    if (slotTier === "medium") return all.filter((m) => m.tier === "small");
  }
  return pool;
}

export function fillSlot(
  slotTier: SlotTier,
  analysis: BoardAnalysis,
  previousShapeIndices: number[],
): number {
  const pool = getPoolForSlot(slotTier);
  if (pool.length === 0) return 0;

  const weights = pool.map((meta) => {
    let weight = 1.0;

    if (analysis.danger === "high" || analysis.danger === "critical") {
      weight += WITHIN_TIER.COMPACTNESS_BONUS * meta.compactness;
    }

    if (meta.isLine) {
      const nearComplete = analysis.nearCompleteRows + analysis.nearCompleteCols;
      weight += WITHIN_TIER.LINE_CLEAR_BONUS * Math.min(nearComplete, WITHIN_TIER.LINE_CLEAR_CAP);
    }

    if (previousShapeIndices.includes(meta.shapeIndex)) {
      weight *= WITHIN_TIER.ANTI_REPETITION_FACTOR;
    }

    return Math.max(weight, WITHIN_TIER.MIN_WEIGHT);
  });

  const total = weights.reduce((sum, w) => sum + w, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return pool[i].shapeIndex;
  }
  return pool[pool.length - 1].shapeIndex;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest archetypeGeneration --verbose -t "Within-Tier"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add utils/weightedGeneration.ts utils/__tests__/archetypeGeneration.test.ts
git commit -m "feat: implement within-tier slot filling with board-aware weights"
```

---

### Task 6: Implement Main Generation Entry Point

**Files:**
- Modify: `utils/weightedGeneration.ts`
- Modify: `utils/__tests__/archetypeGeneration.test.ts`

- [ ] **Step 1: Write failing tests for generateWeightedPieceBatch**

Add to test file:

```typescript
import { generateWeightedPieceBatch } from "../weightedGeneration";
import { createEmptyGrid } from "../gameLogic";
import { isBatchSolvable } from "../batchSolver";
import { BOARD_SIZE, SHAPES } from "../../constants/constants";
import { getAllShapeDifficulties } from "../shapeDifficulty";
import { ARCHETYPES } from "../generationConstants";

describe("generateWeightedPieceBatch: Integration", () => {
  beforeEach(() => {
    resetDifficultyCache();
    resetGenerationContext();
  });

  it("returns 3 blocks with id, shape, color on empty board", () => {
    const grid = createEmptyGrid();
    const batch = generateWeightedPieceBatch(grid);
    expect(batch).toHaveLength(3);
    for (const block of batch) {
      expect(block.id).toBeDefined();
      expect(block.shape).toBeDefined();
      expect(block.color).toBeDefined();
    }
  });

  it("all generated batches pass solver validation (empty board)", () => {
    const grid = createEmptyGrid();
    for (let i = 0; i < 20; i++) {
      const batch = generateWeightedPieceBatch(grid);
      const shapes = batch.map((b) => b.shape);
      expect(isBatchSolvable(grid, shapes)).toBe(true);
    }
  });

  it("all generated batches pass solver validation (tight board)", () => {
    const grid = createEmptyGrid();
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if ((r + c) % 2 === 0) grid[r][c] = 1;
      }
    }
    for (let c = 0; c < BOARD_SIZE; c++) grid[0][c] = 0;

    for (let i = 0; i < 10; i++) {
      const batch = generateWeightedPieceBatch(grid);
      const shapes = batch.map((b) => b.shape);
      expect(isBatchSolvable(grid, shapes)).toBe(true);
    }
  });

  it("fallback works on near-full board", () => {
    const grid = createEmptyGrid();
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (!(r === 0 && c <= 2)) grid[r][c] = 1;
      }
    }
    const batch = generateWeightedPieceBatch(grid);
    expect(batch).toHaveLength(3);
  });

  it("batch composition matches archetype tier slots", () => {
    // Generate many batches on empty board and verify at least some
    // match expected tier compositions from known archetypes
    const grid = createEmptyGrid();
    const allMeta = getAllShapeDifficulties();
    let matchedWorkhorse = false; // 2 medium + 1 small

    for (let i = 0; i < 50; i++) {
      const batch = generateWeightedPieceBatch(grid);
      const tiers = batch.map((b) => {
        const idx = SHAPES.indexOf(b.shape);
        return allMeta[idx].tier;
      });
      const tierCounts = { small: 0, medium: 0, large: 0 };
      for (const t of tiers) tierCounts[t]++;

      if (tierCounts.medium === 2 && tierCounts.small === 1) {
        matchedWorkhorse = true;
      }
    }
    // Workhorse is 35% at low danger — should appear in 50 tries
    expect(matchedWorkhorse).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest archetypeGeneration --verbose -t "Integration"`
Expected: FAIL — `generateWeightedPieceBatch` uses old implementation.

- [ ] **Step 3: Implement full generateWeightedPieceBatch**

Complete `utils/weightedGeneration.ts` with the main entry point. Key fix from review: shuffle indices first, then map to shapes (avoids fragile `SHAPES.indexOf`):

```typescript
import { SHAPES, BLOCK_COLORS } from "../constants/constants";
import type { Block, Grid, Shape } from "../constants/types";
import { isBatchSolvable } from "./batchSolver";
import { analyzeBoardState, type BoardAnalysis } from "./boardAnalysis";
import { computeBatchDifficulty } from "./shapeDifficulty";
import { getGenerationContext, recordBatch } from "./generationContext";
import { emergencyFallback } from "./pieceGeneration";
import { ARCHETYPES, MAX_WEIGHTED_ATTEMPTS, MAX_RESCUE_ATTEMPTS } from "./generationConstants";

function makeBlocks(shapes: Shape[]): Block[] {
  return shapes.map((shape, i) => ({
    id: `block-${Date.now()}-${i}`,
    shape,
    color: BLOCK_COLORS[Math.floor(Math.random() * BLOCK_COLORS.length)],
  }));
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function generateWeightedPieceBatch(grid: Grid, count = 3): Block[] {
  const analysis = analyzeBoardState(grid);
  const context = getGenerationContext();

  // Phase 1: Archetype generation
  for (let attempt = 0; attempt < MAX_WEIGHTED_ATTEMPTS; attempt++) {
    const archetypeName = selectArchetype(analysis, context);
    const archetype = ARCHETYPES[archetypeName];
    const slots = count < 3 ? archetype.slots.slice(0, count) : archetype.slots;

    const indices = slots.map((slotTier) =>
      fillSlot(slotTier, analysis, context.previousBatchShapeIndices),
    );
    const shuffledIndices = shuffle(indices);
    const shapes = shuffledIndices.map((i) => SHAPES[i]);

    if (isBatchSolvable(grid, shapes)) {
      recordBatch({
        difficulty: computeBatchDifficulty(shuffledIndices),
        usedFallback: false,
        danger: analysis.danger,
        shapeIndices: shuffledIndices,
      });
      return makeBlocks(shapes);
    }
  }

  // Phase 2: Rescue mode (force critical danger)
  const rescueAnalysis: BoardAnalysis = { ...analysis, danger: "critical" };
  const rescueContext = getGenerationContext();
  for (let attempt = 0; attempt < MAX_RESCUE_ATTEMPTS; attempt++) {
    const archetypeName = selectArchetype(rescueAnalysis, rescueContext);
    const archetype = ARCHETYPES[archetypeName];
    const slots = count < 3 ? archetype.slots.slice(0, count) : archetype.slots;

    const indices = slots.map((slotTier) =>
      fillSlot(slotTier, rescueAnalysis, rescueContext.previousBatchShapeIndices),
    );
    const shuffledIndices = shuffle(indices);
    const shapes = shuffledIndices.map((i) => SHAPES[i]);

    if (isBatchSolvable(grid, shapes)) {
      recordBatch({
        difficulty: computeBatchDifficulty(shuffledIndices),
        usedFallback: false,
        danger: analysis.danger,
        shapeIndices: shuffledIndices,
      });
      return makeBlocks(shapes);
    }
  }

  // Phase 3: Emergency fallback
  const blocks = emergencyFallback(grid, count);
  recordBatch({
    difficulty: 0.1,
    usedFallback: true,
    danger: analysis.danger,
    shapeIndices: [],
  });
  return blocks;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest archetypeGeneration --verbose -t "Integration"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add utils/weightedGeneration.ts utils/__tests__/archetypeGeneration.test.ts
git commit -m "feat: implement archetype-based batch generation entry point"
```

---

### Task 7: Clean Up Dead Code and Fix Old Tests

**Files:**
- Modify: `utils/pieceGeneration.ts`
- Modify: `utils/__tests__/weightedGeneration.test.ts`
- Modify: `utils/__tests__/batchSolver.test.ts`

- [ ] **Step 1: Clean up pieceGeneration.ts**

Remove `generateNextPieceBatch`, `SHAPE_WEIGHTS`, `randomShape`, `randomEasyShape`, `randomIndex`, `randomColor`, `makeBlock`, `makeBlocks`, `MAX_RANDOM_ATTEMPTS`, `MAX_EASY_ATTEMPTS`, `EASY_SHAPE_INDICES`.

Keep only `emergencyFallback` and its dependencies:

```typescript
/**
 * Emergency Fallback Generation
 *
 * Last-resort piece generation when archetype-based generation
 * and rescue mode both fail.
 */

import { BLOCK_COLORS, SHAPES } from "../constants/constants";
import type { Block, Grid, Shape } from "../constants/types";
import { getAllValidPlacements } from "./batchSolver";

function makeBlocks(shapes: Shape[]): Block[] {
  return shapes.map((shape, i) => ({
    id: `block-${Date.now()}-${i}`,
    shape,
    color: BLOCK_COLORS[Math.floor(Math.random() * BLOCK_COLORS.length)],
  }));
}

export function emergencyFallback(grid: Grid, count: number): Block[] {
  const selected: Shape[] = [];

  const easyIndices = [0, 1, 2, 3, 4, 9, 10];
  const easyShapes = easyIndices.map((i) => SHAPES[i]);
  const shuffledEasy = [...easyShapes].sort(() => Math.random() - 0.5);

  for (const shape of shuffledEasy) {
    if (selected.length >= count) break;
    if (getAllValidPlacements(grid, shape, true).length > 0) {
      selected.push(shape);
    }
  }

  if (selected.length < count) {
    const shuffledAll = [...SHAPES].sort(() => Math.random() - 0.5);
    for (const shape of shuffledAll) {
      if (selected.length >= count) break;
      if (getAllValidPlacements(grid, shape, true).length > 0) {
        selected.push(shape);
      }
    }
  }

  while (selected.length < count) {
    selected.push(SHAPES[0]);
  }

  return makeBlocks(selected);
}
```

- [ ] **Step 2: Replace weightedGeneration.test.ts**

```typescript
/**
 * Legacy weighted generation tests — replaced by archetypeGeneration.test.ts
 */

import { generateWeightedPieceBatch } from "../weightedGeneration";
import { createEmptyGrid } from "../gameLogic";
import { isBatchSolvable } from "../batchSolver";
import { resetGenerationContext } from "../generationContext";
import { resetDifficultyCache } from "../shapeDifficulty";

describe("Weighted Generation: Backward Compatibility", () => {
  beforeEach(() => {
    resetGenerationContext();
    resetDifficultyCache();
  });

  it("generateWeightedPieceBatch still returns valid batches", () => {
    const grid = createEmptyGrid();
    const batch = generateWeightedPieceBatch(grid);
    expect(batch).toHaveLength(3);
    const shapes = batch.map((b) => b.shape);
    expect(isBatchSolvable(grid, shapes)).toBe(true);
  });
});
```

- [ ] **Step 3: Update batchSolver.test.ts**

Replace any imports of `generateNextPieceBatch` from `pieceGeneration` with `generateWeightedPieceBatch` from `weightedGeneration`. Find lines like:
```typescript
import { generateNextPieceBatch } from "../pieceGeneration";
```
Replace with:
```typescript
import { generateWeightedPieceBatch } from "../weightedGeneration";
```

And update any test calls from `generateNextPieceBatch(grid)` to `generateWeightedPieceBatch(grid)`.

- [ ] **Step 4: Run all tests**

Run: `npx jest --verbose`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add utils/pieceGeneration.ts utils/__tests__/weightedGeneration.test.ts utils/__tests__/batchSolver.test.ts
git commit -m "refactor: remove dead code, update old tests for archetype system"
```

---

### Task 8: Full Test Suite Run and Final Validation

- [ ] **Step 1: Run full test suite**

Run: `npx jest --verbose`
Expected: ALL PASS

- [ ] **Step 2: Run the app to verify no runtime errors**

Run: `npx expo start` and verify the game loads, blocks generate, and can be placed.

- [ ] **Step 3: Final commit if any adjustments were needed**

```bash
git add -A
git commit -m "feat: batch archetype piece generation system

Replace independent weighted sampling with archetype-based batch
composition. Archetypes define tier templates (e.g., workhorse =
2 medium + 1 small), selected by board danger level with smoothing
overrides. Within-tier weights use compactness, line-clear opportunity,
and anti-repetition modifiers. DFS solver validation unchanged."
```
