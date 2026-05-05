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

package unifyerror

import (
	"headscale-panel/pkg/constants"
	"math"

	"github.com/gin-gonic/gin"
)

// PaginationQuery is an embeddable struct for binding pagination query parameters.
type PaginationQuery struct {
	All      bool `form:"all"`
	Page     int  `form:"page,default=1"`
	PageSize int  `form:"page_size,default=10"`
}

// Resolve normalises the pagination values and returns (page, pageSize).
// When All is true it returns (1, -1), which signals "no limit" to callers.
func (q PaginationQuery) Resolve() (page, pageSize int) {
	if q.All {
		return 1, -1
	}
	page = q.Page
	if page < 1 {
		page = constants.DefaultPage
	}
	pageSize = q.PageSize
	if pageSize < 1 {
		pageSize = constants.DefaultPageSize
	}
	if pageSize > constants.MaxPageSize {
		pageSize = constants.MaxPageSize
	}
	return page, pageSize
}

// PaginatedData is the JSON envelope for paginated list responses.
type PaginatedData struct {
	List      interface{} `json:"list"`
	Total     int64       `json:"total"`
	Page      int         `json:"page"`
	PageSize  int         `json:"page_size"`
	PageCount int         `json:"page_count"`
}

// NewPaginatedData constructs a PaginatedData value.
func NewPaginatedData(list interface{}, total int64, page, pageSize int) PaginatedData {
	if page < 1 {
		page = constants.DefaultPage
	}
	if pageSize <= 0 {
		// "all" mode: single page containing everything
		return PaginatedData{
			List:      list,
			Total:     total,
			Page:      1,
			PageSize:  int(total),
			PageCount: 1,
		}
	}

	pageCount := 0
	if total > 0 {
		pageCount = int(math.Ceil(float64(total) / float64(pageSize)))
	}

	return PaginatedData{
		List:      list,
		Total:     total,
		Page:      page,
		PageSize:  pageSize,
		PageCount: pageCount,
	}
}

// SuccessPage sends an HTTP 200 OK paginated list response.
func SuccessPage(c *gin.Context, list interface{}, total int64, page, pageSize int) {
	Success(c, NewPaginatedData(list, total, page, pageSize))
}
