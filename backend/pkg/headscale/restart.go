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

package headscale

import (
	"context"
	"fmt"
	"headscale-panel/pkg/conf"
	"os/exec"
	"regexp"

	"github.com/sirupsen/logrus"
)

// containerNamePattern restricts container names to alphanumeric characters,
// hyphens, and underscores. This prevents shell injection via the container
// name configuration value.
var containerNamePattern = regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$`)

// IsDinDEnabled reports whether Docker-in-Docker mode is configured and a
// valid container name has been provided.
func IsDinDEnabled() bool {
	return conf.Conf.Docker.DinDEnabled &&
		containerNamePattern.MatchString(conf.Conf.Docker.HeadscaleContainerName)
}

// RestartHeadscaleServer restarts the configured Headscale Docker container.
// It returns an error if:
//   - DinD mode is disabled (DOCKER_DIND_ENABLED not set to true)
//   - the container name is empty or contains invalid characters
//   - the docker command fails
func RestartHeadscaleServer(ctx context.Context) error {
	if !conf.Conf.Docker.DinDEnabled {
		return fmt.Errorf("DinD mode is disabled (DOCKER_DIND_ENABLED is not set)")
	}

	containerName := conf.Conf.Docker.HeadscaleContainerName
	if !containerNamePattern.MatchString(containerName) {
		return fmt.Errorf("invalid headscale container name %q: must match %s", containerName, containerNamePattern.String())
	}

	logrus.WithField("container", containerName).Info("Restarting Headscale container via Docker")

	// #nosec G204 – containerName is validated against containerNamePattern above
	cmd := exec.CommandContext(ctx, "docker", "restart", containerName)
	out, err := cmd.CombinedOutput()
	if err != nil {
		logrus.WithFields(logrus.Fields{
			"container": containerName,
			"output":    string(out),
		}).WithError(err).Error("Failed to restart Headscale container")
		return fmt.Errorf("docker restart %q: %w (output: %s)", containerName, err, string(out))
	}

	logrus.WithField("container", containerName).Info("Headscale container restarted successfully")
	return nil
}

// TryRestartHeadscale restarts the Headscale container only when DinD is
// enabled and logs failures instead of propagating them.
func TryRestartHeadscale(ctx context.Context, reason string) {
	if !IsDinDEnabled() {
		return
	}
	if err := RestartHeadscaleServer(ctx); err != nil {
		entry := logrus.WithError(err)
		if reason != "" {
			entry = entry.WithField("reason", reason)
		}
		entry.Error("Failed to restart Headscale container")
	}
}
