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

package influxdb

import (
	"context"
	"strings"
	"testing"
	"time"
)

func TestFluxStringLiteralEscapes(t *testing.T) {
	input := "a\"b\\c\nx\ry\tz"
	got := fluxStringLiteral(input)
	want := "\"a\\\"b\\\\c x y z\""
	if got != want {
		t.Fatalf("unexpected escaped value: got %q, want %q", got, want)
	}
}

func TestNormalizeNumericID(t *testing.T) {
	testCases := []struct {
		name     string
		field    string
		value    string
		required bool
		want     string
		wantErr  bool
	}{
		{
			name:     "valid numeric id",
			field:    "user_id",
			value:    "12345",
			required: true,
			want:     "12345",
		},
		{
			name:     "trim spaces",
			field:    "machine_id",
			value:    "  42  ",
			required: true,
			want:     "42",
		},
		{
			name:     "required empty",
			field:    "user_id",
			value:    "   ",
			required: true,
			wantErr:  true,
		},
		{
			name:     "optional empty",
			field:    "user_id",
			value:    "",
			required: false,
			want:     "",
		},
		{
			name:     "invalid alpha",
			field:    "machine_id",
			value:    "abc",
			required: true,
			wantErr:  true,
		},
		{
			name:     "too long",
			field:    "machine_id",
			value:    "123456789012345678901",
			required: true,
			wantErr:  true,
		},
	}

	for _, tc := range testCases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			got, err := normalizeNumericID(tc.field, tc.value, tc.required)
			if tc.wantErr {
				if err == nil {
					t.Fatalf("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if got != tc.want {
				t.Fatalf("unexpected normalized value: got %q, want %q", got, tc.want)
			}
		})
	}
}

func TestQueryOnlineDurationRejectsInvalidIDs(t *testing.T) {
	start := time.Now().Add(-time.Hour)
	end := time.Now()

	_, err := QueryOnlineDuration(context.Background(), `1" or true`, "", start, end)
	if err == nil {
		t.Fatalf("expected error for invalid user_id")
	}
	if !strings.Contains(err.Error(), "invalid user_id format") {
		t.Fatalf("unexpected error: %v", err)
	}

	_, err = QueryOnlineDuration(context.Background(), "", `7 |> drop(columns: ["_value"])`, start, end)
	if err == nil {
		t.Fatalf("expected error for invalid machine_id")
	}
	if !strings.Contains(err.Error(), "invalid machine_id format") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestGetDeviceStatusHistoryRejectsInvalidMachineID(t *testing.T) {
	_, err := GetDeviceStatusHistory(context.Background(), `1") |> from(bucket:"x")`, time.Now().Add(-time.Hour), time.Now())
	if err == nil {
		t.Fatalf("expected error for invalid machine_id")
	}
	if !strings.Contains(err.Error(), "invalid machine_id format") {
		t.Fatalf("unexpected error: %v", err)
	}
}
