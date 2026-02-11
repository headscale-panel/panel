package services

import "testing"

func TestValidateAndNormalizeDeployRequest_AllowsHeadscaleSetupRequest(t *testing.T) {
	req := DeployRequest{
		Image:         "headscale/headscale:stable",
		ContainerName: "headscale-server",
		Ports: map[string]string{
			"28080": "8080",
			"28081": "50443",
		},
		Volumes: map[string]string{
			"./headscale/config":                "/etc/headscale",
			"./headscale/data":                  "/var/lib/headscale",
			"./headscale/run":                   "/var/run/headscale",
			"/usr/share/zoneinfo/Asia/Shanghai": "/etc/localtime",
		},
		Command:       []string{"serve"},
		NetworkName:   "private",
		RestartPolicy: "unless-stopped",
	}

	_, normalized, err := validateAndNormalizeDeployRequest(req)
	if err != nil {
		t.Fatalf("expected valid request, got error: %v", err)
	}
	if normalized.Image != req.Image {
		t.Fatalf("unexpected image: %s", normalized.Image)
	}
}

func TestValidateAndNormalizeDeployRequest_RejectsIllegalImage(t *testing.T) {
	req := DeployRequest{
		Image:         "ubuntu:latest",
		ContainerName: "bad",
	}

	_, _, err := validateAndNormalizeDeployRequest(req)
	if err == nil {
		t.Fatalf("expected error for illegal image")
	}
}

func TestValidateAndNormalizeDeployRequest_RejectsDangerousMount(t *testing.T) {
	req := DeployRequest{
		Image:         "headscale/headscale:stable",
		ContainerName: "headscale-server",
		Volumes: map[string]string{
			"/var/run/docker.sock": "/var/run/docker.sock",
		},
		Command: []string{"serve"},
	}

	_, _, err := validateAndNormalizeDeployRequest(req)
	if err == nil {
		t.Fatalf("expected error for dangerous mount")
	}
}

func TestValidateAndNormalizeDeployRequest_RejectsIllegalEnvKey(t *testing.T) {
	req := DeployRequest{
		Image:         "fredliang/derper",
		ContainerName: "headscale-derp",
		Ports: map[string]string{
			"26060":     "6060",
			"33478/udp": "3478",
		},
		Volumes: map[string]string{
			"/var/run/tailscale": "/var/run/tailscale",
		},
		Env: map[string]string{
			"UNSAFE_KEY": "1",
		},
		NetworkName: "private",
	}

	_, _, err := validateAndNormalizeDeployRequest(req)
	if err == nil {
		t.Fatalf("expected error for illegal env key")
	}
}

func TestValidateAndNormalizeDeployRequest_RejectsIllegalNetwork(t *testing.T) {
	req := DeployRequest{
		Image:         "headscale/headscale:stable",
		ContainerName: "headscale-server",
		Command:       []string{"serve"},
		NetworkName:   "host",
	}

	_, _, err := validateAndNormalizeDeployRequest(req)
	if err == nil {
		t.Fatalf("expected error for illegal network")
	}
}
