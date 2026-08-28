// HashRouter is used (not BrowserRouter) because the packaged Electron renderer
// loads from file:// in production, which does not support history-API routing.
import { useState } from 'react'
import { HashRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom'
import DesktopLayout from './layouts/DesktopLayout'
import { QueryProvider } from './components/QueryProvider'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { CartProvider } from './hooks/useCart'
import { TabHistoryProvider } from './hooks/useTabHistory'
import { ChatProvider } from '@swaff-y/thunder-chat-core'
import { useChatBridge } from './hooks/useChatBridge'
import {
  createViewSource,
  useViewTracking,
  type TrackedViewSource
} from './components/chat/current-view'
import { DownloadsProvider } from './browser/useDownloads'
import Login from './pages/Login'
import Home from './pages/Home'
import CategoryList from './pages/CategoryList'
import CategoryDetail from './pages/CategoryDetail'
import MultiWatch from './pages/MultiWatch'
import Stats from './pages/Stats'
import LoadingSpinner from './components/shared/LoadingSpinner'

// TD-070: reads the route and writes it into the source, and renders
// nothing. `useLocation` re-renders whoever calls it on every navigation,
// so it is called here — a childless leaf — rather than in
// `ChatBridgeProvider`, which would re-render the whole app instead.
function CurrentViewTracker({ source }: { source: TrackedViewSource }): null {
  useViewTracking(source)
  return null
}

// TD-056: the store takes `send` as a prop so it stays testable without IPC;
// this is the one place the real bridge is attached.
function ChatBridgeProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { send, loadCapabilities, cancelRequest, clearRequest } = useChatBridge()
  // TD-070: one source for the life of the app — the store reads it once
  // per ask, so it must not be rebuilt on every render.
  const [viewSource] = useState(createViewSource)
  return (
    <ChatProvider
      send={send}
      loadCapabilities={loadCapabilities}
      cancelRequest={cancelRequest}
      clearRequest={clearRequest}
      storage={sessionStorage}
      viewSource={viewSource}
    >
      <CurrentViewTracker source={viewSource} />
      {children}
    </ChatProvider>
  )
}

function ProtectedRoute({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { isAuthenticated, isLoading } = useAuth()
  if (isLoading) return <LoadingSpinner fullScreen />
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

// TD-035: a single shared DesktopLayout across protected routes keeps
// the persistent <BrowserPage> mounted on tab switches, which is what
// preserves the embedded webview's URL, history, and DOM state.
function ProtectedDesktopOutlet(): React.JSX.Element {
  return (
    <ProtectedRoute>
      <DesktopLayout>
        <Outlet />
      </DesktopLayout>
    </ProtectedRoute>
  )
}

function AppRoutes(): React.JSX.Element {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <DesktopLayout>
            <Login />
          </DesktopLayout>
        }
      />
      <Route element={<ProtectedDesktopOutlet />}>
        <Route path="/" element={<Home />} />
        <Route path="/stats" element={<Stats />} />
        {/* TD-035: BrowserPage is rendered persistently in DesktopLayout;
            the route exists only so /browser links and sidebar match. */}
        <Route path="/browser" element={null} />
        {/* TD-038 follow-up: Watch is rendered persistently in DesktopLayout
            so the <video> element survives tab switches; the route exists
            only so /watch links match the protected outlet. */}
        <Route path="/watch/:id" element={null} />
        <Route path="/:category" element={<CategoryList />} />
        <Route path="/:category/:id" element={<CategoryDetail />} />
      </Route>
      <Route
        path="/multi-watch"
        element={
          <ProtectedRoute>
            <MultiWatch />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function App(): React.JSX.Element {
  return (
    <QueryProvider>
      <HashRouter>
        <TabHistoryProvider>
          <ChatBridgeProvider>
            <AuthProvider>
              <CartProvider>
                <DownloadsProvider>
                  <AppRoutes />
                </DownloadsProvider>
              </CartProvider>
            </AuthProvider>
          </ChatBridgeProvider>
        </TabHistoryProvider>
      </HashRouter>
    </QueryProvider>
  )
}

export default App
