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

// Package config owns the headscale configuration file.
//
// The panel edits a headscale YAML file that an operator may also edit by hand,
// and that file contains comments worth keeping. Two rules follow from that:
//
//   - The panel never renders a whole document from a struct. It merges the
//     fields it owns into the existing document, so unknown keys, comments and
//     formatting survive a save.
//   - Ownership is declared once, in the registry, and drives the merge, the API
//     validation, drift detection and the UI grouping. A field that is not
//     Managed is never written, even if a caller sends it.
package config

// Ownership says who is allowed to change a field.
type Ownership string

const (
	// Managed fields are the panel's: they are rewritten on every save and
	// reconciled if they drift.
	Managed Ownership = "managed"

	// ReadOnly fields are never written, with one exception: HSBootstrap may set
	// them when generating or repairing a file that does not have them yet. They
	// appear in the UI as visible but disabled, because an operator looking for
	// database.path needs to see its current value.
	ReadOnly Ownership = "readonly"

	// Passthrough fields are not modelled at all. They are preserved verbatim by
	// the merge and never appear in the API.
	Passthrough Ownership = "passthrough"
)

// BootstrapPolicy says whether the bootstrap flow may create a missing field.
type BootstrapPolicy string

const (
	// BootstrapNever means the panel will not invent a value. Used where a wrong
	// guess is worse than refusing to start: postgres credentials in particular.
	BootstrapNever BootstrapPolicy = "never"

	// BootstrapIfMissing allows generate/repair to write the field only when it is
	// absent from the file.
	BootstrapIfMissing BootstrapPolicy = "if_missing"
)

// Tier says how a change reaches headscale.
type Tier string

const (
	// TierAPI changes take effect immediately through the HTTP API.
	TierAPI Tier = "api"

	// TierHotFile changes are picked up by headscale's own file watcher.
	TierHotFile Tier = "hotfile"

	// TierConfigFile changes need a restart.
	TierConfigFile Tier = "configfile"
)

// Kind is the value type a field carries, used to validate input without
// reflection over the destination struct.
type Kind string

const (
	KindString    Kind = "string"
	KindBool      Kind = "bool"
	KindInt       Kind = "int"
	KindDuration  Kind = "duration"
	KindStrings   Kind = "strings"
	KindStringMap Kind = "stringmap"
)

// FieldRule declares everything the panel knows about one configuration key.
type FieldRule struct {
	// Key is the dotted path inside the document, e.g. "dns.base_domain".
	Key   string
	Kind  Kind
	Owner Ownership
	// Bootstrap is only consulted for ReadOnly fields.
	Bootstrap BootstrapPolicy
	Tier      Tier
	Section   string
	Secret    bool
	Default   any
	// Note is shown to the operator next to the input.
	Note string
}

