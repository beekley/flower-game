import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import App from './App.vue'
import type { Flower, Cell } from './types'

describe('App.vue', () => {
  let wrapper: VueWrapper<InstanceType<typeof App>>

  beforeEach(() => {
    vi.useFakeTimers()
    window.scrollTo = vi.fn()

    // Mock Canvas context
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      save: vi.fn(),
      scale: vi.fn(),
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      roundRect: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      arc: vi.fn(),
      restore: vi.fn(),
    })

    // Mock getBoundingClientRect for stable coordinate mapping
    HTMLCanvasElement.prototype.getBoundingClientRect = vi.fn().mockReturnValue({
      left: 0,
      top: 0,
      width: 2400,
      height: 2400,
    })

    wrapper = mount(App)
  })

  const clickCanvas = async (x: number, y: number, isClick = true) => {
    // TOTAL_CELL_SIZE = 24 in App.vue
    const clientX = x * 24 + 10
    const clientY = y * 24 + 10
    const canvas = wrapper.find('canvas')
    
    if (isClick) {
      await canvas.trigger('mousedown', { clientX, clientY, button: 0 })
    } else {
      await canvas.trigger('mousemove', { clientX, clientY })
    }
  }

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    wrapper.unmount()
  })

  it('spawns an empty grid initially', () => {
    const grid = wrapper.vm.grid
    
    // Verify a square grid is generated in state
    expect(grid.length).toBe(100)
    expect(grid[0]!.length).toBe(100)

    expect(wrapper.vm.activeFlowers.size).toBe(0)
  })

  it('can paint a flower on an empty cell using mousedown and mouseenter', async () => {
    // simulate click (mousedown on a cell at 0,0)
    await clickCanvas(0, 0, true)
    expect(wrapper.vm.activeFlowers.size).toBe(1)

    // Simulate dragging (global mousedown starts, then mouseenter on cell 1,0)
    window.dispatchEvent(new MouseEvent('mousedown', { button: 0 }))
    await clickCanvas(1, 0, false)

    expect(wrapper.vm.activeFlowers.size).toBe(2)
  })

  it('can pick colors using number keys', async () => {
    // Press '1' for red brush (#ff0000)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }))

    await clickCanvas(0, 0, true)

    const cell = wrapper.vm.grid[0]![0]!
    expect(cell.flower).not.toBeNull()
    expect(cell.flower?.color).toBe('#ff0000')
  })

  it('flowers age and die after MAX_FLOWER_AGE (100) ticks', async () => {
    await clickCanvas(0, 0, true)

    expect(wrapper.vm.activeFlowers.size).toBe(1)

    // TICK_RATE_MS = 10 in App.vue
    // Advance time by 99 ticks (99 * 10ms = 990ms)
    vi.advanceTimersByTime(990)
    await wrapper.vm.$nextTick()

    // Our original cell should still have a flower (age 99)
    expect(wrapper.vm.activeFlowers.size).toBe(1)
    expect(wrapper.vm.grid[0]![0]!.flower).not.toBeNull()

    // Advance to tick 101
    vi.advanceTimersByTime(20)
    await wrapper.vm.$nextTick()

    // The original flower should have died
    expect(wrapper.vm.activeFlowers.size).toBe(0)
    expect(wrapper.vm.grid[0]![0]!.flower).toBeNull()
  })

  it('cleans up ancestors that no longer exist on the grid', async () => {
    // Enable history tracking for this test
    wrapper.vm.isTrackingHistory = true
    
    // Mock random to ensure pollination (always succeeds)
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0)

    // Plant two flowers next to each other
    // (0,0) and (1,0) are adjacent
    await clickCanvas(0, 0, true)
    await clickCanvas(1, 0, true)

    // Trigger tick to allow pollination
    vi.advanceTimersByTime(10)
    await wrapper.vm.$nextTick()

    const grid = wrapper.vm.grid

    // Find a flower that has ancestors (the child)
    let childFlower: Flower | null = null
    
    for (const row of grid) {
      for (const cell of row) {
        const flower = cell.flower
        if (flower && Object.keys(flower.ancestors).length > 0) {
          childFlower = flower
          break
        }
      }
      if (childFlower) break
    }

    expect(childFlower).not.toBeNull()
    const parentCoord = '0,0'
    
    if (childFlower) {
      expect(childFlower.ancestors).toHaveProperty(parentCoord)
    }

    // Manually remove the parent at (0,0) safely
    const firstCell = grid[0]![0]!
    firstCell.flower = null
    wrapper.vm.activeFlowers.delete(firstCell)

    // Trigger another tick - this is when cleanup should happen
    vi.advanceTimersByTime(10)
    await wrapper.vm.$nextTick()

    // Verify parent is no longer in ancestors
    if (childFlower) {
      expect(childFlower.ancestors).not.toHaveProperty(parentCoord)
    }

    randomSpy.mockRestore()
  })

  it('does not track ancestry history by default', async () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0)

    await clickCanvas(0, 0, true)
    await clickCanvas(1, 0, true)

    // Trigger tick for pollination
    vi.advanceTimersByTime(10)
    await wrapper.vm.$nextTick()

    const grid = wrapper.vm.grid
    let childFlower: Flower | null = null

    // Look for a spawned child (should be near the parents at x=0,1 y=0)
    for (const row of grid) {
      for (const cell of row) {
        if (cell.flower && (cell.x !== 0 || cell.y !== 0) && (cell.x !== 1 || cell.y !== 0)) {
          childFlower = cell.flower
          break
        }
      }
      if (childFlower) break
    }

    expect(childFlower).not.toBeNull()
    if (childFlower) {
      expect(Object.keys(childFlower.ancestors).length).toBe(0)
    }

    randomSpy.mockRestore()
  })

  it('toggles debug menu after pressing b five times quickly', async () => {
    expect(wrapper.find('.debug-menu').exists()).toBe(false)

    for (let i = 0; i < 5; i++) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b' }))
    }
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.debug-menu').exists()).toBe(true)

    // Toggle off
    for (let i = 0; i < 5; i++) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b' }))
    }
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.debug-menu').exists()).toBe(false)
  })

  it('does not toggle debug menu if presses are slow', async () => {
    expect(wrapper.find('.debug-menu').exists()).toBe(false)

    for (let i = 0; i < 4; i++) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b' }))
    }

    // Wait more than 1 second (threshold is 1000ms)
    vi.advanceTimersByTime(1100)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b' }))
    await wrapper.vm.$nextTick()

    // Counter should have been reset by the delay, so 5th press is now effectively the 1st
    expect(wrapper.find('.debug-menu').exists()).toBe(false)
  })

  it('maintains activeFlowers Set synchronization during plant and death', async () => {
    // Plant two flowers
    await clickCanvas(5, 5, true)
    await clickCanvas(6, 6, true)
    expect(wrapper.vm.activeFlowers.size).toBe(2)

    // Verify they are in the set
    const flowersArray = Array.from(wrapper.vm.activeFlowers) as Cell[]
    expect(flowersArray.some((c: Cell) => c.x === 5 && c.y === 5)).toBe(true)
    expect(flowersArray.some((c: Cell) => c.x === 6 && c.y === 6)).toBe(true)

    // Manually kill one via tick-like logic
    const targetCell = flowersArray.find((c: Cell) => c.x === 5 && c.y === 5)!
    targetCell.flower = null
    wrapper.vm.activeFlowers.delete(targetCell)

    expect(wrapper.vm.activeFlowers.size).toBe(1)
    expect(Array.from(wrapper.vm.activeFlowers as Set<Cell>).some((c: Cell) => c.x === 5 && c.y === 5)).toBe(false)
  })

  it('prunes ancestors deeper than 10 generations for performance', async () => {
    wrapper.vm.isTrackingHistory = true
    
    // Plant the "ancestors" first so they aren't pruned for being empty
    await clickCanvas(1, 1, true)
    await clickCanvas(2, 2, true)
    await clickCanvas(3, 3, true)
    await clickCanvas(4, 4, true)
    await clickCanvas(5, 5, true)

    // Setup a new flower with a very deep ancestor record manually
    await clickCanvas(0, 0, true)
    const cell = wrapper.vm.grid[0]![0]!
    cell.flower!.ancestors = {
      '1,1': 1,
      '2,2': 5,
      '3,3': 10,
      '4,4': 11, // This should be pruned (distance > 10)
      '5,5': 15  // This should be pruned (distance > 10)
    }

    // Trigger tick to invoke cleanup logic
    vi.advanceTimersByTime(10)
    await wrapper.vm.$nextTick()

    const ancestors = cell.flower!.ancestors
    expect(ancestors).toHaveProperty('1,1')
    expect(ancestors).toHaveProperty('3,3')
    expect(ancestors).not.toHaveProperty('4,4')
    expect(ancestors).not.toHaveProperty('5,5')
  })

  it('scales canvas dimensions based on devicePixelRatio', async () => {
    // Mock high-DPI display
    vi.stubGlobal('devicePixelRatio', 2)
    
    // Remount to trigger onMounted scaling logic
    const wrapper2 = mount(App)
    await wrapper2.vm.$nextTick()
    
    const canvas = wrapper2.find('canvas').element as HTMLCanvasElement
    // GRID_PX_SIZE = 2396
    // Expected width = 2396 * 2 = 4792
    expect(canvas.width).toBe(2396 * 2)
    expect(canvas.height).toBe(2396 * 2)
    
    vi.unstubAllGlobals()
  })
})
