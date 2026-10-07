import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createDatabase } from '../db'
import { createApp } from '../app'

// No application database, live server, remote images, or real records.
const directory = mkdtempSync(join(tmpdir(), 'bunhono-browser-'))
const db = createDatabase(join(directory, 'browser.sqlite'))
const app = createApp(db)
try {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  })
  try {
    const page = await browser.newPage()
    await page.route('**/*', (route) => route.abort())
    const title = '<img src=x onerror="window.__injected=true">'
    const description = '<script>window.__injected=true</script>'
    const response = await app.request('http://localhost/todos', {
      method: 'POST', headers: { Origin: 'http://localhost' }, body: new URLSearchParams({ title, description }),
    })
    assert.equal(response.status, 201)
    await page.setContent(await response.text())
    assert.equal(await page.locator('h4').textContent(), title)
    assert.equal(await page.locator('article > p').textContent(), description)
    assert.equal(await page.locator('script, [onerror], iframe, svg').count(), 0)
    assert.equal(await page.evaluate('window.__injected'), undefined)
    assert.equal(await page.getByRole('button', { name: 'Mark Completed' }).count(), 1)
    const updated = await app.request('http://localhost/todos/1', {
      method: 'PUT', headers: { Origin: 'http://localhost' }, body: new URLSearchParams({ status: 'completed' }),
    })
    await page.setContent(await updated.text())
    assert.equal(await page.getByRole('button', { name: 'Mark Completed' }).count(), 0)
    assert.equal(await page.getByRole('button', { name: 'Delete' }).count(), 1)
    assert.equal(await page.locator('h4').textContent(), title)
    await page.setContent(await (await app.request('http://localhost/')).text())
    await page.addScriptTag({ content: readFileSync('public/app.js', 'utf8') })
    await page.getByLabel('Title').fill('Keep my draft')
    const errorBehavior = await page.evaluate(() => {
      const form = document.getElementById('add-todo-form')!
      const detail = { xhr: { status: 500 }, shouldSwap: false, isError: false, target: form, swapOverride: '' }
      document.body.dispatchEvent(new CustomEvent('htmx:beforeSwap', { detail }))
      document.body.dispatchEvent(new CustomEvent('htmx:afterRequest', { detail: { elt: form, successful: false } }))
      return { target: detail.target.id, swap: detail.swapOverride, shouldSwap: detail.shouldSwap }
    })
    assert.deepEqual(errorBehavior, { target: 'error-message-container', swap: 'innerHTML', shouldSwap: true })
    assert.equal(await page.getByLabel('Title').inputValue(), 'Keep my draft')
    await page.evaluate(() => document.body.dispatchEvent(new CustomEvent('htmx:afterRequest', {
      detail: { elt: document.getElementById('add-todo-form'), successful: true },
    })))
    assert.equal(await page.getByLabel('Title').inputValue(), '')
    console.log('Chromium: stored markup stays literal; controls and success/failure form handling pass.')
  } finally {
    await browser.close()
  }
} finally {
  db.close()
  rmSync(directory, { recursive: true, force: true })
}
