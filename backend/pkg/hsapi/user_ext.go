package hsapi

import (
	"strings"
)

// Origin records how a headscale user came into existence, derived from the
// provider fields rather than stored.
type Origin string

const (
	// OriginManual is a user created through the API or CLI.
	OriginManual Origin = "manual"
	// OriginPanelIDP is a user created by headscale via the panel's own IdP.
	OriginPanelIDP Origin = "panel_idp"
	// OriginExternalIDP is a user created by headscale via a third-party IdP.
	OriginExternalIDP Origin = "external_idp"
	// OriginUnknown means the provider fields did not match any known shape.
	OriginUnknown Origin = "unknown"
)

// PolicyUsername mirrors headscale's own User.Username(), which is what every
// policy alias resolves against: email first, then the raw name, then the
// provider identifier.
//
// ACL generation must use this, never Name: for an OIDC user the policy alias is
// the email address, and using Name silently matches nothing.
func (u *User) PolicyUsername() string {
	if u == nil {
		return ""
	}
	switch {
	case u.Email != "":
		return u.Email
	case u.Name != "":
		return u.Name
	case u.ProviderId != "":
		return u.ProviderId
	case u.Id != "":
		return u.Id
	default:
		return ""
	}
}

// IsTagged reports whether the user is the synthetic owner that headscale
// reports for tagged devices.
func (u *User) IsTagged() bool {
	return u != nil && u.Id == "" && u.Name == ""
}

// Classify determines where this user came from. panelIssuer is the panel's own
// OIDC issuer URL, as configured for headscale.
//
// headscale stores the OIDC identity as "<issuer>/<subject>", so a prefix match
// against the panel issuer identifies identities minted by the panel.
func (u *User) Classify(panelIssuer string) (origin Origin, issuer string) {
	if u == nil {
		return OriginUnknown, ""
	}

	ident := strings.TrimSpace(u.ProviderId)
	provider := strings.TrimSpace(u.Provider)

	if ident == "" && provider == "" {
		return OriginManual, ""
	}

	if ident != "" {
		// Split at the last slash that leaves a non-empty subject; issuers are
		// URLs and may themselves contain slashes.
		if idx := strings.LastIndex(ident, "/"); idx > 0 {
			issuer = ident[:idx]
			if panelIssuer = normalizeIssuer(panelIssuer); panelIssuer != "" &&
				normalizeIssuer(issuer) == panelIssuer {
				return OriginPanelIDP, issuer
			}
			return OriginExternalIDP, issuer
		}
	}

	if strings.EqualFold(provider, "oidc") {
		return OriginExternalIDP, ""
	}

	return OriginUnknown, ""
}

// SubjectFromPanelIssuer extracts the account id encoded in an identity minted
// by the panel's IdP, where the subject is the decimal account id.
func (u *User) SubjectFromPanelIssuer(panelIssuer string) (uint64, bool) {
	origin, _ := u.Classify(panelIssuer)
	if origin != OriginPanelIDP {
		return 0, false
	}

	ident := strings.TrimSpace(u.ProviderId)
	idx := strings.LastIndex(ident, "/")
	if idx < 0 || idx == len(ident)-1 {
		return 0, false
	}

	var id uint64
	for _, r := range ident[idx+1:] {
		if r < '0' || r > '9' {
			return 0, false
		}
		id = id*10 + uint64(r-'0')
	}
	if id == 0 {
		return 0, false
	}
	return id, true
}

func normalizeIssuer(s string) string {
	return strings.ToLower(strings.TrimRight(strings.TrimSpace(s), "/"))
}

// IsExitRoute reports whether a route is an exit-node route rather than a subnet.
func IsExitRoute(route string) bool {
	return route == "0.0.0.0/0" || route == "::/0"
}

// SubnetsExcludingExit returns the node's routes without exit routes.
//
// The list endpoint's subnetRoutes field includes exit routes, unlike the
// approve_routes response, so every caller that renders "subnet routes" has to
// filter them out.
func (n *Node) SubnetsExcludingExit() []string {
	if n == nil || len(n.SubnetRoutes) == 0 {
		return nil
	}
	out := make([]string, 0, len(n.SubnetRoutes))
	for _, r := range n.SubnetRoutes {
		if !IsExitRoute(r) {
			out = append(out, r)
		}
	}
	return out
}

// IsExitNode reports whether the node has an approved exit route.
func (n *Node) IsExitNode() bool {
	if n == nil {
		return false
	}
	for _, r := range n.SubnetRoutes {
		if IsExitRoute(r) {
			return true
		}
	}
	return false
}
