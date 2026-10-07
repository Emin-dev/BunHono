// HTMX does not swap error responses by default. Keep failures visible and
// preserve the user's form input unless the create request succeeded.
document.body.addEventListener('htmx:beforeSwap', (event) => {
  if (event.detail.xhr.status >= 400) {
    event.detail.shouldSwap = true
    event.detail.isError = true
    event.detail.swapOverride = 'innerHTML'
    event.detail.target = document.getElementById('error-message-container')
  }
})

document.body.addEventListener('htmx:afterRequest', (event) => {
  if (!event.detail.successful) return
  document.getElementById('error-message-container').textContent = ''
  if (event.detail.elt.id === 'add-todo-form') {
    event.detail.elt.reset()
    document.querySelector('#todo-list [data-empty-state]')?.remove()
  }
})
