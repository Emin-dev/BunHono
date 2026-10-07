import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import { html } from 'hono/html'
import { bodyLimit } from 'hono/body-limit'
import { csrf } from 'hono/csrf'
import type { Database } from 'bun:sqlite'
import { readFile } from 'node:fs/promises'
import type { TodoRow } from './db'

export const MAX_BODY_BYTES = 64 * 1024
export const MAX_TITLE_LENGTH = 200
export const MAX_DESCRIPTION_LENGTH = 4000

// Escape every stored field, including records that predate input validation.
const renderTodoItem = (todo: TodoRow) => html`
  <article id="todo-${todo.id}" style="margin-bottom: 1rem; ${todo.status === 'completed' ? 'border-left: 5px solid green;' : ''}">
    <img src="https://picsum.photos/seed/${todo.id}/200/100" alt="Random image for todo ${todo.id}" style="border-radius: 6px; margin-bottom: 0.5rem;">
    <hgroup>
      <h4>${todo.title}</h4>
      <small>Status: ${todo.status}</small>
    </hgroup>
    <p>${todo.description || ''}</p>
    <footer>
      ${todo.status !== 'completed' ? html`
        <button hx-put="/todos/${todo.id}" hx-target="#todo-${todo.id}" hx-swap="outerHTML"
          hx-vals='{"status": "completed"}' class="outline" style="margin-right: 0.5rem;">Mark Completed</button>
      ` : ''}
      <button hx-delete="/todos/${todo.id}" hx-target="#todo-${todo.id}" hx-swap="outerHTML" class="contrast">Delete</button>
    </footer>
  </article>
`

function validId(id: string): boolean {
  return /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id))
}

// An explicit database dependency keeps tests away from the application file.
export function createApp(db: Database) {
  const app = new Hono()
  app.use('*', bodyLimit({ maxSize: MAX_BODY_BYTES, onError: (c) => c.text('Request body is too large', 413) }))
  app.use('*', csrf())
  app.use('/public/*', serveStatic({ root: './public', rewriteRequestPath: (path) => path.replace(/^\/public/, '') }))
  app.use('/favicon.ico', serveStatic({ path: './public/favicon.ico' }))

  app.get('/', async (c) => {
    try {
      return c.html(await readFile('./public/index.html', 'utf-8'))
    } catch {
      return c.text('Error serving HTML page', 500)
    }
  })

  app.get('/todos', (c) => {
    try {
      const todos = db.query<TodoRow, []>('SELECT * FROM todos ORDER BY created_at DESC, id DESC').all()
      return c.html(todos.length ? html`${todos.map(renderTodoItem)}` : html`<p data-empty-state>No todos yet. Add one below!</p>`)
    } catch {
      return c.html('<p class="error">Error fetching todos. Please try again later.</p>', 500)
    }
  })

  app.post('/todos', async (c) => {
    try {
      const { title, description } = await c.req.parseBody({ all: true })
      if (typeof title !== 'string' || !title.trim()) return c.text('Title is required', 400)
      if (title.trim().length > MAX_TITLE_LENGTH) return c.text('Title is too long', 400)
      if (description !== undefined && (typeof description !== 'string' || description.trim().length > MAX_DESCRIPTION_LENGTH)) {
        return c.text('Description must be text of at most 4000 characters', 400)
      }
      const todo = db.query<TodoRow, [string, string | null]>(
        'INSERT INTO todos (title, description) VALUES (?, ?) RETURNING *'
      ).get(title.trim(), typeof description === 'string' ? description.trim() : null)
      if (!todo) return c.html('<p class="error">Error creating todo. Please try again.</p>', 500)
      return c.html(renderTodoItem(todo), 201)
    } catch {
      return c.html('<p class="error">Error creating todo. Please try again.</p>', 500)
    }
  })

  app.put('/todos/:id', async (c) => {
    const id = c.req.param('id')
    if (!validId(id)) return c.text('Invalid todo ID', 400)
    try {
      const body = await c.req.parseBody({ all: true })
      const updates: { title?: string; description?: string; status?: 'pending' | 'completed' } = {}
      if (body.title !== undefined) {
        if (typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > MAX_TITLE_LENGTH) {
          return c.text('Title must be text of 1 to 200 characters', 400)
        }
        updates.title = body.title.trim()
      }
      if (body.description !== undefined) {
        if (typeof body.description !== 'string' || body.description.trim().length > MAX_DESCRIPTION_LENGTH) {
          return c.text('Description must be text of at most 4000 characters', 400)
        }
        updates.description = body.description.trim()
      }
      if (body.status !== undefined) {
        if (body.status !== 'pending' && body.status !== 'completed') return c.text('Invalid status', 400)
        updates.status = body.status
      }
      const existingTodo = db.query<TodoRow, [string]>('SELECT * FROM todos WHERE id = ?').get(id)
      if (!existingTodo) return c.text('Todo not found', 404)
      const fields = Object.keys(updates)
      const todo = fields.length ? db.query<TodoRow, string[]>(
        `UPDATE todos SET ${fields.map((field) => `${field} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING *`
      ).get(...Object.values(updates), id) : existingTodo
      if (!todo) return c.html('<p class="error">Error updating todo. Please try again.</p>', 500)
      return c.html(renderTodoItem(todo))
    } catch {
      return c.html('<p class="error">Error updating todo. Please try again.</p>', 500)
    }
  })

  app.delete('/todos/:id', (c) => {
    const id = c.req.param('id')
    if (!validId(id)) return c.text('Invalid todo ID', 400)
    try {
      const result = db.query('DELETE FROM todos WHERE id = ?').run(id)
      if (!result.changes) return c.text('Todo not found', 404)
      return c.html('', 200)
    } catch {
      c.header('HX-Retarget', '#error-message-container')
      c.header('HX-Reswap', 'innerHTML')
      return c.html('<p class="error">Error deleting todo. Please try again.</p>', 500)
    }
  })

  return app
}
