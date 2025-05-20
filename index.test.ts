import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import app from "./index"; // Corrected path
import db from "./db";    // Corrected path

// Helper to clear todos table before each test
beforeEach(() => {
  try {
    db.query("DELETE FROM todos").run();
    // Optional: Reset autoincrement counter if your DB supports it and it's needed.
    // For SQLite, this is usually handled by `sqlite_sequence` table.
    // db.query("DELETE FROM sqlite_sequence WHERE name='todos'").run();
  } catch (e) {
    console.error("Error clearing todos table:", e);
  }
});

// Close the database connection after all tests are done
afterAll(() => {
  try {
    db.close();
  } catch (e) {
    console.error("Error closing database:", e);
  }
});

describe("Todo API Endpoints", () => {
  describe("GET /", () => {
    test("should return 200 OK and HTML content", async () => {
      const response = await app.fetch(new Request("http://localhost/"));
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toMatch(/text\/html/);
      const text = await response.text();
      expect(text).toContain("<title>Todo App</title>");
    });
  });

  describe("POST /todos", () => {
    test("should create a new todo and return HTML fragment", async () => {
      const formData = new FormData();
      formData.append("title", "Test Todo");
      formData.append("description", "This is a test description.");

      const request = new Request("http://localhost/todos", {
        method: "POST",
        body: formData,
      });
      const response = await app.fetch(request);

      expect(response.status).toBe(201); // Or 200 if that's the actual implementation for HTML
      const html = await response.text();
      expect(html).toContain("Test Todo");
      expect(html).toContain("This is a test description.");
      expect(html).toContain("Status: pending"); // Default status

      // Verify in DB
      const dbTodo = db.query("SELECT * FROM todos WHERE title = ?").get("Test Todo") as any;
      expect(dbTodo).not.toBeNull();
      expect(dbTodo.description).toBe("This is a test description.");
      expect(dbTodo.status).toBe("pending");
    });

    test("should return 400 for missing title", async () => {
      const formData = new FormData();
      formData.append("description", "This is a test description."); // No title

      const request = new Request("http://localhost/todos", {
        method: "POST",
        body: formData,
      });
      const response = await app.fetch(request);
      expect(response.status).toBe(400);
      const text = await response.text();
      expect(text).toContain("Title is required");
    });
  });

  describe("GET /todos", () => {
    test("should return todos as HTML", async () => {
      // Create a todo first
      db.query("INSERT INTO todos (title, description) VALUES (?, ?)")
        .run("Sample Todo", "Sample Description");

      const response = await app.fetch(new Request("http://localhost/todos"));
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Sample Todo");
      expect(html).toContain("Sample Description");
    });

    test("should return empty message if no todos", async () => {
        const response = await app.fetch(new Request("http://localhost/todos"));
        expect(response.status).toBe(200);
        const html = await response.text();
        expect(html).toContain("<p>No todos yet. Add one below!</p>");
      });
  });

  describe("PUT /todos/:id", () => {
    test("should update a todo's status to completed and return HTML fragment", async () => {
      const newTodo = db.query("INSERT INTO todos (title, description) VALUES (?, ?) RETURNING id")
                        .get("Update Me", "Initial Description") as { id: number };
      expect(newTodo).not.toBeNull();
      const todoId = newTodo.id;

      const formData = new FormData();
      formData.append("status", "completed");

      const request = new Request(`http://localhost/todos/${todoId}`, {
        method: "PUT",
        body: formData,
      });
      const response = await app.fetch(request);

      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain("Update Me");
      expect(html).toContain("Status: completed");

      // Verify in DB
      const dbTodo = db.query("SELECT * FROM todos WHERE id = ?").get(todoId) as any;
      expect(dbTodo).not.toBeNull();
      expect(dbTodo.status).toBe("completed");
    });

    test("should return 404 for updating a non-existent todo", async () => {
      const formData = new FormData();
      formData.append("status", "completed");

      const request = new Request("http://localhost/todos/99999", { // Non-existent ID
        method: "PUT",
        body: formData,
      });
      const response = await app.fetch(request);
      expect(response.status).toBe(404);
    });
  });

  describe("DELETE /todos/:id", () => {
    test("should delete a todo and return empty response", async () => {
      const newTodo = db.query("INSERT INTO todos (title, description) VALUES (?, ?) RETURNING id")
                        .get("Delete Me", "To be deleted") as { id: number };
      expect(newTodo).not.toBeNull();
      const todoId = newTodo.id;

      const request = new Request(`http://localhost/todos/${todoId}`, {
        method: "DELETE",
      });
      const response = await app.fetch(request);

      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toBe(""); // HTMX expects empty string for outerHTML swap to remove element

      // Verify in DB
      const dbTodo = db.query("SELECT * FROM todos WHERE id = ?").get(todoId);
      expect(dbTodo).toBeNull();
    });

    test("should return 404 for deleting a non-existent todo", async () => {
      const request = new Request("http://localhost/todos/99999", { // Non-existent ID
        method: "DELETE",
      });
      const response = await app.fetch(request);
      expect(response.status).toBe(404);
    });
  });
});
