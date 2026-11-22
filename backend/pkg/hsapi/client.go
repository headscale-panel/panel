package hsapi

import (
	"bytes"
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"syscall"
	"time"
)

// Config describes how to reach a headscale server.
type Config struct {
	// BaseURL is the scheme+host of the headscale HTTP listener, e.g.
	// "http://127.0.0.1:8080". A trailing slash is trimmed.
	BaseURL string
	// APIKey is the headscale API key sent as a bearer token.
	APIKey string
	// Insecure disables TLS entirely. Derived from the scheme by New when the
	// URL is plain http.
	Insecure bool
	// TLSSkipVerify accepts any server certificate.
	TLSSkipVerify bool
	// TLSCACert is a PEM bundle used as the only root CA.
	TLSCACert string
	// CacheTTL bounds how long read responses are reused. Zero disables caching.
	CacheTTL time.Duration
	// Timeout is the per-request timeout. Zero means 30s.
	Timeout time.Duration
}

// Client is the only way the panel talks to headscale.
type Client struct {
	baseURL  string
	apiKey   string
	http     *http.Client
	cacheTTL time.Duration

	mu    sync.Mutex
	cache map[string]*cacheEntry
	group singleflight
}

type cacheEntry struct {
	body    []byte
	expires time.Time
}

// New validates cfg and builds a client. It performs no network I/O; use Probe
// to verify reachability.
func New(cfg Config) (*Client, error) {
	base := strings.TrimRight(strings.TrimSpace(cfg.BaseURL), "/")
	if base == "" {
		return nil, &Error{Kind: KindValidation, Code: codeForKind(KindValidation), Op: "new client", Detail: "headscale API URL is empty"}
	}

	u, err := url.Parse(base)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" {
		return nil, &Error{
			Kind: KindValidation, Code: codeForKind(KindValidation), Op: "new client",
			Detail: fmt.Sprintf("headscale API URL %q is not a valid http(s) URL", base),
		}
	}

	if strings.TrimSpace(cfg.APIKey) == "" {
		return nil, &Error{Kind: KindValidation, Code: codeForKind(KindValidation), Op: "new client", Detail: "headscale API key is empty"}
	}

	transport := http.DefaultTransport.(*http.Transport).Clone()
	dialer := &net.Dialer{
		Timeout:   30 * time.Second,
		KeepAlive: 30 * time.Second,
		Control: func(_, address string, _ syscall.RawConn) error {
			host, _, splitErr := net.SplitHostPort(address)
			if splitErr != nil {
				return fmt.Errorf("invalid target address")
			}
			ip := net.ParseIP(host)
			if ip != nil && (ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsUnspecified()) {
				return fmt.Errorf("refusing connection to link-local or unspecified address")
			}
			return nil
		},
	}
	transport.DialContext = dialer.DialContext

	// Plain http needs no TLS configuration; https gets the caller's options.
	if u.Scheme == "https" {
		tlsCfg := &tls.Config{
			MinVersion:         tls.VersionTLS12,
			InsecureSkipVerify: cfg.TLSSkipVerify, //nolint:gosec // user opt-in for self-signed certificates
		}
		if pem := strings.TrimSpace(cfg.TLSCACert); pem != "" && !cfg.TLSSkipVerify {
			pool := x509.NewCertPool()
			if !pool.AppendCertsFromPEM([]byte(pem)) {
				return nil, &Error{
					Kind: KindValidation, Code: codeForKind(KindValidation), Op: "new client",
					Detail: "custom CA certificate could not be parsed as PEM",
				}
			}
			tlsCfg.RootCAs = pool
		}
		transport.TLSClientConfig = tlsCfg
	}

	timeout := cfg.Timeout
	if timeout <= 0 {
		timeout = 30 * time.Second
	}

	return &Client{
		baseURL:  base,
		apiKey:   strings.TrimSpace(cfg.APIKey),
		http:     &http.Client{Transport: transport, Timeout: timeout},
		cacheTTL: cfg.CacheTTL,
		cache:    make(map[string]*cacheEntry),
	}, nil
}

// BaseURL returns the configured API base without a trailing slash.
func (c *Client) BaseURL() string { return c.baseURL }

