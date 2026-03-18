/**
 * Emergency Fallback Generation
 *
 * Last-resort piece generation when archetype-based generation
 * and rescue mode both fail.
 */

import { BLOCK_COLORS, SHAPES } from "../constants/constants";
import type { Block, Grid, Shape } from "../constants/types";
import { getAllValidPlacements } from "./batchSolver";

const EASY_SHAPE_INDICES = [0, 1, 2, 3, 4, 7, 8];

function makeBlocks(shapes: Shape[]): Block[] {
  return shapes.map((shape, i) => ({
    id: `block-${Date.now()}-${i}`,
    shape,
    color: BLOCK_COLORS[Math.floor(Math.random() * BLOCK_COLORS.length)],
  }));
}

export function emergencyFallback(grid: Grid, count: number): Block[] {
  const selected: Shape[] = [];

  const easyShapes = EASY_SHAPE_INDICES.map((i) => SHAPES[i]);
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
