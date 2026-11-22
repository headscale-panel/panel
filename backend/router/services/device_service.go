// Copyright (C) 2026
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <http://www.gnu.org/licenses/>.

package services

import (
	"context"
	"encoding/json"
	"headscale-panel/internal/network"
	"headscale-panel/pkg/constants"
	"headscale-panel/pkg/hsapi"
	"headscale-panel/pkg/unifyerror"
	"net/http"
	"strings"
	"time"
)

type deviceService struct{}

// DeviceService owns device operations on headscale nodes.
var DeviceService = new(deviceService)

// DeviceView is a node as the UI renders it.
type DeviceView struct {
	ID          string     `json:"id"`
	Name        string     `json:"name"`
	GivenName   string     `json:"given_name"`
	OwnerID     uint64     `json:"owner_hs_user_id"`
	OwnerName   string     `json:"owner_name"`
	OwnerTagged bool       `json:"owner_tagged"`
	UserID      string     `json:"user_id"`
	Online      bool       `json:"online"`
	Ephemeral   bool       `json:"ephemeral"`
	IPAddresses []string   `json:"ip_addresses"`
	LastSeen    *time.Time `json:"last_seen,omitempty"`
	Expiry      *time.Time `json:"expiry,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	Tags        []string   `json:"tags"`

	ApprovedRoutes  []string `json:"approved_routes"`
	AvailableRoutes []string `json:"available_routes"`
	SubnetRoutes    []string `json:"subnet_routes"`

	IsExitNode bool `json:"is_exit_node"`
}

// DeviceFilter narrows a list request.
type DeviceFilter struct {
	Query  string
	UserID uint64
	Online *bool
	Tagged *bool
}

// ListDevices returns devices the actor may see.
func (s *deviceService) ListDevices(ctx context.Context, actorUserID uint, filter DeviceFilter) ([]DeviceView, error) {
	if err := RequireAnyPermission(actorUserID, constants.PermNetworkDeviceList, constants.PermNetworkDeviceListSelf); err != nil {
		return nil, err
	}

	scope, err := loadActorScope(actorUserID)
	if err != nil {
		return nil, err
	}

	client, err := headscaleRESTClient()
	if err != nil {
		return nil, err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	nodes, listErr := client.ListNodes(queryCtx, "")
	if listErr != nil {
		return nil, unifyerror.HeadscaleAPIError(listErr)
	}

	out := make([]DeviceView, 0, len(nodes))
	for i := range nodes {
		node := &nodes[i]
		if !actorCanAccessNode(scope, node) {
			continue
		}
		view := toDeviceView(node)
		if !matchesDeviceFilter(&view, filter) {
			continue
		}
		out = append(out, view)
	}
	return out, nil
}

// GetDevice returns one device.
func (s *deviceService) GetDevice(ctx context.Context, actorUserID uint, nodeID uint64) (*DeviceView, error) {
	if err := RequireAnyPermission(actorUserID, constants.PermNetworkDeviceRead, constants.PermNetworkDeviceListSelf); err != nil {
		return nil, err
	}

	client, err := headscaleRESTClient()
	if err != nil {
		return nil, err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	node, getErr := client.GetNode(queryCtx, nodeID)
	if getErr != nil {
		return nil, unifyerror.HeadscaleAPIError(getErr)
	}
	if err := ensureActorCanAccessNode(actorUserID, node); err != nil {
		return nil, err
	}

	view := toDeviceView(node)
	return &view, nil
}

// RenameDevice changes a device's given name.
func (s *deviceService) RenameDevice(ctx context.Context, actorUserID uint, nodeID uint64, newName string) (*DeviceView, error) {
	if err := RequireAnyPermission(actorUserID, constants.PermNetworkDeviceUpdate, constants.PermNetworkDeviceUpdateSelf); err != nil {
		return nil, err
	}

	newName = strings.TrimSpace(newName)
	if newName == "" {
		return nil, unifyerror.WrongParam("name")
	}

	client, err := headscaleRESTClient()
	if err != nil {
		return nil, err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	node, getErr := client.GetNode(queryCtx, nodeID)
	if getErr != nil {
		return nil, unifyerror.HeadscaleAPIError(getErr)
	}
	if err := ensureActorCanAccessNode(actorUserID, node); err != nil {
		return nil, err
	}

	renamed, renameErr := client.RenameNode(queryCtx, nodeID, newName)
	if renameErr != nil {
		return nil, unifyerror.HeadscaleAPIError(renameErr)
	}

	view := toDeviceView(renamed)
	return &view, nil
}

// DeleteDevice removes a device.
func (s *deviceService) DeleteDevice(ctx context.Context, actorUserID uint, nodeID uint64) error {
	if err := RequireAnyPermission(actorUserID, constants.PermNetworkDeviceDelete, constants.PermNetworkDeviceDeleteSelf); err != nil {
		return err
	}

	client, err := headscaleRESTClient()
	if err != nil {
		return err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	node, getErr := client.GetNode(queryCtx, nodeID)
	if getErr != nil {
		return unifyerror.HeadscaleAPIError(getErr)
	}
	if err := ensureActorCanAccessNode(actorUserID, node); err != nil {
		return err
	}

	if delErr := client.DeleteNode(queryCtx, nodeID); delErr != nil {
		return unifyerror.HeadscaleAPIError(delErr)
	}
	return nil
}

// ExpireDevice expiring a key forces re-authentication; clearing expiry
// re-enables a previously expired device.
func (s *deviceService) ExpireDevice(ctx context.Context, actorUserID uint, nodeID uint64, expiry *time.Time, clearExpiry bool) (*DeviceView, error) {
	if err := RequireAnyPermission(actorUserID, constants.PermNetworkDeviceUpdate, constants.PermNetworkDeviceUpdateSelf); err != nil {
		return nil, err
	}

	client, err := headscaleRESTClient()
	if err != nil {
		return nil, err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	node, getErr := client.GetNode(queryCtx, nodeID)
	if getErr != nil {
		return nil, unifyerror.HeadscaleAPIError(getErr)
	}
	if err := ensureActorCanAccessNode(actorUserID, node); err != nil {
		return nil, err
	}

	updated, expireErr := client.ExpireNode(queryCtx, nodeID, expiry, clearExpiry)
	if expireErr != nil {
		return nil, unifyerror.HeadscaleAPIError(expireErr)
	}

	view := toDeviceView(updated)
	return &view, nil
}

// SetDeviceTags replaces a device's tags.
//
// Two different rejections can come back from headscale and they mean different
// things: a malformed tag, and a well-formed tag the policy does not declare.
// The check here separates them so the operator gets an actionable message
// instead of "invalid or not permitted".
func (s *deviceService) SetDeviceTags(ctx context.Context, actorUserID uint, nodeID uint64, tags []string) (*DeviceView, error) {
	if err := RequirePermission(actorUserID, constants.PermNetworkDeviceTags); err != nil {
		return nil, err
	}

	normalized, tagErr := normalizeTagList(tags)
	if tagErr != nil {
		return nil, tagErr
	}

	client, err := headscaleRESTClient()
	if err != nil {
		return nil, err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	node, getErr := client.GetNode(queryCtx, nodeID)
	if getErr != nil {
		return nil, unifyerror.HeadscaleAPIError(getErr)
	}
	if err := ensureActorCanAccessNode(actorUserID, node); err != nil {
		return nil, err
	}

	if undeclared, checkErr := undeclaredTags(queryCtx, client, normalized); checkErr == nil && len(undeclared) > 0 {
		return nil, unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr,
			"these tags are not declared under tagOwners in the current policy: "+strings.Join(undeclared, ", "))
	}

	updated, setErr := client.SetNodeTags(queryCtx, nodeID, normalized)
	if setErr != nil {
		return nil, unifyerror.HeadscaleAPIError(setErr)
	}

	view := toDeviceView(updated)
	return &view, nil
}

// RegisterDevice attaches a node by machine key.
func (s *deviceService) RegisterDevice(ctx context.Context, actorUserID uint, hsUserID uint64, key string) (*DeviceView, error) {
	if err := RequireAnyPermission(actorUserID, constants.PermNetworkDeviceCreate, constants.PermNetworkDeviceCreateSelf); err != nil {
		return nil, err
	}
	if err := ensureActorCanAccessHeadscaleUser(actorUserID, hsUserID); err != nil {
		return nil, err
	}

	key = strings.TrimSpace(key)
	if key == "" {
		return nil, unifyerror.WrongParam("key")
	}

	client, err := headscaleRESTClient()
	if err != nil {
		return nil, err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	snap, snapErr := identitySnapshot(queryCtx)
	if snapErr != nil {
		return nil, unifyerror.HeadscaleAPIError(snapErr)
	}
	owner := snap.Identity(hsUserID)
	if owner == nil {
		return nil, unifyerror.New(http.StatusNotFound, unifyerror.CodeNotFound, "network identity not found")
	}

	node, regErr := client.RegisterNode(queryCtx, owner.Name, key)
	if regErr != nil {
		return nil, unifyerror.HeadscaleAPIError(regErr)
	}

	view := toDeviceView(node)
	return &view, nil
}

// ListPreAuthKeys returns the keys for a headscale user.
func (s *deviceService) ListPreAuthKeys(ctx context.Context, actorUserID uint, hsUserID uint64) ([]hsapi.PreAuthKey, error) {
	if err := RequireAnyPermission(actorUserID, constants.PermNetworkKeyList, constants.PermNetworkKeyCreateSelf); err != nil {
		return nil, err
	}

	client, err := headscaleRESTClient()
	if err != nil {
		return nil, err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	keys, listErr := client.ListPreAuthKeys(queryCtx)
	if listErr != nil {
		return nil, unifyerror.HeadscaleAPIError(listErr)
	}

	scope, err := loadActorScope(actorUserID)
	if err != nil {
		return nil, err
	}

	out := make([]hsapi.PreAuthKey, 0, len(keys))
	for i := range keys {
		key := &keys[i]
		ownerID := parseHSUserID(key.User.Id)
		if hsUserID != 0 && ownerID != hsUserID {
			continue
		}
		if !scope.AllowsHeadscaleUser(ownerID) {
			continue
		}
		out = append(out, *key)
	}
	return out, nil
}

// ExpirePreAuthKey invalidates a key.
func (s *deviceService) ExpirePreAuthKey(ctx context.Context, actorUserID uint, keyID uint64) error {
	if err := RequirePermission(actorUserID, constants.PermNetworkKeyUpdate); err != nil {
		return err
	}

	client, err := headscaleRESTClient()
	if err != nil {
		return err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	if expireErr := client.ExpirePreAuthKey(queryCtx, keyID); expireErr != nil {
		return unifyerror.HeadscaleAPIError(expireErr)
	}
	return nil
}

// DeletePreAuthKey removes a key entirely.
func (s *deviceService) DeletePreAuthKey(ctx context.Context, actorUserID uint, keyID uint64) error {
	if err := RequirePermission(actorUserID, constants.PermNetworkKeyDelete); err != nil {
		return err
	}

	client, err := headscaleRESTClient()
	if err != nil {
		return err
	}

	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	if delErr := client.DeletePreAuthKey(queryCtx, keyID); delErr != nil {
		return unifyerror.HeadscaleAPIError(delErr)
	}
	return nil
}

// toDeviceView flattens a node for the API.
func toDeviceView(node *hsapi.Node) DeviceView {
	ownerID := parseHSUserID(node.User.Id)
	return DeviceView{
		ID:              node.Id,
		Name:            node.Name,
		GivenName:       node.GivenName,
		OwnerID:         ownerID,
		OwnerName:       node.User.Name,
		OwnerTagged:     ownerID == network.TaggedDevicesUserID,
		UserID:          node.User.Id,
		Online:          node.Online,
		Ephemeral:       node.Ephemeral,
		IPAddresses:     node.IpAddresses,
		LastSeen:        node.LastSeen,
		Expiry:          node.Expiry,
		CreatedAt:       node.CreatedAt,
		Tags:            node.Tags,
		ApprovedRoutes:  node.ApprovedRoutes,
		AvailableRoutes: node.AvailableRoutes,
		SubnetRoutes:    node.SubnetRoutes,
		IsExitNode:      containsString(node.ApprovedRoutes, exitRouteIPv4) || containsString(node.ApprovedRoutes, exitRouteIPv6),
	}
}

func matchesDeviceFilter(view *DeviceView, filter DeviceFilter) bool {
	if filter.UserID != 0 && view.OwnerID != filter.UserID {
		return false
	}
	if filter.Online != nil && view.Online != *filter.Online {
		return false
	}
	if filter.Tagged != nil {
		isTagged := len(view.Tags) > 0
		if isTagged != *filter.Tagged {
			return false
		}
	}
	if filter.Query == "" {
		return true
	}

	q := strings.ToLower(strings.TrimSpace(filter.Query))
	if strings.Contains(strings.ToLower(view.Name), q) ||
		strings.Contains(strings.ToLower(view.GivenName), q) ||
		strings.Contains(strings.ToLower(view.OwnerName), q) {
		return true
	}
	for _, ip := range view.IPAddresses {
		if strings.Contains(ip, q) {
			return true
		}
	}
	for _, tag := range view.Tags {
		if strings.Contains(strings.ToLower(tag), q) {
			return true
		}
	}
	return false
}

// normalizeTagList validates tag syntax before it reaches headscale.
//
// headscale's own validation rejects the whole request on a single bad tag with a
// message that does not say which one, so the check happens here where the
// offending value can be named.
func normalizeTagList(tags []string) ([]string, error) {
	out := make([]string, 0, len(tags))
	seen := make(map[string]struct{}, len(tags))

	for _, raw := range tags {
		tag := strings.TrimSpace(raw)
		if tag == "" {
			continue
		}
		if !strings.HasPrefix(tag, "tag:") {
			return nil, unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr,
				"tag "+tag+" must start with \"tag:\"")
		}
		if tag != strings.ToLower(tag) {
			return nil, unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr,
				"tag "+tag+" must be lowercase")
		}
		if strings.ContainsAny(tag, " \t") {
			return nil, unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr,
				"tag "+tag+" must not contain whitespace")
		}
		if _, ok := seen[tag]; ok {
			continue
		}
		seen[tag] = struct{}{}
		out = append(out, tag)
	}
	return out, nil
}

// undeclaredTags reports tags the live policy does not list under tagOwners.
//
// headscale refuses to apply an undeclared tag, and its error does not
// distinguish "malformed" from "not declared"; checking first lets the panel say
// which rule was broken.
func undeclaredTags(ctx context.Context, client *hsapi.Client, tags []string) ([]string, error) {
	if len(tags) == 0 {
		return nil, nil
	}

	policy, err := client.GetPolicy(ctx)
	if err != nil {
		if isNoPolicy(err) {
			return tags, nil
		}
		return nil, err
	}

	declared := make(map[string]struct{})
	for key := range parseTagOwners(policy.Policy) {
		declared[key] = struct{}{}
	}

	var missing []string
	for _, tag := range tags {
		if _, ok := declared[tag]; !ok {
			missing = append(missing, tag)
		}
	}
	return missing, nil
}

// parseTagOwners extracts the tagOwners map from a policy document.
//
// The policy is HuJSON, so a plain json.Unmarshal would fail on comments; the
// caller has already standardized it by the time this runs, but accepting a
// plain map keeps the helper usable from both paths.
func parseTagOwners(raw string) map[string][]string {
	var doc struct {
		TagOwners map[string][]string `json:"tagOwners"`
	}
	if err := json.Unmarshal([]byte(raw), &doc); err != nil {
		return nil
	}
	return doc.TagOwners
}
