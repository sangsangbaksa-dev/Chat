import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { Home } from './pages/Home'
import { Login } from './pages/Login'
import { Settings } from './pages/Settings'
import { Shell } from './pages/Shell'

const Install = lazy(() => import('./pages/Install').then((m) => ({ default: m.Install })))

function Gate() {
  const { user, loading } = useAuth()
  if (loading) return <div className="splash" aria-busy="true">불러오는 중…</div>
  if (!user) return <Login />
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Home />} />
        <Route path="install" element={<Suspense fallback={<div className="splash">불러오는 중…</div>}><Install /></Suspense>} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </BrowserRouter>
  )
}
