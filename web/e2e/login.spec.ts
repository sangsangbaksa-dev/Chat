import { expect, test } from '@playwright/test'

test('로그인 화면: 코드 요청 → 코드 입력 → 오류 문구', async ({ page }) => {
  let otpBody = ''
  await page.route('**/auth/v1/otp*', async (r) => {
    otpBody = r.request().postData() ?? ''
    await r.fulfill({ json: {} })
  })
  await page.route('**/auth/v1/verify*', (r) => r.fulfill({ status: 403, json: { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' } }))
  await page.goto('/')
  await expect(page.getByRole('heading', { name: '메일로 시작하기' })).toBeVisible()
  await expect(page.getByRole('button', { name: '코드 받기' })).toBeDisabled()
  await page.getByLabel('메일 주소').fill('wrong')
  await page.getByLabel('메일 주소').press('Enter')
  await expect(page.getByRole('alert')).toContainText('형식')
  await page.getByLabel('메일 주소').fill('hello@gmail.com')
  await page.getByRole('button', { name: '코드 받기' }).click()
  await expect(page.getByRole('heading', { name: '코드를 입력해 주세요' })).toBeVisible()
  expect(JSON.parse(otpBody).email).toBe('hello@gmail.com')
  await expect(page.getByRole('button', { name: /초 뒤에 다시 받기/ })).toBeDisabled()
  await page.getByLabel('인증 코드').fill('12ab3456')
  await expect(page.getByLabel('인증 코드')).toHaveValue('123456')
  await page.getByRole('button', { name: '들어가기' }).click()
  await expect(page.getByRole('alert')).toContainText('만료')
  if (process.env.SHOTS_DIR) await page.screenshot({ path: process.env.SHOTS_DIR + '/login-code.png' })
})

test('중복/일회용 메일은 안내 문구', async ({ page }) => {
  await page.route('**/auth/v1/otp*', (r) => r.fulfill({ status: 500, json: { code: 500, error_code: 'unexpected_failure', msg: 'Database error saving new user' } }))
  await page.goto('/')
  await page.getByLabel('메일 주소').fill('dupe@gmail.com')
  await page.getByRole('button', { name: '코드 받기' }).click()
  await expect(page.getByRole('alert')).toContainText('이미 가입')
})

test('비로그인 보호 경로와 /install 공개', async ({ page }) => {
  await page.goto('/c/00000000-0000-0000-0000-000000000000')
  await expect(page.getByRole('heading', { name: '메일로 시작하기' })).toBeVisible()
  await page.goto('/install')
  await expect(page.getByAltText('왈도쳇 설치 QR 코드')).toBeVisible()
})

test('PWA: manifest, 서비스워커, 새로고침(SPA)', async ({ page, request }) => {
  const m = await (await request.get('/manifest.webmanifest')).json()
  expect(m.name).toBe('왈도쳇')
  expect(m.display).toBe('standalone')
  await page.goto('/')
  await page.evaluate(() => navigator.serviceWorker.ready)
  expect((await page.evaluate(() => navigator.serviceWorker.getRegistrations())).length).toBe(1)
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: '메일로 시작하기' })).toBeVisible()
})
