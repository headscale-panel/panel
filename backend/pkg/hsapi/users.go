package hsapi

import (
	"context"
	"net/http"
	"net/url"
	"strconv"
)

// ListUsers returns every headscale user. The API supports id/name/email
// filters, but the panel always needs the full set to resolve bindings, so no
// filter is sent and callers filter locally.
func (c *Client) ListUsers(ctx context.Context) ([]User, error) {
	var out ListUsersOutputBody
	if err := c.getJSON(ctx, "listing users", "/api/v1/user", nil, &out); err != nil {
		return nil, err
	}
	return out.Users, nil
}

// GetUserByName returns the single user with the given name.
func (c *Client) GetUserByName(ctx context.Context, name string) (*User, error) {
	q := url.Values{}
	q.Set("name", name)

	var out ListUsersOutputBody
	if err := c.getJSON(ctx, "getting user "+name, "/api/v1/user", q, &out); err != nil {
		return nil, err
	}
	for i := range out.Users {
		if out.Users[i].Name == name {
			return &out.Users[i], nil
		}
	}
	return nil, &Error{
		Kind: KindNotFound, Status: http.StatusNotFound, Code: codeForKind(KindNotFound),
		Op: "getting user " + name, Detail: "user not found",
	}
}

// CreateUser creates a headscale user.
func (c *Client) CreateUser(ctx context.Context, name, displayName, email, pictureURL string) (*User, error) {
	body := CreateUserRequestBody{}
	if name != "" {
		body.Name = &name
	}
	if displayName != "" {
		body.DisplayName = &displayName
	}
	if email != "" {
		body.Email = &email
	}
	if pictureURL != "" {
		body.PictureUrl = &pictureURL
	}

	raw, err := c.do(ctx, "creating user", http.MethodPost, "/api/v1/user", nil, body)
	if err != nil {
		return nil, err
	}
	c.Invalidate()

	var out UserOutputBody
	if err := unmarshal(raw, "creating user", &out); err != nil {
		return nil, err
	}
	return &out.User, nil
}

// RenameUser renames a user by id.
func (c *Client) RenameUser(ctx context.Context, id uint64, newName string) (*User, error) {
	path := "/api/v1/user/" + strconv.FormatUint(id, 10) + "/rename/" + url.PathEscape(newName)

	raw, err := c.do(ctx, "renaming user", http.MethodPost, path, nil, nil)
	if err != nil {
		return nil, err
	}
	c.Invalidate()

	var out UserOutputBody
	if err := unmarshal(raw, "renaming user", &out); err != nil {
		return nil, err
	}
	return &out.User, nil
}

// DeleteUser removes a user. headscale refuses with a validation error while the
// user still owns nodes, so callers surface the detail instead of pre-checking.
func (c *Client) DeleteUser(ctx context.Context, id uint64) error {
	path := "/api/v1/user/" + strconv.FormatUint(id, 10)
	if _, err := c.do(ctx, "deleting user", http.MethodDelete, path, nil, nil); err != nil {
		return err
	}
	c.Invalidate()
	return nil
}
