<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

const GRID_SIZE = 15
const TICK_RATE_MS = 1000
const POLLINATION_CHANCE = 0.1

type Flower = {
  color: string
  ancestors: Record<string, number> // "x,y" -> generation distance
}

type Cell = {
  x: number
  y: number
  flower: Flower | null
}

// Initialize Grid
const grid = ref<Cell[][]>([])
const selectedCell = ref<{ x: number; y: number } | null>(null)

const ancestorHighlights = computed(() => {
  if (!selectedCell.value) return new Map<string, number>()
  const { x, y } = selectedCell.value
  const cell = grid.value[y]?.[x]
  if (!cell?.flower) return new Map<string, number>()
  return new Map(Object.entries(cell.flower.ancestors))
})

const getAncestorStyle = (distance: number) => {
  // distance 1 (parent): Bright Yellow (#ffcc00)
  // distance 5+ (distant): Grey (#555555)
  // We'll interpolate between Yellow and Grey
  const maxDist = 5
  const ratio = Math.min((distance - 1) / (maxDist - 1), 1)

  // Yellow: R:255, G:204, B:0
  // Grey: R:85, G:85, B:85
  const r = 255 - (255 - 85) * ratio
  const g = 204 - (204 - 85) * ratio
  const b = 0 + (85 - 0) * ratio

  const color = `rgb(${r}, ${g}, ${b})`
  const opacity = Math.max(0.3, 1 - ratio * 0.5)

  return {
    borderColor: color,
    backgroundColor: `${color}33`, // Low opacity background
    boxShadow: `0 0 ${10 - ratio * 5}px rgba(${r}, ${g}, ${b}, ${opacity * 0.4})`,
  }
}

const initializeGrid = () => {
  const newGrid: Cell[][] = []
  for (let y = 0; y < GRID_SIZE; y++) {
    const row: Cell[] = []
    for (let x = 0; x < GRID_SIZE; x++) {
      row.push({ x, y, flower: null })
    }
    newGrid.push(row)
  }
  grid.value = newGrid
}

// Color mixing utility
const hexToRgb = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result || !result[1] || !result[2] || !result[3]) return null
  return {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  }
}

const componentToHex = (c: number) => {
  const hex = Math.round(c).toString(16)
  return hex.length == 1 ? '0' + hex : hex
}

const rgbToHex = (r: number, g: number, b: number) => {
  return '#' + componentToHex(r) + componentToHex(g) + componentToHex(b)
}

const mixColors = (color1: string, color2: string) => {
  const rgb1 = hexToRgb(color1)
  const rgb2 = hexToRgb(color2)

  if (!rgb1 || !rgb2) return color1

  const r = (rgb1.r + rgb2.r) / 2
  const g = (rgb1.g + rgb2.g) / 2
  const b = (rgb1.b + rgb2.b) / 2

  return rgbToHex(r, g, b)
}

// Simulation Logic
const getAdjacentEmptyCells = (x: number, y: number) => {
  const emptyCells: Cell[] = []
  const coords = [
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
  ]
  for (const { dx, dy } of coords) {
    const nx = x + dx
    const ny = y + dy
    if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE) {
      const targetRow = grid.value[ny]
      if (targetRow && !targetRow[nx]?.flower) {
        const targetCell = targetRow[nx]
        if (targetCell) emptyCells.push(targetCell)
      }
    }
  }
  return emptyCells
}

const getAdjacentFlowers = (x: number, y: number) => {
  const flowers: Cell[] = []
  const coords = [
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
  ]
  for (const { dx, dy } of coords) {
    const nx = x + dx
    const ny = y + dy
    if (nx >= 0 && nx < GRID_SIZE && ny >= 0 && ny < GRID_SIZE) {
      const targetRow = grid.value[ny]
      if (targetRow && targetRow[nx]?.flower) {
        const targetCell = targetRow[nx]
        if (targetCell) flowers.push(targetCell)
      }
    }
  }
  return flowers
}

const tick = () => {
  const newFlowers: {
    x: number
    y: number
    color: string
    ancestors: Record<string, number>
  }[] = []

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const row = grid.value[y]
      if (!row) continue
      const cell = row[x]
      if (!cell || !cell.flower) continue

      const adjacentFlowers = getAdjacentFlowers(x, y)
      if (adjacentFlowers.length > 0 && Math.random() < POLLINATION_CHANCE) {
        const partner = adjacentFlowers[Math.floor(Math.random() * adjacentFlowers.length)]
        const emptyCells = getAdjacentEmptyCells(x, y)
        if (partner && partner.flower && emptyCells.length > 0) {
          const spawnCell = emptyCells[Math.floor(Math.random() * emptyCells.length)]
          if (spawnCell) {
            const newColor = mixColors(cell.flower.color, partner.flower.color)
            const combinedAncestors: Record<string, number> = {}

            // Helper to add ancestor with distance increment
            const addAncestors = (src: Record<string, number>) => {
              for (const [coord, dist] of Object.entries(src)) {
                const newDist = dist + 1
                if (!combinedAncestors[coord] || newDist < combinedAncestors[coord]) {
                  combinedAncestors[coord] = newDist
                }
              }
            }

            addAncestors(cell.flower.ancestors)
            addAncestors(partner.flower.ancestors)

            // Add the immediate parents at distance 1
            combinedAncestors[`${cell.x},${cell.y}`] = 1
            combinedAncestors[`${partner.x},${partner.y}`] = 1

            newFlowers.push({
              x: spawnCell.x,
              y: spawnCell.y,
              color: newColor,
              ancestors: combinedAncestors,
            })
          }
        }
      }
    }
  }

  // Apply new flowers
  for (const { x, y, color, ancestors } of newFlowers) {
    const row = grid.value[y]
    if (row) {
      const cell = row[x]
      if (cell && !cell.flower) {
        cell.flower = { color, ancestors }
      }
    }
  }
}