// Registry is the complete set of keys the panel knows about.
//
// Keys absent from this registry are Passthrough by definition: the merge leaves
// them alone, which is what allows headscale to add settings without a panel
// release silently dropping them.
var Registry = []FieldRule{
	// ── server ────────────────────────────────────────────────────────────────
	{Key: "server_url", Kind: KindString, Owner: Managed, Tier: TierConfigFile, Section: "server",
		Note: "Public URL clients use to reach this headscale."},
	{Key: "listen_addr", Kind: KindString, Owner: Managed, Tier: TierConfigFile, Section: "server"},
	{Key: "metrics_listen_addr", Kind: KindString, Owner: Managed, Tier: TierConfigFile, Section: "server"},
	{Key: "ephemeral_node_inactivity_timeout", Kind: KindDuration, Owner: Managed, Tier: TierConfigFile, Section: "server"},
	{Key: "disable_check_updates", Kind: KindBool, Owner: Managed, Tier: TierConfigFile, Section: "server"},
	{Key: "randomize_client_port", Kind: KindBool, Owner: Managed, Tier: TierConfigFile, Section: "server"},

	// ── tls ───────────────────────────────────────────────────────────────────
	// 0.30 nests these under tls:, unlike 0.29's flat tls_* keys.
	{Key: "tls.cert_path", Kind: KindString, Owner: Managed, Tier: TierConfigFile, Section: "tls"},
	{Key: "tls.key_path", Kind: KindString, Owner: Managed, Tier: TierConfigFile, Section: "tls"},
	{Key: "tls.letsencrypt_hostname", Kind: KindString, Owner: Managed, Tier: TierConfigFile, Section: "tls"},
	{Key: "tls.letsencrypt_cache_dir", Kind: KindString, Owner: Managed, Tier: TierConfigFile, Section: "tls"},
	{Key: "tls.letsencrypt_challenge_type", Kind: KindString, Owner: Managed, Tier: TierConfigFile, Section: "tls"},
	{Key: "tls.letsencrypt_listen", Kind: KindString, Owner: Managed, Tier: TierConfigFile, Section: "tls"},
	{Key: "tls.alpn_allowed_protocols", Kind: KindStrings, Owner: Managed, Tier: TierConfigFile, Section: "tls"},

	// ── noise ─────────────────────────────────────────────────────────────────
	// The key path is ReadOnly: pointing headscale at a different key file would
	// orphan every registered node.
	{Key: "noise.private_key_path", Kind: KindString, Owner: ReadOnly, Bootstrap: BootstrapIfMissing,
		Tier: TierConfigFile, Section: "noise",
		Note: "Changing this orphans every registered node; it is set once at bootstrap."},

	// ── prefixes ──────────────────────────────────────────────────────────────
	{Key: "prefixes.v4", Kind: KindString, Owner: Managed, Tier: TierConfigFile, Section: "prefixes",
		Note: "Changing the prefix pool invalidates existing node addresses."},
	{Key: "prefixes.v6", Kind: KindString, Owner: Managed, Tier: TierConfigFile, Section: "prefixes"},
	{Key: "prefixes.allocation", Kind: KindString, Owner: Managed, Tier: TierConfigFile, Section: "prefixes"},

	// ── derp ──────────────────────────────────────────────────────────────────
	{Key: "derp.server.enabled", Kind: KindBool, Owner: Managed, Tier: TierConfigFile, Section: "derp"},
	{Key: "derp.server.region_id", Kind: KindInt, Owner: Managed, Tier: TierConfigFile, Section: "derp"},
	{Key: "derp.server.region_code", Kind: KindString, Owner: Managed, Tier: TierConfigFile, Section: "derp"},
	{Key: "derp.server.region_name", Kind: KindString, Owner: Managed, Tier: TierConfigFile, Section: "derp"},
	{Key: "derp.server.stun_listen_addr", Kind: KindString, Owner: Managed, Tier: TierConfigFile, Section: "derp"},
	{Key: "derp.server.verify_clients", Kind: KindBool, Owner: Managed, Tier: TierConfigFile, Section: "derp"},
	{Key: "derp.server.automatically_add_embedded_derp_region", Kind: KindBool, Owner: Managed, Tier: TierConfigFile, Section: "derp"},
	{Key: "derp.server.private_key_path", Kind: KindString, Owner: ReadOnly, Bootstrap: BootstrapIfMissing, Tier: TierConfigFile, Section: "derp"},
	{Key: "derp.server.ipv4", Kind: KindString, Owner: ReadOnly, Bootstrap: BootstrapIfMissing, Tier: TierConfigFile, Section: "derp"},
	{Key: "derp.server.ipv6", Kind: KindString, Owner: ReadOnly, Bootstrap: BootstrapIfMissing, Tier: TierConfigFile, Section: "derp"},
	{Key: "derp.urls", Kind: KindStrings, Owner: Managed, Tier: TierConfigFile, Section: "derp"},
	{Key: "derp.paths", Kind: KindStrings, Owner: Managed, Tier: TierHotFile, Section: "derp",
		Note: "Re-read every derp.update_frequency (3h by default)."},
	{Key: "derp.auto_update_enabled", Kind: KindBool, Owner: Managed, Tier: TierConfigFile, Section: "derp"},
	{Key: "derp.update_frequency", Kind: KindDuration, Owner: Managed, Tier: TierConfigFile, Section: "derp"},
	{Key: "derp.ipv4", Kind: KindString, Owner: ReadOnly, Bootstrap: BootstrapIfMissing, Tier: TierConfigFile, Section: "derp"},
	{Key: "derp.ipv6", Kind: KindString, Owner: ReadOnly, Bootstrap: BootstrapIfMissing, Tier: TierConfigFile, Section: "derp"},

	// ── database ──────────────────────────────────────────────────────────────
	// All ReadOnly. Writing these wrong makes headscale fail to start, and the
	// postgres credentials in particular cannot be guessed: BootstrapNever.
	{Key: "database.type", Kind: KindString, Owner: ReadOnly, Bootstrap: BootstrapIfMissing, Tier: TierConfigFile, Section: "database"},
	{Key: "database.sqlite.path", Kind: KindString, Owner: ReadOnly, Bootstrap: BootstrapIfMissing, Tier: TierConfigFile, Section: "database"},
	{Key: "database.sqlite.write_ahead_log", Kind: KindBool, Owner: ReadOnly, Bootstrap: BootstrapIfMissing, Tier: TierConfigFile, Section: "database"},
	{Key: "database.sqlite.wal_autocheckpoint", Kind: KindInt, Owner: ReadOnly, Bootstrap: BootstrapIfMissing, Tier: TierConfigFile, Section: "database"},
	{Key: "database.debug", Kind: KindBool, Owner: ReadOnly, Bootstrap: BootstrapIfMissing, Tier: TierConfigFile, Section: "database"},
	{Key: "database.gorm.parameterized_queries", Kind: KindBool, Owner: ReadOnly, Bootstrap: BootstrapIfMissing, Tier: TierConfigFile, Section: "database"},
	{Key: "database.gorm.skip_err_record_not_found", Kind: KindBool, Owner: ReadOnly, Bootstrap: BootstrapIfMissing, Tier: TierConfigFile, Section: "database"},
	{Key: "database.gorm.slow_threshold", Kind: KindInt, Owner: ReadOnly, Bootstrap: BootstrapIfMissing, Tier: TierConfigFile, Section: "database"},
	{Key: "database.postgres.host", Kind: KindString, Owner: ReadOnly, Bootstrap: BootstrapNever, Tier: TierConfigFile, Section: "database"},
	{Key: "database.postgres.port", Kind: KindInt, Owner: ReadOnly, Bootstrap: BootstrapNever, Tier: TierConfigFile, Section: "database"},
	{Key: "database.postgres.name", Kind: KindString, Owner: ReadOnly, Bootstrap: BootstrapNever, Tier: TierConfigFile, Section: "database"},
	{Key: "database.postgres.user", Kind: KindString, Owner: ReadOnly, Bootstrap: BootstrapNever, Tier: TierConfigFile, Section: "database"},
	{Key: "database.postgres.pass", Kind: KindString, Owner: ReadOnly, Bootstrap: BootstrapNever, Tier: TierConfigFile, Section: "database", Secret: true},
	{Key: "database.postgres.ssl", Kind: KindString, Owner: ReadOnly, Bootstrap: BootstrapNever, Tier: TierConfigFile, Section: "database"},
	{Key: "database.postgres.max_open_conns", Kind: KindInt, Owner: ReadOnly, Bootstrap: BootstrapNever, Tier: TierConfigFile, Section: "database"},
	{Key: "database.postgres.max_idle_conns", Kind: KindInt, Owner: ReadOnly, Bootstrap: BootstrapNever, Tier: TierConfigFile, Section: "database"},
	{Key: "database.postgres.conn_max_idle_time_secs", Kind: KindInt, Owner: ReadOnly, Bootstrap: BootstrapNever, Tier: TierConfigFile, Section: "database"},

	// ── preauth_keys ──────────────────────────────────────────────────────────
	{Key: "preauth_keys.revoked_retention", Kind: KindDuration, Owner: Managed, Tier: TierConfigFile, Section: "server",
		Note: "How long soft-revoked pre-auth keys and OAuth clients are kept before deletion."},

	// ── tailsql ───────────────────────────────────────────────────────────────
	{Key: "tailsql.enabled", Kind: KindBool, Owner: Managed, Tier: TierConfigFile, Section: "server",
		Note: "Runs tailsql as a node on the tailnet (requires SQLite database)."},
	{Key: "tailsql.state_dir", Kind: KindString, Owner: ReadOnly, Bootstrap: BootstrapIfMissing, Tier: TierConfigFile, Section: "server"},

	// ── dns ───────────────────────────────────────────────────────────────────
	{Key: "dns.base_domain", Kind: KindString, Owner: Managed, Tier: TierConfigFile, Section: "dns"},
	{Key: "dns.magic_dns", Kind: KindBool, Owner: Managed, Tier: TierConfigFile, Section: "dns"},
	{Key: "dns.nameservers.global", Kind: KindStrings, Owner: Managed, Tier: TierConfigFile, Section: "dns"},
	{Key: "dns.nameservers.split", Kind: KindStringMap, Owner: Managed, Tier: TierConfigFile, Section: "dns"},
	{Key: "dns.search_domains", Kind: KindStrings, Owner: Managed, Tier: TierConfigFile, Section: "dns"},
	{Key: "dns.override_local_dns", Kind: KindBool, Owner: Managed, Tier: TierConfigFile, Section: "dns"},
	{Key: "dns.extra_records_path", Kind: KindString, Owner: Managed, Tier: TierHotFile, Section: "dns",
		Note: "Watched with fsnotify. The panel writes in place so the inode stays watched."},
	{Key: "dns.extra_records", Kind: KindString, Owner: ReadOnly, Bootstrap: BootstrapNever, Tier: TierConfigFile, Section: "dns",
		Note: "Read-only because the panel owns extra_records_path; two writers would fight."},
	{Key: "dns.certificates.zone", Kind: KindString, Owner: Managed, Tier: TierConfigFile, Section: "dns"},
	{Key: "dns.challenge.provider", Kind: KindString, Owner: Managed, Tier: TierConfigFile, Section: "dns"},
	{Key: "dns.challenge.resolvers", Kind: KindStrings, Owner: Managed, Tier: TierConfigFile, Section: "dns"},

	// ── policy ────────────────────────────────────────────────────────────────
	{Key: "policy.mode", Kind: KindString, Owner: Managed, Tier: TierConfigFile, Section: "policy",
		Note: "The panel needs database mode to edit policy through the API."},
	{Key: "policy.path", Kind: KindString, Owner: Managed, Tier: TierConfigFile, Section: "policy"},

	// ── oidc ──────────────────────────────────────────────────────────────────
	// Derived from the panel IdP or the external IdP settings; never edited here.
	{Key: "oidc.issuer", Kind: KindString, Owner: Managed, Tier: TierConfigFile, Section: "oidc"},
	{Key: "oidc.client_id", Kind: KindString, Owner: Managed, Tier: TierConfigFile, Section: "oidc"},
	{Key: "oidc.client_secret", Kind: KindString, Owner: Managed, Tier: TierConfigFile, Section: "oidc", Secret: true},
	{Key: "oidc.client_secret_path", Kind: KindString, Owner: Managed, Tier: TierConfigFile, Section: "oidc"},
	{Key: "oidc.scope", Kind: KindStrings, Owner: Managed, Tier: TierConfigFile, Section: "oidc"},
	{Key: "oidc.only_start_if_oidc_is_available", Kind: KindBool, Owner: Managed, Tier: TierConfigFile, Section: "oidc"},
	{Key: "oidc.email_verified_required", Kind: KindBool, Owner: Managed, Tier: TierConfigFile, Section: "oidc"},
	{Key: "oidc.allowed_domains", Kind: KindStrings, Owner: Managed, Tier: TierConfigFile, Section: "oidc"},
	{Key: "oidc.allowed_users", Kind: KindStrings, Owner: Managed, Tier: TierConfigFile, Section: "oidc"},
	{Key: "oidc.allowed_groups", Kind: KindStrings, Owner: Managed, Tier: TierConfigFile, Section: "oidc"},
	{Key: "oidc.expiry", Kind: KindDuration, Owner: Managed, Tier: TierConfigFile, Section: "oidc"},
	{Key: "oidc.use_expiry_from_token", Kind: KindBool, Owner: Managed, Tier: TierConfigFile, Section: "oidc"},
	{Key: "oidc.extra_params", Kind: KindStringMap, Owner: Managed, Tier: TierConfigFile, Section: "oidc"},
	{Key: "oidc.pkce.enabled", Kind: KindBool, Owner: Managed, Tier: TierConfigFile, Section: "oidc"},
	{Key: "oidc.pkce.method", Kind: KindString, Owner: Managed, Tier: TierConfigFile, Section: "oidc"},

	// ── log / logtail ─────────────────────────────────────────────────────────
	{Key: "log.level", Kind: KindString, Owner: Managed, Tier: TierConfigFile, Section: "log"},
	{Key: "log.format", Kind: KindString, Owner: Managed, Tier: TierConfigFile, Section: "log"},
	{Key: "logtail.enabled", Kind: KindBool, Owner: Managed, Tier: TierConfigFile, Section: "log"},

	// ── taildrop ──────────────────────────────────────────────────────────────
	{Key: "taildrop.enabled", Kind: KindBool, Owner: Managed, Tier: TierConfigFile, Section: "taildrop"},

	// ── runtime paths ─────────────────────────────────────────────────────────
	{Key: "unix_socket", Kind: KindString, Owner: ReadOnly, Bootstrap: BootstrapIfMissing, Tier: TierConfigFile, Section: "socket"},
	{Key: "unix_socket_permission", Kind: KindString, Owner: ReadOnly, Bootstrap: BootstrapIfMissing, Tier: TierConfigFile, Section: "socket"},
	{Key: "cli.timeout", Kind: KindDuration, Owner: ReadOnly, Bootstrap: BootstrapIfMissing, Tier: TierConfigFile, Section: "cli"},
	{Key: "cli.integration_testing", Kind: KindBool, Owner: ReadOnly, Bootstrap: BootstrapIfMissing, Tier: TierConfigFile, Section: "cli"},
	{Key: "tuning.batch_change_delay", Kind: KindDuration, Owner: ReadOnly, Bootstrap: BootstrapIfMissing, Tier: TierConfigFile, Section: "tuning"},
	{Key: "tuning.batcher_workers", Kind: KindInt, Owner: ReadOnly, Bootstrap: BootstrapIfMissing, Tier: TierConfigFile, Section: "tuning"},
	{Key: "tuning.node_mapsession_buffered_chan_size", Kind: KindInt, Owner: ReadOnly, Bootstrap: BootstrapIfMissing, Tier: TierConfigFile, Section: "tuning"},
	{Key: "tuning.node_store_batch_size", Kind: KindInt, Owner: ReadOnly, Bootstrap: BootstrapIfMissing, Tier: TierConfigFile, Section: "tuning"},
	{Key: "tuning.node_store_batch_timeout", Kind: KindDuration, Owner: ReadOnly, Bootstrap: BootstrapIfMissing, Tier: TierConfigFile, Section: "tuning"},
	{Key: "tuning.register_cache_expiration", Kind: KindDuration, Owner: ReadOnly, Bootstrap: BootstrapIfMissing, Tier: TierConfigFile, Section: "tuning"},
	{Key: "tuning.register_cache_max_entries", Kind: KindInt, Owner: ReadOnly, Bootstrap: BootstrapIfMissing, Tier: TierConfigFile, Section: "tuning"},
	{Key: "tuning.batcher.buffer_size", Kind: KindInt, Owner: ReadOnly, Bootstrap: BootstrapIfMissing, Tier: TierConfigFile, Section: "tuning"},
	{Key: "tuning.batcher.flush_interval", Kind: KindDuration, Owner: ReadOnly, Bootstrap: BootstrapIfMissing, Tier: TierConfigFile, Section: "tuning"},
	{Key: "tuning.node_maps.use_ratelimiter", Kind: KindBool, Owner: ReadOnly, Bootstrap: BootstrapIfMissing, Tier: TierConfigFile, Section: "tuning"},
	{Key: "tuning.node_maps.ratelimit", Kind: KindDuration, Owner: ReadOnly, Bootstrap: BootstrapIfMissing, Tier: TierConfigFile, Section: "tuning"},
	{Key: "tuning.node_maps.batchsize", Kind: KindInt, Owner: ReadOnly, Bootstrap: BootstrapIfMissing, Tier: TierConfigFile, Section: "tuning"},
	{Key: "tuning.node_maps.cache_ttl", Kind: KindDuration, Owner: ReadOnly, Bootstrap: BootstrapIfMissing, Tier: TierConfigFile, Section: "tuning"},
	{Key: "tuning.node_maps.cache_size", Kind: KindInt, Owner: ReadOnly, Bootstrap: BootstrapIfMissing, Tier: TierConfigFile, Section: "tuning"},
}

