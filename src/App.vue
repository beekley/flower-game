<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { hslToHex, mixColors } from './utils/colors'
import type { FlowerSpawn, Cell } from './types'

// --- Constants ---
const GRID_SIZE = 100
const TICK_RATE_MS = 100
const MAX_POLLINATION_CHANCE = 0.1
const MAX_FLOWER_AGE = 100

// --- State & Global Variables ---
const grid = ref<Cell[][]>([])
const selectedCell = ref<{ x: number; y: number } | null>(null)
const selectedBrushColor = ref<string | null>(null)
const isMouseDown = ref(false)
const isPaused = ref(false)
const rainbowHue = ref(0)
const showDebugMenu = ref(false)
const debugPressCount = ref(0)
const lastDebugPressTime = ref(0)
const usedMemory = ref(0)
let tickInterval: number | undefined
let memoryInterval: number | undefined

const colorMap: Record<string, string> = {
  '1': '#ff0000',
  '2': '#ff8800',
  '3': '#ffff00',
  '4': '#00ff00',
  '5': '#00ffff',
  '6': '#0000ff',
  '7': '#8800ff',
  '8': '#ff00ff',
  '9': '#ffffff',
}

// --- Input Event Handlers ---
const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key.toLowerCase() === 'b') {
    const now = Date.now()
    if (now - lastDebugPressTime.value > 1000) {
      debugPressCount.value = 1
    } else {
      debugPressCount.value++
      if (debugPressCount.value >= 5) {
        showDebugMenu.value = !showDebugMenu.value
        debugPressCount.value = 0
      }
    }
    lastDebugPressTime.value = now
  }
  if (e.code === 'Space') {
    e.preventDefault()
    isPaused.value = !isPaused.value
    return
  }
  const color = colorMap[e.key]
  if (e.key === '0') selectedBrushColor.value = null
  else if (color) selectedBrushColor.value = color
}

const handleGlobalMouseDown = (e: MouseEvent) => {
  if (e.button === 0) isMouseDown.value = true
}

const handleGlobalMouseUp = (e: MouseEvent) => {
  if (e.button === 0) isMouseDown.value = false
}

// --- Computed Properties & Dynamic Styling ---
const ancestorHighlights = computed(() => {
  if (!selectedCell.value) return new Map<string, number>()
  const cell = grid.value[selectedCell.value.y]?.[selectedCell.value.x]
  return cell?.flower ? new Map(Object.entries(cell.flower.ancestors)) : new Map()
})

const getAncestorStyle = (distance: number) => {
  const ratio = Math.min((distance - 1) / 4, 1)
  const r = 255 - 170 * ratio
  const g = 204 - 119 * ratio
  const b = 85 * ratio
  const color = `rgb(${r}, ${g}, ${b})`
  const opacity = Math.max(0.3, 1 - ratio * 0.5)

  return {
    borderColor: color,
    backgroundColor: `${color}33`,
    boxShadow: `0 0 ${10 - ratio * 5}px rgba(${r}, ${g}, ${b}, ${opacity * 0.4})`,
  }
}

// --- Grid Initialization & Neighbors ---
const initializeGrid = () => {
  grid.value = Array.from({ length: GRID_SIZE }, (_, y) =>
    Array.from({ length: GRID_SIZE }, (_, x) => ({ x, y, flower: null })),
  )
}

const getAdjacentCells = (x: number, y: number) => {
  const neighbors: Cell[] = []
  for (const { dx, dy } of [
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
  ]) {
    const cell = grid.value[y + dy]?.[x + dx]
    if (cell) neighbors.push(cell)
  }
  return neighbors
}

// --- Simulation Core: Flow & Pollination ---
const processCellPollination = (
  x: number,
  y: number,
  cell: Cell,
  deadFlowers: { x: number; y: number }[],
  newFlowers: FlowerSpawn[],
) => {
  cell.flower!.age++

  if (cell.flower!.age > MAX_FLOWER_AGE) {
    deadFlowers.push({ x, y })
    return
  }

  let chance = MAX_POLLINATION_CHANCE
  if (cell.flower!.age > MAX_FLOWER_AGE * 0.25) chance *= 0.05
  else if (cell.flower!.age > MAX_FLOWER_AGE * 0.1) chance *= 0.1

  if (Math.random() >= chance) return

  const neighbors = getAdjacentCells(x, y)
  const adjacentFlowers = neighbors.filter((n) => n.flower)
  const emptyCells = neighbors.filter((n) => !n.flower)

  if (adjacentFlowers.length === 0 || emptyCells.length === 0) return

  const partner = adjacentFlowers[Math.floor(Math.random() * adjacentFlowers.length)]
  const spawnCell = emptyCells[Math.floor(Math.random() * emptyCells.length)]

  if (!partner || !spawnCell) return

  const combinedAncestors: Record<string, number> = {}
  const addAncestors = (src: Record<string, number>) => {
    for (const [coord, dist] of Object.entries(src)) {
      if (!combinedAncestors[coord] || dist + 1 < combinedAncestors[coord]) {
        combinedAncestors[coord] = dist + 1
      }
    }
  }

  addAncestors(cell.flower!.ancestors)
  addAncestors(partner.flower!.ancestors)
  combinedAncestors[`${cell.x},${cell.y}`] = 1
  combinedAncestors[`${partner.x},${partner.y}`] = 1

  newFlowers.push({
    x: spawnCell.x,
    y: spawnCell.y,
    color: mixColors(cell.flower!.color, partner.flower!.color),
    ancestors: combinedAncestors,
    age: 0,
  })
}

