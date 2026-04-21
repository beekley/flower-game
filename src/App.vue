<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, shallowRef, triggerRef } from 'vue'
import type { Cell, GameSystem } from './types'
import { FlowerSystem } from './systems/FlowerSystem'

// --- Constants ---
const GRID_SIZE = 100
const TICK_RATE_MS = 100

// --- Systems Setup ---
const availableSystems: GameSystem[] = [FlowerSystem]
const currentSystemIndex = ref(0)
const currentSystem = computed(() => availableSystems[currentSystemIndex.value]!)

// --- State & Global Variables ---
const grid = shallowRef<Cell[][]>([])
const activeCells = ref<Set<Cell>>(new Set())
const selectedCell = ref<{ x: number; y: number } | null>(null)
const selectedBrushColor = ref<string | null>(null)
const isMouseDown = ref(false)
const isPaused = ref(false)
const showDebugMenu = ref(false)
const debugPressCount = ref(0)
const lastDebugPressTime = ref(0)
const usedMemory = ref(0)
const canvasRef = ref<HTMLCanvasElement | null>(null)
const mousePos = ref<{ x: number; y: number } | null>(null)
const tickCount = ref(0)
const actualTicksPerSecond = ref(0)
let lastTickRateUpdate = 0 // Initialized in onMounted
let tickInterval: number | undefined
let memoryInterval: number | undefined
let rafId: number | undefined
let cachedBgCanvas: HTMLCanvasElement | null = null

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

// --- Rendering: Canvas Draw Loop ---
const draw = () => {
  if (!canvasRef.value) return
  const ctx = canvasRef.value.getContext('2d', { alpha: false })
  if (!ctx) return

  const dpr = window.devicePixelRatio || 1
  ctx.save()
  ctx.scale(dpr, dpr)

  // 1. Background
  if (cachedBgCanvas) {
    ctx.drawImage(cachedBgCanvas, 0, 0, GRID_PX_SIZE, GRID_PX_SIZE)
  } else {
    ctx.fillStyle = '#121212'
    ctx.fillRect(0, 0, GRID_PX_SIZE, GRID_PX_SIZE)
  }

  // 2. System Overlay
  if (currentSystem.value.drawOverlay) {
    currentSystem.value.drawOverlay(ctx, {
      selectedCell: selectedCell.value,
      grid: grid.value,
      cellSize: CELL_SIZE,
      totalCellSize: TOTAL_CELL_SIZE,
    })
  }

  // 3. Hovered Cell
  if (mousePos.value && mousePos.value.x >= 0 && mousePos.value.y >= 0) {
    const { x, y } = mousePos.value
    const cell = grid.value[y]?.[x]
    if (cell && !currentSystem.value.hasEntity(cell)) {
      const px = x * TOTAL_CELL_SIZE
      const py = y * TOTAL_CELL_SIZE
      ctx.beginPath()
      ctx.roundRect(px, py, CELL_SIZE, CELL_SIZE, 6)
      ctx.fillStyle = '#3a3a3a'
      ctx.fill()
    }
  }

  // 4. Selected Cell
  if (selectedCell.value) {
    const { x, y } = selectedCell.value
    const px = x * TOTAL_CELL_SIZE
    const py = y * TOTAL_CELL_SIZE
    ctx.beginPath()
    ctx.roundRect(px, py, CELL_SIZE, CELL_SIZE, 6)
    ctx.fillStyle = '#444'
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.fill()
    ctx.stroke()
  }

  // 5. Active Entities
  for (const cell of activeCells.value) {
    const px = cell.x * TOTAL_CELL_SIZE
    const py = cell.y * TOTAL_CELL_SIZE
    currentSystem.value.drawCell(ctx, cell, px, py, CELL_SIZE)
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
      row.push({ x, y })
    }
    newGrid.push(row)
  }
  grid.value = newGrid
  activeCells.value.clear()
}

// --- Main Simulation Loop (Tick) ---
const tick = () => {
  if (isPaused.value) return
  currentSystem.value.tick(grid.value, activeCells.value)
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

    cachedBgCanvas = document.createElement('canvas')
    cachedBgCanvas.width = GRID_PX_SIZE * dpr
    cachedBgCanvas.height = GRID_PX_SIZE * dpr
    const bgCtx = cachedBgCanvas.getContext('2d', { alpha: false })
    if (bgCtx) {
      bgCtx.scale(dpr, dpr)
      bgCtx.fillStyle = '#121212'
      bgCtx.fillRect(0, 0, GRID_PX_SIZE, GRID_PX_SIZE)
      bgCtx.fillStyle = '#161616'
      for (let y = 0; y < GRID_SIZE; y++) {
        for (let x = 0; x < GRID_SIZE; x++) {
          bgCtx.beginPath()
          bgCtx.roundRect(x * TOTAL_CELL_SIZE, y * TOTAL_CELL_SIZE, CELL_SIZE, CELL_SIZE, 6)
          bgCtx.fill()
        }
      }
    }

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

// --- User Interaction ---
const handleCellInteract = (x: number, y: number, isClick: boolean) => {
  const cell = grid.value[y]?.[x]
  if (!cell) return

  const hasSystemEntity = currentSystem.value.hasEntity(cell)

  if (isClick && hasSystemEntity) {
    selectedCell.value =
      selectedCell.value?.x === x && selectedCell.value?.y === y ? null : { x, y }
  } else if (isClick || isMouseDown.value) {
    if (!hasSystemEntity) {
      currentSystem.value.placeEntity(cell, selectedBrushColor.value, activeCells.value)
      triggerRef(grid)
    }
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
  activeCells,
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
        <span class="debug-label">System:</span>
        <select class="debug-select" v-model="currentSystemIndex">
          <option v-for="(sys, idx) in availableSystems" :key="sys.name" :value="idx">
            {{ sys.name }}
          </option>
        </select>
      </div>
      <div class="debug-separator"></div>
      <div class="debug-item">
        <span class="debug-label">Memory:</span>
        <span class="debug-value">{{ usedMemory > 0 ? usedMemory + ' MB' : 'N/A' }}</span>
      </div>
      <div class="debug-separator"></div>
      <div class="debug-item">
        <span class="debug-label">Tick Rate:</span>
        <span class="debug-value">{{ actualTicksPerSecond }} tps</span>
      </div>
      <template v-if="currentSystem.debugItems && currentSystem.debugItems().length > 0">
        <div class="debug-separator"></div>
        <div
          v-for="(item, index) in currentSystem.debugItems()"
          :key="index"
          class="debug-item"
          :class="{ clickable: !!item.onClick }"
          @click="item.onClick && item.onClick()"
        >
          <span class="debug-label">{{ item.label }}</span>
          <span class="debug-value" :class="item.class">{{ item.value }}</span>
        </div>
      </template>
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

.debug-select {
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  padding: 0.25rem 0.5rem;
  font-family: 'Inter', sans-serif;
  font-size: 0.85rem;
  cursor: pointer;
  outline: none;
}
.debug-select:focus {
  border-color: rgba(255, 255, 255, 0.5);
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
