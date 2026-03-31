package serializer

import (
	"headscale-panel/pkg/constants"
	"math"
	"strconv"

	"github.com/gin-gonic/gin"
)

type PaginatedData struct {
	List      interface{} `json:"list"`
	Total     int64       `json:"total"`
	Page      int         `json:"page"`
	PageSize  int         `json:"page_size"`
	PageCount int         `json:"page_count"`
}

func ParsePaginationQuery(c *gin.Context) (int, int) {
	page := parsePositiveInt(c.Query("page"), constants.DefaultPage)
	pageSize := parsePositiveInt(c.Query("page_size"), constants.DefaultPageSize)
	if pageSize > constants.MaxPageSize {
		pageSize = constants.MaxPageSize
	}
	return page, pageSize
}

func NewPaginatedData(list interface{}, total int64, page, pageSize int) PaginatedData {
	if page < 1 {
		page = constants.DefaultPage
	}
	if pageSize < 1 {
		pageSize = constants.DefaultPageSize
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

func SuccessPage(c *gin.Context, list interface{}, total int64, page, pageSize int) {
	Success(c, NewPaginatedData(list, total, page, pageSize))
}

func parsePositiveInt(raw string, fallback int) int {
	if raw == "" {
		return fallback
	}
	v, err := strconv.Atoi(raw)
	if err != nil || v < 1 {
		return fallback
	}
	return v
}
