import { Database } from "bun:sqlite";

// Open or create the SQLite database file
const db = new Database("todos.sqlite");

// SQL to create the todos table
const createTableQuery = `
  CREATE TABLE IF NOT EXISTS todos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`;

// Execute the query to create the table
db.query(createTableQuery).run();

console.log("Table 'todos' created successfully or already exists.");

// Export the database connection
export default db;
