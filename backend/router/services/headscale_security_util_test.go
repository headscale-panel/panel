package services

import (
	v1 "headscale-panel/pkg/proto/headscale/v1"
	"testing"
)

func TestNormalizePagination(t *testing.T) {
	tests := []struct {
		name         string
		page         int
		pageSize     int
		wantPage     int
		wantPageSize int
	}{
		{
			name:         "negative values fall back to defaults",
			page:         -1,
			pageSize:     -10,
			wantPage:     defaultPage,
			wantPageSize: defaultPageSize,
		},
		{
			name:         "zero values fall back to defaults",
			page:         0,
			pageSize:     0,
			wantPage:     defaultPage,
			wantPageSize: defaultPageSize,
		},
		{
			name:         "page size is capped",
			page:         3,
			pageSize:     maxPageSize + 100,
			wantPage:     3,
			wantPageSize: maxPageSize,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			gotPage, gotPageSize := normalizePagination(tc.page, tc.pageSize)
			if gotPage != tc.wantPage || gotPageSize != tc.wantPageSize {
				t.Fatalf("normalizePagination(%d,%d) = (%d,%d), want (%d,%d)", tc.page, tc.pageSize, gotPage, gotPageSize, tc.wantPage, tc.wantPageSize)
			}
		})
	}
}

func TestActorCanAccessNode(t *testing.T) {
	node := &v1.Node{
		User: &v1.User{
			Name: "alice",
		},
	}

	if !actorCanAccessNode(&actorScope{isAdmin: true}, node) {
		t.Fatal("admin actor should be able to access node")
	}

	if !actorCanAccessNode(&actorScope{headscaleName: "Alice"}, node) {
		t.Fatal("owner match should be case-insensitive")
	}

	if actorCanAccessNode(&actorScope{headscaleName: "bob"}, node) {
		t.Fatal("non-owner should not be able to access node")
	}
}

func TestActorCanAccessHeadscaleUser(t *testing.T) {
	if !actorCanAccessHeadscaleUser(&actorScope{isAdmin: true}, "alice") {
		t.Fatal("admin actor should access any headscale user")
	}
	if !actorCanAccessHeadscaleUser(&actorScope{headscaleName: "Alice"}, "alice") {
		t.Fatal("owner match should be case-insensitive")
	}
	if actorCanAccessHeadscaleUser(&actorScope{headscaleName: "bob"}, "alice") {
		t.Fatal("non-owner should not access other headscale users")
	}
}
