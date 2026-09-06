import { describe, expect, it, vi } from 'vitest'
import { render, screen, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { BrowserNavProvider, useBrowserNavState, useOpenInBrowserTab } from '../BrowserNavContext'

function Consumer({ url }: { url: string }): React.JSX.Element {
  const nav = useBrowserNavState()
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
      <p data-testid="url">{nav.url}</p>
      <p data-testid="validation">{nav.validationError ?? ''}</p>
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
  it('takes the user to the Browser tab with the URL loaded', async () => {
    const user = userEvent.setup()
    const onOpenBrowserTab = vi.fn()
    renderConsumer('https://example.com/cat.gif', onOpenBrowserTab)

    await user.click(screen.getByRole('button', { name: 'Open' }))

    expect(screen.getByTestId('path')).toHaveTextContent('/browser')
    expect(screen.getByTestId('url')).toHaveTextContent('https://example.com/cat.gif')
    expect(screen.getByTestId('validation')).toBeEmptyDOMElement()
    expect(onOpenBrowserTab).toHaveBeenCalledOnce()
  })

  it('leaves the user where they are when the scheme is not http(s)', async () => {
    const user = userEvent.setup()
    const onOpenBrowserTab = vi.fn()
    renderConsumer('javascript:alert(1)', onOpenBrowserTab)

    await user.click(screen.getByRole('button', { name: 'Open' }))

    expect(screen.getByTestId('path')).toHaveTextContent('/')
    expect(screen.getByTestId('url')).toHaveTextContent('https://www.google.com')
    expect(screen.getByTestId('validation')).toHaveTextContent('Unsupported scheme: javascript:')
    expect(onOpenBrowserTab).not.toHaveBeenCalled()
  })
})
