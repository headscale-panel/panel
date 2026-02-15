# -- Build frontend assets --
FROM node:20-alpine AS frontend-builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /build

COPY headscale-panel-frontend/package.json headscale-panel-frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY headscale-panel-frontend/ .
RUN pnpm build && \
    find dist -name '*.map' -delete

# -- Build backend binary --
FROM golang:1.24-alpine AS backend-builder

RUN apk add --no-cache gcc musl-dev

WORKDIR /build
COPY headscale-panel-backend/go.mod headscale-panel-backend/go.sum ./
RUN go mod download

COPY headscale-panel-backend/ .
RUN CGO_ENABLED=1 GOOS=linux go build \
    -ldflags="-s -w" \
    -trimpath \
    -o headscale-panel .

# -- Minimal runtime image --
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata && \
    addgroup -S appgroup && \
    adduser -S -G appgroup -h /app appuser

WORKDIR /app

COPY --from=backend-builder /build/headscale-panel .
COPY --from=frontend-builder /build/dist ./frontend/

# Data directory for SQLite database
RUN mkdir -p /app/data && chown -R appuser:appgroup /app

ENV FRONTEND_DIR=/app/frontend
EXPOSE 8080

ENTRYPOINT ["./headscale-panel"]