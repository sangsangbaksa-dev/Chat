import { ImagePlus, SendHorizonal, X } from 'lucide-react'
import { useEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'
import { ALLOWED } from './api'

const drafts = new Map<string, string>()

export interface Outgoing {
  body: string
  file: File | null
}

export function Composer({ conversationId, replyLabel, onCancelReply, onSend, dropped, onError }: {
  conversationId: string
  replyLabel: string | null
  onCancelReply: () => void
  onSend: (o: Outgoing) => void
  dropped: File | null
  onError: (m: string) => void
}) {
  const [text, setText] = useState(() => drafts.get(conversationId) ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const area = useRef<HTMLTextAreaElement>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setText(drafts.get(conversationId) ?? '')
    setFile(null)
  }, [conversationId])

  useEffect(() => {
    if (!file) return setPreview('')
    const u = URL.createObjectURL(file)
    setPreview(u)
    return () => URL.revokeObjectURL(u)
  }, [file])

  useEffect(() => {
    if (dropped) stage(dropped)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dropped])

  useEffect(() => {
    const el = area.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }, [text])

  useEffect(() => {
    if (replyLabel) area.current?.focus()
  }, [replyLabel])

  function stage(f: File) {
    if (!ALLOWED.includes(f.type)) return onError('JPG, PNG, GIF, WebP 사진만 보낼 수 있어요.')
    setFile(f)
    area.current?.focus()
  }

  function change(v: string) {
    setText(v)
    drafts.set(conversationId, v)
  }

  function submit() {
    const body = text.trim()
    if (!body && !file) return
    onSend({ body, file })
    setText('')
    setFile(null)
    drafts.delete(conversationId)
    if (area.current) area.current.style.height = 'auto'
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  function onPaste(e: ClipboardEvent) {
    const f = Array.from(e.clipboardData.files).find((x) => x.type.startsWith('image/'))
    if (f) {
      e.preventDefault()
      stage(f)
    }
  }

  return (
    <div className="composer">
      {replyLabel && (
        <div className="composing-bar">
          <span>{replyLabel}</span>
          <button className="icon-btn" onClick={onCancelReply} aria-label="답장 취소"><X size={15} /></button>
        </div>
      )}
      {preview && (
        <div className="staged">
          <img src={preview} alt="보낼 사진 미리보기" />
          <button className="icon-btn" onClick={() => setFile(null)} aria-label="사진 빼기"><X size={14} /></button>
        </div>
      )}
      <div className="composer-row">
        <button className="icon-btn" onClick={() => input.current?.click()} aria-label="사진 첨부"><ImagePlus size={20} /></button>
        <input ref={input} type="file" accept={ALLOWED.join(',')} hidden data-testid="file-input" onChange={(e) => { const f = e.target.files?.[0]; if (f) stage(f); e.target.value = '' }} />
        <textarea ref={area} rows={1} value={text} placeholder="메시지 보내기" maxLength={4000} onChange={(e) => change(e.target.value)} onKeyDown={onKey} onPaste={onPaste} aria-label="메시지 입력" enterKeyHint="send" />
        <button className="send" onClick={submit} disabled={!text.trim() && !file} aria-label="보내기"><SendHorizonal size={18} /></button>
      </div>
    </div>
  )
}
