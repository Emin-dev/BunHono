# Use an official Bun image as the base
FROM oven/bun:1.1.21-alpine

# Set the working directory
WORKDIR /app

# Copy package.json, bun.lockb
COPY package.json bun.lockb ./

# Install dependencies using the lockfile for reproducible builds
RUN bun install --frozen-lockfile

# Copy the rest of the application code
# This includes source files, public directory, and todos.sqlite
COPY . .

# Environment variable for the port, Fly.io will set this.
# Default to 3000 if PORT is not set during local build/run.
ENV PORT=3000

# Expose the port the application runs on.
# Fly.io will map this to external ports. The internal_port in fly.toml should match this.
# However, Fly.io sets the PORT env var, which our app uses.
# So, we expose what Fly.io expects internally.
EXPOSE 8080

# Command to run the application
# The 'start' script in package.json should be `bun run index.ts`
# Bun automatically picks up the PORT environment variable.
CMD ["bun", "run", "start"]
