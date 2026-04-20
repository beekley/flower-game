import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import App from './App.vue'
import type { Cell } from './types'

describe('App.vue (Core Engine)', () => {
  let wrapper: VueWrapper<InstanceType<typeof App>>

  beforeEach(() => {
    vi.useFakeTimers()
    window.scrollTo = vi.fn()

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

    HTMLCanvasElement.prototype.getBoundingClientRect = vi.fn().mockReturnValue({
      left: 0,
      top: 0,
      width: 2400,
      height: 2400,
    })

    wrapper = mount(App)
  })

  const clickCanvas = async (x: number, y: number, isClick = true) => {
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
    expect(grid.length).toBe(100)
    expect(grid[0]!.length).toBe(100)
    expect(wrapper.vm.activeCells.size).toBe(0)
  })

  it('can place an entity on an empty cell using mousedown and mouseenter', async () => {
    await clickCanvas(0, 0, true)
    expect(wrapper.vm.activeCells.size).toBe(1)

    window.dispatchEvent(new MouseEvent('mousedown', { button: 0 }))
    await clickCanvas(1, 0, false)

    expect(wrapper.vm.activeCells.size).toBe(2)
  })

  it('can pick colors using number keys', async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }))
    await clickCanvas(0, 0, true)

    const cell = wrapper.vm.grid[0]![0]!
    expect(cell.data.flower).not.toBeUndefined()
    expect(cell.data.flower?.color).toBe('#ff0000')
  })

  it('toggles debug menu after pressing b five times quickly', async () => {
    expect(wrapper.find('.debug-menu').exists()).toBe(false)

    for (let i = 0; i < 5; i++) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b' }))
    }
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.debug-menu').exists()).toBe(true)

    // Check if dropdown rendered
    expect(wrapper.find('.debug-select').exists()).toBe(true)

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
    vi.advanceTimersByTime(1100)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b' }))
    await wrapper.vm.$nextTick()
    expect(wrapper.find('.debug-menu').exists()).toBe(false)
  })

  it('maintains activeCells Set synchronization during placement and manual removal', async () => {
    await clickCanvas(5, 5, true)
    await clickCanvas(6, 6, true)
    expect(wrapper.vm.activeCells.size).toBe(2)

    const cellsArray = Array.from(wrapper.vm.activeCells) as Cell[]
    const targetCell = cellsArray.find((c: Cell) => c.x === 5 && c.y === 5)!

    // Simulate system logic clearing the cell
    targetCell.data = {}
    wrapper.vm.activeCells.delete(targetCell)

    expect(wrapper.vm.activeCells.size).toBe(1)
    expect(
      Array.from(wrapper.vm.activeCells as Set<Cell>).some((c: Cell) => c.x === 5 && c.y === 5),
    ).toBe(false)
  })

  it('scales canvas dimensions based on devicePixelRatio', async () => {
    vi.stubGlobal('devicePixelRatio', 2)
    const wrapper2 = mount(App)
    await wrapper2.vm.$nextTick()
    const canvas = wrapper2.find('canvas').element as HTMLCanvasElement
    expect(canvas.width).toBe(2396 * 2)
    expect(canvas.height).toBe(2396 * 2)
    vi.unstubAllGlobals()
  })
})
