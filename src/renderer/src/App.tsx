// HashRouter is used (not BrowserRouter) because the packaged Electron renderer
// loads from file:// in production, which does not support history-API routing.
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import DesktopLayout from './layouts/DesktopLayout'
import { QueryProvider } from './components/QueryProvider'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { CartProvider } from './hooks/useCart'
import Login from './pages/Login'
import Home from './pages/Home'
import CategoryList from './pages/CategoryList'
import CategoryDetail from './pages/CategoryDetail'
import Watch from './pages/Watch'
import MultiWatch from './pages/MultiWatch'
import Stats from './pages/Stats'
import LoadingSpinner from './components/shared/LoadingSpinner'

function ProtectedRoute({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { isAuthenticated, isLoading } = useAuth()
  if (isLoading) return <LoadingSpinner fullScreen />
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
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
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DesktopLayout>
              <Home />
            </DesktopLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/stats"
        element={
          <ProtectedRoute>
            <DesktopLayout>
              <Stats />
            </DesktopLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/watch/:id"
        element={
          <ProtectedRoute>
            <DesktopLayout>
              <Watch />
            </DesktopLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/multi-watch"
        element={
          <ProtectedRoute>
            <MultiWatch />
          </ProtectedRoute>
        }
      />
      <Route
        path="/:category"
        element={
          <ProtectedRoute>
            <DesktopLayout>
              <CategoryList />
            </DesktopLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/:category/:id"
        element={
          <ProtectedRoute>
            <DesktopLayout>
              <CategoryDetail />
            </DesktopLayout>
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
        <AuthProvider>
          <CartProvider>
            <AppRoutes />
          </CartProvider>
        </AuthProvider>
      </HashRouter>
    </QueryProvider>
  )
}

export default App
