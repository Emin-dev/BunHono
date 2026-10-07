# Local demo container. Authentication is required before public exposure.
FROM oven/bun:1.4.2-alpine
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production --ignore-scripts
COPY app.ts db.ts index.ts ./
COPY public ./public
RUN mkdir /data && chown bun:bun /data
USER bun
ENV HOST=0.0.0.0 PORT=3000 DATABASE_PATH=/data/todos.sqlite
EXPOSE 3000
CMD ["bun", "run", "start"]
