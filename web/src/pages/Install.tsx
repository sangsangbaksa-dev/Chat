import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import { usePwaInstall } from '../lib/usePwaInstall'

export function Install() {
  const { installed, isIOS, canPrompt, install } = usePwaInstall()
  const [qr, setQr] = useState('')
  const url = window.location.origin

  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: 240, color: { dark: '#004d40', light: '#ffffff' } }).then(setQr)
  }, [url])

  return (
    <div className="page">
      <h2>휴대폰에 설치하기</h2>
      {installed && <p className="ok">✅ 이미 앱으로 설치되어 실행 중이에요.</p>}
      <section className="card qr">
        {qr && <img src={qr} width={240} height={240} alt="왈도쳇 설치 QR 코드" />}
        <div>
          <p>휴대폰 카메라로 QR을 스캔해 <b>{url.replace(/^https?:\/\//, '')}</b> 를 열어 주세요.</p>
          <ol>
            <li><b>안드로이드(Chrome)</b>: 메뉴 ⋮ → <i>앱 설치</i> 또는 <i>홈 화면에 추가</i></li>
            <li><b>iPhone(Safari)</b>: 공유 □↑ → <i>홈 화면에 추가</i> (알림은 설치 후에만 와요, iOS 16.4+)</li>
          </ol>
          {canPrompt && <button className="btn" onClick={install}>이 기기에 설치</button>}
          {isIOS && !installed && <p className="muted">iPhone은 Safari의 공유 메뉴에서 직접 추가해야 해요.</p>}
        </div>
      </section>
    </div>
  )
}
