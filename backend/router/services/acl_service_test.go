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

package services

import (
	"context"
	"encoding/json"
	"net"
	"testing"

	v1 "github.com/juanfont/headscale/gen/go/headscale/v1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/status"
	"google.golang.org/grpc/test/bufconn"
)

type policyCheckTestServer struct {
	v1.UnimplementedHeadscaleServiceServer
	err error
}

func (s policyCheckTestServer) CheckPolicy(context.Context, *v1.CheckPolicyRequest) (*v1.CheckPolicyResponse, error) {
	if s.err != nil {
		return nil, s.err
	}
	return &v1.CheckPolicyResponse{}, nil
}

func newPolicyCheckTestClient(t *testing.T, server v1.HeadscaleServiceServer) v1.HeadscaleServiceClient {
	t.Helper()
	listener := bufconn.Listen(1024 * 1024)
	grpcServer := grpc.NewServer()
	v1.RegisterHeadscaleServiceServer(grpcServer, server)
	go func() { _ = grpcServer.Serve(listener) }()
	t.Cleanup(func() {
		grpcServer.Stop()
		_ = listener.Close()
	})
	conn, err := grpc.NewClient("passthrough:///bufnet",
		grpc.WithContextDialer(func(context.Context, string) (net.Conn, error) { return listener.Dial() }),
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = conn.Close() })
	return v1.NewHeadscaleServiceClient(conn)
}

func TestCheckPolicyRPC(t *testing.T) {
	client := newPolicyCheckTestClient(t, policyCheckTestServer{})
	if err := checkPolicyRPC(context.Background(), client, `{}`); err != nil {
		t.Fatalf("valid policy rejected: %v", err)
	}
}

func TestCheckPolicyRPCSurfacesValidationError(t *testing.T) {
	client := newPolicyCheckTestClient(t, policyCheckTestServer{err: status.Error(codes.InvalidArgument, "invalid grant destination")})
	err := checkPolicyRPC(context.Background(), client, `{}`)
	if err == nil || err.Error() != "invalid grant destination" {
		t.Fatalf("validation error = %v", err)
	}
}

func TestNormalizeACLDestination(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		in   string
		want string
	}{
		{name: "group gets wildcard port", in: "group:admin", want: "group:admin:*"},
		{name: "tag keeps explicit port", in: "tag:server:443", want: "tag:server:443"},
		{name: "autogroup gets wildcard port", in: "autogroup:self", want: "autogroup:self:*"},
		{name: "host alias gets wildcard port", in: "db-primary", want: "db-primary:*"},
		{name: "host alias keeps explicit port", in: "nas:22", want: "nas:22"},
		{name: "user alias gets wildcard port", in: "alice@", want: "alice@:*"},
		{name: "user alias keeps explicit port", in: "boss@:22", want: "boss@:22"},
		{name: "ipv4 keeps explicit port", in: "100.64.0.1:22", want: "100.64.0.1:22"},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			got, err := normalizeACLDestination(tc.in)
			if err != nil {
				t.Fatalf("normalizeACLDestination(%q) returned error: %v", tc.in, err)
			}
			if got != tc.want {
				t.Fatalf("normalizeACLDestination(%q) = %q, want %q", tc.in, got, tc.want)
			}
		})
	}
}

func TestNormalizeRawACLPolicyJSON(t *testing.T) {
	t.Parallel()

	raw := `{
		"groups": {
			"group:admin": ["alice@"]
		},
		"acls": [
			{
				"action": "accept",
				"src": ["group:admin"],
				"dst": ["group:admin", "db-primary", "alice@"]
			}
		]
	}`

	normalized, err := normalizeRawACLPolicyJSON(raw)
	if err != nil {
		t.Fatalf("normalizeRawACLPolicyJSON returned error: %v", err)
	}

	var parsed struct {
		ACLs []struct {
			Dst []string `json:"dst"`
		} `json:"acls"`
	}
	if err := json.Unmarshal([]byte(normalized), &parsed); err != nil {
		t.Fatalf("normalized JSON should be valid: %v", err)
	}

	if len(parsed.ACLs) != 1 {
		t.Fatalf("expected 1 ACL rule, got %d", len(parsed.ACLs))
	}

	got := parsed.ACLs[0].Dst
	want := []string{"group:admin:*", "db-primary:*", "alice@:*"}
	if len(got) != len(want) {
		t.Fatalf("expected %d dst entries, got %d", len(want), len(got))
	}
	for index := range want {
		if got[index] != want[index] {
			t.Fatalf("dst[%d] = %q, want %q", index, got[index], want[index])
		}
	}
}

func TestNormalizeRawACLPolicyJSONSupportsHuJSONComments(t *testing.T) {
	t.Parallel()

	raw := `{
		// Operators can reach tagged services.
		"acls": [
			{
				"action": "accept",
				"src": ["group:ops"],
				"dst": ["tag:service"],
			},
		],
	}`

	normalized, err := normalizeRawACLPolicyJSON(raw)
	if err != nil {
		t.Fatalf("normalizeRawACLPolicyJSON should accept HuJSON comments: %v", err)
	}

	var parsed struct {
		ACLs []struct {
			Dst []string `json:"dst"`
		} `json:"acls"`
	}
	if err := json.Unmarshal([]byte(normalized), &parsed); err != nil {
		t.Fatalf("normalized HuJSON should be valid JSON: %v", err)
	}

	if len(parsed.ACLs) != 1 || len(parsed.ACLs[0].Dst) != 1 {
		t.Fatalf("expected one normalized ACL destination, got %#v", parsed.ACLs)
	}

	if parsed.ACLs[0].Dst[0] != "tag:service:*" {
		t.Fatalf("expected normalized destination to include wildcard port, got %q", parsed.ACLs[0].Dst[0])
	}
}
