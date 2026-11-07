import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '../components/Logo'
import { usePwaInstall } from '../lib/usePwaInstall'

export function Install() {
  const { installed, isIOS, canPrompt, install } = usePwaInstall()
  const [qr, setQr] = useState('')
  const url = window.location.origin

  useEffect(() => {
    void QRCode.toDataURL(url, { margin: 1, width: 280, color: { dark: '#14352c', light: '#ffffff' } }).then(setQr)
  }, [url])

  return (
    <main className="install">
      <Link to="/" className="login-brand"><Logo size={36} /><span>왈도쳇</span></Link>
      <h1>휴대폰에 설치하기</h1>
      {installed && <p className="ok">이미 앱으로 설치되어 실행 중이에요.</p>}
      <div className="install-grid">
        <div className="qr">{qr ? <img src={qr} width={220} height={220} alt="왈도쳇 설치 QR 코드" /> : <span className="qr-ph" />}</div>
        <div>
          <p className="sub">휴대폰 카메라로 QR을 비추면 <b>{url.replace(/^https?:\/\//, '')}</b> 이 열려요.</p>
          <ol className="steps">
            <li><b>안드로이드 (Chrome)</b><span>메뉴 ⋮ → 앱 설치 또는 홈 화면에 추가</span></li>
            <li><b>iPhone (Safari)</b><span>공유 버튼 → 홈 화면에 추가. 알림은 설치한 앱에서만 와요 (iOS 16.4 이상).</span></li>
          </ol>
          {canPrompt && <button className="btn primary" onClick={() => void install()}>이 기기에 설치</button>}
          {isIOS && !installed && <p className="hint">iPhone은 Safari 공유 메뉴에서 직접 추가해야 해요.</p>}
        </div>
      </div>
    </main>
  )
}
