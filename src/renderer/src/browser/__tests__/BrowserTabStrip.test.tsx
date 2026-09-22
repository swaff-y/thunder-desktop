import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BrowserTabStrip from '../BrowserTabStrip'
import type { BrowserTabEntry } from '../useBrowserTabs'

function entry(overrides: Partial<BrowserTabEntry> & { id: string }): BrowserTabEntry {
  return {
    title: null,
    url: 'https://www.google.com',
    favicon: null,
    loading: false,
    ...overrides
  }
}

function renderStrip(
  entries: BrowserTabEntry[],
  handlers: {
    onActivate?: (id: string) => void
    onClose?: (id: string) => void
    onOpen?: () => void
  } = {}
): void {
  render(
    <BrowserTabStrip
      entries={entries}
      activeId={entries[0].id}
      message={null}
      onActivate={handlers.onActivate ?? vi.fn()}
      onClose={handlers.onClose ?? vi.fn()}
      onOpen={handlers.onOpen ?? vi.fn()}
    />
  )
}

describe('BrowserTabStrip', () => {
  it('draws a tab per entry, named by its page', () => {
    renderStrip([
      entry({ id: 'tab-1', title: 'Google' }),
      entry({ id: 'tab-2', title: 'Example Domain', url: 'https://example.com/' })
    ])

    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'Google' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Example Domain' })).toBeTruthy()
  })

  it("falls back to the URL's hostname until a title arrives", () => {
    renderStrip([entry({ id: 'tab-1', url: 'https://example.com/deep/page?q=1' })])

    expect(screen.getByRole('button', { name: 'example.com' })).toBeTruthy()
  })

  it('opens a new tab from the + control', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()
    renderStrip([entry({ id: 'tab-1', title: 'Google' })], { onOpen })

    await user.click(screen.getByRole('button', { name: 'New tab' }))

    expect(onOpen).toHaveBeenCalledOnce()
  })

  it('closes the tab whose × was pressed', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    renderStrip(
      [entry({ id: 'tab-1', title: 'Google' }), entry({ id: 'tab-2', title: 'Example Domain' })],
      { onClose }
    )

    await user.click(screen.getByRole('button', { name: 'Close Example Domain' }))

    expect(onClose).toHaveBeenCalledWith('tab-2')
  })

  it('activates the tab that was clicked', async () => {
    const user = userEvent.setup()
    const onActivate = vi.fn()
    renderStrip(
      [entry({ id: 'tab-1', title: 'Google' }), entry({ id: 'tab-2', title: 'Example Domain' })],
      { onActivate }
    )

    await user.click(screen.getByRole('button', { name: 'Example Domain' }))

    expect(onActivate).toHaveBeenCalledWith('tab-2')
  })

  it('says why a tab could not be opened', () => {
    render(
      <BrowserTabStrip
        entries={[entry({ id: 'tab-1', title: 'Google' })]}
        activeId="tab-1"
        message="That is the 8-tab limit. Close one to open another."
        onActivate={vi.fn()}
        onClose={vi.fn()}
        onOpen={vi.fn()}
      />
    )

    expect(screen.getByRole('status')).toHaveTextContent('8-tab limit')
  })
})
