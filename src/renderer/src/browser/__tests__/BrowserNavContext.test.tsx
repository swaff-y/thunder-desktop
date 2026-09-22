import { describe, expect, it, vi } from 'vitest'
import { render, screen, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { BrowserNavProvider, useOpenInBrowserTab } from '../BrowserNavContext'
import { useBrowserTabsState } from '../BrowserTabsContext'

function Consumer({ url }: { url: string }): React.JSX.Element {
  const tabs = useBrowserTabsState()
  const openInBrowserTab = useOpenInBrowserTab()
  const location = useLocation()

  function handleOpen(): void {
    openInBrowserTab(url)
  }

  return (
    <>
      <button type="button" onClick={handleOpen}>
        Open
      </button>
      <p data-testid="path">{location.pathname}</p>
      <p data-testid="count">{tabs.entries.length}</p>
      <p data-testid="urls">{tabs.entries.map((entry) => entry.url).join(' ')}</p>
      <p data-testid="active">{tabs.activeId}</p>
      <p data-testid="message">{tabs.message ?? ''}</p>
    </>
  )
}

function renderConsumer(url: string, onOpenBrowserTab?: () => void): RenderResult {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <BrowserNavProvider onOpenBrowserTab={onOpenBrowserTab}>
        <Consumer url={url} />
      </BrowserNavProvider>
    </MemoryRouter>
  )
}

describe('openInBrowserTab', () => {
  // TD-089: a new tab, not the active one — clicking a chat web image must
  // not throw away whatever the Browser tab was showing.
  it('opens the URL in a new foreground tab and takes the user to the Browser tab', async () => {
    const user = userEvent.setup()
    const onOpenBrowserTab = vi.fn()
    renderConsumer('https://example.com/cat.gif', onOpenBrowserTab)

    await user.click(screen.getByRole('button', { name: 'Open' }))

    expect(screen.getByTestId('path')).toHaveTextContent('/browser')
    expect(screen.getByTestId('count')).toHaveTextContent('2')
    expect(screen.getByTestId('urls')).toHaveTextContent(
      'https://www.google.com https://example.com/cat.gif'
    )
    expect(screen.getByTestId('message')).toBeEmptyDOMElement()
    expect(onOpenBrowserTab).toHaveBeenCalledOnce()
  })

  it('creates no tab when the scheme is not http(s)', async () => {
    const user = userEvent.setup()
    const onOpenBrowserTab = vi.fn()
    renderConsumer('javascript:alert(1)', onOpenBrowserTab)

    await user.click(screen.getByRole('button', { name: 'Open' }))

    expect(screen.getByTestId('path')).toHaveTextContent('/')
    expect(screen.getByTestId('count')).toHaveTextContent('1')
    expect(screen.getByTestId('urls')).toHaveTextContent('https://www.google.com')
    expect(screen.getByTestId('message')).toHaveTextContent('Unsupported scheme: javascript:')
    expect(onOpenBrowserTab).not.toHaveBeenCalled()
  })
})
