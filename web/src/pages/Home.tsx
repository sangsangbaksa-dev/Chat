import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'

export function Home() {
  const { user } = useAuth()
  const first = (user?.user_metadata?.full_name as string | undefined)?.split(' ')[0] ?? ''
  return (
    <div className="empty">
      <div className="empty-art" aria-hidden="true">💬</div>
      <h2>{first ? `${first}님, 환영해요!` : '환영해요!'}</h2>
      <p className="muted">대화 기능은 곧 열려요. 먼저 휴대폰에 설치하고 알림을 켜 두세요.</p>
      <div className="row">
        <Link className="btn" to="/install">휴대폰에 설치 (QR)</Link>
        <Link className="btn ghost" to="/settings">알림 켜기</Link>
      </div>
    </div>
  )
}
