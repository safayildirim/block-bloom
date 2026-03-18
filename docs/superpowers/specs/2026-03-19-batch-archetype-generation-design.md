# Batch Archetype Piece Generation

## Problem

The current weighted generation system produces batches that feel random and lack interesting decisions. Root causes:

1. **Flat weight spread.** At low danger the multipliers are ×0.9/×1.1/×1.0 — effectively uniform.
2. **Lopsided tiers.** 18 of 23 shapes fall into "hard" under the current 3-tier model, making the tier system meaningless.
3. **Independent sampling.** Each of the 3 shapes is picked independently, so batches have no designed relationship between pieces. Interesting tension (placement order trade-offs, size contrast) only happens by accident.

## Solution

Replace independent weighted sampling with a **batch archetype** system:

1. Retune shape difficulty into 3 practical tiers
2. Define batch archetypes — templates that specify the tier for each slot
3. Select an archetype based on board state and generation history
4. Fill each slot from the matching tier pool using board-aware within-tier weights
5. Validate with the existing DFS batch solver (unchanged)

## Shape Difficulty Model

### 3-Tier System

| Tier | Description | Cell count | Examples |
|------|-------------|------------|----------|
| **small** | Easy to fit, low tension | 1–3 | 1×1, 2×1, 3×1, small Ls |
| **medium** | Core gameplay — requires thought | 4–5 | 2×2, T-shapes, Z-shapes, 4×1 |
| **large** | Constraining, creates pressure | 6–9 | 3×2, 2×3, large Ls, 3×3, 5×1 |

### Tier Assignment

Primary: cell count thresholds (small ≤ 3, medium ≤ 5, large > 5).

Secondary: awkwardness bump. Shapes with exactly 5 cells and compactness < 0.6 (ratio of filled cells to bounding box area) are bumped from medium to large. This currently affects only the large L-shapes (indices 11, 12: 5 cells in a 3×3 bounding box, compactness = 0.56).

The continuous difficulty score (0.0–1.0) remains for batch scoring and smoothing but is no longer used for tier assignment.

### Tier Population (23 shapes)

| Tier | Count | Indices | Shapes |
|------|-------|---------|--------|
| **small** | 7 | 0, 1, 2, 3, 4, 9, 10 | 1×1, 2×1h, 2×1v, 3×1h, 3×1v, small L, small L flipped |
| **medium** | 11 | 5, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22 | 2×2, T×4, Z×2, 4×1h, 4×1v, 5×1h, 5×1v |
| **large** | 5 | 6, 7, 8, 11, 12 | 3×2, 2×3, 3×3, large L, large L flipped |

Note: Indices 11 and 12 (large L-shapes, 5 cells) are bumped from medium to large by the awkwardness rule.

## Batch Archetypes

Each archetype defines the tier for 3 slots:

| Archetype | Slot 1 | Slot 2 | Slot 3 | Purpose |
|-----------|--------|--------|--------|---------|
| **workhorse** | medium | medium | small | Bread and butter. Interesting but manageable. |
| **challenge** | medium | medium | large | Pressure batch. Must think about placement order. |
| **builder** | medium | small | small | Recovery batch after hard streaks. |
| **blockbuster** | large | medium | small | One big piece dominates planning. |
| **line-hunter** | line* | line* | medium | Reward batch when near-complete rows/cols exist. |
| **filler** | small | small | small | Emergency rescue. Rare. |

*line = any shape where `isLine` is true (width=1 or height=1), regardless of tier.

### Archetype Selection Weights

Weights are percentages per danger level (sum to 100 per row):

| Board state | workhorse | challenge | builder | blockbuster | line-hunter | filler |
|-------------|-----------|-----------|---------|-------------|-------------|--------|
| **low** | 35 | 25 | 10 | 20 | 10* | 0 |
| **medium** | 40 | 15 | 20 | 10 | 15* | 0 |
| **high** | 30 | 5 | 35 | 5 | 20* | 5 |
| **critical** | 15 | 0 | 40 | 0 | 10* | 35 |

*line-hunter activates only when `nearCompleteRows + nearCompleteCols >= 2`. Otherwise its weight redistributes proportionally to the other active archetypes.

