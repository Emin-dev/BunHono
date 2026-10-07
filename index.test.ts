import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Database } from 'bun:sqlite'
import { createApp, MAX_BODY_BYTES } from './app'
import { createDatabase, type TodoRow } from './db'

let directory: string
let db: Database
let app: ReturnType<typeof createApp>

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'bunhono-test-'))
  db = createDatabase(join(directory, 'test.sqlite'))
  app = createApp(db)
})

afterEach(() => {
  db.close()
  // Only remove the temporary directory created by this test.
  rmSync(directory, { recursive: true, force: true })
})

function request(path: string, method = 'GET', fields?: Record<string, string>) {
  return app.request(`http://localhost${path}`, {
    method,
    headers: { Origin: 'http://localhost' },
    body: fields ? new URLSearchParams(fields) : undefined,
  })
}

function seed(title = 'Synthetic todo', description = 'Synthetic description', status = 'pending') {
  return db.query<TodoRow, [string, string, string]>(
    'INSERT INTO todos (title, description, status) VALUES (?, ?, ?) RETURNING *'
  ).get(title, description, status)!
}

function row(id: number) {
  return db.query<TodoRow, [number]>('SELECT * FROM todos WHERE id = ?').get(id)
}

describe('Todo routes with a fresh temporary database', () => {
  test('serves the existing HTML page and public assets', async () => {
    expect(await (await request('/')).text()).toContain('<title>Todo App</title>')
    expect((await request('/public/index.html')).status).toBe(200)
    expect((await request('/db.ts')).status).toBe(404)
    expect((await request('/public/%252e%252e/package.json')).status).toBe(404)
  })

  test('lists an empty state', async () => {
    const response = await request('/todos')
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('No todos yet.')
  })

  test('creates a trimmed todo and persists the default status', async () => {
    const response = await request('/todos', 'POST', { title: ' New todo ', description: ' Description ' })
    expect(response.status).toBe(201)
    expect(await response.text()).toContain('Status: pending')
    expect(row(1)?.title).toBe('New todo')
    expect(row(1)?.description).toBe('Description')
  })

  test('renders new markup as literal text in POST and subsequent GET', async () => {
    const title = '<img src=x onerror="alert(1)"> & test'
    const description = '</p><script>alert(2)</script>'
    const created = await request('/todos', 'POST', { title, description })
    expect(created.status).toBe(201)
    for (const response of [created, await request('/todos')]) {
      const body = await response.text()
      expect(body).toContain('&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; test')
      expect(body).toContain('&lt;/p&gt;&lt;script&gt;alert(2)&lt;/script&gt;')
      expect(body).not.toContain('<script>alert(2)</script>')
      expect(body).not.toContain('<img src=x')
    }
    expect(row(1)?.title).toBe(title)
  })

  test('escapes legacy title, description, and status already stored in SQLite', async () => {
    seed('<b>title</b>', '<iframe src=x></iframe>', '<svg onload="alert(3)">')
    const body = await (await request('/todos')).text()
    expect(body).toContain('&lt;b&gt;title&lt;/b&gt;')
    expect(body).toContain('&lt;iframe src=x&gt;&lt;/iframe&gt;')
    expect(body).toContain('&lt;svg onload=&quot;alert(3)&quot;&gt;')
    expect(body).not.toContain('<svg')
  })

  test('renders updated markup as literal text', async () => {
    const todo = seed()
    const response = await request(`/todos/${todo.id}`, 'PUT', { title: '<script>title</script>', description: '<b>text</b>' })
    expect(response.status).toBe(200)
    const body = await response.text()
    expect(body).toContain('&lt;script&gt;title&lt;/script&gt;')
    expect(body).toContain('&lt;b&gt;text&lt;/b&gt;')
    expect(body).not.toContain('<script>')
  })

  test('supports completion, repeated completion, reopening, and clearing descriptions', async () => {
    const todo = seed()
    for (let count = 0; count < 2; count++) {
      const response = await request(`/todos/${todo.id}`, 'PUT', { status: 'completed' })
      expect(response.status).toBe(200)
      expect(await response.text()).not.toContain('Mark Completed')
    }
    expect(row(todo.id)?.status).toBe('completed')
    expect((await request(`/todos/${todo.id}`, 'PUT', { status: 'pending', description: '' })).status).toBe(200)
    expect(row(todo.id)?.description).toBe('')
    expect(row(todo.id)?.status).toBe('pending')
  })

  test('rejects invalid status without changing the stored row', async () => {
    const todo = seed()
    expect((await request(`/todos/${todo.id}`, 'PUT', { status: '<img src=x>', title: 'changed' })).status).toBe(400)
    expect(row(todo.id)?.title).toBe('Synthetic todo')
    expect(row(todo.id)?.status).toBe('pending')
  })

  test('rejects missing, whitespace, and oversized titles', async () => {
    for (const fields of [{}, { title: ' ' }, { title: 'a'.repeat(201) }] as Record<string, string>[]) {
      expect((await request('/todos', 'POST', fields)).status).toBe(400)
    }
    const todo = seed()
    for (const title of [' ', 'a'.repeat(201)]) {
      expect((await request(`/todos/${todo.id}`, 'PUT', { title })).status).toBe(400)
    }
  })

  test('rejects oversized descriptions and accepts the documented limits', async () => {
    expect((await request('/todos', 'POST', { title: 'ok', description: 'x'.repeat(4001) })).status).toBe(400)
    const response = await request('/todos', 'POST', { title: 'x'.repeat(200), description: 'x'.repeat(4000) })
    expect(response.status).toBe(201)
    expect((await request('/todos/1', 'PUT', { description: 'x'.repeat(4001) })).status).toBe(400)
  })

  test('rejects uploaded files and repeated scalar fields', async () => {
    const fileBody = new FormData()
    fileBody.set('title', 'Upload')
    fileBody.set('description', new File(['test'], 'test.txt'))
    expect((await app.request('http://localhost/todos', { method: 'POST', headers: { Origin: 'http://localhost' }, body: fileBody })).status).toBe(400)
    const repeated = new URLSearchParams([['title', 'one'], ['title', 'two']])
    expect((await app.request('http://localhost/todos', { method: 'POST', headers: { Origin: 'http://localhost' }, body: repeated })).status).toBe(400)
  })

  test('limits oversized request bodies before inserting records', async () => {
    expect((await request('/todos', 'POST', { title: 'x'.repeat(MAX_BODY_BYTES + 1) })).status).toBe(413)
    expect(row(1)).toBeNull()
  })

  test('rejects cross-origin form submissions', async () => {
    const response = await app.request('http://localhost/todos', {
      method: 'POST', headers: { Origin: 'https://untrusted.example' }, body: new URLSearchParams({ title: 'Rejected' }),
    })
    expect(response.status).toBe(403)
    expect(row(1)).toBeNull()
  })

  test('accepts same-origin form submissions', async () => {
    const response = await app.request('http://localhost/todos', {
      method: 'POST', headers: { Origin: 'http://localhost' }, body: new URLSearchParams({ title: 'Accepted' }),
    })
    expect(response.status).toBe(201)
  })

  test('validates IDs and returns 404 for missing rows', async () => {
    for (const method of ['PUT', 'DELETE']) {
      for (const id of ['0', '-1', 'abc', '1.5', '9007199254740992']) {
        expect((await request(`/todos/${id}`, method, method === 'PUT' ? { status: 'completed' } : undefined)).status).toBe(400)
      }
      expect((await request('/todos/99999', method, method === 'PUT' ? { status: 'completed' } : undefined)).status).toBe(404)
    }
  })

  test('deletes a todo and handles repeated deletion', async () => {
    const todo = seed()
    const response = await request(`/todos/${todo.id}`, 'DELETE')
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('')
    expect(row(todo.id)).toBeNull()
    expect((await request(`/todos/${todo.id}`, 'DELETE')).status).toBe(404)
  })

  test('returns the intended HTML error when SQLite deletion fails', async () => {
    seed()
    db.query("CREATE TRIGGER fail_delete BEFORE DELETE ON todos BEGIN SELECT RAISE(ABORT, 'synthetic failure'); END").run()
    const response = await request('/todos/1', 'DELETE')
    expect(response.status).toBe(500)
    expect(response.headers.get('HX-Retarget')).toBe('#error-message-container')
    expect(await response.text()).toBe('<p class="error">Error deleting todo. Please try again.</p>')
    expect(row(1)).not.toBeNull()
  })

  test('keeps a separate synthetic application database byte-for-byte unchanged', async () => {
    const applicationPath = join(directory, 'synthetic-application.sqlite')
    const applicationDb = createDatabase(applicationPath)
    applicationDb.query('INSERT INTO todos (title) VALUES (?)').run('Keep this synthetic record')
    applicationDb.close()
    const before = readFileSync(applicationPath)
    await request('/todos', 'POST', { title: 'Test database only' })
    await request('/todos/1', 'DELETE')
    expect(readFileSync(applicationPath)).toEqual(before)
  })
})
