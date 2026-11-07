import { useEffect, useState } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { disablePush, enablePush, getPushStatus, sendTestPush, type PushStatus } from '../lib/push'

const LABEL: Record<PushStatus, string> = {
  unsupported: '이 브라우저는 푸시 알림을 지원하지 않아요. iPhone은 홈 화면에 설치한 뒤 다시 열어 주세요.',
  unconfigured: '푸시 키(VAPID)가 아직 설정되지 않았어요.',
  denied: '알림이 차단되어 있어요. 브라우저 설정에서 허용해 주세요.',
  default: '알림이 꺼져 있어요.',
  subscribed: '이 기기에서 알림을 받고 있어요.',
}

export function Settings() {
  const { user } = useAuth()
  const [status, setStatus] = useState<PushStatus | null>(null)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    getPushStatus().then(setStatus)
  }, [])

  async function run(fn: () => Promise<void>) {
    setBusy(true)
    setMsg('')
    try {
      await fn()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
      setStatus(await getPushStatus())
    }
  }

  return (
    <div className="page">
      <h2>알림 · 설정</h2>
      <section className="card">
        <h3>푸시 알림</h3>
        <p data-testid="push-status">{status ? LABEL[status] : '확인 중…'}</p>
        <div className="row">
          {status !== 'subscribed' ? (
            <button className="btn" disabled={busy || !user || status === 'unsupported' || status === 'unconfigured'} onClick={() => run(async () => { await enablePush() })}>
              알림 켜기
            </button>
          ) : (
            <>
              <button className="btn" disabled={busy} onClick={() => run(async () => { const e = await sendTestPush(); setMsg(e ?? '테스트 알림을 보냈어요.') })}>테스트 알림 보내기</button>
              <button className="btn ghost" disabled={busy} onClick={() => run(disablePush)}>알림 끄기</button>
            </>
          )}
        </div>
        {msg && <p className="muted" role="status">{msg}</p>}
      </section>
    </div>
  )
}