// registryIndex maps a dotted key to its rule.
var registryIndex = func() map[string]FieldRule {
	out := make(map[string]FieldRule, len(Registry))
	for _, rule := range Registry {
		out[rule.Key] = rule
	}
	return out
}()

// Lookup returns the rule for a dotted key.
func Lookup(key string) (FieldRule, bool) {
	rule, ok := registryIndex[key]
	return rule, ok
}

// IsManaged reports whether the panel may write a key unconditionally.
func IsManaged(key string) bool {
	rule, ok := registryIndex[key]
	return ok && rule.Owner == Managed
}

// BySection groups the rules by UI section, preserving registry order.
func BySection() map[string][]FieldRule {
	out := map[string][]FieldRule{}
	for _, rule := range Registry {
		out[rule.Section] = append(out[rule.Section], rule)
	}
	return out
}

// Requirement is one key the panel expects to find in the file.
type Requirement struct {
	Key   string
	Value any
}

// BootstrapRequirements returns the values HSBootstrap may create.
//
// Only ReadOnly fields whose policy allows it appear here: the bootstrap flow is
// the single place permitted to write them, and only for keys that are absent.
func BootstrapRequirements(values map[string]any) []Requirement {
	out := make([]Requirement, 0, len(values))
	for key, value := range values {
		rule, ok := registryIndex[key]
		if !ok {
			continue
		}
		if rule.Owner == Managed {
			// Managed keys are written by every save; bootstrap does not need to
			// special-case them.
			continue
		}
		if rule.Bootstrap != BootstrapIfMissing {
			continue
		}
		out = append(out, Requirement{Key: key, Value: value})
	}
	return out
}
