import { describe, it, expect, beforeEach, vi } from 'vitest'
import { FlowerSystem, setTrackingHistory } from './FlowerSystem'
import type { Cell, Flower } from '../types'

describe('FlowerSystem', () => {
  let grid: Cell[][]
  let activeCells: Set<Cell>

  beforeEach(() => {
    grid = []
    for (let y = 0; y < 10; y++) {
      const row: Cell[] = []
      for (let x = 0; x < 10; x++) {
        row.push({ x, y })
      }
      grid.push(row)
    }
    activeCells = new Set()
    setTrackingHistory(false)
  })

  it('plants a flower with placeEntity', () => {
    const cell = grid[0]![0]!
    FlowerSystem.placeEntity(cell, '#ff0000', activeCells)

    expect(activeCells.size).toBe(1)
    expect(activeCells.has(cell)).toBe(true)
    expect(FlowerSystem.hasEntity(cell)).toBe(true)

    const flower = cell as Flower
    expect(flower.color).toBe('#ff0000')
    expect(flower.age).toBe(0)
  })

  it('flowers age and die after MAX_FLOWER_AGE (100) ticks', () => {
    const cell = grid[0]![0]!
    FlowerSystem.placeEntity(cell, '#ff0000', activeCells)

    // Tick 99 times
    for (let i = 0; i < 99; i++) {
      FlowerSystem.tick(grid, activeCells)
    }

    // Still alive
    expect(activeCells.size).toBe(1)
    expect(FlowerSystem.hasEntity(cell)).toBe(true)

    // Tick to 101, should die (crosses MAX_FLOWER_AGE = 100)
    FlowerSystem.tick(grid, activeCells)
    FlowerSystem.tick(grid, activeCells)

    expect(activeCells.size).toBe(0)
    expect(FlowerSystem.hasEntity(cell)).toBe(false)
  })

  it('pollinates to adjacent cells', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0) // Ensure 100% pollination chance

    const cell1 = grid[0]![0]!
    const cell2 = grid[1]![0]!

    FlowerSystem.placeEntity(cell1, '#ff0000', activeCells)
    FlowerSystem.placeEntity(cell2, '#ffff00', activeCells)

    FlowerSystem.tick(grid, activeCells)

    // A child should have spawned for each parent flower since we mocked 100% chance
    expect(activeCells.size).toBe(4)

    randomSpy.mockRestore()
  })

  it('tracks ancestry and cleans up ancestors that no longer exist', () => {
    setTrackingHistory(true)
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0)

    const parent1 = grid[0]![0]!
    const parent2 = grid[0]![1]!
    FlowerSystem.placeEntity(parent1, '#ff0000', activeCells)
    FlowerSystem.placeEntity(parent2, '#ffff00', activeCells)

    FlowerSystem.tick(grid, activeCells)

    // Find the spawned child
    let childCell: Cell | null = null
    for (const cell of activeCells) {
      if (cell !== parent1 && cell !== parent2) {
        childCell = cell
        break
      }
    }
    expect(childCell).not.toBeNull()

    let childFlower = childCell as Flower
    expect(childFlower.ancestors).toHaveProperty('0,0')

    // Remove parent 1
    FlowerSystem.clearEntity(parent1, activeCells)
    FlowerSystem.tick(grid, activeCells)

    // Ancestor reference should be pruned
    childFlower = childCell as Flower
    expect(childFlower.ancestors).not.toHaveProperty('0,0')
    // Parent 2 should still be tracked
    expect(childFlower.ancestors).toHaveProperty('1,0')

    randomSpy.mockRestore()
  })

  it('prunes ancestors deeper than 10 generations for performance', () => {
    setTrackingHistory(true)

    const cell = grid[0]![0]!
    FlowerSystem.placeEntity(cell, '#ffffff', activeCells)

    // Setup dummy flowers that will serve as the actual ancestors to avoid pruning because they evaporated
    const anc1 = grid[1]![1]!
    const anc3 = grid[3]![3]!
    const anc4 = grid[4]![4]!
    const anc5 = grid[5]![5]!

    FlowerSystem.placeEntity(anc1, '#ffffff', activeCells)
    FlowerSystem.placeEntity(anc3, '#ffffff', activeCells)
    FlowerSystem.placeEntity(anc4, '#ffffff', activeCells)
    FlowerSystem.placeEntity(anc5, '#ffffff', activeCells)

    const flower = cell as Flower
    flower.ancestors = {
      '1,1': 1,
      '3,3': 10,
      '4,4': 11, // Too deep, should be pruned
      '5,5': 15, // Too deep, should be pruned
    }

    FlowerSystem.tick(grid, activeCells)

    const ancestors = (cell as Flower).ancestors
    expect(ancestors).toHaveProperty('1,1')
    expect(ancestors).toHaveProperty('3,3')
    expect(ancestors).not.toHaveProperty('4,4')
    expect(ancestors).not.toHaveProperty('5,5')
  })
})
