<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, shallowRef, triggerRef } from 'vue'
import { hslToHex, mixColors } from './utils/colors'
import type { FlowerSpawn, Cell } from './types'

// --- Constants ---
const GRID_SIZE = 100
const TICK_RATE_MS = 100
const MAX_POLLINATION_CHANCE = 0.1
const MAX_FLOWER_AGE = 100

// --- State & Global Variables ---
const grid = shallowRef<Cell[][]>([])
const activeFlowers = ref<Set<Cell>>(new Set())
const selectedCell = ref<{ x: number; y: number } | null>(null)
const selectedBrushColor = ref<string | null>(null)
const isMouseDown = ref(false)
const isPaused = ref(false)
const rainbowHue = ref(0)
const showDebugMenu = ref(false)
const debugPressCount = ref(0)
const lastDebugPressTime = ref(0)
const usedMemory = ref(0)
const isTrackingHistory = ref(false)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const mousePos = ref<{ x: number; y: number } | null>(null)
const tickCount = ref(0)
const actualTicksPerSecond = ref(0)
let lastTickRateUpdate = 0 // Initialized in onMounted
let tickInterval: number | undefined
let memoryInterval: number | undefined
let rafId: number | undefined

const CELL_SIZE = 20
const CELL_GAP = 4
const TOTAL_CELL_SIZE = CELL_SIZE + CELL_GAP
const GRID_PX_SIZE = GRID_SIZE * TOTAL_CELL_SIZE - CELL_GAP

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

const ancestorHighlights = computed(() => {
  if (!selectedCell.value) return new Map<string, number>()
  const cell = grid.value[selectedCell.value.y]?.[selectedCell.value.x]
  return cell?.flower ? new Map(Object.entries(cell.flower.ancestors)) : new Map()
})

const getAncestorColor = (distance: number) => {
  const ratio = Math.min((distance - 1) / 4, 1)
  const r = 255 - 170 * ratio
  const g = 204 - 119 * ratio
  const b = 85 * ratio
  return { r, g, b, a: Math.max(0.3, 1 - ratio * 0.5) }
}

// --- Rendering: Canvas Draw Loop ---
const draw = () => {
  if (!canvasRef.value) return
  const ctx = canvasRef.value.getContext('2d', { alpha: false })
  if (!ctx) return

  const dpr = window.devicePixelRatio || 1
  ctx.save()
  ctx.scale(dpr, dpr)

  // Background
  ctx.fillStyle = '#121212'
  ctx.fillRect(0, 0, GRID_PX_SIZE, GRID_PX_SIZE)

  const highlights = ancestorHighlights.value

  for (let y = 0; y < GRID_SIZE; y++) {
    const row = grid.value[y]
    if (!row) continue
    for (let x = 0; x < GRID_SIZE; x++) {
      const cell = row[x]
      if (!cell) continue
      const px = x * TOTAL_CELL_SIZE
      const py = y * TOTAL_CELL_SIZE

      const isSelected = selectedCell.value?.x === x && selectedCell.value?.y === y
      const ancestorDist = highlights.get(`${x},${y}`)
      const isHovered = mousePos.value?.x === x && mousePos.value?.y === y

      // Draw Cell Background
      ctx.beginPath()
      const radius = 6
      ctx.roundRect(px, py, CELL_SIZE, CELL_SIZE, radius)

      if (isSelected) {
        ctx.fillStyle = '#444'
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 2
        ctx.fill()
        ctx.stroke()
      } else if (ancestorDist !== undefined) {
        const { r, g, b, a } = getAncestorColor(ancestorDist)
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.2)`
        ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${a})`
        ctx.lineWidth = 1
        ctx.fill()
        ctx.stroke()
      } else if (isHovered && !cell.flower) {
        ctx.fillStyle = '#3a3a3a'
        ctx.fill()
      } else {
        ctx.fillStyle = '#161616'
        ctx.fill()
      }

      // Draw Flower
      if (cell.flower) {
        const centerX = px + CELL_SIZE / 2
        const centerY = py + CELL_SIZE / 2
        const flowerRadius = 7

        // Shadow/Glow
        ctx.shadowBlur = 10
        ctx.shadowColor = `${cell.flower.color}88`

        ctx.beginPath()
        ctx.arc(centerX, centerY, flowerRadius, 0, Math.PI * 2)
        ctx.fillStyle = cell.flower.color
        ctx.fill()

        // Reset shadow
        ctx.shadowBlur = 0
      }
    }
  }

  ctx.restore()
  rafId = requestAnimationFrame(draw)
}

// --- Grid Initialization & Neighbors ---
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
  activeFlowers.value.clear()
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

  if (isTrackingHistory.value) {
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
  }

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

  for (const cell of activeFlowers.value) {
    if (cell.flower) {
      processCellPollination(cell.x, cell.y, cell, deadFlowers, newFlowers)
    }
  }

  for (const { x, y } of deadFlowers) {
    const cell = grid.value[y]?.[x]
    if (cell) {
      cell.flower = null
      activeFlowers.value.delete(cell)
      if (selectedCell.value?.x === x && selectedCell.value?.y === y) selectedCell.value = null
    }
  }

  // --- Optimized Ancestor cleanup pass ---
  if (isTrackingHistory.value) {
    for (const cell of activeFlowers.value) {
      const flower = cell.flower
      if (!flower) continue

      const entries = Object.entries(flower.ancestors)
      if (entries.length === 0) continue

      const cleaned: Record<string, number> = {}
      let changed = false
      for (const [coord, dist] of entries) {
        if (dist > 10) {
          // Prune deep ancestors for performance
          changed = true
          continue
        }
        const parts = coord.split(',')
        const ax = parseInt(parts[0] || '', 10)
        const ay = parseInt(parts[1] || '', 10)

        const ancestorCell = grid.value[ay]?.[ax]
        if (ancestorCell?.flower) {
          cleaned[coord] = dist
        } else {
          changed = true
        }
      }
      if (changed) flower.ancestors = cleaned
    }
  }

  for (const f of newFlowers) {
    const cell = grid.value[f.y]?.[f.x]
    if (cell) {
      cell.flower = { color: f.color, ancestors: f.ancestors, age: f.age }
      activeFlowers.value.add(cell)
    }
  }

  tickCount.value++
  triggerRef(grid)
}

