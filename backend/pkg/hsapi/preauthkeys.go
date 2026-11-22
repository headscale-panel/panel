package hsapi

import (
	"context"
	"net/http"
	"net/url"
	"strconv"
	"time"
)

// ListPreAuthKeys returns every pre-auth key. The API has no per-user filter, so
// callers filter locally.
func (c *Client) ListPreAuthKeys(ctx context.Context) ([]PreAuthKey, error) {
	var out ListPreAuthKeysOutputBody
	if err := c.getJSON(ctx, "listing pre-auth keys", "/api/v1/preauthkey", nil, &out); err != nil {
		return nil, err
	}
	return out.PreAuthKeys, nil
}

// CreatePreAuthKey mints a key. userID is the decimal headscale user id; pass 0
// with aclTags to create a tagged key that belongs to no user.
func (c *Client) CreatePreAuthKey(ctx context.Context, userID uint64, reusable, ephemeral bool, expiration *time.Time, aclTags []string) (*PreAuthKey, error) {
	body := CreatePreAuthKeyRequestBody{
		Reusable:   &reusable,
		Ephemeral:  &ephemeral,
		Expiration: expiration,
	}
	if userID != 0 {
		id := strconv.FormatUint(userID, 10)
		body.User = &id
	}
	// Creation differs from update: there is no existing value to clear, so an
	// empty tag list and no tag list mean the same thing. Sending `"aclTags": []`
	// here would add a field headscale has no use for.
	if len(aclTags) > 0 {
		body.AclTags = optionalList(aclTags)
	}

	raw, err := c.do(ctx, "creating pre-auth key", http.MethodPost, "/api/v1/preauthkey", nil, body)
	if err != nil {
		return nil, err
	}
	c.Invalidate()

	var out PreAuthKeyOutputBody
	if err := unmarshal(raw, "creating pre-auth key", &out); err != nil {
		return nil, err
	}
	return &out.PreAuthKey, nil
}

// ExpirePreAuthKey expires a key by id.
func (c *Client) ExpirePreAuthKey(ctx context.Context, id uint64) error {
	sid := strconv.FormatUint(id, 10)
	body := ExpirePreAuthKeyRequestBody{Id: &sid}

	if _, err := c.do(ctx, "expiring pre-auth key", http.MethodPost, "/api/v1/preauthkey/expire", nil, body); err != nil {
		return err
	}
	c.Invalidate()
	return nil
}

// DeletePreAuthKey removes a key. The id travels in the query string because
// DELETE carries no body.
func (c *Client) DeletePreAuthKey(ctx context.Context, id uint64) error {
	q := url.Values{}
	q.Set("id", strconv.FormatUint(id, 10))

	if _, err := c.do(ctx, "deleting pre-auth key", http.MethodDelete, "/api/v1/preauthkey", q, nil); err != nil {
		return err
	}
	c.Invalidate()
	return nil
}

// ListAPIKeys returns the configured API keys, with prefixes masked by the server.
func (c *Client) ListAPIKeys(ctx context.Context) ([]ApiKey, error) {
	var out ListApiKeysOutputBody
	if err := c.getJSON(ctx, "listing API keys", "/api/v1/apikey", nil, &out); err != nil {
		return nil, err
	}
	return out.ApiKeys, nil
}
