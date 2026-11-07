import { ArrowLeft, Hash, Lock, Users } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from "react"
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthProvider'
import { dayKey, formatDay } from '../lib/format'
import { supabase } from '../lib/supabase'
import type { Message } from '../lib/types'
import { Avatar } from '../ui/Avatar'
import { fetchMessage, fetchMessages, PAGE, prepareImage, rpcMessage, uploadAttachment } from './api'
import { useChat } from './ChatContext'
import { Composer, type Outgoing } from './Composer'
import { MembersPanel, type Member } from './MembersPanel'
import { MessageItem } from './MessageItem'

const GROUP_MS = 5 * 60 * 1000

export function ChatView() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const me = user!.id
  const nav = useNavigate()
  const { conversations, loaded, profiles, loadProfiles, subscribe, setActiveId, refresh } = useChat()
  const conv = conversations.find((c) => c.id === id)

  const [messages, setMessages] = useState<Message[]>([])
  const [ready, setReady] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [loadingOld, setLoadingOld] = useState(false)
  const [members, setMembers] = useState<Member[]>([])
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [active, setActive] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [panel, setPanel] = useState(false)
  const [notice, setNotice] = useState('')
  const [dropFile, setDropFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)

  const scroller = useRef<HTMLDivElement>(null)
  const stick = useRef(true)
  const prevHeight = useRef<number | null>(null)
  const local = useRef(new Map<string, string>())
  const pendingFiles = useRef(new Map<string, Outgoing>())
  const msgsRef = useRef<Message[]>([])
  msgsRef.current = messages

  const flash = useCallback((m: string) => {
    setNotice(m)
    window.setTimeout(() => setNotice(''), 4000)
  }, [])

  const ensureNames = useCallback(
    (list: Message[]) => {
      const ids = new Set<string>()
      list.forEach((m) => {
        ids.add(m.sender_id)
        if (m.reply) ids.add(m.reply.sender_id)
      })
      void loadProfiles([...ids])
    },
    [loadProfiles],
  )

  // 대화가 바뀌면 처음부터 다시 불러온다.
  useEffect(() => {
    setActiveId(id)
    setMessages([])
    setReady(false)
    setHasMore(false)
    setReplyTo(null)
    setActive(null)
    setPanel(false)
    stick.current = true
    let alive = true
    fetchMessages(id)
      .then((list) => {
        if (!alive) return
        setMessages(list)
        setHasMore(list.length === PAGE)
        setReady(true)
        ensureNames(list)
      })
      .catch(() => {
        if (alive) {
          setReady(true)
          flash('메시지를 불러오지 못했어요.')
        }
      })
    return () => {
      alive = false
      setActiveId(null)
    }
  }, [id, setActiveId, ensureNames, flash])

  const loadMembers = useCallback(async () => {
    const { data } = await supabase.from('conversation_members').select('user_id, role, last_read_at').eq('conversation_id', id)
    const list = (data ?? []) as Member[]
    setMembers(list)
    void loadProfiles(list.map((m) => m.user_id))
  }, [id, loadProfiles])

  useEffect(() => {
    setMembers([])
    void loadMembers()
  }, [loadMembers])

  // 실시간 이벤트
  useEffect(() => {
    return subscribe((e) => {
      if (e.kind === 'member') {
        if (e.conversationId === id) void loadMembers()
        return
      }
      if (e.kind === 'reaction') {
        if (!msgsRef.current.some((m) => m.id === e.messageId)) return
        void fetchMessage(e.messageId).then((m) => m && setMessages((cur) => cur.map((x) => (x.id === m.id ? m : x))))
        return
      }
      const row = e.row as unknown as Message
      if (row.conversation_id !== id) return
      void fetchMessage(row.id).then((m) => {
        if (!m) return
        ensureNames([m])
        setMessages((cur) => {
          const i = cur.findIndex((x) => x.id === m.id)
          if (i >= 0) {
            const next = cur.slice()
            next[i] = m
            return next
          }
          return [...cur, m]
        })
      })
    })
  }, [subscribe, id, loadMembers, ensureNames])

  // 읽음 처리
  const lastId = messages[messages.length - 1]?.id
  useEffect(() => {
    if (!ready || !lastId) return
    const mark = () => {
      if (document.visibilityState !== 'visible') return
      void supabase.rpc('mark_read', { p_conversation: id }).then(() => refresh())
    }
    mark()
    document.addEventListener('visibilitychange', mark)
    window.addEventListener('focus', mark)
    return () => {
      document.removeEventListener('visibilitychange', mark)
      window.removeEventListener('focus', mark)
    }
  }, [ready, lastId, id, refresh])

  // 스크롤: 맨 아래에 있으면 새 메시지를 따라가고, 이전 메시지를 불러오면 위치를 유지한다.
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    if (prevHeight.current !== null) {
      el.scrollTop += el.scrollHeight - prevHeight.current
      prevHeight.current = null
    } else if (stick.current) {
      el.scrollTop = el.scrollHeight
    }
  }, [messages, ready])

  function onScroll() {
    const el = scroller.current!
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    if (el.scrollTop < 60 && hasMore && !loadingOld) void loadOlder()
  }

  async function loadOlder() {
    const first = messages[0]
    if (!first) return
    setLoadingOld(true)
    try {
      const older = await fetchMessages(id, first.created_at)
      prevHeight.current = scroller.current!.scrollHeight
      setMessages((cur) => [...older, ...cur.filter((m) => !older.some((o) => o.id === m.id))])
      setHasMore(older.length === PAGE)
      ensureNames(older)
    } catch {
      flash('이전 메시지를 불러오지 못했어요.')
    } finally {
      setLoadingOld(false)
    }
  }

  // 보내기 (낙관적 표시 → 서버 확정)
  async function deliver(msg: Message, o: Outgoing) {
    try {
      let att: { path: string; name: string; type: string; size: number } | null = null
      if (o.file) {
        const img = await prepareImage(o.file)
        att = await uploadAttachment(id, img)
      }
      const { error } = await supabase.from('messages').insert({
        id: msg.id,
        conversation_id: id,
        sender_id: me,
        body: o.body,
        reply_to: msg.reply_to,
        attachment_path: att?.path ?? null,
        attachment_name: att?.name ?? null,
        attachment_type: att?.type ?? null,
        attachment_size: att?.size ?? null,
      })
      if (error && error.code !== '23505') throw error
      const real = await fetchMessage(msg.id)
      if (real) setMessages((cur) => cur.map((x) => (x.id === msg.id ? real : x)))
      pendingFiles.current.delete(msg.id)
    } catch (err) {
      setMessages((cur) => cur.map((x) => (x.id === msg.id ? { ...x, pending: false, failed: true } : x)))
      if (err instanceof Error && err.message.includes('사진')) flash(err.message)
    }
  }

  function send(o: Outgoing) {
    const msgId = crypto.randomUUID()
    if (o.file) local.current.set(msgId, URL.createObjectURL(o.file))
    const msg: Message = {
      id: msgId,
      conversation_id: id,
      sender_id: me,
      body: o.body,
      reply_to: replyTo?.id ?? null,
      attachment_path: o.file ? `local:${msgId}` : null,
      attachment_name: o.file?.name ?? null,
      attachment_type: o.file?.type ?? null,
      attachment_size: o.file?.size ?? null,
      created_at: new Date().toISOString(),
      edited_at: null,
      deleted_at: null,
      reactions: [],
      reply: replyTo ? { id: replyTo.id, sender_id: replyTo.sender_id, body: replyTo.body, deleted_at: replyTo.deleted_at, attachment_path: replyTo.attachment_path } : null,
      pending: true,
    }
    pendingFiles.current.set(msgId, o)
    stick.current = true
    setMessages((cur) => [...cur, msg])
    setReplyTo(null)
    void deliver(msg, o)
  }

  async function edit(m: Message, body: string) {
    const prev = m.body
    setMessages((cur) => cur.map((x) => (x.id === m.id ? { ...x, body, edited_at: new Date().toISOString() } : x)))
    const { error } = await supabase.from('messages').update({ body }).eq('id', m.id)
    if (error) {
      setMessages((cur) => cur.map((x) => (x.id === m.id ? { ...x, body: prev, edited_at: m.edited_at } : x)))
      flash('수정하지 못했어요.')
    }
  }

  async function remove(m: Message) {
    if (!window.confirm('이 메시지를 삭제할까요?')) return
    setMessages((cur) => cur.map((x) => (x.id === m.id ? { ...x, deleted_at: new Date().toISOString(), body: '' } : x)))
    const { error } = await supabase.from('messages').update({ deleted_at: new Date().toISOString() }).eq('id', m.id)
    if (error) {
      setMessages((cur) => cur.map((x) => (x.id === m.id ? m : x)))
      flash('삭제하지 못했어요.')
    }
  }

  async function react(m: Message, emoji: string) {
    const has = m.reactions.some((r) => r.user_id === me && r.emoji === emoji)
    const apply = (add: boolean) =>
      setMessages((cur) =>
        cur.map((x) =>
          x.id !== m.id
            ? x
            : { ...x, reactions: add ? [...x.reactions, { emoji, user_id: me }] : x.reactions.filter((r) => !(r.user_id === me && r.emoji === emoji)) },
        ),
      )
    apply(!has)
    const { error } = has
      ? await supabase.from('message_reactions').delete().eq('message_id', m.id).eq('user_id', me).eq('emoji', emoji)
      : await supabase.from('message_reactions').insert({ message_id: m.id, user_id: me, emoji })
    if (error && error.code !== '23505') {
      apply(has)
      flash('반응을 남기지 못했어요.')
    }
  }

  function retry(m: Message) {
    const o = pendingFiles.current.get(m.id)
    if (!o) return
    setMessages((cur) => cur.map((x) => (x.id === m.id ? { ...x, pending: true, failed: false } : x)))
    void deliver(m, o)
  }

  function discard(m: Message) {
    pendingFiles.current.delete(m.id)
    setMessages((cur) => cur.filter((x) => x.id !== m.id))
  }

  function jumpTo(mid: string) {
    const el = document.getElementById(`m-${mid}`)
    if (!el) return flash('더 오래된 메시지예요. 위로 스크롤해서 이전 메시지를 불러와 주세요.')
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    el.classList.add('flash')
    window.setTimeout(() => el.classList.remove('flash'), 1400)
  }

  const nameOf = useCallback((uid: string) => profiles[uid]?.display_name ?? '…', [profiles])

  // 내 마지막 메시지의 읽음 표시
  const lastMine = useMemo(() => [...messages].reverse().find((m) => m.sender_id === me && !m.pending && !m.failed && !m.deleted_at), [messages, me])
  const receipt = useMemo(() => {
    if (!lastMine) return null
    const readers = members.filter((m) => m.user_id !== me && m.last_read_at >= lastMine.created_at).length
    if (!readers) return null
    return conv?.type === 'dm' ? '읽음' : `${readers}명 읽음`
  }, [lastMine, members, me, conv?.type])

  if (loaded && !conv) {
    return (
      <div className="empty">
        <h2>찾을 수 없는 대화예요</h2>
        <p>삭제됐거나 참여하지 않은 대화일 수 있어요.</p>
        <Link className="btn primary" to="/">대화 목록으로</Link>
      </div>
    )
  }

  const rows: ReactElement[] = []
  let prev: Message | undefined
  messages.forEach((m) => {
    if (!prev || dayKey(prev.created_at) !== dayKey(m.created_at)) {
      rows.push(<div key={`d-${m.id}`} className="day"><span>{formatDay(m.created_at)}</span></div>)
      prev = undefined
    }
    const grouped = Boolean(prev && prev.sender_id === m.sender_id && !m.reply_to && new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < GROUP_MS)
    const att = local.current.get(m.id)
    rows.push(
      <MessageItem
        key={m.id}
        m={m}
        mine={m.sender_id === me}
        grouped={grouped}
        name={m.sender_id === me ? (profiles[me]?.display_name ?? '나') : nameOf(m.sender_id)}
        replyName={m.reply ? nameOf(m.reply.sender_id) : ''}
        myId={me}
        localPreview={att}
        active={active === m.id}
        onActivate={setActive}
        onReply={(x) => setReplyTo(x)}
        onEdit={edit}
        onDelete={remove}
        onReact={react}
        onRetry={retry}
        onDiscard={discard}
        onOpenImage={setLightbox}
        onJumpTo={jumpTo}
        receipt={lastMine?.id === m.id && receipt ? receipt : undefined}
      />,
    )
    prev = m
  })

  const replyLabel = replyTo ? `${nameOf(replyTo.sender_id)}에게 답장: ${replyTo.body || '사진'}` : null
  const TypeIcon = conv?.type === 'space' ? (conv.is_public ? Hash : Lock) : conv?.type === 'group' ? Users : null

  return (
    <div
      className="chat"
      onDragOver={(e) => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true) } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false) }}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        const f = Array.from(e.dataTransfer.files).find((x) => x.type.startsWith('image/'))
        if (f) setDropFile(f)
      }}
    >
      <header className="chat-head">
        <button className="icon-btn back" onClick={() => nav('/')} aria-label="목록으로"><ArrowLeft size={20} /></button>
        <Avatar name={conv?.title ?? '…'} seed={id} size={34} square={conv?.type !== 'dm'} />
        <div className="chat-title">
          <h2>{TypeIcon && <TypeIcon size={15} />}{conv?.title ?? ' '}</h2>
          <small>{conv ? (conv.type === 'dm' ? '1:1 대화' : `멤버 ${conv.member_count}명`) : ''}</small>
        </div>
        {conv && conv.type !== 'dm' && (
          <button className="icon-btn" onClick={() => setPanel(true)} aria-label="멤버 보기"><Users size={19} /></button>
        )}
      </header>
      <div className="scroll" ref={scroller} onScroll={onScroll} role="log" aria-live="polite" aria-label="메시지">
        {loadingOld && <div className="older">이전 메시지 불러오는 중…</div>}
        {!hasMore && ready && messages.length > 0 && <div className="older">대화의 시작이에요</div>}
        {!ready && <div className="older">불러오는 중…</div>}
        {ready && messages.length === 0 && (
          <div className="first">
            <Avatar name={conv?.title ?? '?'} seed={id} size={56} square={conv?.type !== 'dm'} />
            <p><b>{conv?.title}</b>에서 첫 메시지를 보내 보세요.</p>
          </div>
        )}
        {rows}
      </div>
      {notice && <div className="flash-note" role="status">{notice}</div>}
      <Composer conversationId={id} replyLabel={replyLabel} onCancelReply={() => setReplyTo(null)} onSend={send} dropped={dropFile} onError={flash} />
      {dragging && <div className="drop">사진을 놓으면 보낼 준비가 돼요</div>}
      {lightbox && (
        <div className="lightbox" onClick={() => setLightbox(null)} role="dialog" aria-modal="true" aria-label="사진 보기">
          <img src={lightbox} alt="" />
        </div>
      )}
      {panel && conv && (
        <MembersPanel
          conv={conv}
          me={me}
          members={members}
          profiles={profiles}
          onClose={() => setPanel(false)}
          onChanged={() => void loadMembers()}
          onLeft={() => { setPanel(false); void refresh(); nav('/') }}
          onError={(e) => flash(rpcMessage(e))}
        />
      )}
    </div>
  )
}
