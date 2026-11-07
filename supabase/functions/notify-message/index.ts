// 새 메시지가 저장되면 DB 트리거(pg_net)가 호출한다. 보낸 사람을 뺀 대화 멤버의 기기로 웹 푸시를 보낸다.
// verify_jwt=false: 호출자는 DB 트리거뿐이고, notified_at 으로 메시지당 한 번만 처리하므로 재호출해도 무해하다.
// 필요한 시크릿: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method' }, 405)
  let messageId = ''
  try {
    messageId = String((await req.json()).message_id ?? '')
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  if (!/^[0-9a-f-]{36}$/i.test(messageId)) return json({ error: 'bad_request' }, 400)

  const pub = Deno.env.get('VAPID_PUBLIC_KEY')
  const priv = Deno.env.get('VAPID_PRIVATE_KEY')
  // 키가 없으면 처리한 것으로 표시하지 않는다. 나중에 키를 넣어도 새 메시지부터 정상 동작한다.
  if (!pub || !priv) return json({ skipped: 'vapid_not_configured' })
  webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') ?? 'https://waldochat-waldo5.vercel.app', pub, priv)

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  // 한 번만 처리하도록 먼저 선점한다.
  const { data: claimed } = await admin
    .from('messages')
    .update({ notified_at: new Date().toISOString() })
    .eq('id', messageId)
    .is('notified_at', null)
    .select('id, conversation_id, sender_id, body, attachment_path, deleted_at')
    .maybeSingle()
  if (!claimed || claimed.deleted_at) return json({ skipped: 'already_or_missing' })

  const [{ data: conv }, { data: sender }, { data: members }] = await Promise.all([
    admin.from('conversations').select('id, type, name').eq('id', claimed.conversation_id).single(),
    admin.from('profiles').select('display_name').eq('id', claimed.sender_id).single(),
    admin.from('conversation_members').select('user_id').eq('conversation_id', claimed.conversation_id).neq('user_id', claimed.sender_id),
  ])
  const ids = (members ?? []).map((m) => m.user_id)
  if (!conv || ids.length === 0) return json({ sent: 0 })

  const { data: subs } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').in('user_id', ids)
  if (!subs?.length) return json({ sent: 0 })

  const who = sender?.display_name ?? '새 메시지'
  const text = (claimed.body || (claimed.attachment_path ? '사진을 보냈어요' : '')).slice(0, 140)
  const payload = JSON.stringify(
    conv.type === 'dm'
      ? { title: who, body: text, url: `/c/${conv.id}`, tag: conv.id }
      : { title: conv.name ?? '그룹 대화', body: `${who}: ${text}`, url: `/c/${conv.id}`, tag: conv.id },
  )

  let sent = 0
  const dead: string[] = []
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 24 })
        sent++
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode
        if (code === 404 || code === 410) dead.push(s.id)
      }
    }),
  )
  if (dead.length) await admin.from('push_subscriptions').delete().in('id', dead)
  return json({ sent, removed: dead.length })
})
