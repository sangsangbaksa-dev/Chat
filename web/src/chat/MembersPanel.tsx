import { LogOut, UserPlus } from 'lucide-react'
import { useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Conversation, Profile } from '../lib/types'
import { Avatar } from '../ui/Avatar'
import { Dialog } from '../ui/Dialog'
import { PeoplePicker } from './NewChat'

export interface Member {
  user_id: string
  role: 'owner' | 'member'
  last_read_at: string
}

export function MembersPanel({ conv, me, members, profiles, onClose, onChanged, onLeft, onError }: {
  conv: Conversation
  me: string
  members: Member[]
  profiles: Record<string, Profile>
  onClose: () => void
  onChanged: () => void
  onLeft: () => void
  onError: (e: { message?: string } | null) => void
}) {
  const [adding, setAdding] = useState(false)
  const [picked, setPicked] = useState<Profile[]>([])
  const [busy, setBusy] = useState(false)

  async function add() {
    setBusy(true)
    const { error } = await supabase.rpc('add_members', { p_conversation: conv.id, p_user_ids: picked.map((p) => p.id) })
    setBusy(false)
    if (error) return onError(error)
    setPicked([])
    setAdding(false)
    onChanged()
  }

  async function leave() {
    if (!window.confirm(`'${conv.title}'에서 나갈까요?`)) return
    const { error } = await supabase.from('conversation_members').delete().eq('conversation_id', conv.id).eq('user_id', me)
    if (error) return onError(error)
    onLeft()
  }

  return (
    <Dialog title={adding ? '멤버 초대' : `멤버 ${members.length}명`} onClose={onClose}>
      {adding ? (
        <>
          <PeoplePicker me={me} multi picked={picked} exclude={members.map((m) => m.user_id)} onToggle={(p) => setPicked((c) => (c.some((x) => x.id === p.id) ? c.filter((x) => x.id !== p.id) : [...c, p]))} />
          <footer>
            <button className="btn ghost" onClick={() => { setAdding(false); setPicked([]) }}>뒤로</button>
            <button className="btn primary" disabled={busy || picked.length === 0} onClick={() => void add()}>초대하기{picked.length ? ` (${picked.length})` : ''}</button>
          </footer>
        </>
      ) : (
        <>
          <ul className="people">
            {members.map((m) => {
              const name = profiles[m.user_id]?.display_name ?? '…'
              return (
                <li key={m.user_id} className="person static">
                  <Avatar name={name} seed={m.user_id} size={34} />
                  <span>{name}{m.user_id === me && ' (나)'}</span>
                  {m.role === 'owner' && <em>만든 사람</em>}
                </li>
              )
            })}
          </ul>
          <footer className="split">
            <button className="btn ghost danger" onClick={() => void leave()}><LogOut size={15} /> 나가기</button>
            <button className="btn primary" onClick={() => setAdding(true)}><UserPlus size={15} /> 초대</button>
          </footer>
        </>
      )}
    </Dialog>
  )
}
