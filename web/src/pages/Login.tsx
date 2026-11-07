import { ArrowLeft } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { Logo } from '../components/Logo'
import { isConfigured } from '../lib/supabase'

const COOLDOWN = 45

export function Login() {
  const { sendCode, verifyCode } = useAuth()
  const [email, setEmail] = useState('')
  const [sentTo, setSentTo] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [wait, setWait] = useState(0)
  const codeRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (wait <= 0) return
    const t = window.setTimeout(() => setWait((w) => w - 1), 1000)
    return () => window.clearTimeout(t)
  }, [wait])

  useEffect(() => {
    if (sentTo) codeRef.current?.focus()
  }, [sentTo])

  async function send(e?: FormEvent) {
    e?.preventDefault()
    const addr = (sentTo || email).trim()
    if (!/^\S+@\S+\.\S+$/.test(addr)) return setError('메일 주소 형식을 확인해 주세요.')
    setBusy(true)
    setError('')
    const err = await sendCode(addr)
    setBusy(false)
    if (err) return setError(err)
    setSentTo(addr)
    setCode('')
    setWait(COOLDOWN)
  }

  async function verify(e?: FormEvent) {
    e?.preventDefault()
    if (code.length < 6) return setError('메일로 받은 숫자 코드를 모두 입력해 주세요.')
    setBusy(true)
    setError('')
    const err = await verifyCode(sentTo, code)
    setBusy(false)
    if (err) setError(err)
  }

  return (
    <main className="login">
      <div className="login-card">
        <div className="login-brand">
          <Logo size={44} />
          <span>왈도쳇</span>
        </div>
        {!isConfigured ? (
          <p className="notice">서버 설정이 아직 연결되지 않았어요.</p>
        ) : !sentTo ? (
          <form onSubmit={send} noValidate>
            <h1>메일로 시작하기</h1>
            <p className="sub">메일로 받은 6자리 코드를 입력하면 바로 들어올 수 있어요. 비밀번호는 없어요.</p>
            <label htmlFor="email">메일 주소</label>
            <input id="email" type="email" inputMode="email" autoComplete="email" autoFocus placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            {error && <p className="error" role="alert">{error}</p>}
            <button className="btn primary block" disabled={busy || !email}>{busy ? '보내는 중…' : '코드 받기'}</button>
            <p className="fine">한 사람이 계정을 여러 개 만들지 못하도록 메일 인증을 해요. 일회용 메일은 쓸 수 없어요.</p>
          </form>
        ) : (
          <form onSubmit={verify} noValidate>
            <button type="button" className="link-back" onClick={() => { setSentTo(''); setError('') }}>
              <ArrowLeft size={15} /> 다른 메일 쓰기
            </button>
            <h1>코드를 입력해 주세요</h1>
            <p className="sub"><b>{sentTo}</b> 로 6자리 코드를 보냈어요. 메일이 안 보이면 스팸함도 확인해 주세요.</p>
            <label htmlFor="code">인증 코드</label>
            <input id="code" ref={codeRef} className="code" inputMode="numeric" autoComplete="one-time-code" maxLength={10} placeholder="000000" value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
            {error && <p className="error" role="alert">{error}</p>}
            <button className="btn primary block" disabled={busy || code.length < 6}>{busy ? '확인 중…' : '들어가기'}</button>
            <button type="button" className="btn ghost block" disabled={busy || wait > 0} onClick={() => void send()}>
              {wait > 0 ? `${wait}초 뒤에 다시 받기` : '코드 다시 받기'}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
