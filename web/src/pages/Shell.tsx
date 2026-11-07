import { useEffect, useState } from 'react'
import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { Logo } from '../components/Logo'
import { supabase } from '../lib/supabase'

interface Profile {
  display_name: string
  avatar_url: string | null
}

export function Shell() {
  const { user, signOut } = useAuth()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [menu, setMenu] = useState(false)

  useEffect(() => {
    if (!user) return
    supabase
      .from('profiles')
      .select('display_name, avatar_url')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => setProfile(data))
  }, [user])

  const name = profile?.display_name ?? user?.email ?? ''

  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="brand"><Logo size={28} /> <span>왈도쳇</span></Link>
        <div className="search" role="search"><input placeholder="채팅 검색 (준비 중)" disabled aria-label="검색" /></div>
        <div className="me">
          <button className="avatar" onClick={() => setMenu((v) => !v)} aria-label="내 계정" aria-expanded={menu}>
            {profile?.avatar_url ? <img src={profile.avatar_url} alt="" referrerPolicy="no-referrer" /> : name.slice(0, 1).toUpperCase()}
          </button>
          {menu && (
            <div className="menu" role="menu">
              <div className="menu-name">{name}</div>
              <div className="menu-mail">{user?.email}</div>
              <Link role="menuitem" to="/settings" onClick={() => setMenu(false)}>알림 · 설정</Link>
              <Link role="menuitem" to="/install" onClick={() => setMenu(false)}>앱 설치 / QR</Link>
              <button role="menuitem" onClick={() => signOut()}>로그아웃</button>
            </div>
          )}
        </div>
      </header>
      <div className="body">
        <aside className="sidebar">
          <button className="new-chat" disabled>＋ 새 채팅</button>
          <nav>
            <div className="side-title">채팅</div>
            <div className="side-empty">아직 대화가 없어요</div>
            <div className="side-title">스페이스</div>
            <div className="side-empty">아직 스페이스가 없어요</div>
          </nav>
        </aside>
        <main className="main"><Outlet /></main>
      </div>
    </div>
  )
}
