ARG ALPINE_MIRROR=

FROM node:26-alpine AS frontend-builder

ARG PNPM_VERSION=10.33.1
RUN npm install -g "pnpm@${PNPM_VERSION}"

WORKDIR /build

COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY frontend/ .
RUN pnpm build && \
    find dist -name '*.map' -delete

FROM golang:1.27-alpine AS backend-builder

ARG ALPINE_MIRROR
ARG VERSION_CODE

RUN if [ -n "$ALPINE_MIRROR" ]; then \
    sed -i "s/dl-cdn.alpinelinux.org/$ALPINE_MIRROR/g" /etc/apk/repositories; \
    fi && \
    apk add --no-cache gcc musl-dev

WORKDIR /build
COPY backend/go.mod backend/go.sum ./
RUN go mod download

COPY backend/ .
RUN CGO_ENABLED=1 GOOS=linux go build \
    -ldflags="-s -w -X main.VersionCode=${VERSION_CODE}" \
    -trimpath \
    -o headscale-panel .

FROM alpine:3.20

ARG ALPINE_MIRROR

RUN if [ -n "$ALPINE_MIRROR" ]; then \
    sed -i "s/dl-cdn.alpinelinux.org/$ALPINE_MIRROR/g" /etc/apk/repositories; \
    fi && \
    apk update && \
    apk add --no-cache ca-certificates tzdata docker-cli && \
    addgroup -S appgroup && \
    adduser -S -G appgroup -h /app appuser

WORKDIR /app

COPY --from=backend-builder /build/headscale-panel .
COPY --from=frontend-builder /build/dist ./frontend/

RUN mkdir -p /app/data && chown -R appuser:appgroup /app

ENV GIN_MODE=release
ENV FRONTEND_DIR=/app/frontend
EXPOSE 8080

USER appuser:appgroup

ENTRYPOINT ["./headscale-panel"]