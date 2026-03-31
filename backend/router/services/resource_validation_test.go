package services

import "testing"

func TestNormalizeIPAddress(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		want    string
		wantErr bool
	}{
		{name: "ipv4 no cidr", input: "192.168.1.10", want: "192.168.1.10/32"},
		{name: "ipv6 no cidr", input: "2001:db8::1", want: "2001:db8::1/128"},
		{name: "cidr normalized", input: "192.168.1.9/24", want: "192.168.1.0/24"},
		{name: "invalid", input: "abc", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := normalizeIPAddress(tt.input)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("expected nil error, got %v", err)
			}
			if got != tt.want {
				t.Fatalf("unexpected normalized ip: got %q, want %q", got, tt.want)
			}
		})
	}
}

func TestValidatePortSpec(t *testing.T) {
	valid := []string{
		"",
		"80",
		"22,80,443",
		"1000-2000",
		"22,1000-2000,443",
	}
	for _, v := range valid {
		t.Run("valid_"+v, func(t *testing.T) {
			if err := validatePortSpec(v); err != nil {
				t.Fatalf("expected valid port spec, got %v", err)
			}
		})
	}

	invalid := []string{
		",",
		"0",
		"65536",
		"2000-1000",
		"abc",
		"80-",
		"-100",
		"1-70000",
	}
	for _, v := range invalid {
		t.Run("invalid_"+v, func(t *testing.T) {
			if err := validatePortSpec(v); err == nil {
				t.Fatalf("expected invalid port spec error for %q", v)
			}
		})
	}
}
