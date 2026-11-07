import { useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { Logo } from '../components/Logo'
import { isConfigured } from '../lib/supabase'

// 가입 트리거(중복/일회용 메일)가 막으면 Supabase는 일반 문구만 돌려준다.
function readAuthError(): string | null {
  const params = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const desc = params.get('error_description') ?? hash.get('error_description')
  if (!desc && !params.get('error') && !hash.get('error')) return null
  if (/database error saving new user/i.test(desc ?? '')) {
    return '이 이메일로는 가입할 수 없어요. 같은 Gmail 계정이 이미 등록되어 있거나(점·+별칭 포함) 일회용 메일일 수 있어요.'
  }
  return desc ?? '로그인에 실패했어요. 다시 시도해 주세요.'
}

export function Login() {
  const { signInWithGoogle } = useAuth()
  const [err, setErr] = useState<string | null>(() => {
    const e = readAuthError()
    if (e) window.history.replaceState(null, '', window.location.pathname)
    return e
  })
  const [busy, setBusy] = useState(false)

  async function go() {
    setBusy(true)
    setErr(null)
    const e = await signInWithGoogle()
    if (e) {
      setErr(e)
      setBusy(false)
    }
  }

  return (
    <main className="login">
      <div className="login-card">
        <Logo size={64} />
        <h1>왈도쳇</h1>
        <p className="muted">Google 계정으로 로그인하면 바로 시작할 수 있어요.</p>
        {!isConfigured && (
          <p className="notice" role="alert">
            Supabase 설정이 없습니다. <code>VITE_SUPABASE_URL</code>, <code>VITE_SUPABASE_ANON_KEY</code>를 설정하세요.
          </p>
        )}
        <button className="google-btn" onClick={go} disabled={busy || !isConfigured}>
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.3 5.7c4.3-4 6.8-9.9 6.8-17.1z"/>
            <path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z"/>
            <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.3-5.7c-2 1.4-4.6 2.3-8.6 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/>
          </svg>
          {busy ? '이동 중…' : 'Google로 계속하기'}
        </button>
        {err && <p className="error" role="alert">{err}</p>}
        <p className="fine">로그인하면 Google 계정의 이메일로 본인이 확인됩니다. 한 계정당 하나의 프로필만 만들어져요.</p>
      </div>
    </main>
  )
}
