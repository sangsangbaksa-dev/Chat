import { Compass, MessageSquare, Settings as Cog } from 'lucide-react'
import { useEffect } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { ChatProvider, useChat } from '../chat/ChatContext'
import { ConversationList } from '../chat/ConversationList'
import { Avatar } from '../ui/Avatar'
import { useAuth } from '../auth/AuthProvider'

function Nav({ vertical }: { vertical?: boolean }) {
  const { totalUnread } = useChat()
  const items = [
    { to: '/', end: true, label: '채팅', icon: <MessageSquare size={20} />, badge: totalUnread },
    { to: '/spaces', end: false, label: '스페이스', icon: <Compass size={20} />, badge: 0 },
    { to: '/settings', end: false, label: '설정', icon: <Cog size={20} />, badge: 0 },
  ]
  return (
    <nav className={vertical ? 'rail-nav' : 'tabbar'} aria-label="주 메뉴">
      {items.map((i) => (
        <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => 'nav-item' + (isActive || (i.to === '/' && location.pathname.startsWith('/c/')) ? ' on' : '')}>
          <span className="nav-ico">
            {i.icon}
            {i.badge > 0 && <i className="dot">{i.badge > 99 ? '99+' : i.badge}</i>}
          </span>
          <span className="nav-label">{i.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

function Toasts() {
  const { toasts, dismissToast } = useChat()
  const nav = useNavigate()
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <button key={t.id} className="toast" onClick={() => { dismissToast(t.id); nav(t.to) }}>
          <b>{t.title}</b>
          <span>{t.body}</span>
        </button>
      ))}
    </div>
  )
}

function Frame() {
  const { pathname } = useLocation()
  const { user } = useAuth()
  const { profiles, connected } = useChat()
  const nav = useNavigate()
  const inChat = pathname.startsWith('/c/')
  const view = pathname === '/' ? 'list' : 'main'
  const meName = profiles[user!.id]?.display_name ?? user!.email ?? ''

  // 서비스워커 알림 클릭이 열어 주는 경로를 따라간다.
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === 'navigate' && typeof e.data.url === 'string') nav(e.data.url)
    }
    navigator.serviceWorker?.addEventListener('message', onMsg)
    return () => navigator.serviceWorker?.removeEventListener('message', onMsg)
  }, [nav])

  return (
    <div className="app" data-view={view} data-chat={inChat}>
      <aside className="rail">
        <div className="rail-logo"><Logo size={34} /></div>
        <Nav vertical />
        <div className="rail-me" title={meName}><Avatar name={meName} seed={user!.id} size={34} /></div>
      </aside>
      <section className="pane-list" aria-label="대화 목록">
        {!connected && <div className="offline" role="status">연결이 끊겼어요. 다시 연결하는 중…</div>}
        <ConversationList />
      </section>
      <section className="pane-main">
        <Outlet />
      </section>
      <Nav />
      <Toasts />
    </div>
  )
}

export function Shell() {
  return (
    <ChatProvider>
      <Frame />
    </ChatProvider>
  )
}
