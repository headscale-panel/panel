package hsapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/url"
	"strconv"
	"time"
)

func unmarshal(raw []byte, op string, out any) error {
	if err := json.Unmarshal(raw, out); err != nil {
		return &Error{Kind: KindInternal, Code: codeForKind(KindInternal), Op: op, Wrapped: err}
	}
	return nil
}

// ListNodes returns every node, optionally filtered by user name.
func (c *Client) ListNodes(ctx context.Context, userName string) ([]Node, error) {
	var q url.Values
	if userName != "" {
		q = url.Values{}
		q.Set("user", userName)
	}

	var out ListNodesOutputBody
	if err := c.getJSON(ctx, "listing nodes", "/api/v1/node", q, &out); err != nil {
		return nil, err
	}
	return out.Nodes, nil
}

// GetNode returns one node by id.
//
// headscale 0.30 populates node.user for GET /api/v1/node (the list) but leaves
// it null for GET /api/v1/node/{id}. Callers must not have to know that, so the
// owning user is backfilled from the list endpoint, which the two-second cache
// usually makes free.
func (c *Client) GetNode(ctx context.Context, id uint64) (*Node, error) {
	path := "/api/v1/node/" + strconv.FormatUint(id, 10)

	var out NodeOutputBody
	if err := c.getJSON(ctx, "getting node", path, nil, &out); err != nil {
		return nil, err
	}

	if out.Node.User.Id == "" {
		if u, err := c.nodeOwner(ctx, id); err == nil {
			out.Node.User = u
		}
	}
	return &out.Node, nil
}

// nodeOwner finds a node's owner through the list endpoint. A failure here is
// not fatal: the caller still gets the node, just without its owner.
func (c *Client) nodeOwner(ctx context.Context, id uint64) (User, error) {
	nodes, err := c.ListNodes(ctx, "")
	if err != nil {
		return User{}, err
	}
	for i := range nodes {
		if nodes[i].Id == strconv.FormatUint(id, 10) {
			return nodes[i].User, nil
		}
	}
	return User{}, &Error{Kind: KindNotFound, Code: codeForKind(KindNotFound), Op: "resolving node owner"}
}

// RenameNode sets a node's given name.
func (c *Client) RenameNode(ctx context.Context, id uint64, newName string) (*Node, error) {
	path := "/api/v1/node/" + strconv.FormatUint(id, 10) + "/rename/" + url.PathEscape(newName)
	return c.nodeWrite(ctx, "renaming node", http.MethodPost, path, nil)
}

// DeleteNode removes a node.
func (c *Client) DeleteNode(ctx context.Context, id uint64) error {
	path := "/api/v1/node/" + strconv.FormatUint(id, 10)
	if _, err := c.do(ctx, "deleting node", http.MethodDelete, path, nil, nil); err != nil {
		return err
	}
	c.Invalidate()
	return nil
}

// ExpireNode expires a node's key, or clears expiry when disableExpiry is set.
func (c *Client) ExpireNode(ctx context.Context, id uint64, expiry *time.Time, disableExpiry bool) (*Node, error) {
	body := ExpireNodeRequestBody{DisableExpiry: &disableExpiry}
	if expiry != nil {
		body.Expiry = expiry
	}

	path := "/api/v1/node/" + strconv.FormatUint(id, 10) + "/expire"
	return c.nodeWrite(ctx, "expiring node", http.MethodPost, path, body)
}

// SetNodeTags replaces a node's tags. headscale validates tag syntax and rejects
// malformed tags with a validation error.
// SetNodeTags replaces a node's tags.
//
// A nil slice means "leave the tags alone"; an empty, non-nil slice clears them.
// The distinction matters: headscale treats an omitted field as no change, so a
// caller that wants to remove every tag has to send `"tags": []` explicitly, and
// a caller that wants to edit nothing must not send the field at all.
func (c *Client) SetNodeTags(ctx context.Context, id uint64, tags []string) (*Node, error) {
	body := SetTagsRequestBody{Tags: optionalList(tags)}
	path := "/api/v1/node/" + strconv.FormatUint(id, 10) + "/tags"
	return c.nodeWrite(ctx, "setting node tags", http.MethodPost, path, body)
}

// SetApprovedRoutes replaces a node's approved routes wholesale.
//
// Same three-way rule as SetNodeTags: nil leaves them alone, an empty slice
// clears them. This is the only correct way to disable every route on a node —
// omitting the field would look like "no change" and the routes would stay.
func (c *Client) SetApprovedRoutes(ctx context.Context, id uint64, routes []string) (*Node, error) {
	body := SetApprovedRoutesRequestBody{Routes: optionalList(routes)}
	path := "/api/v1/node/" + strconv.FormatUint(id, 10) + "/approve_routes"
	return c.nodeWrite(ctx, "setting approved routes", http.MethodPost, path, body)
}

// optionalList maps a slice onto the pointer the wire type uses.
//
// nil stays nil so the field is omitted; an empty but non-nil slice becomes a
// non-nil pointer to it, which serialises as [] rather than null. Taking the
// address unconditionally (as the naive version did) turned "no change" into
// `"tags": null`.
func optionalList(values []string) *[]string {
	if values == nil {
		return nil
	}
	return &values
}

// RegisterNode registers a node from a pending auth id for the named user.
func (c *Client) RegisterNode(ctx context.Context, userName, authKey string) (*Node, error) {
	q := url.Values{}
	q.Set("user", userName)
	q.Set("key", authKey)

	raw, err := c.do(ctx, "registering node", http.MethodPost, "/api/v1/node/register", q, nil)
	if err != nil {
		return nil, err
	}
	c.Invalidate()

	var out NodeOutputBody
	if err := unmarshal(raw, "registering node", &out); err != nil {
		return nil, err
	}
	return &out.Node, nil
}

func (c *Client) nodeWrite(ctx context.Context, op, method, path string, body any) (*Node, error) {
	raw, err := c.do(ctx, op, method, path, nil, body)
	if err != nil {
		return nil, err
	}
	c.Invalidate()

	var out NodeOutputBody
	if err := unmarshal(raw, op, &out); err != nil {
		return nil, err
	}

	if out.Node.User.Id == "" {
		if u, ownerErr := c.nodeOwner(ctx, parseNodeID(out.Node.Id)); ownerErr == nil {
			out.Node.User = u
		}
	}
	return &out.Node, nil
}

func parseNodeID(raw string) uint64 {
	id, _ := strconv.ParseUint(raw, 10, 64)
	return id
}
