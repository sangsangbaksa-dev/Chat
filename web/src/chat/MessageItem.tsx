import { AlertCircle, CornerUpLeft, Pencil, SmilePlus, Trash2 } from 'lucide-react'
import { memo, useEffect, useRef, useState, type ReactNode } from 'react'
import { formatTime } from '../lib/format'
import type { Message, Profile } from '../lib/types'
import { Avatar } from '../ui/Avatar'
import { signedUrl } from './api'

export const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏']

function linkify(text: string): ReactNode[] {
  return text.split(/(https?:\/\/[^\s<]+)/g).map((part, i) =>
    i % 2 === 1 ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer nofollow">{part}</a>
    ) : (
      part
    ),
  )
}

function Attachment({ path, name, local, onOpen }: { path: string; name: string | null; local?: string; onOpen: (url: string) => void }) {
  const [url, setUrl] = useState<string | null>(local ?? null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (local) return
    let alive = true
    signedUrl(path).then((u) => alive && (u ? setUrl(u) : setFailed(true)))
    return () => {
      alive = false
    }
  }, [path, local])
  if (failed) return <div className="att-fail">사진을 불러오지 못했어요</div>
  return (
    <button type="button" className={'att' + (url ? '' : ' loading')} onClick={() => url && onOpen(url)} aria-label={`사진 크게 보기${name ? `: ${name}` : ''}`}>
      {url && <img src={url} alt={name ?? '첨부 사진'} loading="lazy" onError={() => !local && setFailed(true)} />}
    </button>
  )
}

interface Props {
  m: Message
  mine: boolean
  grouped: boolean
  name: string
  profile?: Profile
  replyName: string
  myId: string
  localPreview?: string
  active: boolean
  onActivate: (id: string | null) => void
  onReply: (m: Message) => void
  onEdit: (m: Message, body: string) => Promise<void>
  onDelete: (m: Message) => void
  onReact: (m: Message, emoji: string) => void
  onRetry: (m: Message) => void
  onDiscard: (m: Message) => void
  onOpenImage: (url: string) => void
  onJumpTo: (id: string) => void
  receipt?: string
}

export const MessageItem = memo(function MessageItem(p: Props) {
  const { m, mine, grouped } = p
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(m.body)
  const [picker, setPicker] = useState(false)
  const editRef = useRef<HTMLTextAreaElement>(null)
  const deleted = Boolean(m.deleted_at)

  useEffect(() => {
    if (editing) {
      const el = editRef.current
      el?.focus()
      el?.setSelectionRange(el.value.length, el.value.length)
    }
  }, [editing])

  const grouped_reactions = Object.entries(
    m.reactions.reduce<Record<string, string[]>>((acc, r) => {
      ;(acc[r.emoji] ??= []).push(r.user_id)
      return acc
    }, {}),
  )

  async function save() {
    const body = draft.trim()
    if (!body || body === m.body) return setEditing(false)
    await p.onEdit(m, body)
    setEditing(false)
  }

  return (
    <div
      id={`m-${m.id}`}
      className={'msg' + (grouped ? ' grouped' : '') + (p.active ? ' active' : '') + (m.pending ? ' pending' : '') + (m.failed ? ' failed' : '')}
      data-mine={mine}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('a, button, textarea')) return
        p.onActivate(p.active ? null : m.id)
      }}
    >
      <div className="msg-side">
        {grouped ? <time className="hover-time">{formatTime(m.created_at)}</time> : <Avatar name={p.name} seed={m.sender_id} size={34} />}
      </div>
      <div className="msg-main">
        {!grouped && (
          <div className="msg-head">
            <b>{p.name}</b>
            <time dateTime={m.created_at}>{formatTime(m.created_at)}</time>
          </div>
        )}
        {m.reply_to && !deleted && (
          <button type="button" className="quote" onClick={() => p.onJumpTo(m.reply_to!)}>
            <CornerUpLeft size={12} />
            <b>{p.replyName}</b>
            <span>{m.reply ? (m.reply.deleted_at ? '삭제된 메시지' : m.reply.body || '사진') : '원본을 볼 수 없어요'}</span>
          </button>
        )}
        {deleted ? (
          <p className="body deleted">삭제된 메시지예요</p>
        ) : editing ? (
          <div className="edit">
            <textarea
              ref={editRef}
              value={draft}
              maxLength={4000}
              rows={Math.min(8, draft.split('\n').length + 1)}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setEditing(false)
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  void save()
                }
              }}
              aria-label="메시지 수정"
            />
            <div className="edit-actions">
              <small>Enter로 저장 · Esc로 취소</small>
              <button className="btn ghost sm" onClick={() => setEditing(false)}>취소</button>
              <button className="btn primary sm" onClick={() => void save()}>저장</button>
            </div>
          </div>
        ) : (
          <>
            {m.body && (
              <p className="body">
                {linkify(m.body)}
                {m.edited_at && <small className="edited"> (수정됨)</small>}
              </p>
            )}
            {m.attachment_path && <Attachment path={m.attachment_path} name={m.attachment_name} local={p.localPreview} onOpen={p.onOpenImage} />}
          </>
        )}
        {grouped_reactions.length > 0 && !deleted && (
          <div className="reacts">
            {grouped_reactions.map(([emoji, users]) => (
              <button key={emoji} type="button" className={users.includes(p.myId) ? 'on' : ''} onClick={() => p.onReact(m, emoji)} aria-label={`${emoji} ${users.length}명`} aria-pressed={users.includes(p.myId)}>
                <span>{emoji}</span> {users.length}
              </button>
            ))}
          </div>
        )}
        {m.failed && (
          <div className="send-fail" role="alert">
            <AlertCircle size={14} /> 보내지 못했어요
            <button type="button" onClick={() => p.onRetry(m)}>다시 보내기</button>
            <button type="button" onClick={() => p.onDiscard(m)}>지우기</button>
          </div>
        )}
        {p.receipt && !m.failed && <div className="receipt">{p.receipt}</div>}
      </div>
      {!deleted && !m.pending && !m.failed && !editing && (
        <div className="tools" role="toolbar" aria-label="메시지 작업">
          <button type="button" className="icon-btn" aria-label="반응 달기" onClick={() => setPicker((v) => !v)}><SmilePlus size={16} /></button>
          <button type="button" className="icon-btn" aria-label="답장" onClick={() => p.onReply(m)}><CornerUpLeft size={16} /></button>
          {mine && !m.attachment_path && <button type="button" className="icon-btn" aria-label="수정" onClick={() => { setDraft(m.body); setEditing(true) }}><Pencil size={15} /></button>}
          {mine && <button type="button" className="icon-btn danger" aria-label="삭제" onClick={() => p.onDelete(m)}><Trash2 size={15} /></button>}
          {picker && (
            <div className="emoji-pop" role="menu">
              {EMOJIS.map((e) => (
                <button key={e} type="button" role="menuitem" onClick={() => { setPicker(false); p.onReact(m, e) }} aria-label={e}>{e}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
})
