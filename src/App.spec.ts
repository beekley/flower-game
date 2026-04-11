import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import App from './App.vue'
import type { Flower } from './types'

describe('App.vue', () => {
  let wrapper: VueWrapper<InstanceType<typeof App>>

  beforeEach(() => {
    vi.useFakeTimers()
    window.scrollTo = vi.fn()
    wrapper = mount(App)
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    wrapper.unmount()
  })

  it('spawns an empty grid initially', () => {
    const rows = wrapper.findAll('.row')
    const cells = wrapper.findAll('.cell')
    
    // Verify a square grid is generated
    expect(rows.length).toBeGreaterThan(0)
    expect(cells.length).toBe(rows.length * rows.length)

    const flowers = wrapper.findAll('.flower')
    expect(flowers.length).toBe(0)
  })

  it('can paint a flower on an empty cell using mousedown and mouseenter', async () => {
    const cells = wrapper.findAll('.cell')

    // simulate click (mousedown on a cell)
    await cells[0]!.trigger('mousedown')
    expect(wrapper.findAll('.flower').length).toBe(1)

    // Simulate dragging (global mousedown starts, then mouseenter on a cell)
    window.dispatchEvent(new MouseEvent('mousedown', { button: 0 }))
    await cells[1]!.trigger('mouseenter')

    expect(wrapper.findAll('.flower').length).toBe(2)
  })

  it('can pick colors using number keys', async () => {
    // Press '1' for red brush (#ff0000)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }))

    const cells = wrapper.findAll('.cell')
    await cells[0]!.trigger('mousedown')

    const flower = wrapper.find('.flower')
    expect(flower.exists()).toBe(true)

    // DOM typically normalizes #ff0000 to rgb(255, 0, 0)
    const style = flower.attributes('style') || ''
    expect(style.replace(/\s+/g, '')).toContain('background-color:rgb(255,0,0)')
  })

  it('flowers age and die after MAX_FLOWER_AGE (100) ticks', async () => {
    const cells = wrapper.findAll('.cell')
    await cells[0]!.trigger('mousedown')

    expect(wrapper.findAll('.flower').length).toBe(1)

    // Advance time by 99 ticks (99 * 100ms = 9900ms)
    vi.advanceTimersByTime(9900)
    await wrapper.vm.$nextTick()

    // Our original cell should still have a flower (age 99)
    expect(cells[0]!.find('.flower').exists()).toBe(true)

    // Advance to tick 101
    vi.advanceTimersByTime(200)
    await wrapper.vm.$nextTick()

    // The original flower should have died
    expect(cells[0]!.find('.flower').exists()).toBe(false)
  })

  it('cleans up ancestors that no longer exist on the grid', async () => {
    // Mock random to ensure pollination (always succeeds)
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0)

    // Plant two flowers next to each other
    // (0,0) and (1,0) are adjacent
    const rows = wrapper.findAll('.row')
    const cell00 = rows[0]!.findAll('.cell')[0]!
    const cell10 = rows[0]!.findAll('.cell')[1]!

    await cell00.trigger('mousedown')
    await cell10.trigger('mousedown')

    // Trigger tick to allow pollination
    vi.advanceTimersByTime(100)
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
    const firstRow = grid[0]
    const firstCell = firstRow?.[0]
    if (firstCell) {
      firstCell.flower = null
    }

    // Trigger another tick - this is when cleanup should happen
    vi.advanceTimersByTime(100)
    await wrapper.vm.$nextTick()

    // Verify parent is no longer in ancestors
    if (childFlower) {
      expect(childFlower.ancestors).not.toHaveProperty(parentCoord)
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
})
