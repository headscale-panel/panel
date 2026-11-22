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
	"headscale-panel/pkg/unifyerror"
	"headscale-panel/router/services"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// DeviceController handles tailnet nodes.
type DeviceController struct{}

// NewDeviceController builds the controller.
func NewDeviceController() *DeviceController {
	return &DeviceController{}
}

// ListDevicesQuery is the list filter.
type ListDevicesQuery struct {
	Query  string `form:"q"`
	UserID uint64 `form:"user_id"`
	Online *bool  `form:"online"`
	Tagged *bool  `form:"tagged"`
}

// List godoc
// @Summary List devices
// @Tags devices
// @Produce json
// @Success 200 {object} unifyerror.Response{data=array}
// @Security BearerAuth
// @Router /devices [get]
func (d *DeviceController) List(c *gin.Context) {
	var q ListDevicesQuery
	if err := c.ShouldBindQuery(&q); err != nil {
		unifyerror.Fail(c, unifyerror.ErrBind)
		return
	}

	devices, err := services.DeviceService.ListDevices(c.Request.Context(), c.GetUint("userID"),
		services.DeviceFilter{Query: q.Query, UserID: q.UserID, Online: q.Online, Tagged: q.Tagged})
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}
	unifyerror.Success(c, devices)
}

// Get godoc
// @Summary Read one device
// @Tags devices
// @Produce json
// @Param nodeID path int true "Node ID"
// @Success 200 {object} unifyerror.Response{data=object}
// @Security BearerAuth
// @Router /devices/{nodeID} [get]
func (d *DeviceController) Get(c *gin.Context) {
	id, err := parseUintParam(c, "nodeID")
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}

	device, getErr := services.DeviceService.GetDevice(c.Request.Context(), c.GetUint("userID"), id)
	if getErr != nil {
		unifyerror.Fail(c, getErr)
		return
	}
	unifyerror.Success(c, device)
}

// Rename godoc
// @Summary Rename a device
// @Tags devices
// @Accept json
// @Produce json
// @Param nodeID path int true "Node ID"
// @Success 200 {object} unifyerror.Response{data=object}
// @Security BearerAuth
// @Router /devices/{nodeID}/rename [post]
func (d *DeviceController) Rename(c *gin.Context) {
	id, err := parseUintParam(c, "nodeID")
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}

	var req RenameRequest
	if bindErr := c.ShouldBindJSON(&req); bindErr != nil {
		unifyerror.Fail(c, unifyerror.ErrBind)
		return
	}

	device, renameErr := services.DeviceService.RenameDevice(c.Request.Context(), c.GetUint("userID"), id, req.Name)
	if renameErr != nil {
		unifyerror.Fail(c, renameErr)
		return
	}
	unifyerror.Success(c, device)
}

// Delete godoc
// @Summary Delete a device
// @Tags devices
// @Produce json
// @Param nodeID path int true "Node ID"
// @Success 200 {object} unifyerror.Response
// @Security BearerAuth
// @Router /devices/{nodeID} [delete]
func (d *DeviceController) Delete(c *gin.Context) {
	id, err := parseUintParam(c, "nodeID")
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}

	if delErr := services.DeviceService.DeleteDevice(c.Request.Context(), c.GetUint("userID"), id); delErr != nil {
		unifyerror.Fail(c, delErr)
		return
	}
	unifyerror.Success(c, gin.H{"message": "device deleted"})
}

// ExpireDeviceRequest is the expiry payload.
type ExpireDeviceRequest struct {
	// Expiry is an RFC3339 timestamp; empty with DisableExpiry unset expires now.
	Expiry string `json:"expiry"`
	// DisableExpiry clears an existing expiry instead.
	DisableExpiry bool `json:"disable_expiry"`
}

// Expire godoc
// @Summary Expire or re-enable a device
// @Tags devices
// @Accept json
// @Produce json
// @Param nodeID path int true "Node ID"
// @Success 200 {object} unifyerror.Response{data=object}
// @Security BearerAuth
// @Router /devices/{nodeID}/expire [post]
func (d *DeviceController) Expire(c *gin.Context) {
	id, err := parseUintParam(c, "nodeID")
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}

	var req ExpireDeviceRequest
	if bindErr := c.ShouldBindJSON(&req); bindErr != nil {
		unifyerror.Fail(c, unifyerror.ErrBind)
		return
	}

	var expiry *time.Time
	if req.Expiry != "" {
		at, parseErr := time.Parse(time.RFC3339, req.Expiry)
		if parseErr != nil {
			unifyerror.Fail(c, unifyerror.WrongParam("expiry"))
			return
		}
		expiry = &at
	}

	device, expireErr := services.DeviceService.ExpireDevice(c.Request.Context(), c.GetUint("userID"), id, expiry, req.DisableExpiry)
	if expireErr != nil {
		unifyerror.Fail(c, expireErr)
		return
	}
	unifyerror.Success(c, device)
}

// SetTagsRequest is the tags payload.
type SetTagsRequest struct {
	Tags []string `json:"tags"`
}

