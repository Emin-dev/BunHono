import { Hono } from 'hono'
import { serveStatic } from 'hono/bun'
import db from './db'
import fs from 'fs/promises'

const app = new Hono()

// Helper function to render a single todo item as HTML
const renderTodoItem = (todo) => {
  return `
    <article id="todo-${todo.id}" style="margin-bottom: 1rem; ${todo.status === 'completed' ? 'border-left: 5px solid green;' : ''}">
      <img src="https://picsum.photos/seed/${todo.id}/200/100" alt="Random image for todo ${todo.id}" style="border-radius: 6px; margin-bottom: 0.5rem;">
      <hgroup>
        <h4>${todo.title}</h4>
        <small>Status: ${todo.status}</small>
      </hgroup>
      <p>${todo.description || ''}</p>
      <footer>
        ${todo.status !== 'completed' ? `
        <button 
          hx-put="/todos/${todo.id}" 
          hx-target="#todo-${todo.id}" 
          hx-swap="outerHTML"
          hx-vals='{"status": "completed"}'
          class="outline"
          style="margin-right: 0.5rem;"
        >Mark Completed</button>` : ''}
        <button 
          hx-delete="/todos/${todo.id}" 
          hx-target="#todo-${todo.id}" 
          hx-swap="outerHTML"
          class="contrast"
        >Delete</button>
      </footer>
    </article>
  `
}

// Serve static files from the 'public' directory
app.use('/public/*', serveStatic({ root: './' }))
app.use('/favicon.ico', serveStatic({ path: './public/favicon.ico' })) // Optional: if you have a favicon

// Serve index.html for the root route
app.get('/', async (c) => {
  try {
    const htmlContent = await fs.readFile('./public/index.html', 'utf-8')
    return c.html(htmlContent)
  } catch (error) {
    console.error("Error reading index.html:", error)
    return c.text('Error serving HTML page', 500)
  }
})

// GET /todos: Fetch all todos and return as HTML fragments
app.get('/todos', (c) => {
  try {
    const todos = db.query('SELECT * FROM todos ORDER BY created_at DESC').all()
    if (todos.length === 0) {
        return c.html('<p>No todos yet. Add one below!</p>');
    }
    const html = todos.map(renderTodoItem).join('')
    return c.html(html)
  } catch (error) {
    console.error('Error fetching todos:', error)
    // For HTMX, it's often better to return an error message that can be displayed
    return c.html('<p class="error">Error fetching todos. Please try again later.</p>', 500)
  }
})

// POST /todos: Create a new todo and return HTML fragment for the new todo
app.post('/todos', async (c) => {
  try {
    const { title, description } = await c.req.parseBody() // Use parseBody for form data

    if (!title || typeof title !== 'string' || title.trim() === '') {
      // For HTMX, you might return an error message to display, or just a 400
      return c.text('Title is required', 400) 
    }

    const result = db
      .query(
        'INSERT INTO todos (title, description) VALUES (?, ?) RETURNING *'
      )
      .get(title.trim(), (description && typeof description === 'string') ? description.trim() : null)

    if (!result) {
        return c.html('<p class="error">Error creating todo. Please try again.</p>', 500);
    }
    return c.html(renderTodoItem(result), 201)
  } catch (error) {
    console.error('Error creating todo:', error)
    return c.html('<p class="error">Error creating todo. Please try again.</p>', 500)
  }
})

// PUT /todos/:id: Update a todo and return HTML fragment for the updated todo
app.put('/todos/:id', async (c) => {
  try {
    const { id } = c.req.param()
    const body = await c.req.parseBody() // Use parseBody for form data
    const status = body.status

    const existingTodo = db.query('SELECT * FROM todos WHERE id = ?').get(id)
    if (!existingTodo) {
      return c.text('Todo not found', 404) // HTMX can handle this
    }

    let updatedTodo;
    if (status === 'completed') {
      updatedTodo = db.query('UPDATE todos SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING *')
                       .get('completed', id)
    } else {
      // Potentially handle other updates here if needed, or return error
      // For now, only 'completed' status update is fully implemented via this endpoint by the HTML
      // Or, if other fields are sent:
      const { title, description } = body;
      const updateFields = {};
      if (title && typeof title === 'string') updateFields.title = title.trim();
      if (description && typeof description === 'string') updateFields.description = description.trim();
      if (status && typeof status === 'string') updateFields.status = status.trim();
      
      if (Object.keys(updateFields).length > 0) {
        let setClauses = Object.keys(updateFields).map(key => `${key} = ?`).join(', ');
        let params = [...Object.values(updateFields), id];
        updatedTodo = db.query(`UPDATE todos SET ${setClauses}, updated_at = CURRENT_TIMESTAMP WHERE id = ? RETURNING *`)
                         .get(...params);
      } else {
        updatedTodo = existingTodo; // No actual change
      }
    }
    
    if (!updatedTodo) {
        return c.html(`<p class="error">Error updating todo ${id}.</p>`, 500);
    }

    return c.html(renderTodoItem(updatedTodo))
  } catch (error) {
    console.error('Error updating todo:', error)
    return c.html(`<p class="error">Error updating todo. Please try again.</p>`, 500)
  }
})

// DELETE /todos/:id: Delete a todo, return empty response (for HTMX to swap out)
app.delete('/todos/:id', (c) => {
  try {
    const { id } = c.req.param()

    const existingTodo = db.query('SELECT id FROM todos WHERE id = ?').get(id)
    if (!existingTodo) {
      return c.text('Todo not found', 404) // HTMX will remove the element
    }

    db.query('DELETE FROM todos WHERE id = ?').run(id)
    return c.html('', 200) // Return empty string, HTMX will swap outerHTML and remove it
  } catch (error) {
    console.error('Error deleting todo:', error)
    // Optionally return an error that HTMX can display, e.g., as a header
    c.header('HX-Retarget', '#error-message-container') // Define an error container in your HTML
    c.header('HX-Reswap', 'innerHTML')
    return c.html(`<p class="error">Error deleting todo ${id}.</p>`, 500)
  }
})

export default {
  port: process.env.PORT || 3000, // Use environment variable for port if available
  fetch: app.fetch,
}