package hsapi

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
)

// ConnState is the outcome of probing a headscale server.
type ConnState string

const (
	// StateOK means the server is reachable and speaks the v1 API this client needs.
	StateOK ConnState = "ok"
	// StateUnreachable means no HTTP response was obtained.
	StateUnreachable ConnState = "unreachable"
	// StateTLSError means the TLS handshake failed.
	StateTLSError ConnState = "tls_error"
	// StateUnauthorized means the API key was rejected.
	StateUnauthorized ConnState = "unauthorized"
	// StateVersionMismatch means the server is older than 0.30.
	StateVersionMismatch ConnState = "version_mismatch"
)

// ProbeResult reports what a running server supports.
type ProbeResult struct {
	State    ConnState      `json:"state"`
	Detail   string         `json:"detail,omitempty"`
	Commit   string         `json:"commit,omitempty"`
	Baseline BaselineStatus `json:"baseline"`
	// HasV1API is true when /api/v1/health answered, which only 0.30+ does.
	HasV1API bool `json:"has_v1_api"`
	// DBConnectivity mirrors the health endpoint's database check.
	DBConnectivity bool `json:"db_connectivity"`
}

// versionInfo mirrors the unauthenticated /version response.
type versionInfo struct {
	Version   string `json:"version"`
	Commit    string `json:"commit"`
	BuildTime string `json:"buildTime"`
	Dirty     bool   `json:"dirty"`
}

// Probe determines reachability, API capability and baseline alignment.
//
// The gate is the presence of /api/v1/health, not the version string: dev builds
// report an empty or "dev" version, so a version comparison would reject a
// perfectly usable server.
func (c *Client) Probe(ctx context.Context) ProbeResult {
	res := ProbeResult{Baseline: BaselineUnknown}

	body, err := c.do(ctx, "probing version", http.MethodGet, "/version", nil, nil)
	if err != nil {
		e := AsError("probing version", err)
		switch {
		case e.Kind == KindUnavailable && isTLSError(e.Wrapped):
			res.State = StateTLSError
		case e.Kind == KindUnavailable:
			res.State = StateUnreachable
		default:
			res.State = StateUnreachable
		}
		res.Detail = e.Detail
		if res.Detail == "" && e.Wrapped != nil {
			res.Detail = e.Wrapped.Error()
		}
		return res
	}

	var v versionInfo
	if err := json.Unmarshal(body, &v); err == nil {
		res.Commit = v.Commit
		res.Baseline = CompareCommit(v.Commit)
	}

	var health HealthResponseBody
	err = c.getJSON(ctx, "probing v1 API", "/api/v1/health", nil, &health)
	if err != nil {
		e := AsError("probing v1 API", err)
		switch e.Kind {
		case KindAuth:
			res.State = StateUnauthorized
			res.Detail = "the API key was rejected"
		case KindNotFound:
			// /api/v1/health only exists on 0.30+; its absence means an older server.
			res.State = StateVersionMismatch
			res.Detail = "headscale is older than 0.30: /api/v1/health is missing"
		default:
			res.State = StateUnreachable
			res.Detail = e.Detail
		}
		return res
	}

	res.State = StateOK
	res.HasV1API = true
	res.DBConnectivity = health.DatabaseConnectivity
	return res
}

func isTLSError(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "tls") || strings.Contains(msg, "x509") || strings.Contains(msg, "certificate")
}

// Health performs a single authenticated health check, for connectivity tests
// that do not need baseline reporting.
func (c *Client) Health(ctx context.Context) error {
	var out HealthResponseBody
	return c.getJSON(ctx, "checking health", "/api/v1/health", nil, &out)
}
