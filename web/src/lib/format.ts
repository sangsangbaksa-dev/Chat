const timeFmt = new Intl.DateTimeFormat('ko-KR', { hour: 'numeric', minute: '2-digit', hour12: true })
const dateFmt = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })
const shortFmt = new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric' })

export const dayKey = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}
export const formatTime = (iso: string) => timeFmt.format(new Date(iso))
export const formatDay = (iso: string) => dateFmt.format(new Date(iso))

export function formatListTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const now = new Date()
  if (dayKey(iso) === dayKey(now.toISOString())) return timeFmt.format(d)
  const y = new Date(now)
  y.setDate(y.getDate() - 1)
  if (dayKey(iso) === dayKey(y.toISOString())) return '어제'
  return shortFmt.format(d)
}

const PALETTE = [
  ['#e4efe9', '#1f6f5b'], ['#efe6da', '#8a5a1f'], ['#e3e9f2', '#34527f'], ['#f1e1e3', '#8f3b48'],
  ['#e8e3f0', '#5c458f'], ['#e0eceb', '#1d6a6f'], ['#f0ead7', '#7a6414'], ['#ece3e8', '#7c3f62'],
]
export function avatarColors(seed: string): { bg: string; fg: string } {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  const [bg, fg] = PALETTE[h % PALETTE.length]
  return { bg, fg }
}
export const initial = (s: string) => Array.from(s.trim())[0]?.toUpperCase() ?? '?'
