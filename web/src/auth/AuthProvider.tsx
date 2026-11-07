import type { Session, User } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { isConfigured, supabase } from '../lib/supabase'

interface AuthState {
  session: Session | null
  user: User | null
  loading: boolean
  sendCode: (email: string) => Promise<string | null>
  verifyCode: (email: string, code: string) => Promise<string | null>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function readAuthError(raw: string): string {
  const m = raw.toLowerCase()
  if (m.includes('database error saving new user') || m.includes('email_already_registered'))
    return '이미 가입된 메일이거나 사용할 수 없는 메일이에요. 일회용 메일은 쓸 수 없고, Gmail의 점(.)이나 +별칭만 다른 주소는 같은 계정으로 봐요.'
  if (m.includes('rate limit') || m.includes('too many') || m.includes('security purposes'))
    return '요청이 너무 잦아요. 잠시 뒤에 다시 시도해 주세요.'
  if (m.includes('expired') || m.includes('invalid') || m.includes('otp'))
    return '코드가 맞지 않거나 만료됐어요. 새 코드를 받아 다시 입력해 주세요.'
  if (m.includes('valid email') || m.includes('invalid format'))
    return '메일 주소 형식을 확인해 주세요.'
  if (m.includes('failed to fetch') || m.includes('network'))
    return '네트워크에 연결할 수 없어요.'
  return '문제가 생겼어요. 잠시 뒤에 다시 시도해 주세요.'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(isConfigured)

  useEffect(() => {
    if (!isConfigured) return
    let alive = true
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      setSession(data.session)
      setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [])

  const value: AuthState = {
    session,
    user: session?.user ?? null,
    loading,
    async sendCode(email) {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true, emailRedirectTo: window.location.origin },
      })
      return error ? readAuthError(error.message) : null
    },
    async verifyCode(email, code) {
      const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' })
      return error ? readAuthError(error.message) : null
    },
    async signOut() {
      await supabase.auth.signOut()
    },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth must be used inside AuthProvider')
  return v
}
