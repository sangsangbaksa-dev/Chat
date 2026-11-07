import { Bell, BellOff, LogOut, Smartphone } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { useChat } from '../chat/ChatContext'
import { disablePush, enablePush, getPushStatus, sendTestPush, type PushStatus } from '../lib/push'
import { supabase } from '../lib/supabase'
import { Avatar } from '../ui/Avatar'

const LABEL: Record<PushStatus, string> = {
  unsupported: '이 브라우저에서는 알림을 쓸 수 없어요. iPhone은 홈 화면에 설치한 뒤 앱으로 열어 주세요.',
  unconfigured: '알림 키가 아직 설정되지 않았어요.',
  denied: '알림이 차단되어 있어요. 브라우저 설정에서 허용해 주세요.',
  default: '이 기기에서는 알림이 꺼져 있어요.',
  subscribed: '이 기기에서 알림을 받고 있어요.',
}

export function Settings() {
  const { user, signOut } = useAuth()
  const { profiles, loadProfiles } = useChat()
  const me = user!.id
  const current = profiles[me]?.display_name ?? ''
  const [name, setName] = useState(current)
  const [nameMsg, setNameMsg] = useState('')
  const [status, setStatus] = useState<PushStatus | null>(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => setName(current), [current])
  useEffect(() => {
    void getPushStatus().then(setStatus)
  }, [])

  async function saveName() {
    const v = name.trim()
    if (!v || v === current) return
    const { error } = await supabase.from('profiles').update({ display_name: v }).eq('id', me)
    if (error) return setNameMsg('저장하지 못했어요. 1~40자로 입력해 주세요.')
    setNameMsg('저장했어요.')
    await loadProfiles([me], true)
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setMsg('')
    try {
      await fn()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : '문제가 생겼어요.')
    } finally {
      setBusy(false)
      setStatus(await getPushStatus())
    }
  }

  return (
    <div className="page">
      <h1>설정</h1>

      <section className="panel">
        <h2>내 프로필</h2>
        <div className="profile-row">
          <Avatar name={current || user!.email || '?'} seed={me} size={52} />
          <div>
            <b>{current}</b>
            <small>{user!.email}</small>
          </div>
        </div>
        <label htmlFor="dn">표시 이름</label>
        <div className="inline">
          <input id="dn" value={name} maxLength={40} onChange={(e) => { setName(e.target.value); setNameMsg('') }} />
          <button className="btn primary" disabled={!name.trim() || name.trim() === current} onClick={() => void saveName()}>저장</button>
        </div>
        {nameMsg && <p className="hint" role="status">{nameMsg}</p>}
      </section>

      <section className="panel">
        <h2>알림</h2>
        <p data-testid="push-status">{status ? LABEL[status] : '확인 중…'}</p>
        <div className="row">
          {status !== 'subscribed' ? (
            <button className="btn primary" disabled={busy || status === 'unsupported' || status === 'unconfigured' || status === 'denied'} onClick={() => void run(async () => { await enablePush() })}>
              <Bell size={16} /> 알림 켜기
            </button>
          ) : (
            <>
              <button className="btn" disabled={busy} onClick={() => void run(async () => { const e = await sendTestPush(); setMsg(e ?? '테스트 알림을 보냈어요.') })}>테스트 알림</button>
              <button className="btn ghost" disabled={busy} onClick={() => void run(disablePush)}><BellOff size={16} /> 끄기</button>
            </>
          )}
        </div>
        {msg && <p className="hint" role="status">{msg}</p>}
      </section>

      <section className="panel">
        <h2>휴대폰에 설치</h2>
        <p>홈 화면에 추가하면 앱처럼 열리고 알림도 받을 수 있어요.</p>
        <Link className="btn" to="/install"><Smartphone size={16} /> QR로 설치하기</Link>
      </section>

      <section className="panel">
        <h2>계정</h2>
        <p>{user!.email}</p>
        <button className="btn danger-outline" onClick={() => void signOut()}><LogOut size={16} /> 로그아웃</button>
      </section>
    </div>
  )
}
