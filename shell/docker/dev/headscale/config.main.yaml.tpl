# Seed config for headscale 0.30 (main profile).
# Once the panel manages headscale config (DB-first derivation), this file becomes
# a bootstrap seed only; the panel owns every field listed in its registry.
server_url: http://headscale:8080
listen_addr: 0.0.0.0:8080
metrics_listen_addr: 0.0.0.0:9090
noise:
  private_key_path: /var/lib/headscale/noise_private.key
prefixes:
  v4: 100.64.0.0/10
  v6: fd7a:115c:a1e0::/48
  allocation: sequential
derp:
  server:
    enabled: false
  urls:
    - https://controlplane.tailscale.com/derpmap/default
  paths: []
  auto_update_enabled: true
  update_frequency: 3h
database:
  type: sqlite
  sqlite:
    path: /var/lib/headscale/db.sqlite
    write_ahead_log: true
dns:
  base_domain: example.net
  magic_dns: true
  nameservers:
    global:
      - 1.1.1.1
  override_local_dns: false
policy:
  mode: database
unix_socket: /var/run/headscale/headscale.sock
