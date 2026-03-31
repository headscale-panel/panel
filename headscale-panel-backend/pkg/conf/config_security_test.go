package conf

import "testing"

func TestValidateSecurityConfig(t *testing.T) {
	tests := []struct {
		name    string
		secret  string
		wantErr bool
	}{
		{name: "empty secret is auto-generated", secret: "", wantErr: false},
		{name: "default insecure secret", secret: "headscale-panel-secret", wantErr: true},
		{name: "placeholder insecure secret", secret: "your-secret-key", wantErr: true},
		{name: "too short secret", secret: "1234567890abcdef", wantErr: true},
		{name: "valid secret", secret: "1234567890abcdef1234567890abcdef", wantErr: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := Config{
				JWT: JWTConfig{
					Secret: tt.secret,
				},
			}
			err := validateSecurityConfig(cfg)
			if tt.wantErr && err == nil {
				t.Fatalf("expected error, got nil")
			}
			if !tt.wantErr && err != nil {
				t.Fatalf("expected nil error, got %v", err)
			}
		})
	}
}
