# Batch Archetype Piece Generation

## Problem

The current weighted generation system produces batches that feel random and lack interesting decisions. Root causes:

1. **Flat weight spread.** At low danger the multipliers are ×0.9/×1.1/×1.0 — effectively uniform.
2. **Lopsided tiers.** 21 of 26 shapes fall into "hard", making the tier system meaningless.
3. **Independent sampling.** Each of the 3 shapes is picked independently, so batches have no designed relationship between pieces. Interesting tension (placement order trade-offs, size contrast) only happens by accident.

## Solution

Replace independent weighted sampling with a **batch archetype** system:

1. Retune shape difficulty into 4 practical tiers
2. Define batch archetypes — templates that specify the tier for each slot
3. Select an archetype based on board state and generation history
4. Fill each slot from the matching tier pool using board-aware within-tier weights
5. Validate with the existing DFS batch solver (unchanged)

## Shape Difficulty Model

### 4-Tier System

| Tier | Description | Cell count | Examples |
|------|-------------|------------|----------|
| **tiny** | Trivial filler | 1 | 1×1 |
| **small** | Easy to fit | 2–3 | 2×1, 3×1, small Ls |
| **medium** | Core gameplay — requires thought | 4–5 | 2×2, T-shapes, Z-shapes, 4×1 |
| **large** | Constraining, creates pressure | 6–9 | 3×2, 2×3, large Ls, 3×3, 5×1 |

### Tier Assignment

Primary: cell count thresholds (tiny ≤ 1, small ≤ 3, medium ≤ 5, large > 5).

Secondary: awkwardness bump. Shapes with compactness < 0.6 (e.g., large L-shapes with 6 cells in a 3×3 bounding box = 0.67 compactness) get bumped up one tier if they're at a tier boundary. This is checked only for shapes at the boundary between small/medium and medium/large.

The continuous difficulty score (0.0–1.0) remains for batch scoring and smoothing but is no longer used for tier assignment.

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

*line = any shape where width=1 or height=1, regardless of tier.

### Archetype Selection Weights

Weights are percentages per danger level:

| Board state | workhorse | challenge | builder | blockbuster | line-hunter | filler |
|-------------|-----------|-----------|---------|-------------|-------------|--------|
| **low** | 35 | 25 | 10 | 20 | 10* | 0 |
| **medium** | 40 | 15 | 20 | 10 | 15* | 0 |
| **high** | 30 | 5 | 35 | 5 | 20* | 5 |
| **critical** | 15 | 0 | 40 | 0 | 10* | 35 |

*line-hunter activates only when `nearCompleteRows + nearCompleteCols >= 2`. Otherwise its weight redistributes proportionally to the other archetypes.

### Smoothing Override

When `consecutiveHardBatches >= 2`:
- challenge weight → 0
- blockbuster weight → 0
- Freed weight redistributes: 60% to builder, 40% to workhorse

## Within-Tier Slot Filling

Once an archetype is selected, each slot is filled by weighted sampling from the matching tier pool.

### Within-Tier Weight Modifiers

All modifiers apply multiplicatively to a base weight of 1.0 per shape:

1. **Compactness bonus (high/critical danger only):** `weight += 0.3 × compactness`. Compact shapes fit into tighter spaces.

2. **Line-clear opportunity:** If near-complete rows/cols exist, line shapes matching the needed orientation get `+0.4` per matching near-complete line (capped at contribution from 3 lines). Applies in all archetypes, not just line-hunter.

3. **Anti-repetition:** If the previous batch contained a shape (by index), that shape's weight is multiplied by ×0.5. Prevents seeing the same shape in consecutive batches.

4. **Minimum floor:** Every shape in the tier keeps a minimum weight of 0.1.

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

## Files Changed

| File | Change |
|------|--------|
| `utils/generationConstants.ts` | New 4-tier thresholds, archetype definitions with per-danger weights, within-tier modifier constants, smoothing constants |
| `utils/shapeDifficulty.ts` | 4-tier model (tiny/small/medium/large). Simpler cell-count-based tier assignment. Reset cache for new shapes. |
| `utils/weightedGeneration.ts` | Replace independent sampling with archetype selection → slot filling → solver validation. Existing `calculateShapeWeight` becomes within-tier weighting. |
| `utils/generationContext.ts` | Add `shapeIndices` to `BatchRecord` for anti-repetition. |

| File | Unchanged |
|------|-----------|
| `utils/batchSolver.ts` | Hard safety gate — no changes |
| `utils/boardAnalysis.ts` | Already provides all needed metrics |
| `utils/pieceGeneration.ts` | `emergencyFallback` still used. Old `generateNextPieceBatch` becomes dead code (remove). |
| Store / UI | No changes — store already calls `generateWeightedPieceBatch` |

## Test Plan

| Test | Verifies |
|------|----------|
| Archetype selection respects danger level | low danger → mostly workhorse/challenge; critical → builder/filler |
| Batch composition matches archetype | workhorse batch has 2 medium + 1 small |
| Smoothing suppresses hard archetypes | 2+ consecutive hard batches → no challenge/blockbuster |
| Line-hunter only activates with near-complete lines | No near-complete → weight redistributes to workhorse |
| Anti-repetition reduces repeat shapes | Same shape index less likely in consecutive batches |
| All generated batches pass solver validation | Hard invariant — every test batch is solver-verified |
| Fallback still works on near-full boards | Emergency path unchanged |
| Tier assignment is correct for all 26 shapes | Each shape lands in expected tier |
| Within-tier compactness bonus activates at high danger | Compact shapes weighted higher when board is tight |

## Tunable Constants

| Constant | Default | Purpose |
|----------|---------|---------|
| Tier cell-count thresholds | 1 / 3 / 5 | Where tiers divide |
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

## Possible Next Improvements

- Orientation-aware line-clear bonuses (horizontal vs vertical)
- Batch interestingness scoring: prefer batches where placement order matters (measured by solver path count)
- Adaptive archetype weights that learn from player behavior (e.g., if player consistently handles challenge batches, increase their frequency)
