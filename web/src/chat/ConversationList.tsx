import { Hash, Lock, Pencil, Search, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { formatListTime } from '../lib/format'
import { Avatar } from '../ui/Avatar'
import { useChat } from './ChatContext'
import { NewChat } from './NewChat'

export function ConversationList() {
  const { conversations, loaded } = useChat()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const list = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? conversations.filter((c) => c.title.toLowerCase().includes(s)) : conversations
  }, [conversations, q])

  return (
    <>
      <header className="list-head">
        <h1>채팅</h1>
        <button className="btn primary sm" onClick={() => setOpen(true)}><Pencil size={15} /> 새 채팅</button>
      </header>
      <div className="search">
        <Search size={16} />
        <input type="search" placeholder="대화 찾기" value={q} onChange={(e) => setQ(e.target.value)} aria-label="대화 찾기" />
      </div>
      <ul className="convs" aria-busy={!loaded}>
        {!loaded && [0, 1, 2, 3].map((i) => <li key={i} className="conv skeleton"><span /><div><i /><i /></div></li>)}
        {loaded && list.length === 0 && (
          <li className="list-empty">
            {q ? '찾는 대화가 없어요.' : <>아직 대화가 없어요.<br />새 채팅으로 첫 대화를 시작해 보세요.</>}
          </li>
        )}
        {list.map((c) => (
          <li key={c.id}>
            <NavLink to={`/c/${c.id}`} className={({ isActive }) => 'conv' + (isActive ? ' on' : '') + (c.unread_count > 0 ? ' unread' : '')}>
              <Avatar name={c.title} seed={c.id} size={42} square={c.type !== 'dm'} />
              <div className="conv-body">
                <div className="conv-top">
                  <span className="conv-title">
                    {c.type === 'space' && (c.is_public ? <Hash size={14} /> : <Lock size={13} />)}
                    {c.type === 'group' && <Users size={14} />}
                    {c.title}
                  </span>
                  <time>{formatListTime(c.last_message_at)}</time>
                </div>
                <div className="conv-bot">
                  <span className="conv-preview">{c.last_message_preview ?? '새 대화'}</span>
                  {c.unread_count > 0 && <b className="count">{c.unread_count > 99 ? '99+' : c.unread_count}</b>}
                </div>
              </div>
            </NavLink>
          </li>
        ))}
      </ul>
      {open && <NewChat onClose={() => setOpen(false)} />}
    </>
  )
}
