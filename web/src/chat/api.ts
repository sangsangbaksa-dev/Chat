import { supabase } from '../lib/supabase'
import type { Message } from '../lib/types'

export const MSG_SELECT = '*, reactions:message_reactions(emoji, user_id)'
export const PAGE = 40

type Quoted = NonNullable<Message['reply']>

// 답장 원본은 자기 참조 임베드가 모호해서 따로 읽어 붙인다.
async function attachReplies(list: Message[]): Promise<Message[]> {
  const ids = [...new Set(list.map((m) => m.reply_to).filter((x): x is string => Boolean(x)))]
  const found = new Map<string, Quoted>()
  list.forEach((m) => found.set(m.id, { id: m.id, sender_id: m.sender_id, body: m.body, deleted_at: m.deleted_at, attachment_path: m.attachment_path }))
  const missing = ids.filter((id) => !found.has(id))
  if (missing.length) {
    const { data } = await supabase.from('messages').select('id, sender_id, body, deleted_at, attachment_path').in('id', missing)
    ;(data ?? []).forEach((q) => found.set(q.id, q as Quoted))
  }
  return list.map((m) => ({ ...m, reply: m.reply_to ? (found.get(m.reply_to) ?? null) : null }))
}

export async function fetchMessages(conversationId: string, before?: string): Promise<Message[]> {
  let q = supabase.from('messages').select(MSG_SELECT).eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(PAGE)
  if (before) q = q.lt('created_at', before)
  const { data, error } = await q
  if (error) throw error
  return attachReplies(((data ?? []) as unknown as Message[]).reverse())
}

export async function fetchMessage(id: string): Promise<Message | null> {
  const { data } = await supabase.from('messages').select(MSG_SELECT).eq('id', id).maybeSingle()
  if (!data) return null
  return (await attachReplies([data as unknown as Message]))[0]
}

const urlCache = new Map<string, { url: string; exp: number }>()
export async function signedUrl(path: string): Promise<string | null> {
  const hit = urlCache.get(path)
  if (hit && hit.exp > Date.now()) return hit.url
  const { data } = await supabase.storage.from('chat-attachments').createSignedUrl(path, 3600)
  if (!data?.signedUrl) return null
  urlCache.set(path, { url: data.signedUrl, exp: Date.now() + 50 * 60 * 1000 })
  return data.signedUrl
}

export const ALLOWED = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const MAX_BYTES = 10 * 1024 * 1024
const MAX_SIDE = 1600

/** 큰 사진은 줄여서 올린다. GIF와 작은 파일은 그대로 둔다. */
export async function prepareImage(file: File): Promise<{ blob: Blob; type: string; name: string }> {
  if (!ALLOWED.includes(file.type)) throw new Error('JPG, PNG, GIF, WebP 사진만 보낼 수 있어요.')
  if (file.type === 'image/gif' || file.size < 500 * 1024) {
    if (file.size > MAX_BYTES) throw new Error('사진은 10MB까지 보낼 수 있어요.')
    return { blob: file, type: file.type, name: file.name }
  }
  const bmp = await createImageBitmap(file).catch(() => null)
  if (!bmp) {
    if (file.size > MAX_BYTES) throw new Error('사진은 10MB까지 보낼 수 있어요.')
    return { blob: file, type: file.type, name: file.name }
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bmp.width * scale)
  canvas.height = Math.round(bmp.height * scale)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
  bmp.close()
  const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.86))
  if (!blob || blob.size > MAX_BYTES) throw new Error('사진이 너무 커요.')
  return { blob, type: 'image/jpeg', name: file.name.replace(/\.\w+$/, '') + '.jpg' }
}

export async function uploadAttachment(conversationId: string, img: { blob: Blob; type: string; name: string }) {
  const ext = img.type === 'image/jpeg' ? 'jpg' : img.type.split('/')[1]
  const path = `${conversationId}/${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('chat-attachments').upload(path, img.blob, { contentType: img.type, upsert: false })
  if (error) throw error
  return { path, name: img.name, type: img.type, size: img.blob.size }
}

export function rpcMessage(e: { message?: string } | null): string {
  const m = e?.message ?? ''
  if (m.includes('USER_NOT_FOUND')) return '이 사용자를 찾을 수 없어요.'
  if (m.includes('NAME_REQUIRED')) return '스페이스 이름을 입력해 주세요.'
  if (m.includes('MEMBERS_REQUIRED')) return '대화 상대를 한 명 이상 골라 주세요.'
  if (m.includes('TOO_MANY')) return '인원이 너무 많아요.'
  return '문제가 생겼어요. 잠시 뒤에 다시 시도해 주세요.'
}
