package hsapi

import (
	"context"
	"errors"
	"net/http"
	"strings"
)

// GetPolicy returns the current policy document and its revision timestamp.
// The timestamp is the optimistic-lock token for SetPolicy.
//
// A server that has never had a policy stored answers 500 with "acl policy not
// found"; that is reported as ErrNoPolicy so callers can distinguish "nothing
// configured yet" from a genuine server failure.
func (c *Client) GetPolicy(ctx context.Context) (*PolicyResponseBody, error) {
	var out PolicyResponseBody
	if err := c.getJSON(ctx, "getting policy", "/api/v1/policy", nil, &out); err != nil {
		var e *Error
		if errors.As(err, &e) && e.Status == http.StatusInternalServerError &&
			strings.Contains(strings.ToLower(string(e.Raw)), "acl policy not found") {
			return nil, &Error{
				Kind: KindNoPolicy, Status: e.Status, Code: codeForKind(KindNoPolicy),
				Op: "getting policy", Detail: e.Detail, Wrapped: e, Raw: e.Raw,
			}
		}
		return nil, err
	}
	return &out, nil
}

// SetPolicy replaces the policy. headscale only accepts this in database mode;
// file mode answers validation error, which the caller surfaces verbatim.
func (c *Client) SetPolicy(ctx context.Context, policy string) (*PolicyResponseBody, error) {
	body := PolicyRequestBody{Policy: &policy}

	raw, err := c.do(ctx, "setting policy", http.MethodPut, "/api/v1/policy", nil, body)
	if err != nil {
		return nil, err
	}
	c.Invalidate()

	var out PolicyResponseBody
	if err := unmarshal(raw, "setting policy", &out); err != nil {
		return nil, err
	}
	return &out, nil
}

// CheckPolicy validates a policy without persisting it.
func (c *Client) CheckPolicy(ctx context.Context, policy string) error {
	body := PolicyRequestBody{Policy: &policy}
	_, err := c.do(ctx, "checking policy", http.MethodPost, "/api/v1/policy/check", nil, body)
	return err
}
