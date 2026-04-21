/**
 * @file benchmark.bench.ts
 * @description
 * This suite measures the "Pure Compute" time of the simulation logic (the `tick` function)
 * across different grid dimensions. It isolates logic from rendering to find CPU bottlenecks.
 *
 * RESULTS INTERPRETATION:
 * - hz: Ticks per second. Maximize this.
 * - mean: Average time (ms) per tick. Must be < 100ms for real-time simulation targets.
 *
 * METHODOLOGY:
 * - Uses Mulberry32 PRNG to ensure deterministic seeding across all runs.
 * - Mocks Math.random() so results are strictly comparable hardware-to-hardware.
 */

import { bench, describe, vi } from 'vitest'
import { FlowerSystem } from './FlowerSystem'
import type { GameSystem, Cell } from '../types'

// Mulberry32 PRNG
function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SYSTEMS: GameSystem[] = [FlowerSystem]
const DIMENSIONS = [50, 100, 250, 500, 1000]

describe('Simulation Compute Performance', () => {
  for (const system of SYSTEMS) {
    describe(`System: ${system.name}`, () => {
      for (const size of DIMENSIONS) {
        let grid: Cell[][]
        let activeCells: Set<Cell>

        const setupBenchmark = () => {
          // Deterministic Math.random so benches run fairly
          const random = mulberry32(12345)
          vi.spyOn(Math, 'random').mockImplementation(random)

          grid = []
          activeCells = new Set<Cell>()

          // Initialize grid
          for (let y = 0; y < size; y++) {
            const row: Cell[] = []
            for (let x = 0; x < size; x++) {
              row.push({ x, y })
            }
            grid.push(row)
          }

          // Initial seeding: 5% of tiles active
          for (let y = 0; y < size; y++) {
            for (let x = 0; x < size; x++) {
              if (Math.random() < 0.05) {
                const cell = grid[y]![x]!
                system.placeEntity(cell, null, activeCells)
              }
            }
          }
        }

        bench(
          `${size}x${size} Grid`,
          () => {
            system.tick(grid, activeCells)
          },
          {
            setup: setupBenchmark,
          },
        )
      }
    })
  }
})
