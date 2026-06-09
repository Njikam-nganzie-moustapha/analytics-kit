FROM oven/bun:1.1-alpine
WORKDIR /app

COPY package.json ./
COPY packages/storage/package.json  ./packages/storage/package.json
COPY packages/collector/package.json ./packages/collector/package.json

RUN bun install

COPY packages/storage  ./packages/storage
COPY packages/collector ./packages/collector

WORKDIR /app/packages/collector
EXPOSE 4210
CMD ["bun", "run", "src/index.ts"]
