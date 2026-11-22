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

package network

import (
	"sort"
	"strconv"
	"strings"

	"headscale-panel/pkg/hsapi"
)

// TaggedDevicesUserID is headscale's synthetic owner for every tagged node.
//
// Applying a tag is an ownership transfer upstream, not an annotation: the node
// leaves its human owner and is reparented to this id, which has no row in the
// user list.
const TaggedDevicesUserID uint64 = 2147455555

// TaggedDevicesName is the display name headscale gives that synthetic owner.
const TaggedDevicesName = "tagged-devices"

// Identity is a headscale user as the panel presents it: a projection of live
// upstream state plus the panel-side binding, never a stored copy.
type Identity struct {
	HSUserID       uint64       `json:"hs_user_id"`
	Name           string       `json:"name"`
	PolicyUsername string       `json:"policy_username"`
	DisplayName    string       `json:"display_name"`
	Email          string       `json:"email"`
	PictureURL     string       `json:"profile_pic_url"`
	Provider       string       `json:"provider"`
	ProviderIdent  string       `json:"provider_identifier"`
	Origin         hsapi.Origin `json:"origin"`
	OriginIssuer   string       `json:"origin_issuer"`

	// OriginAccountID is the panel account encoded in a panel-minted identity.
	// Zero when the identity did not come from the panel IdP.
	OriginAccountID uint64 `json:"origin_account_id,omitempty"`

	DeviceCount  int `json:"device_count"`
	DeviceOnline int `json:"device_online"`

	// Tagged marks the synthetic owner. Devices under it are real, but they
	// have no human owner to count against.
	Tagged bool `json:"tagged"`

	// Binding is nil when this identity is not linked to a panel account.
	Binding *BindingView `json:"binding,omitempty"`
}

// BindingView is the binding as returned to callers, without the cached copy of
// upstream fields (those are always available from the identity itself).
type BindingView struct {
	ID        uint `json:"id"`
	AccountID uint `json:"account_id"`
	IsPrimary bool `json:"is_primary"`
}

// UnlistedOwner is an owner referenced by a node but absent from the user
// list. headscale only produces this for tagged devices today; the panel
// reports it generically so an upstream change cannot make devices vanish from
// the UI without a trace.
type UnlistedOwner struct {
	HSUserID    uint64 `json:"hs_user_id"`
	Name        string `json:"name"`
	Tagged      bool   `json:"tagged"`
	DeviceCount int    `json:"device_count"`
}

// Snapshot is one consistent read of upstream state plus local bindings.
//
// Every list view is built from a single snapshot so a device cannot appear
// under two owners because two upstream calls were served at different times.
type Snapshot struct {
	Identities []Identity      `json:"identities"`
	Bindings   []BindingView   `json:"bindings"`
	Unlisted   []UnlistedOwner `json:"unlisted_owners"`

	byID         map[uint64]*Identity
	devicesByOwn map[uint64][]hsapi.Node
	nodes        []hsapi.Node
}

// Identity returns the identity for an owner id, or nil when the owner is not
// listed upstream.
func (s *Snapshot) Identity(id uint64) *Identity {
	if s == nil {
		return nil
	}
	return s.byID[id]
}

// Nodes returns the full node list from this snapshot.
func (s *Snapshot) Nodes() []hsapi.Node {
	if s == nil {
		return nil
	}
	return s.nodes
}

// DevicesOf returns the devices owned by one headscale user, including the
// synthetic tagged owner.
func (s *Snapshot) DevicesOf(hsUserID uint64) []hsapi.Node {
	if s == nil {
		return nil
	}
	return s.devicesByOwn[hsUserID]
}

