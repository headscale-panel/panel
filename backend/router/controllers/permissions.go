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

package controllers

import (
	"headscale-panel/pkg/constants"
	"headscale-panel/pkg/unifyerror"
)

// Permission codes used by the account and role controllers. Aliased so a
// consistency check can find them: every code referenced from a controller must
// exist in the catalogue, or startup fails.
const (
	permissionAccountList   = constants.PermAccountList
	permissionAccountCreate = constants.PermAccountCreate
	permissionAccountUpdate = constants.PermAccountUpdate
	permissionAccountDelete = constants.PermAccountDelete

	permissionRoleList   = constants.PermRoleList
	permissionRoleManage = constants.PermRoleManage

	permissionBindingRead   = constants.PermNetworkBindingRead
	permissionBindingManage = constants.PermNetworkBindingManage

	permissionIdentityList   = constants.PermNetworkIdentityList
	permissionIdentityRead   = constants.PermNetworkIdentityRead
	permissionIdentityCreate = constants.PermNetworkIdentityCreate
	permissionIdentityUpdate = constants.PermNetworkIdentityUpdate
	permissionIdentityDelete = constants.PermNetworkIdentityDelete

	permissionDeviceList   = constants.PermNetworkDeviceList
	permissionDeviceRead   = constants.PermNetworkDeviceRead
	permissionDeviceCreate = constants.PermNetworkDeviceCreate
	permissionDeviceUpdate = constants.PermNetworkDeviceUpdate
	permissionDeviceDelete = constants.PermNetworkDeviceDelete
	permissionDeviceTags   = constants.PermNetworkDeviceTags

	permissionRouteList   = constants.PermNetworkRouteList
	permissionRouteUpdate = constants.PermNetworkRouteUpdate

	permissionKeyList   = constants.PermNetworkKeyList
	permissionKeyCreate = constants.PermNetworkKeyCreate
	permissionKeyUpdate = constants.PermNetworkKeyUpdate
	permissionKeyDelete = constants.PermNetworkKeyDelete

	permissionPolicyRead   = constants.PermACLPolicyRead
	permissionPolicyUpdate = constants.PermACLPolicyUpdate

	permissionResourceList   = constants.PermACLResourceList
	permissionResourceRead   = constants.PermACLResourceRead
	permissionResourceCreate = constants.PermACLResourceCreate
	permissionResourceUpdate = constants.PermACLResourceUpdate
	permissionResourceDelete = constants.PermACLResourceDelete

	permissionConfigRead   = constants.PermSystemConfigRead
	permissionConfigUpdate = constants.PermSystemConfigUpdate
	permissionHealthView   = constants.PermSystemHealthView
	permissionAuditList    = constants.PermSystemAuditList
	permissionLifecycle    = constants.PermSystemLifecycle
	permissionAuthManage   = constants.PermSystemAuthManage
	permissionDerpRead     = constants.PermSystemDerpRead
	permissionDerpManage   = constants.PermSystemDerpManage

	permissionDNSList   = constants.PermDNSRecordList
	permissionDNSManage = constants.PermDNSRecordManage

	permissionMetricsView = constants.PermMetricsView

	permissionDashboardView   = constants.PermDashboardView
	permissionTopologyView    = constants.PermTopologyView
	permissionTopologyACLView = constants.PermTopologyACLView
)

// dbError wraps a storage failure with the standard 500 shape.
func dbError(err error) error {
	return unifyerror.DbError(err)
}