// APIKeyPrefix returns the first 14 characters of the API key, enough to
// identify it in a key listing without disclosing the secret.
func (c *Client) APIKeyPrefix() string {
	const n = 14 // "hskey-api-" + 4 chars of the prefix
	if len(c.apiKey) <= n {
		return ""
	}
	return c.apiKey[:n]
}

// do performs one request and returns the raw body.
func (c *Client) do(ctx context.Context, op, method, path string, query url.Values, body any) ([]byte, error) {
	target := c.baseURL + path
	if len(query) > 0 {
		target += "?" + query.Encode()
	}

	var payload io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			return nil, &Error{Kind: KindInternal, Code: codeForKind(KindInternal), Op: op, Wrapped: err}
		}
		payload = bytes.NewReader(raw)
	}

	req, err := http.NewRequestWithContext(ctx, method, target, payload)
	if err != nil {
		return nil, &Error{Kind: KindInternal, Code: codeForKind(KindInternal), Op: op, Wrapped: err}
	}

	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, newTransportError(op, err)
	}
	defer resp.Body.Close()

	// Bound the response so a malicious or broken server cannot exhaust memory.
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return nil, newTransportError(op, err)
	}

	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return nil, newHTTPError(op, resp.StatusCode, raw)
	}

	return raw, nil
}

// getJSON reads a GET response, reusing a cached body when one is fresh.
func (c *Client) getJSON(ctx context.Context, op, path string, query url.Values, out any) error {
	key := methodKey(http.MethodGet, path, query)

	body, err := c.cached(ctx, key, func() ([]byte, error) {
		return c.do(ctx, op, http.MethodGet, path, query, nil)
	})
	if err != nil {
		return err
	}

	if out == nil {
		return nil
	}
	if err := json.Unmarshal(body, out); err != nil {
		return &Error{Kind: KindInternal, Code: codeForKind(KindInternal), Op: op, Wrapped: err}
	}
	return nil
}

func methodKey(method, path string, query url.Values) string {
	if len(query) == 0 {
		return method + " " + path
	}
	return method + " " + path + "?" + query.Encode()
}

// cached returns a fresh cached body or runs fetch once per key. Concurrent
// callers for the same key share a single upstream request.
func (c *Client) cached(_ context.Context, key string, fetch func() ([]byte, error)) ([]byte, error) {
	if c.cacheTTL <= 0 {
		return fetch()
	}

	c.mu.Lock()
	if e, ok := c.cache[key]; ok && time.Now().Before(e.expires) {
		body := e.body
		c.mu.Unlock()
		return body, nil
	}
	c.mu.Unlock()

	return c.group.Do(key, func() ([]byte, error) {
		// Re-check inside the flight: a concurrent fetch may have just filled it.
		c.mu.Lock()
		if e, ok := c.cache[key]; ok && time.Now().Before(e.expires) {
			body := e.body
			c.mu.Unlock()
			return body, nil
		}
		c.mu.Unlock()

		body, err := fetch()
		if err != nil {
			return nil, err
		}

		c.mu.Lock()
		c.cache[key] = &cacheEntry{body: body, expires: time.Now().Add(c.cacheTTL)}
		c.mu.Unlock()

		return body, nil
	})
}

// Invalidate drops cached reads. Called after any write so a follow-up read
// cannot observe pre-write state.
func (c *Client) Invalidate() {
	c.mu.Lock()
	c.cache = make(map[string]*cacheEntry)
	c.mu.Unlock()
}

// singleflight collapses concurrent calls with the same key.
type singleflight struct {
	mu sync.Mutex
	m  map[string]*flight
}

type flight struct {
	done chan struct{}
	body []byte
	err  error
}

func (g *singleflight) Do(key string, fn func() ([]byte, error)) ([]byte, error) {
	g.mu.Lock()
	if g.m == nil {
		g.m = make(map[string]*flight)
	}
	if f, ok := g.m[key]; ok {
		g.mu.Unlock()
		<-f.done
		return f.body, f.err
	}
	f := &flight{done: make(chan struct{})}
	g.m[key] = f
	g.mu.Unlock()

	f.body, f.err = fn()

	g.mu.Lock()
	delete(g.m, key)
	g.mu.Unlock()
	close(f.done)

	return f.body, f.err
}