// BuildSnapshot projects upstream users and nodes plus local bindings into the
// view the panel renders.
//
// panelIssuer is the issuer the panel's own IdP advertises, used to recognise
// identities the panel minted. bindings may be nil.
func BuildSnapshot(users []hsapi.User, nodes []hsapi.Node, bindings []Binding, panelIssuer string) *Snapshot {
	snap := &Snapshot{
		byID:         make(map[uint64]*Identity, len(users)),
		devicesByOwn: make(map[uint64][]hsapi.Node),
		nodes:        nodes,
	}

	bindingByUser := make(map[uint64]Binding, len(bindings))
	for _, b := range bindings {
		bindingByUser[b.HSUserID] = b
	}

	for i := range users {
		u := &users[i]
		id := parseUserID(u.Id)
		if id == 0 {
			continue
		}

		origin, issuer := u.Classify(panelIssuer)
		ident := Identity{
			HSUserID:       id,
			Name:           u.Name,
			PolicyUsername: u.PolicyUsername(),
			DisplayName:    u.DisplayName,
			Email:          u.Email,
			PictureURL:     u.ProfilePicUrl,
			Provider:       u.Provider,
			ProviderIdent:  u.ProviderId,
			Origin:         origin,
			OriginIssuer:   issuer,
			Tagged:         id == TaggedDevicesUserID,
		}
		if origin == hsapi.OriginPanelIDP {
			if accID, ok := u.SubjectFromPanelIssuer(panelIssuer); ok {
				ident.OriginAccountID = accID
			}
		}

		if b, ok := bindingByUser[id]; ok {
			ident.Binding = &BindingView{ID: b.ID, AccountID: b.AccountID, IsPrimary: b.IsPrimary}
		}

		snap.Identities = append(snap.Identities, ident)
	}

	for i := range nodes {
		n := &nodes[i]
		ownerID := parseUserID(n.User.Id)
		snap.devicesByOwn[ownerID] = append(snap.devicesByOwn[ownerID], *n)
	}

	snap.Identities = append(snap.Identities, syntheticOwner(users, snap.devicesByOwn)...)

	// Index only after the slice is final: taking pointers into a slice that is
	// still growing would leave them dangling on reallocation.
	for i := range snap.Identities {
		snap.byID[snap.Identities[i].HSUserID] = &snap.Identities[i]
	}

	for i := range snap.Identities {
		ident := &snap.Identities[i]
		for _, n := range snap.devicesByOwn[ident.HSUserID] {
			ident.DeviceCount++
			if n.Online {
				ident.DeviceOnline++
			}
		}
	}

	snap.Unlisted = unlistedOwners(snap)
	return snap
}

// syntheticOwner materialises the tagged-devices identity when devices reference
// it but the user list does not contain it.
func syntheticOwner(users []hsapi.User, devicesByOwner map[uint64][]hsapi.Node) []Identity {
	devices := devicesByOwner[TaggedDevicesUserID]
	if len(devices) == 0 {
		return nil
	}
	for i := range users {
		if parseUserID(users[i].Id) == TaggedDevicesUserID {
			return nil
		}
	}

	name := TaggedDevicesName
	for _, n := range devices {
		if n.User.Name != "" {
			name = n.User.Name
			break
		}
	}

	return []Identity{{
		HSUserID: TaggedDevicesUserID,
		Name:     name,
		Tagged:   true,
		Origin:   hsapi.OriginManual,
	}}
}

// unlistedOwners finds node owners that have no identity, i.e. owners the user
// list does not mention. Devices must still be reachable through the UI.
func unlistedOwners(snap *Snapshot) []UnlistedOwner {
	var out []UnlistedOwner
	for ownerID, devices := range snap.devicesByOwn {
		if ownerID == 0 || snap.byID[ownerID] != nil {
			continue
		}

		name := ""
		for _, n := range devices {
			if n.User.Name != "" {
				name = n.User.Name
				break
			}
		}
		out = append(out, UnlistedOwner{
			HSUserID:    ownerID,
			Name:        name,
			Tagged:      ownerID == TaggedDevicesUserID,
			DeviceCount: len(devices),
		})
	}

	sort.Slice(out, func(i, j int) bool { return out[i].HSUserID < out[j].HSUserID })
	return out
}

// ReconcileResult reports what an automatic binding pass did.
type ReconcileResult struct {
	Scanned uint     `json:"scanned"`
	Bound   []uint64 `json:"bound"`
	Skipped []uint64 `json:"skipped"`
	Failed  []uint64 `json:"failed"`
}

// parseUserID converts the decimal id string headscale returns into a number.
func parseUserID(raw string) uint64 {
	id, err := strconv.ParseUint(strings.TrimSpace(raw), 10, 64)
	if err != nil {
		return 0
	}
	return id
}
