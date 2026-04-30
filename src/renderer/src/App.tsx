import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import DesktopLayout from './layouts/DesktopLayout'
import { QueryProvider } from './components/QueryProvider'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { CartProvider } from './hooks/useCart'
import Login from './pages/Login'
import Home from './pages/Home'
import CategoryList from './pages/CategoryList'
import ComponentGallery from './pages/dev/ComponentGallery'

function ProtectedRoute({ children }: { children: React.ReactNode }): React.JSX.Element {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

function App(): React.JSX.Element {
  return (
    <QueryProvider>
      <HashRouter>
        <AuthProvider>
          <CartProvider>
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
                path="/dev/components"
                element={
                  <DesktopLayout>
                    <ComponentGallery />
                  </DesktopLayout>
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
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </CartProvider>
        </AuthProvider>
      </HashRouter>
    </QueryProvider>
  )
}

export default App
