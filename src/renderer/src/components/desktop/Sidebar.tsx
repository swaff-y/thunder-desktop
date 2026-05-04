import { useNavigate, useLocation } from 'react-router-dom'
import {
  IoHomeOutline,
  IoPeopleOutline,
  IoFilmOutline,
  IoVideocamOutline,
  IoPricetagOutline,
  IoGlobeOutline,
  IoStatsChartOutline
} from 'react-icons/io5'
import type { IconType } from 'react-icons'
import { useTabHistory, type TabKey } from '../../hooks/useTabHistory'

interface NavItem {
  path: string
  label: string
  icon: IconType
  tabKey?: TabKey
}

const NAV_ITEMS: NavItem[] = [
  { path: '/', label: 'Home', icon: IoHomeOutline },
  { path: '/actors', label: 'Actors', icon: IoPeopleOutline, tabKey: 'actors' },
  { path: '/series', label: 'Series', icon: IoFilmOutline, tabKey: 'series' },
  { path: '/movies', label: 'Movies', icon: IoVideocamOutline, tabKey: 'movies' },
  { path: '/tags', label: 'Tags', icon: IoPricetagOutline, tabKey: 'tags' },
  { path: '/browser', label: 'Browser', icon: IoGlobeOutline },
  { path: '/stats', label: 'Stats', icon: IoStatsChartOutline }
]

export default function Sidebar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { activeTab, resolveTabClick } = useTabHistory()

  function handleBrandClick() {
    navigate('/')
  }

  return (
    <aside className="desktop-sidebar">
      <div className="sidebar-brand" onClick={handleBrandClick}>
        <h1 className="sidebar-title">Thunder</h1>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map(({ path, label, icon: Icon, tabKey }) => {
          const isActive = isItemActive(path, tabKey, location.pathname, activeTab)

          function handleClick() {
            if (tabKey) {
              navigate(resolveTabClick(tabKey))
            } else {
              navigate(path)
            }
          }

          return (
            <button
              key={path}
              className={`sidebar-link ${isActive ? 'active' : ''}`}
              onClick={handleClick}
            >
              <Icon size={20} />
              <span>{label}</span>
            </button>
          )
        })}
      </nav>

      <style>{`
        .desktop-sidebar {
          width: 240px;
          min-width: 240px;
          background: var(--color-surface);
          border-right: 1px solid var(--color-border);
          display: flex;
          flex-direction: column;
          padding-top: var(--space-lg);
        }
        .sidebar-brand {
          padding: var(--space-md) var(--space-lg);
          cursor: pointer;
          margin-bottom: var(--space-lg);
        }
        .sidebar-title {
          font-size: var(--text-h1);
          font-weight: var(--weight-extrabold);
          color: var(--color-accent);
          margin: 0;
          letter-spacing: var(--tracking-tight);
        }
        .sidebar-nav {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .sidebar-link {
          display: flex;
          align-items: center;
          gap: var(--space-md);
          padding: var(--space-sm) var(--space-lg);
          background: none;
          border: none;
          color: var(--color-text-muted);
          font-size: var(--text-body);
          font-weight: var(--weight-medium);
          cursor: pointer;
          transition: all 0.2s;
          width: 100%;
          text-align: left;
          border-left: 3px solid transparent;
        }
        .sidebar-link:hover {
          background: rgba(14, 165, 233, 0.05);
          color: var(--color-text);
        }
        .sidebar-link.active {
          background: rgba(14, 165, 233, 0.1);
          color: var(--color-accent);
          border-left-color: var(--color-accent);
        }
      `}</style>
    </aside>
  )
}

function isItemActive(
  path: string,
  tabKey: TabKey | undefined,
  pathname: string,
  activeTab: TabKey | null
): boolean {
  if (path === '/') return pathname === '/'
  if (tabKey && pathname.startsWith('/watch/')) return activeTab === tabKey
  return pathname.startsWith(path)
}
