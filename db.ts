import { Database } from 'bun:sqlite'

export interface TodoRow {
  id: number
  title: string
  description: string | null
  status: string
  created_at: string
  updated_at: string
}

// The caller must choose the database. Importing this module never opens a file.
export function createDatabase(filename: string): Database {
  const db = new Database(filename, { create: true })
  db.query(`
    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `).run()
  return db
}