const updateStats = (): void => {
  const perf = window.performance
  if (perf.memory) {
    usedMemory.value = Math.round(perf.memory.usedJSHeapSize / (1024 * 1024))
  }

  // Calculate actual tick rate safely
  const now = Date.now()
  const elapsed = (now - lastTickRateUpdate) / 1000

  if (elapsed > 0) {
    actualTicksPerSecond.value = Math.round(tickCount.value / elapsed)
  }

  tickCount.value = 0
  lastTickRateUpdate = now
}

// --- Component Lifecycle ---
onMounted(() => {
  initializeGrid()
  lastTickRateUpdate = Date.now()
  tickCount.value = 0
  tickInterval = window.setInterval(tick, TICK_RATE_MS)
  memoryInterval = window.setInterval(updateStats, 1000)
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('mousedown', handleGlobalMouseDown)
  window.addEventListener('mouseup', handleGlobalMouseUp)

  if (canvasRef.value) {
    const dpr = window.devicePixelRatio || 1
    canvasRef.value.width = GRID_PX_SIZE * dpr
    canvasRef.value.height = GRID_PX_SIZE * dpr
    canvasRef.value.style.width = `${GRID_PX_SIZE}px`
    canvasRef.value.style.height = `${GRID_PX_SIZE}px`
    rafId = requestAnimationFrame(draw)
  }

  nextTick(() => {
    const container = document.querySelector('.simulation-container')
    if (container) {
      window.scrollTo({
        top: (container.scrollHeight - window.innerHeight) / 2,
        left: (container.scrollWidth - window.innerWidth) / 2,
        behavior: 'auto',
      })
    }
  })
})

onUnmounted(() => {
  if (tickInterval) clearInterval(tickInterval)
  if (memoryInterval) clearInterval(memoryInterval)
  if (rafId) cancelAnimationFrame(rafId)
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
    activeFlowers.value.add(row[x])
    triggerRef(grid)
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

const handleCanvasInteraction = (e: MouseEvent, isClick: boolean) => {
  if (!canvasRef.value) return
  const rect = canvasRef.value.getBoundingClientRect()
  const xPx = e.clientX - rect.left
  const yPx = e.clientY - rect.top

  const col = Math.floor(xPx / TOTAL_CELL_SIZE)
  const row = Math.floor(yPx / TOTAL_CELL_SIZE)

  if (col >= 0 && col < GRID_SIZE && row >= 0 && row < GRID_SIZE) {
    mousePos.value = { x: col, y: row }
    handleCellInteract(col, row, isClick)
  } else {
    mousePos.value = null
  }
}

const handleCanvasMouseLeave = () => {
  mousePos.value = null
}

defineExpose({
  grid,
  activeFlowers,
  isTrackingHistory,
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
    <div class="canvas-wrapper">
      <canvas
        ref="canvasRef"
        class="flower-canvas"
        @mousedown="handleCanvasInteraction($event, true)"
        @mousemove="handleCanvasInteraction($event, false)"
        @mouseleave="handleCanvasMouseLeave"
      ></canvas>
    </div>

    <div v-if="showDebugMenu" class="debug-menu">
      <div class="debug-item">
        <span class="debug-label">Memory:</span>
        <span class="debug-value">{{ usedMemory > 0 ? usedMemory + ' MB' : 'N/A' }}</span>
      </div>
      <div class="debug-separator"></div>
      <div class="debug-item">
        <span class="debug-label">Tick Rate:</span>
        <span class="debug-value">{{ actualTicksPerSecond }} tps</span>
      </div>
      <div class="debug-separator"></div>
      <div class="debug-item clickable" @click="isTrackingHistory = !isTrackingHistory">
        <span class="debug-label">Ancestry:</span>
        <span
          class="debug-value"
          :class="{ 'status-on': isTrackingHistory, 'status-off': !isTrackingHistory }"
        >
          {{ isTrackingHistory ? 'ON' : 'OFF' }}
        </span>
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

.canvas-wrapper {
  margin: 0 auto;
  padding: 20px;
  background: #1a1a1a;
  border-radius: 16px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
}

.flower-canvas {
  cursor: crosshair;
  border-radius: 8px;
  display: block;
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

.debug-item.clickable {
  cursor: pointer;
  pointer-events: auto;
  transition: opacity 0.2s;
}

.debug-item.clickable:hover {
  opacity: 0.8;
}

.debug-separator {
  width: 1px;
  height: 1.5rem;
  background: rgba(255, 255, 255, 0.1);
  align-self: center;
}

.status-on {
  color: #00ff88 !important;
  text-shadow: 0 0 10px rgba(0, 255, 136, 0.3);
}

.status-off {
  color: #ff4444 !important;
  text-shadow: 0 0 10px rgba(255, 68, 68, 0.3);
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