### Smoothing Override

When `consecutiveHardBatches >= 2`:
- challenge weight → 0
- blockbuster weight → 0
- Freed weight redistributes: 60% to builder, 40% to workhorse

**Worked example at low danger:** challenge (25) + blockbuster (20) = 45 freed. Builder gets 10 + 27 = 37. Workhorse gets 35 + 18 = 53. Line-hunter stays at 10. Filler stays at 0. Total: 53 + 0 + 37 + 0 + 10 + 0 = 100.

## Within-Tier Slot Filling

Once an archetype is selected, each slot is filled by weighted sampling from the matching tier pool. This is a **new function** replacing the current `calculateShapeWeight` — the old per-tier danger multipliers are no longer needed since the archetype already determines which tier each slot draws from.

### Within-Tier Weight Modifiers

All modifiers apply to a base weight of 1.0 per shape:

1. **Compactness bonus (high/critical danger only):** `weight += 0.3 × compactness`. Compact shapes fit into tighter spaces. (Changed from the current 0.4 — the old value over-favored squares.)

2. **Line-clear opportunity:** If near-complete rows/cols exist, line shapes matching the needed orientation get `+0.4` per matching near-complete line (capped at contribution from 3 lines). Applies in all archetypes, not just line-hunter. (Changed from current 0.5 — reduced to avoid line shapes dominating.)

3. **Anti-repetition:** If the previous batch contained a shape (by index), that shape's weight is multiplied by ×0.5. Prevents seeing the same shape in consecutive batches.

4. **Minimum floor:** Every shape in the tier keeps a minimum weight of 0.1.

### Empty Tier Pool Fallback

