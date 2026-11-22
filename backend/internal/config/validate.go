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

package config

import (
	"fmt"
	"net"
	"net/url"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// Issue is one validation finding.
type Issue struct {
	Key     string `json:"key"`
	Message string `json:"message"`
}

// ValidationError carries every issue at once.
//
// Reporting all problems in one pass matters: an operator fixing a form should
// not have to submit it repeatedly to discover the next complaint.
type ValidationError struct {
	Issues []Issue
}

func (e *ValidationError) Error() string {
	if len(e.Issues) == 0 {
		return "configuration is invalid"
	}
	parts := make([]string, 0, len(e.Issues))
	for _, issue := range e.Issues {
		if issue.Key == "" {
			parts = append(parts, issue.Message)
			continue
		}
		parts = append(parts, issue.Key+": "+issue.Message)
	}
	return strings.Join(parts, "; ")
}

// Validate checks a document against the registry and against headscale's own
// structural expectations.
//
// This is the pre-write half of the double validation. It runs on the document
// that is about to be written, not on the incoming request, so a value that
// arrives correct but is corrupted by the merge is still caught.
func Validate(doc *Document) error {
	issues := make([]Issue, 0)

	for _, rule := range Registry {
		value, ok := doc.Get(rule.Key)
		if !ok {
			continue
		}
		if err := validateField(rule, value); err != nil {
			issues = append(issues, Issue{Key: rule.Key, Message: err.Error()})
		}
	}

	issues = append(issues, validateStructure(doc)...)
	if len(issues) > 0 {
		return &ValidationError{Issues: issues}
	}
	return nil
}

func validateField(rule FieldRule, value any) error {
	switch rule.Kind {
	case KindString:
		if _, ok := value.(string); !ok {
			return fmt.Errorf("expected a string, got %T", value)
		}

	case KindBool:
		if _, ok := value.(bool); !ok {
			return fmt.Errorf("expected true or false, got %T", value)
		}

	case KindInt:
		if _, ok := value.(int); !ok {
			return fmt.Errorf("expected an integer, got %T", value)
		}

	case KindStrings:
		if _, ok := value.([]string); !ok {
			return fmt.Errorf("expected a list, got %T", value)
		}

	case KindStringMap:
		if _, ok := value.(map[string]any); !ok {
			return fmt.Errorf("expected a mapping, got %T", value)
		}

	case KindDuration:
		text, ok := value.(string)
		if !ok {
			return fmt.Errorf("expected a duration such as 3h, got %T", value)
		}
		if _, err := time.ParseDuration(text); err != nil {
			return fmt.Errorf("%q is not a valid duration (try 3h, 30m)", text)
		}
	}

	switch rule.Key {
	case "server_url":
		if text, ok := value.(string); ok && text != "" {
			parsed, err := url.Parse(text)
			if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
				return fmt.Errorf("%q must be an absolute http(s) URL", text)
			}
		}

	case "listen_addr", "metrics_listen_addr", "derp.server.stun_listen_addr":
		if text, ok := value.(string); ok && text != "" {
			if _, _, err := net.SplitHostPort(text); err != nil {
				return fmt.Errorf("%q must be host:port", text)
			}
		}

	case "prefixes.v4", "prefixes.v6":
		if text, ok := value.(string); ok && text != "" {
			if _, _, err := net.ParseCIDR(text); err != nil {
				return fmt.Errorf("%q is not a CIDR block", text)
			}
		}

	case "prefixes.allocation":
		if text, ok := value.(string); ok && text != "" {
			if text != "sequential" && text != "random" {
				return fmt.Errorf("%q must be sequential or random", text)
			}
		}

	case "policy.mode":
		if text, ok := value.(string); ok && text != "" {
			if text != "database" && text != "file" {
				return fmt.Errorf("%q must be database or file", text)
			}
		}

	case "database.type":
		if text, ok := value.(string); ok && text != "" {
			if text != "sqlite" && text != "postgres" {
				return fmt.Errorf("%q must be sqlite or postgres", text)
			}
		}

	case "log.level":
		if text, ok := value.(string); ok && text != "" {
			switch strings.ToLower(text) {
			case "trace", "debug", "info", "warn", "error", "fatal":
			default:
				return fmt.Errorf("%q is not a log level", text)
			}
		}

	case "log.format":
		if text, ok := value.(string); ok && text != "" {
			if text != "text" && text != "json" {
				return fmt.Errorf("%q must be text or json", text)
			}
		}

	case "dns.nameservers.global":
		if items, ok := value.([]string); ok {
			for _, item := range items {
				if net.ParseIP(item) == nil {
					return fmt.Errorf("%q is not an IP address", item)
				}
			}
		}
	}

	return nil
}

