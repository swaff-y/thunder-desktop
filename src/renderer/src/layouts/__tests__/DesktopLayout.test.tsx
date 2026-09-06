import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import DesktopLayout from '../DesktopLayout'
import { useOpenInBrowserTab } from '../../browser/BrowserNavContext'

// The layout's own wiring is what's under test, so everything it mounts
// beside the drawer is stubbed down to the one seam each one provides.
vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({ logout: vi.fn() })
}))

vi.mock('../../hooks/useSettings', () => ({
  useChatEnabled: () => true
}))

vi.mock('../../components/desktop/Sidebar', () => ({
  default: () => null
}))

vi.mock('../../components/desktop/TopBar', () => ({
  default: ({ onAskCatalogue }: { onAskCatalogue: () => void }) => (
    <button type="button" onClick={onAskCatalogue}>
      Ask
    </button>
  )
}))

vi.mock('../../browser/BrowserPage', () => ({
  default: () => null
}))

vi.mock('../../pages/Watch', () => ({
  default: () => null
}))

// Stands in for a TD-077 web image tile: the one thing it does is what a
// tile does — hand a stranger's URL to `openInBrowserTab`.
vi.mock('../../components/chat/ChatPanel', () => ({
  COMPOSER_INPUT_ID: 'chat-composer',
  default: function TileStub(): React.JSX.Element {
    const openInBrowserTab = useOpenInBrowserTab()

    function handleClick(): void {
      openInBrowserTab('https://example.com/cat.gif')
    }

    return (
      <button type="button" onClick={handleClick}>
        Open image
      </button>
    )
  }
}))

function CurrentPath(): React.JSX.Element {
  return <p data-testid="path">{useLocation().pathname}</p>
}

describe('DesktopLayout', () => {
  it('closes the chat drawer when a web image asks for the Browser tab', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/']}>
        <DesktopLayout>
          <CurrentPath />
        </DesktopLayout>
      </MemoryRouter>
    )

    await user.click(screen.getByRole('button', { name: 'Ask' }))
    expect(screen.getByRole('dialog', { name: 'Catalogue chat' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Open image' }))

    expect(screen.queryByRole('dialog', { name: 'Catalogue chat' })).not.toBeInTheDocument()
    expect(screen.getByTestId('path')).toHaveTextContent('/browser')
  })
})
