import { type Browser, type BrowserContext, type Page } from '@playwright/test'
import fs from 'node:fs'

const env = Object.fromEntries(
  fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n').filter(Boolean).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
)
export const SUPA = env.VITE_SUPABASE_URL
export const KEY = env.VITE_SUPABASE_ANON_KEY
const ref = new URL(SUPA).hostname.split('.')[0]
export const STORAGE_KEY = `sb-${ref}-auth-token`
export const PASSWORD = 'E2e-test-pass-1'
export const USERS = {
  a: { email: 'e2e-a@waldochat.test', name: '민준E2E' },
  b: { email: 'e2e-b@waldochat.test', name: '서연E2E' },
  c: { email: 'e2e-c@waldochat.test', name: '도윤E2E' },
}

export async function sessionFor(email: string) {
  const res = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  })
  if (!res.ok) throw new Error('login failed ' + res.status + ' ' + (await res.text()))
  return res.json()
}

export async function openAs(browser: Browser, who: keyof typeof USERS, opts: { mobile?: boolean; dark?: boolean } = {}): Promise<{ ctx: BrowserContext; page: Page }> {
  const session = await sessionFor(USERS[who].email)
  const ctx = await browser.newContext({
    viewport: opts.mobile ? { width: 390, height: 780 } : { width: 1280, height: 800 },
    hasTouch: opts.mobile,
    isMobile: opts.mobile,
    colorScheme: opts.dark ? 'dark' : 'light',
    permissions: ['notifications'],
  })
  await ctx.addInitScript(([k, s]) => localStorage.setItem(k as string, JSON.stringify(s)), [STORAGE_KEY, session]) 
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.log('PAGEERROR', who, e.message))
  await page.goto('/')
  return { ctx, page }
}