// validateStructure enforces the relationships headscale assumes but YAML cannot
// express.
func validateStructure(doc *Document) []Issue {
	issues := make([]Issue, 0, 4)

	// A headscale without server_url cannot hand out a login server, and the panel
	// derives its IdP redirect from it.
	if value, ok := doc.Get("server_url"); !ok || strings.TrimSpace(asString(value)) == "" {
		issues = append(issues, Issue{Key: "server_url", Message: "required: clients and the panel identity provider both derive their URLs from it"})
	}

	// policy.mode=file means headscale reads the policy from policy.path; leaving
	// the path empty makes headscale fail at startup.
	mode := asString(mustGet(doc, "policy.mode"))
	path := strings.TrimSpace(asString(mustGet(doc, "policy.path")))
	if mode == "file" && path == "" {
		issues = append(issues, Issue{Key: "policy.path", Message: "required when policy.mode is file"})
	}
	if mode == "database" && path != "" {
		issues = append(issues, Issue{Key: "policy.path", Message: "must be empty when policy.mode is database, or headscale reads the wrong source"})
	}

	// An oidc block without an issuer is how a half-configured provider starts and
	// then fails every login.
	if doc.Has("oidc.issuer") {
		issuer := strings.TrimSpace(asString(mustGet(doc, "oidc.issuer")))
		clientID := strings.TrimSpace(asString(mustGet(doc, "oidc.client_id")))
		if issuer == "" || clientID == "" {
			issues = append(issues, Issue{Key: "oidc", Message: "issuer and client_id must both be set when an oidc block exists"})
		}
	}

	// sqlite mode needs a file path; postgres mode needs a host, database and user.
	dbType := asString(mustGet(doc, "database.type"))
	if dbType == "sqlite" {
		if dbPath := strings.TrimSpace(asString(mustGet(doc, "database.sqlite.path"))); dbPath == "" {
			issues = append(issues, Issue{Key: "database.sqlite.path", Message: "required when database.type is sqlite"})
		}
	}
	if dbType == "postgres" {
		for _, key := range []string{"database.postgres.host", "database.postgres.name", "database.postgres.user"} {
			if strings.TrimSpace(asString(mustGet(doc, key))) == "" {
				issues = append(issues, Issue{Key: key, Message: "required when database.type is postgres"})
			}
		}
	}

	// A relative path in a container is almost always a mistake, and the resulting
	// error from headscale names the file rather than the setting.
	for _, key := range []string{"database.sqlite.path", "noise.private_key_path", "dns.extra_records_path"} {
		value := strings.TrimSpace(asString(mustGet(doc, key)))
		if value == "" {
			continue
		}
		if !filepath.IsAbs(value) {
			issues = append(issues, Issue{Key: key, Message: fmt.Sprintf("%q must be an absolute path", value)})
		}
	}

	// TLS is either terminated by headscale (cert+key) or not at all; half a pair
	// means headscale listens in plaintext while the operator believes otherwise.
	cert := strings.TrimSpace(asString(mustGet(doc, "tls.cert_path")))
	key := strings.TrimSpace(asString(mustGet(doc, "tls.key_path")))
	if (cert == "") != (key == "") {
		issues = append(issues, Issue{Key: "tls", Message: "tls.cert_path and tls.key_path must be set together"})
	}

	return issues
}

// mustGet returns a value or nil when absent.
func mustGet(doc *Document, key string) any {
	value, _ := doc.Get(key)
	return value
}

// asString renders a decoded scalar as text.
func asString(value any) string {
	switch typed := value.(type) {
	case nil:
		return ""
	case string:
		return typed
	case bool:
		return strconv.FormatBool(typed)
	case int:
		return strconv.Itoa(typed)
	default:
		return fmt.Sprint(typed)
	}
}
