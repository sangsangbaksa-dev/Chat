import { Check, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'
import type { Profile } from '../lib/types'
import { Avatar } from '../ui/Avatar'
import { Dialog } from '../ui/Dialog'
import { rpcMessage } from './api'
import { useChat } from './ChatContext'

type Mode = 'dm' | 'group' | 'space'

export async function searchPeople(q: string, me: string): Promise<Profile[]> {
  const term = q.trim().replace(/[%_\\]/g, (m) => '\\' + m)
  let req = supabase.from('profiles').select('id, display_name, avatar_url').neq('id', me).order('display_name').limit(30)
  if (term) req = req.ilike('display_name', `%${term}%`)
  const { data } = await req
  return (data ?? []) as Profile[]
}

export function PeoplePicker({ me, multi, picked, onToggle, exclude }: {
  me: string; multi: boolean; picked: Profile[]; onToggle: (p: Profile) => void; exclude?: string[]
}) {
  const [q, setQ] = useState('')
  const [people, setPeople] = useState<Profile[] | null>(null)
  useEffect(() => {
    let alive = true
    const t = window.setTimeout(() => searchPeople(q, me).then((r) => alive && setPeople(r)), 180)
    return () => {
      alive = false
      window.clearTimeout(t)
    }
  }, [q, me])
  const shown = (people ?? []).filter((p) => !exclude?.includes(p.id))
  return (
    <>
      <div className="search in-dialog">
        <Search size={16} />
        <input placeholder="이름으로 찾기" value={q} onChange={(e) => setQ(e.target.value)} aria-label="이름으로 찾기" />
      </div>
      <ul className="people" aria-busy={people === null}>
        {people && shown.length === 0 && <li className="list-empty">{q ? '찾는 사람이 없어요.' : '아직 다른 사용자가 없어요.'}</li>}
        {shown.map((p) => {
          const on = picked.some((x) => x.id === p.id)
          return (
            <li key={p.id}>
              <button type="button" className={'person' + (on ? ' on' : '')} onClick={() => onToggle(p)} aria-pressed={multi ? on : undefined}>
                <Avatar name={p.display_name} seed={p.id} size={34} />
                <span>{p.display_name}</span>
                {multi && on && <Check size={16} />}
              </button>
            </li>
          )
        })}
      </ul>
    </>
  )
}

export function NewChat({ onClose }: { onClose: () => void }) {
  const { user } = useAuth()
  const { refresh, loadProfiles } = useChat()
  const nav = useNavigate()
  const [mode, setMode] = useState<Mode>('dm')
  const [picked, setPicked] = useState<Profile[]>([])
  const [name, setName] = useState('')
  const [isPublic, setPublic] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const me = user!.id

  const toggle = (p: Profile) => setPicked((cur) => (cur.some((x) => x.id === p.id) ? cur.filter((x) => x.id !== p.id) : [...cur, p]))

  async function startDm(p: Profile) {
    setBusy(true)
    const { data, error: e } = await supabase.rpc('create_dm', { p_other: p.id })
    setBusy(false)
    if (e) return setError(rpcMessage(e))
    await loadProfiles([p.id])
    await refresh()
    onClose()
    nav(`/c/${data}`)
  }

  async function create() {
    setBusy(true)
    setError('')
    const { data, error: e } = await supabase.rpc('create_conversation', {
      p_type: mode,
      p_name: name,
      p_member_ids: picked.map((p) => p.id),
      p_is_public: mode === 'space' ? isPublic : false,
      p_description: null,
    })
    setBusy(false)
    if (e) return setError(rpcMessage(e))
    await refresh()
    onClose()
    nav(`/c/${data}`)
  }

  const needName = mode === 'space'
  const ready = mode === 'group' ? picked.length > 0 : mode === 'space' ? name.trim().length > 0 : false

  return (
    <Dialog title="새 채팅" onClose={onClose}>
      <div className="seg" role="tablist">
        {([['dm', '1:1'], ['group', '그룹'], ['space', '스페이스']] as const).map(([m, label]) => (
          <button key={m} role="tab" aria-selected={mode === m} className={mode === m ? 'on' : ''} onClick={() => { setMode(m); setPicked([]); setError('') }}>{label}</button>
        ))}
      </div>
      {mode === 'space' && (
        <div className="field">
          <label htmlFor="sp-name">스페이스 이름</label>
          <input id="sp-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="예: 점심 메뉴 회의" />
          <label className="check">
            <input type="checkbox" checked={isPublic} onChange={(e) => setPublic(e.target.checked)} />
            <span>누구나 찾아서 들어올 수 있어요</span>
          </label>
        </div>
      )}
      {mode === 'group' && (
        <div className="field">
          <label htmlFor="g-name">그룹 이름 <small>(선택)</small></label>
          <input id="g-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="비워 두면 참여자 이름으로 표시돼요" />
        </div>
      )}
      <p className="hint">{mode === 'dm' ? '대화할 사람을 고르세요.' : mode === 'group' ? '함께할 사람을 고르세요.' : '나중에 사람을 초대할 수도 있어요. 지금 초대하려면 고르세요.'}</p>
      <PeoplePicker me={me} multi={mode !== 'dm'} picked={picked} onToggle={mode === 'dm' ? (p) => void startDm(p) : toggle} />
      {error && <p className="error" role="alert">{error}</p>}
      {mode !== 'dm' && (
        <footer>
          <button className="btn ghost" onClick={onClose}>취소</button>
          <button className="btn primary" disabled={busy || !ready || (needName && !name.trim())} onClick={() => void create()}>
            {busy ? '만드는 중…' : mode === 'group' ? `그룹 만들기${picked.length ? ` (${picked.length})` : ''}` : '스페이스 만들기'}
          </button>
        </footer>
      )}
    </Dialog>
  )
}
