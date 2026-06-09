FROM oven/bun:1.1-alpine
WORKDIR /app/packages/query-api
COPY packages/query-api/package.json ./
RUN bun install
COPY packages/query-api/src ./src
EXPOSE 4211
CMD ["bun", "run", "src/index.ts"]
