<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'

const GRID_SIZE = 50
const TICK_RATE_MS = 100
const MAX_POLLINATION_CHANCE = 0.1
const MAX_FLOWER_AGE = 100

type Flower = {
  color: string
  ancestors: Record<string, number> // "x,y" -> generation distance
  age: number
}

type Cell = {
  x: number
  y: number
  flower: Flower | null
}

// Initialize Grid
const grid = ref<Cell[][]>([])
const selectedCell = ref<{ x: number; y: number } | null>(null)
const selectedBrushColor = ref<string | null>(null)
const isMouseDown = ref(false)

const colorMap: Record<string, string> = {
  '1': '#ff0000', // Red
  '2': '#ff8800', // Orange
  '3': '#ffff00', // Yellow
  '4': '#00ff00', // Green
  '5': '#00ffff', // Cyan
  '6': '#0000ff', // Blue
  '7': '#8800ff', // Purple
  '8': '#ff00ff', // Magenta
  '9': '#ffffff', // White
}

const handleKeyDown = (e: KeyboardEvent) => {
  const color = colorMap[e.key]
  if (e.key === '0') {
    selectedBrushColor.value = null
  } else if (color) {
    selectedBrushColor.value = color
  }
}

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

const rainbowHue = ref(0)

const hslToHex = (h: number, s: number, l: number) => {
  l /= 100
  const a = (s * Math.min(l, 1 - l)) / 100
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
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
    age: number
  }[] = []
  const deadFlowers: { x: number; y: number }[] = []

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const row = grid.value[y]
      if (!row) continue
      const cell = row[x]
      if (!cell || !cell.flower) continue

      cell.flower.age++

      if (cell.flower.age > MAX_FLOWER_AGE) {
        deadFlowers.push({ x, y })
        continue
      }

      let pollinationChance = MAX_POLLINATION_CHANCE
      if (cell.flower.age > MAX_FLOWER_AGE * 0.25) {
        pollinationChance = MAX_POLLINATION_CHANCE * 0.05
      } else if (cell.flower.age > MAX_FLOWER_AGE * 0.1) {
        pollinationChance = MAX_POLLINATION_CHANCE * 0.1
      }

      const adjacentFlowers = getAdjacentFlowers(x, y)
      if (adjacentFlowers.length > 0 && Math.random() < pollinationChance) {
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
              age: 0,
            })
          }
        }
      }
    }
  }

  // Apply deaths
  for (const { x, y } of deadFlowers) {
    const row = grid.value[y]
    if (row && row[x]) {
      row[x].flower = null
      if (selectedCell.value?.x === x && selectedCell.value?.y === y) {
        selectedCell.value = null
      }
    }
  }

  // Apply new flowers
  for (const { x, y, color, ancestors, age } of newFlowers) {
    const row = grid.value[y]
    if (row) {
      const cell = row[x]
      if (cell && !cell.flower) {
        cell.flower = { color, ancestors, age }
      }
    }
  }
}

let tickInterval: number | undefined

const handleGlobalMouseDown = (e: MouseEvent) => {
  if (e.button === 0) isMouseDown.value = true
}
const handleGlobalMouseUp = (e: MouseEvent) => {
  if (e.button === 0) isMouseDown.value = false
}

onMounted(() => {
  initializeGrid()

  tickInterval = window.setInterval(tick, TICK_RATE_MS)
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('mousedown', handleGlobalMouseDown)
  window.addEventListener('mouseup', handleGlobalMouseUp)

  nextTick(() => {
    const scrollX = (document.documentElement.scrollWidth - window.innerWidth) / 2
    const scrollY = (document.documentElement.scrollHeight - window.innerHeight) / 2
    window.scrollTo({
      top: scrollY,
      left: scrollX,
      behavior: 'auto',
    })
  })
})

onUnmounted(() => {
  if (tickInterval) clearInterval(tickInterval)
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('mousedown', handleGlobalMouseDown)
  window.removeEventListener('mouseup', handleGlobalMouseUp)
})

const placeFlower = (x: number, y: number) => {
  const row = grid.value[y]
  if (row && row[x] && !row[x].flower) {
    let color: string
    if (selectedBrushColor.value) {
      color = selectedBrushColor.value
    } else {
      // Generate next rainbow color
      color = hslToHex(rainbowHue.value, 100, 50)
      rainbowHue.value = (rainbowHue.value + 15) % 360
    }
    row[x].flower = { color, ancestors: {}, age: 0 }
  }
}

const handleCellInteract = (x: number, y: number, isClick: boolean) => {
  const cell = grid.value[y]?.[x]
  if (!cell) return

  // Only handle selection logic on an explicit click of an existing flower
  if (isClick && cell.flower) {
    if (selectedCell.value?.x === x && selectedCell.value?.y === y) {
      selectedCell.value = null
    } else {
      selectedCell.value = { x, y }
    }
  } else if (isClick || isMouseDown.value) {
    // Paint if dragging or explicitly clicking
    placeFlower(x, y)
    if (isClick) selectedCell.value = null
  }
}
</script>

<style>
body,
html {
  margin: 0;
  padding: 0;
  background-color: #121212; /* Match simulation background */
  overscroll-behavior: none; /* Prevent swipe-to-back browser navigation */
}
</style>

<template>
  <div class="simulation-container">
    <div class="controls">
      Current Brush: 
      <span v-if="selectedBrushColor" class="brush-swatch" :style="{ backgroundColor: selectedBrushColor }"></span>
      <span v-else class="brush-text rainbow-text">Rainbow Flow</span>
      <span class="brush-hint"> (Keys 1-9 manually pick a color, 0 sets rainbow)</span>
    </div>
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
          @mousedown="handleCellInteract(cell.x, cell.y, true)"
          @mouseenter="handleCellInteract(cell.x, cell.y, false)"
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
  font-family: 'Inter', sans-serif;
  background-color: #121212;
  color: #e0e0e0;
  min-height: 100vh;
  padding: 2rem;
  box-sizing: border-box;
}

.controls {
  margin-bottom: 1rem;
  text-align: center;
  font-size: 0.9rem;
}

.brush-swatch {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  margin: 0 4px;
}

.brush-text {
  font-weight: bold;
}
.rainbow-text {
  background: linear-gradient(90deg, #ff0000, #ffaa00, #ffff00, #00ff00, #00ffff, #0000ff, #aa00ff, #ff00ff);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: rainbowShift 3s linear infinite;
  background-size: 200% 100%;
}

@keyframes rainbowShift {
  0% { background-position: 0% 50%; }
  100% { background-position: -200% 50%; }
}

.brush-hint {
  color: #888;
}

.grid {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin: 0 auto; /* safely center without clipping */
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
  margin: 1.5rem auto 0 auto;
  font-size: 0.9rem;
  color: #ffcc00;
  font-weight: 500;
  animation: fadeIn 0.3s ease-out;
  align-self: center;
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
