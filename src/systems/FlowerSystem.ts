import { hslToHex, mixColors } from '../utils/colors'
import type { Cell, GameSystem } from '../types'

// Re-exporting these here for testing purposes or removing from types.ts later
export interface Flower {
  color: string
  ancestors: Record<string, number>
  age: number
}

export type FlowerSpawn = Flower & { x: number; y: number }

const MAX_POLLINATION_CHANCE = 0.1
const MAX_FLOWER_AGE = 100

// Internal State
let isTrackingHistory = false
let rainbowHue = 0

const getAdjacentCells = (grid: Cell[][], x: number, y: number) => {
  const neighbors: Cell[] = []
  for (const { dx, dy } of [
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
  ]) {
    const cell = grid[y + dy]?.[x + dx]
    if (cell) neighbors.push(cell)
  }
  return neighbors
}

const processCellPollination = (
  grid: Cell[][],
  x: number,
  y: number,
  cell: Cell,
  deadFlowers: { x: number; y: number }[],
  newFlowers: FlowerSpawn[],
) => {
  const flower = cell.data.flower as Flower
  flower.age++

  if (flower.age > MAX_FLOWER_AGE) {
    deadFlowers.push({ x, y })
    return
  }

  let chance = MAX_POLLINATION_CHANCE
  if (flower.age > MAX_FLOWER_AGE * 0.25) chance *= 0.05
  else if (flower.age > MAX_FLOWER_AGE * 0.1) chance *= 0.1

  if (Math.random() >= chance) return

  const neighbors = getAdjacentCells(grid, x, y)
  const adjacentFlowers = neighbors.filter((n) => n.data.flower)
  const emptyCells = neighbors.filter((n) => !n.data.flower)

  if (adjacentFlowers.length === 0 || emptyCells.length === 0) return

  const partner = adjacentFlowers[Math.floor(Math.random() * adjacentFlowers.length)]!
  const spawnCell = emptyCells[Math.floor(Math.random() * emptyCells.length)]!

  const combinedAncestors: Record<string, number> = {}

  if (isTrackingHistory) {
    const addAncestors = (src: Record<string, number>) => {
      for (const [coord, dist] of Object.entries(src)) {
        if (!combinedAncestors[coord] || dist + 1 < combinedAncestors[coord]) {
          combinedAncestors[coord] = dist + 1
        }
      }
    }

    addAncestors(flower.ancestors)
    addAncestors((partner.data.flower as Flower).ancestors)
    combinedAncestors[`${cell.x},${cell.y}`] = 1
    combinedAncestors[`${partner.x},${partner.y}`] = 1
  }

  newFlowers.push({
    x: spawnCell.x,
    y: spawnCell.y,
    color: mixColors(flower.color, (partner.data.flower as Flower).color),
    ancestors: combinedAncestors,
    age: 0,
  })
}

const getAncestorColor = (distance: number) => {
  const ratio = Math.min((distance - 1) / 4, 1)
  const r = 255 - 170 * ratio
  const g = 204 - 119 * ratio
  const b = 85 * ratio
  return { r, g, b, a: Math.max(0.3, 1 - ratio * 0.5) }
}

export const FlowerSystem: GameSystem = {
  name: 'Flower Breeding',

  hasEntity(cell: Cell): boolean {
    return !!cell.data.flower
  },

  placeEntity(cell: Cell, brushColor: string | null, activeCells: Set<Cell>): void {
    let color: string
    if (brushColor) {
      color = brushColor
    } else {
      color = hslToHex(rainbowHue, 100, 50)
      rainbowHue = (rainbowHue + 15) % 360
    }
    cell.data.flower = { color, ancestors: {}, age: 0 } as Flower
    activeCells.add(cell)
  },

  clearEntity(cell: Cell, activeCells: Set<Cell>): void {
    cell.data.flower = null
    activeCells.delete(cell)
  },

  tick(grid: Cell[][], activeCells: Set<Cell>): void {
    const newFlowers: FlowerSpawn[] = []
    const deadFlowers: { x: number; y: number }[] = []

    for (const cell of activeCells) {
      if (cell.data.flower) {
        processCellPollination(grid, cell.x, cell.y, cell, deadFlowers, newFlowers)
      }
    }

    for (const { x, y } of deadFlowers) {
      const cell = grid[y]?.[x]
      if (cell) {
        this.clearEntity(cell, activeCells)
      }
    }

    if (isTrackingHistory) {
      for (const cell of activeCells) {
        const flower = cell.data.flower as Flower
        if (!flower) continue

        const entries = Object.entries(flower.ancestors)
        if (entries.length === 0) continue

        const cleaned: Record<string, number> = {}
        let changed = false
        for (const [coord, dist] of entries) {
          if (dist > 10) {
            changed = true
            continue
          }
          const parts = coord.split(',')
          const ax = parseInt(parts[0] || '', 10)
          const ay = parseInt(parts[1] || '', 10)

          const ancestorCell = grid[ay]?.[ax]
          if (ancestorCell?.data.flower) {
            cleaned[coord] = dist
          } else {
            changed = true
          }
        }
        if (changed) flower.ancestors = cleaned
      }
    }

    for (const f of newFlowers) {
      const cell = grid[f.y]?.[f.x]
      if (cell) {
        cell.data.flower = { color: f.color, ancestors: f.ancestors, age: f.age } as Flower
        activeCells.add(cell)
      }
    }
  },

  drawCell(
    ctx: CanvasRenderingContext2D,
    cell: Cell,
    px: number,
    py: number,
    cellSize: number,
  ): void {
    const flower = cell.data.flower as Flower
    if (!flower) return

    const centerX = px + cellSize / 2
    const centerY = py + cellSize / 2
    const flowerRadius = 7

    ctx.shadowBlur = 10
    ctx.shadowColor = `${flower.color}88`

    ctx.beginPath()
    ctx.arc(centerX, centerY, flowerRadius, 0, Math.PI * 2)
    ctx.fillStyle = flower.color
    ctx.fill()

    ctx.shadowBlur = 0
  },

  drawCustomBackground(
    ctx: CanvasRenderingContext2D,
    cell: Cell,
    px: number,
    py: number,
    cellSize: number,
    context: {
      isSelected: boolean
      isHovered: boolean
      selectedCell: { x: number; y: number } | null
      grid: Cell[][]
    },
  ): boolean {
    if (!context.selectedCell) return false

    const selectedFlower = context.grid[context.selectedCell.y]?.[context.selectedCell.x]?.data
      .flower as Flower | undefined
    if (!selectedFlower) return false

    const ancestorDist = selectedFlower.ancestors[`${cell.x},${cell.y}`]
    if (ancestorDist !== undefined) {
      const { r, g, b, a } = getAncestorColor(ancestorDist)

      // Draw background specifically for this ancestor
      ctx.beginPath()
      const radius = 6
      ctx.roundRect(px, py, cellSize, cellSize, radius)

      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.2)`
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${a})`
      ctx.lineWidth = 1
      ctx.fill()
      ctx.stroke()

      return true
    }

    return false
  },

  debugItems() {
    return [
      {
        label: 'Ancestry:',
        value: isTrackingHistory ? 'ON' : 'OFF',
        class: isTrackingHistory ? 'status-on' : 'status-off',
        onClick: () => {
          isTrackingHistory = !isTrackingHistory
        },
      },
    ]
  },
}

// Export for test usage
export const setTrackingHistory = (val: boolean) => {
  isTrackingHistory = val
}
export const getTrackingHistory = () => isTrackingHistory
