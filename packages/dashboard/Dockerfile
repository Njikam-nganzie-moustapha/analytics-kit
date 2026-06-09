### Stage 1 — Build ############################################################
FROM node:20-alpine AS builder
WORKDIR /app

# Install only dashboard deps via workspace
COPY package.json ./
COPY packages/dashboard/package.json ./packages/dashboard/
RUN npm install --workspace=packages/dashboard --ignore-scripts

COPY packages/dashboard/ ./packages/dashboard/

# Vite bakes env vars at build time via import.meta.env
ARG VITE_QUERY_API_URL=/api
ARG VITE_API_KEY=
ENV VITE_QUERY_API_URL=$VITE_QUERY_API_URL
ENV VITE_API_KEY=$VITE_API_KEY

RUN npm run build --workspace=packages/dashboard

### Stage 2 — Serve ############################################################
FROM nginx:1.27-alpine AS runner
COPY --from=builder /app/packages/dashboard/dist /usr/share/nginx/html
COPY packages/dashboard/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
