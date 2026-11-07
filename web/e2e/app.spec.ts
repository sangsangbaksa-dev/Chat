import { expect, test, type Page } from '@playwright/test'

const STORAGE_KEY = 'sb-fake-auth-token'
const user = {
  id: '11111111-1111-1111-1111-111111111111',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'tester@gmail.com',
  app_metadata: { provider: 'google' },
  user_metadata: { full_name: '테스터 김' },
  created_at: '2026-01-01T00:00:00Z',
}

async function loginAs(page: Page) {
  await page.addInitScript(
    ([key, u]) => {
      localStorage.setItem(
        key as string,
        JSON.stringify({
          access_token: 'a.b.c',
          refresh_token: 'r',
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: u,
        }),
      )
    },
    [STORAGE_KEY, user],
  )
  await page.route('**/rest/v1/profiles*', (r) =>
    r.fulfill({ json: { display_name: '테스터 김', avatar_url: null } }),
  )
}

test('비로그인: 로그인 화면, 구글 OAuth로 이동', async ({ page }) => {
  let authorizeUrl = ''
  await page.route('https://fake.supabase.co/auth/v1/authorize*', (r) => {
    authorizeUrl = r.request().url()
    return r.fulfill({ status: 200, contentType: 'text/html', body: 'oauth' })
  })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '왈도쳇' })).toBeVisible()
  const btn = page.getByRole('button', { name: /Google로 계속하기/ })
  await expect(btn).toBeEnabled()
  await btn.click()
  await expect.poll(() => authorizeUrl).toContain('provider=google')
  expect(decodeURIComponent(authorizeUrl)).toContain('redirect_to=http://localhost:4173')
})

test('가입 차단(트리거 에러)이 한국어 안내로 보임', async ({ page }) => {
  await page.goto('/?error=server_error&error_code=unexpected_failure&error_description=Database+error+saving+new+user')
  await expect(page.getByRole('alert')).toContainText('이 이메일로는 가입할 수 없어요')
  await expect(page).toHaveURL('http://localhost:4173/')
})

test('PKCE로 OAuth 시작 (code_challenge 포함)', async ({ page }) => {
  let url = ''
  await page.route('https://fake.supabase.co/auth/v1/authorize*', (r) => {
    url = r.request().url()
    return r.fulfill({ status: 200, contentType: 'text/html', body: 'oauth' })
  })
  await page.goto('/')
  await page.getByRole('button', { name: /Google로 계속하기/ }).click()
  await expect.poll(() => url).toContain('code_challenge=')
  expect(url).toContain('code_challenge_method=s256')
})

test('비로그인: 보호 경로는 로그인 화면으로', async ({ page }) => {
  await page.goto('/settings')
  await expect(page.getByRole('button', { name: /Google로 계속하기/ })).toBeVisible()
})

test('로그인 후: 쉘, 프로필 이름, 환영 문구, 메뉴', async ({ page }) => {
  await loginAs(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '테스터님, 환영해요!' })).toBeVisible()
  await page.getByRole('button', { name: '내 계정' }).click()
  await expect(page.getByText('tester@gmail.com')).toBeVisible()
  await expect(page.getByRole('menuitem', { name: '로그아웃' })).toBeVisible()
})

test('설치 페이지: QR 이미지가 현재 주소를 가리킴', async ({ page }) => {
  await loginAs(page)
  await page.goto('/install')
  const qr = page.getByAltText('왈도쳇 설치 QR 코드')
  await expect(qr).toBeVisible()
  const src = await qr.getAttribute('src')
  expect(src).toMatch(/^data:image\/png;base64,/)
  await expect(page.getByText('localhost:4173')).toBeVisible()
})

test('PWA: manifest, 아이콘, 서비스 워커', async ({ page, request }) => {
  await page.goto('/')
  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(href).toBeTruthy()
  const m = await (await request.get(href!)).json()
  expect(m.name).toBe('왈도쳇')
  expect(m.display).toBe('standalone')
  for (const i of m.icons) expect((await request.get(i.src)).status(), i.src).toBe(200)
  expect(m.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true)
  const swOk = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready
    return Boolean(reg.active)
  })
  expect(swOk).toBe(true)
})

test('SPA 새로고침: 깊은 경로 직접 접근이 동작', async ({ page }) => {
  await loginAs(page)
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: '알림 · 설정' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: '알림 · 설정' })).toBeVisible()
})

test('알림 켜기: 권한 허용 → 구독 → RPC 호출', async ({ page, context }) => {
  await context.grantPermissions(['notifications'])
  await loginAs(page)
  await page.addInitScript(() => {
    const fakeSub = {
      endpoint: 'https://push.example/abc',
      toJSON: () => ({ endpoint: 'https://push.example/abc', keys: { p256dh: 'P', auth: 'A' } }),
      unsubscribe: async () => true,
    }
    let current: unknown = null
    Object.defineProperty(PushManager.prototype, 'getSubscription', { value: async () => current })
    Object.defineProperty(PushManager.prototype, 'subscribe', { value: async () => (current = fakeSub) })
  })
  let body: Record<string, string> | null = null
  await page.route('**/rest/v1/rpc/register_push_subscription', (r) => {
    body = r.request().postDataJSON()
    return r.fulfill({ status: 204, body: '' })
  })
  await page.goto('/settings')
  await expect(page.getByTestId('push-status')).toContainText('꺼져 있어요')
  await page.getByRole('button', { name: '알림 켜기' }).click()
  await expect(page.getByTestId('push-status')).toContainText('받고 있어요')
  expect(body).toMatchObject({ p_endpoint: 'https://push.example/abc', p_p256dh: 'P', p_auth: 'A' })
})

test('모바일 폭: 가로 스크롤 없음, 사이드바 숨김', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 700 })
  await loginAs(page)
  await page.goto('/install')
  await expect(page.locator('.sidebar')).toBeHidden()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  expect(overflow).toBe(false)
})
