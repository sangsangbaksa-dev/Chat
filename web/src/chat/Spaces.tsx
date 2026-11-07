import { Hash, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Avatar } from '../ui/Avatar'
import { rpcMessage } from './api'
import { useChat } from './ChatContext'

interface SpaceRow {
  id: string
  name: string
  description: string | null
  member_count: number
}

export function Spaces() {
  const { refresh } = useChat()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<SpaceRow[] | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    const t = window.setTimeout(async () => {
      const { data } = await supabase.rpc('browse_spaces', { p_query: q })
      if (alive) setRows((data ?? []) as SpaceRow[])
    }, 180)
    return () => {
      alive = false
      window.clearTimeout(t)
    }
  }, [q])

  async function join(s: SpaceRow) {
    setBusy(s.id)
    setError('')
    const { error: e } = await supabase.rpc('join_space', { p_conversation: s.id })
    if (e) {
      setBusy(null)
      return setError(rpcMessage(e))
    }
    await refresh()
    nav(`/c/${s.id}`)
  }

  return (
    <div className="page">
      <h1>스페이스 찾기</h1>
      <p className="sub">누구나 들어올 수 있게 열려 있는 스페이스예요.</p>
      <div className="search wide">
        <Search size={16} />
        <input type="search" placeholder="스페이스 이름으로 찾기" value={q} onChange={(e) => setQ(e.target.value)} aria-label="스페이스 찾기" />
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <ul className="space-list" aria-busy={rows === null}>
        {rows && rows.length === 0 && <li className="list-empty">{q ? '찾는 스페이스가 없어요.' : <>참여할 수 있는 스페이스가 아직 없어요.<br />새 채팅에서 스페이스를 만들어 보세요.</>}</li>}
        {rows?.map((s) => (
          <li key={s.id} className="space-row">
            <Avatar name={s.name} seed={s.id} size={42} square />
            <div>
              <b><Hash size={14} />{s.name}</b>
              <small>{s.description ?? `멤버 ${s.member_count}명`}</small>
            </div>
            <button className="btn sm" disabled={busy === s.id} onClick={() => void join(s)}>참여</button>
          </li>
        ))}
      </ul>
    </div>
  )
}
