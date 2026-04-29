import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import DesktopLayout from './layouts/DesktopLayout'
import { QueryProvider } from './components/QueryProvider'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { CartProvider } from './hooks/useCart'
import Login from './pages/Login'
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
                      <div>logged in</div>
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
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </CartProvider>
        </AuthProvider>
      </HashRouter>
    </QueryProvider>
  )
}

export default App