If a tier pool is empty after filtering (shouldn't happen with 23 shapes, but defensively): fall back to the next-easier tier (large → medium → small). If all pools are empty, skip to emergency fallback.

### Slot Order

Slot order is shuffled before returning to the tray. The archetype defines composition, not presentation order.

## Generation Flow

```
Board state change (all pieces placed)
  │
  ├─ analyzeBoardState(grid) → BoardAnalysis (unchanged)
  ├─ getGenerationContext() → GenerationContext
  │
  ▼
Phase 1: Archetype generation (up to MAX_WEIGHTED_ATTEMPTS = 50)
  │
  ├─ Select archetype (weighted by danger + smoothing overrides)
  ├─ Fill each slot from matching tier pool (within-tier weights)
  ├─ Shuffle slot order
  ├─ Validate with isBatchSolvable()
  │   ├─ Valid → record batch, return
  │   └─ Invalid → retry with new archetype + new shapes
  │
  ▼
Phase 2: Rescue mode (up to MAX_RESCUE_ATTEMPTS = 30)
  │
  ├─ Force danger to "critical"
  ├─ Same archetype selection + slot filling
  ├─ Validate with isBatchSolvable()
  │   ├─ Valid → record batch, return
  │   └─ Invalid → retry
  │
  ▼
Phase 3: Emergency fallback (unchanged)
  │
  └─ emergencyFallback(grid, count) — guaranteed return
```

## Generation Context Changes

`BatchRecord` gains one field:

```typescript
interface BatchRecord {
  difficulty: number;        // 0.0–1.0 average
  usedFallback: boolean;
  danger: DangerLevel;
  shapeIndices: number[];    // NEW — for anti-repetition
}
```

`getGenerationContext()` return type gains an accessor:

```typescript
interface GenerationContext {
  history: BatchRecord[];
  recentAvgDifficulty: number;
  consecutiveHardBatches: number;
  recentFallbackCount: number;
  previousBatchShapeIndices: number[];  // NEW — last batch's indices, or [] if no history
}
```

The `previousBatchShapeIndices` field is derived from `history[history.length - 1].shapeIndices` when building the context snapshot.

## Files Changed

| File | Change |
|------|--------|
| `utils/generationConstants.ts` | New 3-tier thresholds (small/medium/large), archetype definitions with per-danger weights, within-tier modifier constants, smoothing constants. Remove old 3-tier EASY/NORMAL/HARD config and danger multiplier table. |
| `utils/shapeDifficulty.ts` | 3-tier model (small/medium/large) replacing easy/normal/hard. Cell-count-based tier assignment with awkwardness bump. `DifficultyTier` type updated. Cache reset for new shapes. |
| `utils/weightedGeneration.ts` | Replace `calculateShapeWeight` and independent sampling with: `selectArchetype` → `fillSlot` (new within-tier weight function) → solver validation. Entry point `generateWeightedPieceBatch` keeps same signature. |
| `utils/generationContext.ts` | Add `shapeIndices` to `BatchRecord`. Add `previousBatchShapeIndices` to `GenerationContext`. Update `recordBatch` and `getGenerationContext` accordingly. |
| `utils/pieceGeneration.ts` | Remove `generateNextPieceBatch` (dead code). Retain `emergencyFallback` export. Remove `SHAPE_WEIGHTS` and old `randomShape` since they're superseded. |

| File | Unchanged |
|------|-----------|
| `utils/batchSolver.ts` | Hard safety gate — no changes |
| `utils/boardAnalysis.ts` | Already provides all needed metrics |
| Store / UI | No changes — store already calls `generateWeightedPieceBatch` |

## Test Plan

| Test | Verifies |
|------|----------|
| Tier assignment is correct for all 23 shapes | Each shape lands in expected tier per cell count + awkwardness rule |
| Archetype selection respects danger level | low danger → mostly workhorse/challenge; critical → builder/filler |
| Batch composition matches archetype | workhorse batch has 2 medium + 1 small |
| Smoothing suppresses hard archetypes | 2+ consecutive hard batches → no challenge/blockbuster |
| Line-hunter only activates with near-complete lines | No near-complete → weight redistributes proportionally |
| Anti-repetition reduces repeat shapes | Same shape index less likely in consecutive batches |
| All generated batches pass solver validation | Hard invariant — every test batch is solver-verified |
| Fallback still works on near-full boards | Emergency path unchanged |
| Within-tier compactness bonus activates at high danger | Compact shapes weighted higher when board is tight |
| Empty tier pool falls back to easier tier | Defensive — if large pool were empty, draws from medium |

## Tunable Constants

| Constant | Default | Purpose |
|----------|---------|---------|
| Tier cell-count thresholds | 3 / 5 | Where small/medium and medium/large divide |
| Awkwardness bump compactness threshold | 0.6 | Below this, 5-cell shapes bump to large |
| Archetype weights (per danger) | See table above | Controls batch variety per board state |
| Smoothing streak threshold | 2 | How many hard batches before suppressing challenge |
| Smoothing redistribution | 60% builder / 40% workhorse | Where suppressed weight goes |
| Compactness bonus | 0.3 | How much compact shapes are favored at high danger |
| Line-clear bonus | 0.4 per line | How much line shapes benefit from near-complete lines |
| Anti-repetition factor | ×0.5 | How much repeated shapes are penalized |
| Within-tier minimum weight | 0.1 | Floor to prevent any shape from being impossible |
| MAX_WEIGHTED_ATTEMPTS | 50 | Retry budget for phase 1 |
| MAX_RESCUE_ATTEMPTS | 30 | Retry budget for phase 2 |

## Limitations

- Archetypes are static templates. They don't adapt to specific board topologies (e.g., "there's a 3×1 gap on row 5"). This is intentional — board-topology-aware generation would be fragile and feel rigged.
- The line-hunter archetype uses the `isLine` flag which includes all orientations. It doesn't distinguish "this board needs horizontal lines specifically." Adding orientation-aware line bonuses is a possible future improvement.
- Anti-repetition only looks at the previous batch. Longer memory could smooth things further but adds complexity.
- Archetypes always produce 3 pieces. The `count` parameter on `generateWeightedPieceBatch` is kept for API compatibility but archetypes are designed for 3-slot batches. If count < 3, the first N archetype slots are used.

## Possible Next Improvements

- Orientation-aware line-clear bonuses (horizontal vs vertical)
- Batch interestingness scoring: prefer batches where placement order matters (measured by solver path count)
- Adaptive archetype weights that learn from player behavior (e.g., if player consistently handles challenge batches, increase their frequency)
