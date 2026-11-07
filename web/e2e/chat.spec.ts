import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { openAs, USERS } from './helpers'

const SHOTS = process.env.SHOTS_DIR
const shot = async (page: import('@playwright/test').Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, name + '.png') })
}
const dm = (page: import('@playwright/test').Page, name: string) => page.locator('.conv', { has: page.getByText(name, { exact: true }) }).first()
const stamp = Date.now().toString(36)

test.describe.configure({ mode: 'serial' })

test('두 사용자: 1:1 대화, 실시간, 읽음, 반응, 수정, 삭제', async ({ browser }) => {
  const A = await openAs(browser, 'a')
  const B = await openAs(browser, 'b')
  const a = A.page
  const b = B.page

  await expect(a.getByRole('heading', { name: '채팅' })).toBeVisible()
  // A가 새 채팅으로 B와 1:1
  await a.getByRole('button', { name: '새 채팅' }).click()
  await a.getByLabel('이름으로 찾기').fill(USERS.b.name)
  await a.getByRole('button', { name: USERS.b.name }).click()
  await expect(a).toHaveURL(/\/c\//)
  await expect(a.getByRole('heading', { name: USERS.b.name, level: 2 })).toBeVisible()

  const hello = `안녕 ${stamp}`
  await a.getByLabel('메시지 입력').fill(hello)
  await a.getByLabel('메시지 입력').press('Enter')
  await expect(a.locator('.msg', { hasText: hello })).toBeVisible()
  await expect(a.locator('.msg.pending')).toHaveCount(0)

  // B에게 실시간으로 토스트와 안읽음 표시
  await expect(b.locator('.toast', { hasText: hello })).toBeVisible({ timeout: 10_000 })
  await expect(b.locator('.conv.unread', { hasText: hello })).toBeVisible()
  await expect(b).toHaveTitle(/\(\d+\)/)
  await shot(b, 'desktop-light-list-unread')

  await dm(b, USERS.a.name).click()
  await expect(b.locator('.msg', { hasText: hello })).toBeVisible()
  await expect(b.locator('.conv.on.unread')).toHaveCount(0)
  await expect(b.locator('.conv.on .count')).toHaveCount(0)
  // A: 읽음 표시
  await expect(a.locator('.receipt', { hasText: '읽음' })).toBeVisible({ timeout: 10_000 })

  // B가 답장 + A의 메시지에 반응
  await b.locator('.msg', { hasText: hello }).hover()
  await b.getByRole('button', { name: '반응 달기' }).click()
  await b.getByRole('menuitem', { name: '❤️' }).click()
  await expect(a.locator('.msg', { hasText: hello }).locator('.reacts button', { hasText: '❤️' })).toBeVisible({ timeout: 10_000 })

  await b.locator('.msg', { hasText: hello }).hover()
  await b.getByRole('button', { name: '답장', exact: true }).click()
  const reply = `답장이에요 ${stamp}`
  await b.getByLabel('메시지 입력').fill(reply)
  await b.getByLabel('메시지 입력').press('Enter')
  await expect(a.locator('.msg', { hasText: reply }).locator('.quote', { hasText: hello })).toBeVisible({ timeout: 10_000 })

  // 줄바꿈(Shift+Enter)
  await a.getByLabel('메시지 입력').fill('첫줄')
  await a.getByLabel('메시지 입력').press('Shift+Enter')
  await a.getByLabel('메시지 입력').type('둘째줄')
  await a.getByLabel('메시지 입력').press('Enter')
  await expect(a.locator('.msg .body', { hasText: '둘째줄' }).last()).toBeVisible()
  await shot(a, 'desktop-light-chat')

  // 수정 → B에서 (수정됨)
  await a.locator('.msg[data-mine="true"]', { hasText: hello }).hover()
  await a.getByRole('button', { name: '수정', exact: true }).click()
  await a.getByLabel('메시지 수정').fill(hello + ' 수정')
  await a.getByLabel('메시지 수정').press('Enter')
  await expect(b.locator('.msg[data-mine="false"]', { hasText: hello + ' 수정' }).locator('.edited')).toBeVisible({ timeout: 10_000 })

  // 삭제
  a.on('dialog', (d) => void d.accept())
  await a.locator('.msg', { hasText: '둘째줄' }).last().hover()
  await a.getByRole('button', { name: '삭제', exact: true }).click()
  await expect(b.getByText('삭제된 메시지예요').first()).toBeVisible({ timeout: 10_000 })

  // 새로고침해도 유지
  await a.reload()
  await expect(dm(a, USERS.b.name)).toBeVisible()
  await dm(a, USERS.b.name).click()
  await expect(a.locator('.msg[data-mine="true"]', { hasText: hello + ' 수정' })).toBeVisible()

  await A.ctx.close()
  await B.ctx.close()
})

test('이미지 첨부: 보내기, 상대에게 표시, 확대', async ({ browser }) => {
  const A = await openAs(browser, 'a')
  const B = await openAs(browser, 'b')
  await dm(A.page, USERS.b.name).click()
  await dm(B.page, USERS.a.name).click()
  const png = path.join(process.env.TMPDIR ?? '/tmp', `e2e-${stamp}.png`)
  fs.writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC', 'base64'))
  await A.page.getByTestId('file-input').setInputFiles(png)
  await expect(A.page.getByAltText('보낼 사진 미리보기')).toBeVisible()
  await A.page.getByRole('button', { name: '보내기' }).click()
  await expect(A.page.locator('.msg .att img').last()).toBeVisible({ timeout: 15_000 })
  await expect(B.page.locator('.msg .att img').last()).toBeVisible({ timeout: 15_000 })
  await expect.poll(() => B.page.locator('.msg .att img').last().evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0)
  await B.page.locator('.msg .att').last().click()
  await expect(B.page.getByRole('dialog', { name: '사진 보기' })).toBeVisible()
  await B.page.keyboard.press('Escape')
  await B.page.getByRole('dialog', { name: '사진 보기' }).click()
  await A.ctx.close()
  await B.ctx.close()
})

test('스페이스: 만들기, 찾아서 참여, 그룹 멤버 패널', async ({ browser }) => {
  const A = await openAs(browser, 'a')
  const C = await openAs(browser, 'c')
  const space = `열린방 ${stamp}`
  await A.page.getByRole('button', { name: '새 채팅' }).click()
  await A.page.getByRole('tab', { name: '스페이스' }).click()
  await A.page.getByLabel('스페이스 이름').fill(space)
  await A.page.getByRole('button', { name: '스페이스 만들기' }).click()
  await expect(A.page.getByRole('heading', { name: space, level: 2 })).toBeVisible()
  await A.page.getByLabel('메시지 입력').fill('환영해요')
  await A.page.getByLabel('메시지 입력').press('Enter')

  await C.page.getByRole('link', { name: /스페이스/ }).first().click()
  await C.page.getByLabel('스페이스 찾기').fill(stamp)
  await C.page.locator('.space-row', { hasText: space }).getByRole('button', { name: '참여' }).click()
  await expect(C.page.locator('.msg', { hasText: '환영해요' })).toBeVisible({ timeout: 10_000 })
  await C.page.getByLabel('메시지 입력').fill('반가워요')
  await C.page.getByLabel('메시지 입력').press('Enter')
  await expect(A.page.locator('.msg', { hasText: '반가워요' })).toBeVisible({ timeout: 10_000 })

  // 멤버 패널
  await A.page.getByRole('button', { name: '멤버 보기' }).click()
  await expect(A.page.getByRole('dialog').getByText(USERS.c.name)).toBeVisible()
  await shot(A.page, 'desktop-light-members')
  await A.page.keyboard.press('Escape')
  await A.ctx.close()
  await C.ctx.close()
})

test('설정: 이름 변경, 알림 상태, 설치 페이지(QR)', async ({ browser }) => {
  const A = await openAs(browser, 'a')
  await A.page.getByRole('link', { name: '설정' }).first().click()
  await expect(A.page.getByRole('heading', { name: '설정', level: 1 })).toBeVisible()
  await expect(A.page.getByTestId('push-status')).toBeVisible()
  await shot(A.page, 'desktop-light-settings')
  await A.page.goto('/install')
  await expect(A.page.getByAltText('왈도쳇 설치 QR 코드')).toBeVisible()
  await shot(A.page, 'desktop-light-install')
  await A.ctx.close()
})

test('모바일: 목록 → 대화 → 뒤로, 가로 스크롤 없음, 하단 탭', async ({ browser }) => {
  const M = await openAs(browser, 'a', { mobile: true })
  const p = M.page
  await expect(p.locator('.tabbar')).toBeVisible()
  await shot(p, 'mobile-light-list')
  await dm(p, USERS.b.name).click()
  await expect(p.locator('.tabbar')).toBeHidden()
  await expect(p.getByLabel('메시지 입력')).toBeVisible()
  await shot(p, 'mobile-light-chat')
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
  await p.getByRole('button', { name: '목록으로' }).click()
  await expect(p.getByRole('heading', { name: '채팅' })).toBeVisible()
  await M.ctx.close()
})

test('다크 모드 스크린샷', async ({ browser }) => {
  const D = await openAs(browser, 'a', { dark: true })
  await dm(D.page, USERS.b.name).click()
  await expect(D.page.getByLabel('메시지 입력')).toBeVisible()
  await shot(D.page, 'desktop-dark-chat')
  await D.ctx.close()
  const M = await openAs(browser, 'a', { mobile: true, dark: true })
  await shot(M.page, 'mobile-dark-list')
  await M.ctx.close()
})
