import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import LoginPage from './pages/LoginPage'

const queryClient = new QueryClient()

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--color-bg-primary)' }}>
        <div className="text-lg" style={{ color: 'var(--color-text-secondary)' }}>Loading...</div>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AppRoutes() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--color-bg-primary)' }}>
        <div className="text-lg" style={{ color: 'var(--color-text-secondary)' }}>Loading...</div>
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route path="/" element={
        <ProtectedRoute>
          <div className="p-8 text-white">Dashboard (coming soon)</div>
        </ProtectedRoute>
      } />
      <Route path="/alerts" element={
        <ProtectedRoute>
          <div className="p-8 text-white">Alerts (coming soon)</div>
        </ProtectedRoute>
      } />
      <Route path="/alerts/:id" element={
        <ProtectedRoute>
          <div className="p-8 text-white">Alert Detail (coming soon)</div>
        </ProtectedRoute>
      } />
      <Route path="/tracking" element={
        <ProtectedRoute>
          <div className="p-8 text-white">Tracking (coming soon)</div>
        </ProtectedRoute>
      } />
      <Route path="/favorites" element={
        <ProtectedRoute>
          <div className="p-8 text-white">Favorites (coming soon)</div>
        </ProtectedRoute>
      } />
      <Route path="/lessons" element={
        <ProtectedRoute>
          <div className="p-8 text-white">Lessons (coming soon)</div>
        </ProtectedRoute>
      } />
      <Route path="/settings" element={
        <ProtectedRoute>
          <div className="p-8 text-white">Settings (coming soon)</div>
        </ProtectedRoute>
      } />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
