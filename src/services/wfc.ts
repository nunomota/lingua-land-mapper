import { EventEmitter } from "events";
import * as registry from "../utils/registry.js";

type Cell = {
  collapsed: boolean;
  spriteId: string | null;
  possibilities: Set<string>;
};

type Grid = Cell[][];

function initGrid(
  width: number,
  height: number,
  allSpriteIds: string[]
): Grid {
  return Array.from({ length: height }, () =>
    Array.from({ length: width }, () => ({
      collapsed: false,
      spriteId: null,
      possibilities: new Set(allSpriteIds),
    }))
  );
}

function entropy(
  possibilities: Set<string>,
  matrix: Map<string, Map<string, number>>
): number {
  let sum = 0;
  let h = 0;
  for (const id of possibilities) {
    const row = matrix.get(id);
    const p = row ? Array.from(row.values()).reduce((a, b) => a + b, 0) : 1;
    sum += p;
  }
  if (sum === 0) return 0;
  for (const id of possibilities) {
    const row = matrix.get(id);
    const p = (row ? Array.from(row.values()).reduce((a, b) => a + b, 0) : 1) / sum;
    if (p > 0) h -= p * Math.log2(p);
  }
  return h;
}

function weightedSample(
  possibilities: Set<string>,
  weights: Map<string, number>
): string {
  const ids = Array.from(possibilities);
  const ws = ids.map((id) => weights.get(id) ?? 1);
  const total = ws.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < ids.length; i++) {
    r -= ws[i]!;
    if (r <= 0) return ids[i]!;
  }
  return ids[ids.length - 1]!;
}

function getNeighbours(
  x: number,
  y: number,
  width: number,
  height: number
): { x: number; y: number }[] {
  const dirs = [
    { x: x, y: y - 1 },
    { x: x, y: y + 1 },
    { x: x - 1, y: y },
    { x: x + 1, y: y },
  ];
  return dirs.filter((d) => d.x >= 0 && d.x < width && d.y >= 0 && d.y < height);
}

function collapseWeights(
  cell: Cell,
  x: number,
  y: number,
  grid: Grid,
  width: number,
  height: number,
  matrix: Map<string, Map<string, number>>
): Map<string, number> {
  const neighbours = getNeighbours(x, y, width, height);
  const collapsedNeighbours = neighbours.filter((n) => grid[n.y]![n.x]!.collapsed);

  if (collapsedNeighbours.length === 0) {
    const uniform = new Map<string, number>();
    for (const id of cell.possibilities) uniform.set(id, 1);
    return uniform;
  }

  const combined = new Map<string, number>();
  for (const id of cell.possibilities) {
    let weight = 0;
    for (const n of collapsedNeighbours) {
      const nId = grid[n.y]![n.x]!.spriteId!;
      const row = matrix.get(nId);
      weight += row?.get(id) ?? 0;
    }
    combined.set(id, weight);
  }
  return combined;
}

export async function runWFC({
  matrix,
  dimensions,
  emitter,
  mapId,
  maxRetries = 10,
}: {
  matrix: Map<string, Map<string, number>>;
  dimensions: { width: number; height: number };
  emitter: EventEmitter;
  mapId: string;
  maxRetries?: number;
}): Promise<void> {
  const { width, height } = dimensions;
  const allSpriteIds = Array.from(matrix.keys());
  const total = width * height;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    let grid = initGrid(width, height, allSpriteIds);
    let collapsedCount = 0;
    let contradiction = false;

    // Collapse a random seed cell to start
    const seedX = Math.floor(Math.random() * width);
    const seedY = Math.floor(Math.random() * height);
    const seedCell = grid[seedY]![seedX]!;
    const seedWeights = collapseWeights(seedCell, seedX, seedY, grid, width, height, matrix);
    const seedSpriteId = weightedSample(seedCell.possibilities, seedWeights);
    seedCell.collapsed = true;
    seedCell.spriteId = seedSpriteId;
    seedCell.possibilities = new Set([seedSpriteId]);
    collapsedCount++;
    emitter.emit("cell", { x: seedX, y: seedY, spriteId: seedSpriteId });

    const frontierMap = new Map<string, { x: number; y: number }>();
    for (const n of getNeighbours(seedX, seedY, width, height)) {
      frontierMap.set(`${n.x},${n.y}`, n);
    }

    while (collapsedCount < total) {
      // Select frontier cell with lowest entropy
      let minEntropy = Infinity;
      let candidates: { x: number; y: number }[] = [];

      for (const { x, y } of frontierMap.values()) {
        const cell = grid[y]![x]!;
        if (cell.collapsed) continue;
        const e = entropy(cell.possibilities, matrix) + Math.random() * 1e-6;
        if (e < minEntropy) {
          minEntropy = e;
          candidates = [{ x, y }];
        } else if (e === minEntropy) {
          candidates.push({ x, y });
        }
      }

      if (candidates.length === 0) break;

      const { x, y } =
        candidates[Math.floor(Math.random() * candidates.length)]!;
      const cell = grid[y]![x]!;

      // Collapse
      const weights = collapseWeights(cell, x, y, grid, width, height, matrix);
      const spriteId = weightedSample(cell.possibilities, weights);
      cell.collapsed = true;
      cell.spriteId = spriteId;
      cell.possibilities = new Set([spriteId]);
      collapsedCount++;
      emitter.emit("cell", { x, y, spriteId });

      // Update frontier
      frontierMap.delete(`${x},${y}`);
      for (const n of getNeighbours(x, y, width, height)) {
        const key = `${n.x},${n.y}`;
        if (!grid[n.y]![n.x]!.collapsed && !frontierMap.has(key)) {
          frontierMap.set(key, n);
        }
      }

      // Propagate (BFS)
      const queue: { x: number; y: number }[] = getNeighbours(x, y, width, height);
      const inQueue = new Set(queue.map((n) => `${n.x},${n.y}`));

      while (queue.length > 0) {
        const pos = queue.shift()!;
        const current = grid[pos.y]![pos.x]!;
        if (current.collapsed) continue;

        const collapsedNeighbours = getNeighbours(pos.x, pos.y, width, height).filter(
          (n) => grid[n.y]![n.x]!.collapsed
        );

        if (collapsedNeighbours.length === 0) continue;

        const before = current.possibilities.size;
        for (const id of Array.from(current.possibilities)) {
          const hasValidTransition = collapsedNeighbours.some((n) => {
            const nId = grid[n.y]![n.x]!.spriteId!;
            const row = matrix.get(nId);
            return (row?.get(id) ?? 0) > 0;
          });
          if (!hasValidTransition) current.possibilities.delete(id);
        }

        if (current.possibilities.size === 0) {
          contradiction = true;
          break;
        }

        if (current.possibilities.size < before) {
          for (const n of getNeighbours(pos.x, pos.y, width, height)) {
            const key = `${n.x},${n.y}`;
            if (!inQueue.has(key) && !grid[n.y]![n.x]!.collapsed) {
              queue.push(n);
              inQueue.add(key);
            }
          }
        }
      }

      if (contradiction) break;
    }

    if (!contradiction && collapsedCount === total) {
      emitter.emit("done", {});
      registry.remove(mapId);
      return;
    }

    if (attempt < maxRetries - 1) {
      emitter.emit("restart", { attempt: attempt + 1, maxRetries });
    }
  }

  emitter.emit("error", {
    message: `Map generation failed after ${maxRetries} attempts`,
  });
  registry.remove(mapId);
}