// --- Main Simulation Loop (Tick) ---
const tick = () => {
  if (isPaused.value) return

  const newFlowers: FlowerSpawn[] = []
  const deadFlowers: { x: number; y: number }[] = []

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const cell = grid.value[y]?.[x]
      if (cell?.flower) processCellPollination(x, y, cell, deadFlowers, newFlowers)
    }
  }

  for (const { x, y } of deadFlowers) {
    const row = grid.value[y]
    const cell = row?.[x]
    if (cell) {
      cell.flower = null
      if (selectedCell.value?.x === x && selectedCell.value?.y === y) selectedCell.value = null
    }
  }

  // --- Ancestor cleanup pass ---
  for (let y = 0; y < GRID_SIZE; y++) {
    const row = grid.value[y]
    if (!row) continue
    for (let x = 0; x < GRID_SIZE; x++) {
      const flower = row[x]?.flower
      if (!flower) continue

      const entries = Object.entries(flower.ancestors)
      if (entries.length === 0) continue

      const cleaned: Record<string, number> = {}
      let changed = false
      for (const [coord, dist] of entries) {
        const parts = coord.split(',')
        const ax = parseInt(parts[0] || '', 10)
        const ay = parseInt(parts[1] || '', 10)

        if (!isNaN(ax) && !isNaN(ay) && grid.value[ay]?.[ax]?.flower) {
          cleaned[coord] = dist
        } else {
          changed = true
        }
      }
      if (changed) flower.ancestors = cleaned
    }
  }

  for (const f of newFlowers) {
    const row = grid.value[f.y]
    const cell = row?.[f.x]
    if (cell) {
      cell.flower = { color: f.color, ancestors: f.ancestors, age: f.age }
    }
  }
}

const updateMemory = () => {
  const perf = window.performance
  if (perf.memory) {
    usedMemory.value = Math.round(perf.memory.usedJSHeapSize / (1024 * 1024))
  }
}

// --- Component Lifecycle ---
onMounted(() => {
  initializeGrid()
  tickInterval = window.setInterval(tick, TICK_RATE_MS)
  memoryInterval = window.setInterval(updateMemory, 1000)
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('mousedown', handleGlobalMouseDown)
  window.addEventListener('mouseup', handleGlobalMouseUp)

  nextTick(() => {
    window.scrollTo({
      top: (document.documentElement.scrollHeight - window.innerHeight) / 2,
      left: (document.documentElement.scrollWidth - window.innerWidth) / 2,
      behavior: 'auto',
    })
  })
})

onUnmounted(() => {
  if (tickInterval) clearInterval(tickInterval)
  if (memoryInterval) clearInterval(memoryInterval)
  window.removeEventListener('keydown', handleKeyDown)
  window.removeEventListener('mousedown', handleGlobalMouseDown)
  window.removeEventListener('mouseup', handleGlobalMouseUp)
})

// --- User Interaction (Painting & Clicking) ---
const placeFlower = (x: number, y: number) => {
  const row = grid.value[y]
  if (row && row[x] && !row[x].flower) {
    let color: string
    if (selectedBrushColor.value) {
      color = selectedBrushColor.value
    } else {
      color = hslToHex(rainbowHue.value, 100, 50)
      rainbowHue.value = (rainbowHue.value + 15) % 360
    }
    row[x].flower = { color, ancestors: {}, age: 0 }
  }
}

const handleCellInteract = (x: number, y: number, isClick: boolean) => {
  const cell = grid.value[y]?.[x]
  if (!cell) return

  if (isClick && cell.flower) {
    selectedCell.value =
      selectedCell.value?.x === x && selectedCell.value?.y === y ? null : { x, y }
  } else if (isClick || isMouseDown.value) {
    placeFlower(x, y)
    if (isClick) selectedCell.value = null
  }
}

defineExpose({
  grid,
})
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

    <div v-if="showDebugMenu" class="debug-menu">
      <div class="debug-item">
        <span class="debug-label">Memory Usage:</span>
        <span class="debug-value">{{ usedMemory > 0 ? usedMemory + ' MB' : 'N/A' }}</span>
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
  width: 20px;
  height: 20px;
  background-color: #161616;
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
  border: 1px solid transparent;
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

.flower {
  width: 14px;
  height: 14px;
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

.debug-menu {
  position: fixed;
  bottom: 2rem;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 0.75rem 1.5rem;
  display: flex;
  gap: 1.5rem;
  z-index: 1000;
  pointer-events: none;
  animation: slideUp 0.3s ease-out;
}

.debug-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.debug-label {
  color: #888;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.debug-value {
  color: #fff;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.9rem;
  font-weight: 600;
}

@keyframes slideUp {
  from {
    transform: translate(-50%, 20px);
    opacity: 0;
  }
  to {
    transform: translate(-50%, 0);
    opacity: 1;
  }
}
</style>
