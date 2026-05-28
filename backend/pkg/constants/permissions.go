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

// PermissionDef defines a permission entry for bootstrapping.
type PermissionDef struct {
	Name string
	Code string
	Type string
}

// DefaultPermissions is the complete list of permissions bootstrapped on first run.
var DefaultPermissions = []PermissionDef{
	{Name: "View Dashboard", Code: "dashboard:view", Type: "menu"},

	{Name: "View Users", Code: "system:user:list", Type: "button"},
	{Name: "Create User", Code: "system:user:create", Type: "button"},
	{Name: "Edit User", Code: "system:user:update", Type: "button"},
	{Name: "Delete User", Code: "system:user:delete", Type: "button"},

	{Name: "View Groups", Code: "system:group:list", Type: "button"},
	{Name: "Create Group", Code: "system:group:create", Type: "button"},
	{Name: "Edit Group", Code: "system:group:update", Type: "button"},
	{Name: "Delete Group", Code: "system:group:delete", Type: "button"},
	{Name: "View Permissions", Code: "system:permission:list", Type: "button"},
	{Name: "Create Permission", Code: "system:permission:create", Type: "button"},
	{Name: "Edit Permission", Code: "system:permission:update", Type: "button"},
	{Name: "Delete Permission", Code: "system:permission:delete", Type: "button"},
	{Name: "View OAuth Clients", Code: "system:oauth_client:list", Type: "button"},
	{Name: "Create OAuth Client", Code: "system:oauth_client:create", Type: "button"},
	{Name: "Edit OAuth Client", Code: "system:oauth_client:update", Type: "button"},
	{Name: "Delete OAuth Client", Code: "system:oauth_client:delete", Type: "button"},
	{Name: "Reset OAuth Secret", Code: "system:oauth_client:secret", Type: "button"},

	{Name: "View Resources", Code: "resource:list", Type: "button"},
	{Name: "Publish Resource", Code: "resource:create", Type: "button"},
	{Name: "Edit Resource", Code: "resource:update", Type: "button"},
	{Name: "Delete Resource", Code: "resource:delete", Type: "button"},

	{Name: "View Headscale Users", Code: "headscale:user:list", Type: "button"},
	{Name: "Create Headscale User", Code: "headscale:user:create", Type: "button"},
	{Name: "Edit Headscale User", Code: "headscale:user:update", Type: "button"},
	{Name: "Delete Headscale User", Code: "headscale:user:delete", Type: "button"},
	{Name: "View Headscale Devices", Code: "headscale:machine:list", Type: "button"},
	{Name: "View Device Details", Code: "headscale:machine:get", Type: "button"},
	{Name: "Register Device", Code: "headscale:machine:create", Type: "button"},
	{Name: "Edit Device Name", Code: "headscale:machine:update", Type: "button"},
	{Name: "Delete Device", Code: "headscale:machine:delete", Type: "button"},
	{Name: "Expire Device", Code: "headscale:machine:expire", Type: "button"},
	{Name: "Set Device Tags", Code: "headscale:machine:tags", Type: "button"},
	{Name: "View Routes", Code: "headscale:route:list", Type: "button"},
	{Name: "Enable Route", Code: "headscale:route:enable", Type: "button"},
	{Name: "Disable Route", Code: "headscale:route:disable", Type: "button"},
	{Name: "View PreAuthKeys", Code: "headscale:preauthkey:list", Type: "button"},
	{Name: "Create PreAuthKey", Code: "headscale:preauthkey:create", Type: "button"},
	{Name: "Expire PreAuthKey", Code: "headscale:preauthkey:expire", Type: "button"},

	{Name: "View ACL", Code: "headscale:acl:view", Type: "button"},
	{Name: "Edit ACL", Code: "headscale:acl:update", Type: "button"},
	{Name: "Sync ACL Resources", Code: "headscale:acl:sync", Type: "button"},
	{Name: "Generate ACL Policy", Code: "headscale:acl:generate", Type: "button"},
	{Name: "View ACL History", Code: "headscale:acl:history:list", Type: "button"},
	{Name: "Apply ACL Policy", Code: "headscale:acl:apply", Type: "button"},
	{Name: "View ACL Accessible Devices", Code: "headscale:acl:access", Type: "button"},

	{Name: "View DNS Records", Code: "dns:record:list", Type: "button"},
	{Name: "View DNS Record Details", Code: "dns:record:get", Type: "button"},
	{Name: "Create DNS Record", Code: "dns:record:create", Type: "button"},
	{Name: "Update DNS Record", Code: "dns:record:update", Type: "button"},
	{Name: "Delete DNS Record", Code: "dns:record:delete", Type: "button"},
	{Name: "Sync DNS File", Code: "dns:sync", Type: "button"},
	{Name: "Import DNS File", Code: "dns:import", Type: "button"},
	{Name: "View DNS File", Code: "dns:file:get", Type: "button"},
	{Name: "View Headscale Config", Code: "headscale:config:view", Type: "button"},
	{Name: "Update Headscale Config", Code: "headscale:config:update", Type: "button"},
	{Name: "View DERP Config", Code: "headscale:derp:view", Type: "button"},
	{Name: "Update DERP Config", Code: "headscale:derp:update", Type: "button"},
	{Name: "View Online Duration", Code: "metrics:online_duration:view", Type: "button"},
	{Name: "View Online Duration Stats", Code: "metrics:online_duration_stats:view", Type: "button"},
	{Name: "View Device Status", Code: "metrics:device_status:view", Type: "button"},
	{Name: "View Device Status History", Code: "metrics:device_status_history:view", Type: "button"},
	{Name: "View Traffic Stats", Code: "metrics:traffic:view", Type: "button"},
	{Name: "View InfluxDB Status", Code: "metrics:influxdb:view", Type: "button"},

	{Name: "View Topology", Code: "topology:view", Type: "button"},
	{Name: "View Topology ACL", Code: "topology:with_acl:view", Type: "button"},
	{Name: "View Topology ACL Matrix", Code: "topology:acl_matrix:view", Type: "button"},

	{Name: "View Panel Accounts", Code: "panel:account:list", Type: "button"},
	{Name: "Create Panel Account", Code: "panel:account:create", Type: "button"},
	{Name: "Edit Panel Account", Code: "panel:account:update", Type: "button"},
	{Name: "Delete Panel Account", Code: "panel:account:delete", Type: "button"},
	{Name: "Manage Panel Account Bindings", Code: "panel:account:bindding", Type: "button"},
}
