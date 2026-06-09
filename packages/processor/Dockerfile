FROM oven/bun:1.1-alpine AS runner
WORKDIR /app

# Processor has no external runtime deps — just bun + source
COPY packages/processor ./packages/processor

WORKDIR /app/packages/processor
CMD ["bun", "run", "src/index.ts"]