let tickInterval: number | undefined

onMounted(() => {
  initializeGrid()

  // Plant some initial flowers
  const mid = Math.floor(GRID_SIZE / 2)
  const row1 = grid.value[mid]
  const row2 = grid.value[mid + 2]

  if (row1) {
    if (row1[mid]) row1[mid]!.flower = { color: '#ff0000', ancestors: {} }
    if (row1[mid + 1]) row1[mid + 1]!.flower = { color: '#0000ff', ancestors: {} }
  }
  if (row2) {
    if (row2[mid]) row2[mid]!.flower = { color: '#00ff00', ancestors: {} }
    if (row2[mid + 1]) row2[mid + 1]!.flower = { color: '#ffff00', ancestors: {} }
  }

  tickInterval = window.setInterval(tick, TICK_RATE_MS)
})

onUnmounted(() => {
  if (tickInterval) clearInterval(tickInterval)
})

const placeFlower = (x: number, y: number) => {
  const row = grid.value[y]
  if (row && row[x] && !row[x].flower) {
    // Generate a random bright color
    const randomComponent = () => Math.floor(Math.random() * 256)
    const color = rgbToHex(randomComponent(), randomComponent(), randomComponent())
    row[x].flower = { color, ancestors: {} }
  }
}

const handleCellClick = (x: number, y: number) => {
  const cell = grid.value[y]?.[x]
  if (!cell) return

  if (cell.flower) {
    // If clicking already selected cell, deselect
    if (selectedCell.value?.x === x && selectedCell.value?.y === y) {
      selectedCell.value = null
    } else {
      selectedCell.value = { x, y }
    }
  } else {
    placeFlower(x, y)
    selectedCell.value = null
  }
}
</script>

<style>
body,
html {
  margin: 0;
  padding: 0;
  background-color: #121212; /* Match simulation background */
}
</style>

<template>
  <div class="simulation-container">
    <div class="grid">
      <div v-for="(row, rowIndex) in grid" :key="rowIndex" class="row">
        <div
          v-for="(cell, colIndex) in row"
          :key="`${rowIndex}-${colIndex}`"
          class="cell"
          :class="{
            'has-flower': cell.flower,
            'is-selected': selectedCell?.x === cell.x && selectedCell?.y === cell.y,
            'is-ancestor': ancestorHighlights.has(`${cell.x},${cell.y}`),
          }"
          :style="
            ancestorHighlights.has(`${cell.x},${cell.y}`)
              ? getAncestorStyle(ancestorHighlights.get(`${cell.x},${cell.y}`)!)
              : {}
          "
          @click="handleCellClick(cell.x, cell.y)"
        >
          <div
            v-if="cell.flower"
            class="flower"
            :style="{
              backgroundColor: cell.flower.color,
              boxShadow: `0 0 10px ${cell.flower.color}88`,
            }"
          ></div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.simulation-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  font-family: 'Inter', sans-serif;
  background-color: #121212;
  color: #e0e0e0;
  min-height: 100vh;
  padding: 2rem;
  box-sizing: border-box;
}

h1 {
  margin: 0 0 1rem 0;
  background: linear-gradient(90deg, #ff8a00, #e52e71);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

p {
  color: #a0a0a0;
  margin-bottom: 2rem;
  max-width: 600px;
  text-align: center;
}

.grid {
  display: flex;
  flex-direction: column;
  gap: 4px;
  background-color: #1e1e1e;
  padding: 1rem;
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
}

.row {
  display: flex;
  gap: 4px;
}

.cell {
  width: 40px;
  height: 40px;
  background-color: #2a2a2a;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  justify-content: center;
  align-items: center;
  transition:
    background-color 0.2s,
    transform 0.1s,
    border 0.2s,
    box-shadow 0.2s;
  box-sizing: border-box;
  border: 2px solid transparent;
}

.cell.is-selected {
  border: 2px solid #ffffff;
  background-color: #444;
  box-shadow: 0 0 15px rgba(255, 255, 255, 0.3);
}

.cell.is-ancestor {
  transition: all 0.3s ease;
}

.cell:hover:not(.has-flower, .is-selected, .is-ancestor) {
  background-color: #3a3a3a;
  transform: scale(1.05);
}

.selection-info {
  margin-top: 1.5rem;
  font-size: 0.9rem;
  color: #ffcc00;
  font-weight: 500;
  animation: fadeIn 0.3s ease-out;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.flower {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

@keyframes popIn {
  0% {
    transform: scale(0);
  }
  100% {
    transform: scale(1);
  }
}
</style>
