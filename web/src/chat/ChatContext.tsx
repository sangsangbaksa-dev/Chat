import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { supabase } from '../lib/supabase'
import type { Conversation, Profile } from '../lib/types'

type Row = Record<string, unknown>
export type RtEvent =
  | { kind: 'message'; type: 'INSERT' | 'UPDATE'; row: Row }
  | { kind: 'reaction'; messageId: string }
  | { kind: 'member'; conversationId: string }

export interface Toast {
  id: number
  title: string
  body: string
  to: string
}

interface ChatState {
  conversations: Conversation[]
  loaded: boolean
  totalUnread: number
  profiles: Record<string, Profile>
  toasts: Toast[]
  activeId: string | null
  setActiveId: (id: string | null) => void
  refresh: () => Promise<void>
  loadProfiles: (ids: string[], force?: boolean) => Promise<void>
  subscribe: (fn: (e: RtEvent) => void) => () => void
  dismissToast: (id: number) => void
  connected: boolean
}

const Ctx = createContext<ChatState | null>(null)

export function ChatProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const me = user!.id
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loaded, setLoaded] = useState(false)
  const [profiles, setProfiles] = useState<Record<string, Profile>>({})
  const [toasts, setToasts] = useState<Toast[]>([])
  const [connected, setConnected] = useState(true)
  const [activeId, setActiveIdState] = useState<string | null>(null)
  const activeRef = useRef<string | null>(null)
  const convRef = useRef<Conversation[]>([])
  const listeners = useRef(new Set<(e: RtEvent) => void>())
  const requested = useRef(new Set<string>())
  const timer = useRef<number | undefined>(undefined)
  const toastId = useRef(0)

  const setActiveId = useCallback((id: string | null) => {
    activeRef.current = id
    setActiveIdState(id)
  }, [])

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.rpc('list_conversations')
    if (error) return
    const list = (data ?? []) as Conversation[]
    list.sort((a, b) => (b.last_message_at ?? b.created_at).localeCompare(a.last_message_at ?? a.created_at))
    convRef.current = list
    setConversations(list)
    setLoaded(true)
  }, [])

  const refreshSoon = useCallback(() => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => void refresh(), 250)
  }, [refresh])

  const loadProfiles = useCallback(async (ids: string[], force = false) => {
    const need = ids.filter((id) => id && (force || !requested.current.has(id)))
    if (!need.length) return
    need.forEach((id) => requested.current.add(id))
    const { data } = await supabase.from('profiles').select('id, display_name, avatar_url').in('id', need)
    if (!data) {
      need.forEach((id) => requested.current.delete(id))
      return
    }
    setProfiles((p) => {
      const next = { ...p }
      for (const row of data as Profile[]) next[row.id] = row
      return next
    })
  }, [])

  useEffect(() => {
    void refresh()
    void loadProfiles([me])
  }, [refresh, loadProfiles, me])

  useEffect(() => {
    let disposed = false
    let downTimer: number | undefined
    const emit = (e: RtEvent) => listeners.current.forEach((fn) => fn(e))
    const channel = supabase
      .channel(`app:${me}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (p: RealtimePostgresChangesPayload<Row>) => {
        if (p.eventType === 'DELETE') return
        const row = p.new as Row
        emit({ kind: 'message', type: p.eventType, row })
        refreshSoon()
        if (p.eventType === 'INSERT' && row.sender_id !== me) {
          const cid = row.conversation_id as string
          const viewing = activeRef.current === cid && document.visibilityState === 'visible'
          if (!viewing) {
            void loadProfiles([row.sender_id as string]).then(async () => {
              if (!convRef.current.some((c) => c.id === cid)) await refresh()
              const conv = convRef.current.find((c) => c.id === cid)
              const name = (await supabase.from('profiles').select('display_name').eq('id', row.sender_id as string).maybeSingle()).data?.display_name ?? ''
              const body = (row.body as string) || (row.attachment_path ? '사진을 보냈어요' : '')
              const id = ++toastId.current
              setToasts((t) => [...t.slice(-2), { id, title: conv?.title ?? name, body: conv?.type === 'dm' ? body : `${name}: ${body}`, to: `/c/${cid}` }])
              window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000)
            })
          }
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, (p: RealtimePostgresChangesPayload<Row>) => {
        const r = (p.eventType === 'DELETE' ? p.old : p.new) as Row
        if (r.message_id) emit({ kind: 'reaction', messageId: r.message_id as string })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_members' }, (p: RealtimePostgresChangesPayload<Row>) => {
        const r = (p.eventType === 'DELETE' ? p.old : p.new) as Row
        if (r.conversation_id) emit({ kind: 'member', conversationId: r.conversation_id as string })
        refreshSoon()
      })
      .subscribe((status) => {
        if (disposed) return
        if (status === 'SUBSCRIBED') {
          window.clearTimeout(downTimer)
          setConnected(true)
          void refresh()
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          // 잠깐 끊겼다 바로 붙는 경우는 알리지 않는다.
          window.clearTimeout(downTimer)
          downTimer = window.setTimeout(() => setConnected(false), 4000)
        }
      })
    return () => {
      disposed = true
      window.clearTimeout(downTimer)
      window.clearTimeout(timer.current)
      void supabase.removeChannel(channel)
    }
  }, [me, refresh, refreshSoon, loadProfiles])

  // 탭으로 돌아오면 목록을 다시 맞춘다 (놓친 이벤트 보정).
  useEffect(() => {
    const onVis = () => document.visibilityState === 'visible' && void refresh()
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('online', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('online', onVis)
    }
  }, [refresh])

  const totalUnread = useMemo(() => conversations.reduce((n, c) => n + Number(c.unread_count), 0), [conversations])

  useEffect(() => {
    document.title = totalUnread > 0 ? `(${totalUnread}) 왈도쳇` : '왈도쳇'
    const nav = navigator as Navigator & { setAppBadge?: (n: number) => Promise<void>; clearAppBadge?: () => Promise<void> }
    if (totalUnread > 0) nav.setAppBadge?.(totalUnread).catch(() => undefined)
    else nav.clearAppBadge?.().catch(() => undefined)
  }, [totalUnread])

  const value: ChatState = {
    conversations,
    loaded,
    totalUnread,
    profiles,
    toasts,
    activeId,
    setActiveId,
    refresh,
    loadProfiles,
    subscribe: (fn) => {
      listeners.current.add(fn)
      return () => {
        listeners.current.delete(fn)
      }
    },
    dismissToast: (id) => setToasts((t) => t.filter((x) => x.id !== id)),
    connected,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useChat() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useChat must be used inside ChatProvider')
  return v
}