// SetTags godoc
// @Summary Replace a device's tags
// @Tags devices
// @Accept json
// @Produce json
// @Param nodeID path int true "Node ID"
// @Success 200 {object} unifyerror.Response{data=object}
// @Security BearerAuth
// @Router /devices/{nodeID}/tags [post]
// SetTags replaces the tag set.
//
// Applying a tag hands the device to headscale's synthetic tagged-devices owner:
// it is an ownership transfer, not an annotation. The response reflects the new
// owner so the UI does not have to guess.
func (d *DeviceController) SetTags(c *gin.Context) {
	id, err := parseUintParam(c, "nodeID")
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}

	var req SetTagsRequest
	if bindErr := c.ShouldBindJSON(&req); bindErr != nil {
		unifyerror.Fail(c, unifyerror.ErrBind)
		return
	}

	device, setErr := services.DeviceService.SetDeviceTags(c.Request.Context(), c.GetUint("userID"), id, req.Tags)
	if setErr != nil {
		unifyerror.Fail(c, setErr)
		return
	}
	unifyerror.Success(c, device)
}

// RegisterDeviceRequest is the registration payload.
type RegisterDeviceRequest struct {
	HSUserID uint64 `json:"hs_user_id" binding:"required"`
	Key      string `json:"key" binding:"required"`
}

// Register godoc
// @Summary Register a device from a pending machine key
// @Tags devices
// @Accept json
// @Produce json
// @Success 200 {object} unifyerror.Response{data=object}
// @Security BearerAuth
// @Router /devices/register [post]
func (d *DeviceController) Register(c *gin.Context) {
	var req RegisterDeviceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		unifyerror.Fail(c, unifyerror.ErrBind)
		return
	}

	device, err := services.DeviceService.RegisterDevice(c.Request.Context(), c.GetUint("userID"), req.HSUserID, req.Key)
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}
	unifyerror.Success(c, device)
}

// ListPreAuthKeysQuery filters keys by owner.
type ListPreAuthKeysQuery struct {
	HSUserID uint64 `form:"hs_user_id"`
}

// ListPreAuthKeys godoc
// @Summary List pre-auth keys
// @Tags preauthkeys
// @Produce json
// @Success 200 {object} unifyerror.Response{data=array}
// @Security BearerAuth
// @Router /preauthkeys [get]
func (d *DeviceController) ListPreAuthKeys(c *gin.Context) {
	var q ListPreAuthKeysQuery
	if err := c.ShouldBindQuery(&q); err != nil {
		unifyerror.Fail(c, unifyerror.ErrBind)
		return
	}

	keys, err := services.DeviceService.ListPreAuthKeys(c.Request.Context(), c.GetUint("userID"), q.HSUserID)
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}
	unifyerror.Success(c, keys)
}

// CreatePreAuthKeyRequest is the key creation payload.
type CreatePreAuthKeyRequest struct {
	HSUserID   uint64 `json:"hs_user_id" binding:"required"`
	Reusable   bool   `json:"reusable"`
	Ephemeral  bool   `json:"ephemeral"`
	Expiration string `json:"expiration"`
}

// CreatePreAuthKey godoc
// @Summary Mint a pre-auth key
// @Tags preauthkeys
// @Accept json
// @Produce json
// @Success 200 {object} unifyerror.Response{data=object}
// @Security BearerAuth
// @Router /preauthkeys [post]
func (d *DeviceController) CreatePreAuthKey(c *gin.Context) {
	var req CreatePreAuthKeyRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		unifyerror.Fail(c, unifyerror.ErrBind)
		return
	}

	key, err := services.ConnectionService.CreatePreAuthKeyForIdentity(c.Request.Context(), c.GetUint("userID"),
		req.HSUserID, req.Reusable, req.Ephemeral, req.Expiration)
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}
	unifyerror.Success(c, key)
}

// ExpirePreAuthKey godoc
// @Summary Expire a pre-auth key
// @Tags preauthkeys
// @Produce json
// @Param id path int true "Key ID"
// @Success 200 {object} unifyerror.Response
// @Security BearerAuth
// @Router /preauthkeys/{id}/expire [post]
func (d *DeviceController) ExpirePreAuthKey(c *gin.Context) {
	id, err := parseUintParam(c, "id")
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}

	if expireErr := services.DeviceService.ExpirePreAuthKey(c.Request.Context(), c.GetUint("userID"), id); expireErr != nil {
		unifyerror.Fail(c, expireErr)
		return
	}
	unifyerror.Success(c, gin.H{"message": "key expired"})
}

// DeletePreAuthKey godoc
// @Summary Delete a pre-auth key
// @Tags preauthkeys
// @Produce json
// @Param id path int true "Key ID"
// @Success 200 {object} unifyerror.Response
// @Security BearerAuth
// @Router /preauthkeys/{id} [delete]
func (d *DeviceController) DeletePreAuthKey(c *gin.Context) {
	id, err := parseUintParam(c, "id")
	if err != nil {
		unifyerror.Fail(c, err)
		return
	}

	if delErr := services.DeviceService.DeletePreAuthKey(c.Request.Context(), c.GetUint("userID"), id); delErr != nil {
		unifyerror.Fail(c, delErr)
		return
	}
	unifyerror.Success(c, gin.H{"message": "key deleted"})
}

var _ = http.StatusOK
