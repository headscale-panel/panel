FROM golang:1.24-alpine AS builder

ARG GOPROXY=https://proxy.golang.org,direct

RUN go env -w GOPROXY=${GOPROXY} \
    && go install tailscale.com/cmd/derper@latest

FROM alpine:3.20

RUN apk add --no-cache ca-certificates

COPY --from=builder /go/bin/derper /app/derper

ENV DERP_DOMAIN=your-hostname.com
ENV DERP_CERT_MODE=letsencrypt
ENV DERP_ADDR=:443
ENV DERP_HTTP_PORT=-1
ENV DERP_STUN=true
ENV DERP_STUN_PORT=3478
ENV DERP_VERIFY_CLIENTS=false
ENV DERP_VERIFY_CLIENT_URL="http://headscale:8080/verify"

CMD /app/derper \
    --hostname=$DERP_DOMAIN \
    --certmode=$DERP_CERT_MODE \
    --a=$DERP_ADDR \
    --http-port=$DERP_HTTP_PORT \
    --stun=$DERP_STUN \
    --stun-port=$DERP_STUN_PORT \
    --verify-clients=$DERP_VERIFY_CLIENTS \
    --verify-client-url=$DERP_VERIFY_CLIENT_URL
