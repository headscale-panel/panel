package hsapi

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
)

// Kind classifies every failure the headscale API can produce, so callers never
// have to inspect HTTP status codes or RFC 9457 bodies themselves.
type Kind int

const (
	// KindValidation is a rejected request: bad input, or a policy the server
	// refuses to accept.
	KindValidation Kind = iota
	// KindAuth means the API key was rejected.
	KindAuth
	// KindNotFound means the addressed resource does not exist.
	KindNotFound
	// KindConflict means the request collided with existing state.
	KindConflict
	// KindUnavailable means headscale could not be reached at all.
	KindUnavailable
	// KindVersion means headscale is reachable but lacks the API surface this
	// client needs.
	KindVersion
	// KindNoPolicy means the policy has never been set. headscale reports this as
	// HTTP 500 with "acl policy not found", not as an empty document, so it needs
	// its own kind to keep it apart from real server failures.
	KindNoPolicy
	// KindInternal is an unexpected server-side failure.
	KindInternal
)

// Error is the single error type returned by this package.
type Error struct {
	Kind    Kind
	Status  int    // HTTP status, 0 when the request never reached the server
	Code    string // stable identifier for i18n, e.g. "hs.validation"
	Detail  string // human-readable message from headscale, safe to display
	Op      string // what the client was doing, e.g. "list nodes"
	Wrapped error  // transport error, logged but never displayed

	// Raw is the undecoded response body, kept only for matching documented
	// sentinels that headscale buries in errors[].message.
	Raw []byte
}

func (e *Error) Error() string {
	var b strings.Builder
	b.WriteString("hsapi: ")
	if e.Op != "" {
		b.WriteString(e.Op)
		b.WriteString(": ")
	}
	b.WriteString(e.Code)
	if e.Status != 0 {
		fmt.Fprintf(&b, " (HTTP %d)", e.Status)
	}
	if e.Detail != "" {
		b.WriteString(": ")
		b.WriteString(e.Detail)
	}
	if e.Wrapped != nil {
		b.WriteString(": ")
		b.WriteString(e.Wrapped.Error())
	}
	return b.String()
}

func (e *Error) Unwrap() error { return e.Wrapped }

// Is lets callers test a Kind with errors.Is(err, hsapi.ErrNotFound).
func (e *Error) Is(target error) bool {
	t, ok := target.(*Error)
	return ok && t.Kind == e.Kind
}

// Sentinel errors for errors.Is checks on a Kind.
var (
	ErrValidation  = &Error{Kind: KindValidation}
	ErrAuth        = &Error{Kind: KindAuth}
	ErrNotFound    = &Error{Kind: KindNotFound}
	ErrConflict    = &Error{Kind: KindConflict}
	ErrUnavailable = &Error{Kind: KindUnavailable}
	ErrVersion     = &Error{Kind: KindVersion}
	ErrNoPolicy    = &Error{Kind: KindNoPolicy}
	ErrInternal    = &Error{Kind: KindInternal}
)

// problem is the RFC 9457 body headscale returns for API errors.
type problem struct {
	Type   string `json:"type"`
	Title  string `json:"title"`
	Status int    `json:"status"`
	Detail string `json:"detail"`
}

func kindForStatus(status int) Kind {
	switch status {
	case http.StatusBadRequest, http.StatusUnprocessableEntity:
		return KindValidation
	case http.StatusUnauthorized, http.StatusForbidden:
		return KindAuth
	case http.StatusNotFound:
		return KindNotFound
	case http.StatusConflict:
		return KindConflict
	default:
		if status >= 500 {
			return KindInternal
		}
		return KindValidation
	}
}

func codeForKind(k Kind) string {
	switch k {
	case KindValidation:
		return "hs.validation"
	case KindAuth:
		return "hs.auth"
	case KindNotFound:
		return "hs.not_found"
	case KindConflict:
		return "hs.conflict"
	case KindUnavailable:
		return "hs.unavailable"
	case KindVersion:
		return "hs.version"
	case KindNoPolicy:
		return "hs.no_policy"
	default:
		return "hs.internal"
	}
}

// newHTTPError builds an *Error from a non-2xx response. The body is decoded as
// an RFC 9457 problem when possible; otherwise the raw text becomes the detail.
func newHTTPError(op string, status int, body []byte) *Error {
	kind := kindForStatus(status)

	detail := strings.TrimSpace(string(body))
	var p problem
	if err := json.Unmarshal(body, &p); err == nil {
		if d := strings.TrimSpace(p.Detail); d != "" {
			detail = d
		} else if d := strings.TrimSpace(p.Title); d != "" {
			detail = d
		}
	}
	if len(detail) > 512 {
		detail = detail[:512]
	}

	return &Error{
		Kind:   kind,
		Status: status,
		Code:   codeForKind(kind),
		Detail: detail,
		Op:     op,
		Raw:    body,
	}
}

func newTransportError(op string, err error) *Error {
	// A context deadline or a refused connection means headscale is not
	// answering; that is unavailability, not an internal fault.
	return &Error{
		Kind:    KindUnavailable,
		Code:    codeForKind(KindUnavailable),
		Op:      op,
		Wrapped: err,
	}
}

// AsError converts err into *Error, wrapping anything unexpected as internal.
func AsError(op string, err error) *Error {
	if err == nil {
		return nil
	}
	var e *Error
	if errors.As(err, &e) {
		return e
	}
	return &Error{Kind: KindInternal, Code: codeForKind(KindInternal), Op: op, Wrapped: err}
}
