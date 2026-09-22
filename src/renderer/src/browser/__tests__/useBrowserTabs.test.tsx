import { describe, expect, it } from 'vitest'
import { act, render } from '@testing-library/react'
import { INITIAL_URL, MAX_BROWSER_TABS, useBrowserTabs, type BrowserTabs } from '../useBrowserTabs'

function renderTabs(): { tabs: () => BrowserTabs } {
  let latest: BrowserTabs | null = null

  function Harness(): null {
    latest = useBrowserTabs()
    return null
  }

  render(<Harness />)

  return {
    tabs: () => {
      if (!latest) throw new Error('harness did not render')
      return latest
    }
  }
}

/** Opens until the strip holds `count` tabs, the first one included. */
function fill(tabs: () => BrowserTabs, count: number): void {
  while (tabs().entries.length < count) {
    act(() => {
      tabs().open()
    })
  }
}

describe('useBrowserTabs', () => {
  it('starts with one tab on the initial URL', () => {
    const { tabs } = renderTabs()

    expect(tabs().entries).toHaveLength(1)
    expect(tabs().entries[0].url).toBe(INITIAL_URL)
    expect(tabs().activeId).toBe(tabs().entries[0].id)
  })

  it('opens a tab in the foreground, on the URL it was given', () => {
    const { tabs } = renderTabs()

    act(() => {
      tabs().open('https://example.com/cat.gif')
    })

    expect(tabs().entries).toHaveLength(2)
    expect(tabs().entries[1].url).toBe('https://example.com/cat.gif')
    expect(tabs().activeId).toBe(tabs().entries[1].id)
  })

  it('opens on the initial URL when given no URL', () => {
    const { tabs } = renderTabs()

    act(() => {
      tabs().open()
    })

    expect(tabs().entries[1].url).toBe(INITIAL_URL)
  })

  it('activates the tab it is given', () => {
    const { tabs } = renderTabs()
    const first = tabs().entries[0].id
    act(() => {
      tabs().open()
    })

    act(() => {
      tabs().activate(first)
    })

    expect(tabs().activeId).toBe(first)
  })

  it('refuses a ninth tab, and says why', () => {
    const { tabs } = renderTabs()
    fill(tabs, MAX_BROWSER_TABS)
    const active = tabs().activeId

    let opened: boolean | undefined
    act(() => {
      opened = tabs().open()
    })

    expect(opened).toBe(false)
    expect(tabs().entries).toHaveLength(MAX_BROWSER_TABS)
    expect(tabs().activeId).toBe(active)
    expect(tabs().message).toMatch(/limit/i)
  })

  it('activates the right-hand neighbour when the active tab closes', () => {
    const { tabs } = renderTabs()
    fill(tabs, 3)
    const [, middle, right] = tabs().entries.map((entry) => entry.id)
    act(() => {
      tabs().activate(middle)
    })

    act(() => {
      tabs().close(middle)
    })

    expect(tabs().entries).toHaveLength(2)
    expect(tabs().activeId).toBe(right)
  })

  it('falls back to the left-hand neighbour when the tab that closed was last', () => {
    const { tabs } = renderTabs()
    fill(tabs, 3)
    const [, middle, right] = tabs().entries.map((entry) => entry.id)

    act(() => {
      tabs().close(right)
    })

    expect(tabs().activeId).toBe(middle)
  })

  it('leaves the active tab alone when another one closes', () => {
    const { tabs } = renderTabs()
    fill(tabs, 3)
    const [left, , right] = tabs().entries.map((entry) => entry.id)
    act(() => {
      tabs().activate(right)
    })

    act(() => {
      tabs().close(left)
    })

    expect(tabs().activeId).toBe(right)
  })

  it('opens a fresh tab rather than leaving the strip empty', () => {
    const { tabs } = renderTabs()
    const only = tabs().entries[0].id

    act(() => {
      tabs().close(only)
    })

    expect(tabs().entries).toHaveLength(1)
    expect(tabs().entries[0].id).not.toBe(only)
    expect(tabs().entries[0].url).toBe(INITIAL_URL)
    expect(tabs().activeId).toBe(tabs().entries[0].id)
  })

  it('ignores a close for a tab that is not open', () => {
    const { tabs } = renderTabs()
    const before = tabs().entries[0].id

    act(() => {
      tabs().close('tab-not-open')
    })

    expect(tabs().entries).toHaveLength(1)
    expect(tabs().entries[0].id).toBe(before)
  })

  it('clears the refusal once a tab opens or closes', () => {
    const { tabs } = renderTabs()
    act(() => {
      tabs().refuse('Not a valid URL.')
    })
    expect(tabs().message).toBe('Not a valid URL.')

    act(() => {
      tabs().open()
    })

    expect(tabs().message).toBeNull()
  })
})
