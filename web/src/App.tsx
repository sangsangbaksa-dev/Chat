import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthProvider'
import { ChatView } from './chat/ChatView'
import { Spaces } from './chat/Spaces'
import { Home } from './pages/Home'
import { Login } from './pages/Login'
import { Settings } from './pages/Settings'
import { Shell } from './pages/Shell'

const Install = lazy(() => import('./pages/Install').then((m) => ({ default: m.Install })))

function Gate() {
  const { user, loading } = useAuth()
  return (
    <Routes>
      <Route path="install" element={<Suspense fallback={<div className="splash" />}><Install /></Suspense>} />
      <Route
        path="*"
        element={
          loading ? <div className="splash" aria-busy="true" /> : !user ? <Login /> : (
            <Routes>
              <Route element={<Shell />}>
                <Route index element={<Home />} />
                <Route path="c/:id" element={<ChatView />} />
                <Route path="spaces" element={<Spaces />} />
                <Route path="settings" element={<Settings />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          )
        }
      />
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
