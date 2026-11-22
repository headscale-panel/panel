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

package constants

// PermWildcard is the only wildcard in the system: it is held by the system
// administrator role and short-circuits every authorization check.
const PermWildcard = "*:*:*"

// Permission codes, grouped by domain. Every code referenced anywhere in the
// codebase must appear here: the set is validated against the permissions table
// at startup, so an unregistered code fails fast instead of silently denying or
// silently allowing.
const (
	PermDashboardView = "dashboard:view"

	PermTopologyView    = "topology:view"
	PermTopologyACLView = "topology:acl:view"

	PermNetworkIdentityList   = "network:identity:list"
	PermNetworkIdentityRead   = "network:identity:read"
	PermNetworkIdentityCreate = "network:identity:create"
	PermNetworkIdentityUpdate = "network:identity:update"
	PermNetworkIdentityDelete = "network:identity:delete"

	PermNetworkBindingRead   = "network:binding:read"
	PermNetworkBindingManage = "network:binding:manage"

	PermNetworkDeviceList   = "network:device:list"
	PermNetworkDeviceRead   = "network:device:read"
	PermNetworkDeviceCreate = "network:device:create"
	PermNetworkDeviceUpdate = "network:device:update"
	PermNetworkDeviceDelete = "network:device:delete"
	PermNetworkDeviceTags   = "network:device:tags"

	PermNetworkDeviceListSelf   = "network:device:list:self"
	PermNetworkDeviceCreateSelf = "network:device:create:self"
	PermNetworkDeviceUpdateSelf = "network:device:update:self"
	PermNetworkDeviceDeleteSelf = "network:device:delete:self"
	PermNetworkDeviceEnrollSelf = "network:device:enroll:self"

	PermNetworkRouteList   = "network:route:list"
	PermNetworkRouteUpdate = "network:route:update"

	PermNetworkKeyList       = "network:key:list"
	PermNetworkKeyCreate     = "network:key:create"
	PermNetworkKeyUpdate     = "network:key:update"
	PermNetworkKeyDelete     = "network:key:delete"
	PermNetworkKeyCreateSelf = "network:key:create:self"

	PermACLPolicyRead   = "acl:policy:read"
	PermACLPolicyUpdate = "acl:policy:update"

	PermACLResourceList   = "acl:resource:list"
	PermACLResourceRead   = "acl:resource:read"
	PermACLResourceCreate = "acl:resource:create"
	PermACLResourceUpdate = "acl:resource:update"
	PermACLResourceDelete = "acl:resource:delete"

	PermAccountList   = "account:list"
	PermAccountCreate = "account:create"
	PermAccountUpdate = "account:update"
	PermAccountDelete = "account:delete"

	PermRoleList   = "role:list"
	PermRoleManage = "role:manage"

	PermSystemConfigRead   = "system:config:read"
	PermSystemConfigUpdate = "system:config:update"
	PermSystemHealthView   = "system:health:view"
	PermSystemAuditList    = "system:audit:list"
	PermSystemLifecycle    = "system:headscale:lifecycle"
	PermSystemAuthManage   = "system:auth:manage"
	PermSystemDerpRead     = "system:derp:read"
	PermSystemDerpManage   = "system:derp:manage"

	PermDNSRecordList   = "dns:record:list"
	PermDNSRecordManage = "dns:record:manage"

	PermMetricsView = "metrics:view"
)

// PermissionDef defines a permission entry for bootstrapping.
type PermissionDef struct {
	Code string
	Name string
	Type string
}

const (
	permTypeMenu   = "menu"
	permTypeButton = "button"
)

// DefaultPermissions is the complete permission catalogue.
//
// Order groups the codes the way the settings UI renders them; it is not
// meaningful otherwise.
var DefaultPermissions = []PermissionDef{
	{"dashboard:view", "View dashboard", permTypeMenu},

	{"topology:view", "View topology", permTypeMenu},
	{"topology:acl:view", "View topology ACL edges", permTypeButton},

	{"network:identity:list", "List network identities", permTypeButton},
	{"network:identity:read", "Read network identity", permTypeButton},
	{"network:identity:create", "Create network identity", permTypeButton},
	{"network:identity:update", "Update network identity", permTypeButton},
	{"network:identity:delete", "Delete network identity", permTypeButton},

	{"network:binding:read", "Read identity bindings", permTypeButton},
	{"network:binding:manage", "Manage identity bindings", permTypeButton},

	{"network:device:list", "List devices", permTypeButton},
	{"network:device:read", "Read device", permTypeButton},
	{"network:device:create", "Register device", permTypeButton},
	{"network:device:update", "Update device", permTypeButton},
	{"network:device:delete", "Delete device", permTypeButton},
	{"network:device:tags", "Set device tags", permTypeButton},

	{"network:device:list:self", "List own devices", permTypeButton},
	{"network:device:create:self", "Register own device", permTypeButton},
	{"network:device:update:self", "Update own device", permTypeButton},
	{"network:device:delete:self", "Delete own device", permTypeButton},
	{"network:device:enroll:self", "Enroll own device", permTypeButton},

	{"network:route:list", "List routes", permTypeButton},
	{"network:route:update", "Enable or disable routes", permTypeButton},

	{"network:key:list", "List pre-auth keys", permTypeButton},
	{"network:key:create", "Create pre-auth key", permTypeButton},
	{"network:key:update", "Expire pre-auth key", permTypeButton},
	{"network:key:delete", "Delete pre-auth key", permTypeButton},
	{"network:key:create:self", "Create own pre-auth key", permTypeButton},

	{"acl:policy:read", "Read ACL policy", permTypeButton},
	{"acl:policy:update", "Update ACL policy", permTypeButton},

	{"acl:resource:list", "List resources", permTypeButton},
	{"acl:resource:read", "Read resource", permTypeButton},
	{"acl:resource:create", "Create resource", permTypeButton},
	{"acl:resource:update", "Update resource", permTypeButton},
	{"acl:resource:delete", "Delete resource", permTypeButton},

	{"account:list", "List accounts", permTypeMenu},
	{"account:create", "Create account", permTypeButton},
	{"account:update", "Update account", permTypeButton},
	{"account:delete", "Delete account", permTypeButton},

	{"role:list", "List roles", permTypeButton},
	{"role:manage", "Manage roles and permissions", permTypeButton},

	{"system:config:read", "Read system configuration", permTypeButton},
	{"system:config:update", "Update system configuration", permTypeButton},
	{"system:health:view", "View system health", permTypeButton},
	{"system:audit:list", "Read audit log", permTypeButton},
	{"system:headscale:lifecycle", "Start, stop or restart headscale", permTypeButton},
	{"system:auth:manage", "Manage authentication settings", permTypeButton},
	{"system:derp:read", "Read DERP map", permTypeButton},
	{"system:derp:manage", "Update DERP map", permTypeButton},

	{"dns:record:list", "List DNS records", permTypeButton},
	{"dns:record:manage", "Manage DNS records", permTypeButton},

	{"metrics:view", "View metrics", permTypeButton},
}

// PermissionCodes returns the catalogue as a set.
func PermissionCodes() map[string]struct{} {
	out := make(map[string]struct{}, len(DefaultPermissions))
	for _, p := range DefaultPermissions {
		out[p.Code] = struct{}{}
	}
	return out
}

// SystemAdminRoleName is the role every deployment gets on first run. It is
// matched by IsSystemAdmin at runtime, never by this name.
const SystemAdminRoleName = "System Administrator"

// MemberRoleName is the fallback role for self-registered accounts: it can see
// the dashboard and nothing else until an administrator grants more.
const MemberRoleName = "Member"
