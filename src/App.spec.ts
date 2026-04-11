import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import App from './App.vue'

const GRID_SIZE = 50

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
    const cells = wrapper.findAll('.cell')
    expect(cells.length).toBe(GRID_SIZE * GRID_SIZE)

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
})
