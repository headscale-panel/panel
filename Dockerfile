ARG ALPINE_MIRROR=

FROM node:20-alpine AS frontend-builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /build

COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY frontend/ .
RUN pnpm build && \
    find dist -name '*.map' -delete

FROM golang:1.25-alpine AS backend-builder

ARG ALPINE_MIRROR

RUN if [ -n "$ALPINE_MIRROR" ]; then \
    sed -i "s/dl-cdn.alpinelinux.org/$ALPINE_MIRROR/g" /etc/apk/repositories; \
    fi && \
    apk add --no-cache gcc musl-dev

WORKDIR /build
COPY backend/go.mod backend/go.sum ./
RUN go mod download

COPY backend/ .
RUN CGO_ENABLED=1 GOOS=linux go build \
    -ldflags="-s -w" \
    -trimpath \
    -o headscale-panel .

FROM alpine:3.20

ARG ALPINE_MIRROR

RUN if [ -n "$ALPINE_MIRROR" ]; then \
    sed -i "s/dl-cdn.alpinelinux.org/$ALPINE_MIRROR/g" /etc/apk/repositories; \
    fi && \
    apk update && \
    apk add --no-cache ca-certificates tzdata && \
    addgroup -S appgroup && \
    adduser -S -G appgroup -h /app appuser

WORKDIR /app

COPY --from=backend-builder /build/headscale-panel .
COPY --from=frontend-builder /build/dist ./frontend/

RUN mkdir -p /app/data && chown -R appuser:appgroup /app

ENV FRONTEND_DIR=/app/frontend
EXPOSE 8080

ENTRYPOINT ["./headscale-panel"]