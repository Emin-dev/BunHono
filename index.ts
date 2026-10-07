import { createApp, MAX_BODY_BYTES } from './app'
import { createDatabase } from './db'

const db = createDatabase(process.env.DATABASE_PATH || 'todos.sqlite')
const app = createApp(db)

export default {
  hostname: process.env.HOST || '127.0.0.1',
  port: Number(process.env.PORT || 3000),
  maxRequestBodySize: MAX_BODY_BYTES,
  fetch: app.fetch,
}
