FROM oven/bun:1.1-alpine
WORKDIR /app

COPY package.json ./
COPY packages/storage/package.json  ./packages/storage/package.json
COPY packages/query-api/package.json ./packages/query-api/package.json

RUN bun install

COPY packages/storage  ./packages/storage
COPY packages/query-api ./packages/query-api

WORKDIR /app/packages/query-api
EXPOSE 4211
CMD ["bun", "run", "src/index.ts"]
