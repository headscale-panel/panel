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

package hslifecycle

import (
	"context"
	"errors"
	"fmt"
	"os/exec"
	"strings"
	"time"
)

// Action values reported in an Outcome.
const (
	ActionStart   = "start"
	ActionStop    = "stop"
	ActionRestart = "restart"
)

// Outcome is the result of a lifecycle request.
//
// It is a value, not an error, even when nothing happened: "the operator must
// restart by hand" is a normal result of a deployment choice, and turning it into
// an error would make callers treat a configured state as a failure.
type Outcome struct {
	Performed      bool   `json:"performed"`
	RequiresManual bool   `json:"requires_manual"`
	ManualHint     string `json:"manual_hint,omitempty"`
	Reason         string `json:"reason"`
}

// Status reports whether the panel can act and what the container is doing.
type Status struct {
	Available     bool   `json:"available"`
	Reason        string `json:"reason,omitempty"`
	ContainerName string `json:"container_name,omitempty"`
	Running       bool   `json:"running"`
	State         string `json:"state,omitempty"`
}

// execTimeout bounds every docker invocation.
//
// `docker start` can block for a long time on a wedged daemon; without a bound
// the HTTP request would hang with it.
const execTimeout = 30 * time.Second

// Status inspects the container.
//
// The name carries an underscore because the package also has a Status type; Go
// forbids a function and a type sharing an identifier.
func Inspect(ctx context.Context) Status {
	cfg := resolve()

	status := Status{ContainerName: cfg.ContainerName}
	if reason := cfg.validationError(); reason != "" {
		status.Reason = reason
		return status
	}
	status.Available = true

	out, err := runDocker(ctx, "inspect", "--format", "{{.State.Status}}", cfg.ContainerName)
	if err != nil {
		status.Reason = "container_missing"
		return status
	}

	state := strings.TrimSpace(out)
	status.State = state
	status.Running = state == "running"
	return status
}

// Start starts the container.
func Start(ctx context.Context, reason string) (*Outcome, error) {
	return act(ctx, ActionStart, reason)
}

// Stop stops the container.
func Stop(ctx context.Context, reason string) (*Outcome, error) {
	return act(ctx, ActionStop, reason)
}

// Restart restarts the container.
func Restart(ctx context.Context, reason string) (*Outcome, error) {
	return act(ctx, ActionRestart, reason)
}

func act(ctx context.Context, action, reason string) (*Outcome, error) {
	cfg := resolve()

	if why := cfg.validationError(); why != "" {
		return manualOutcome(why, cfg), nil
	}

	if _, err := runDocker(ctx, "inspect", "--format", "{{.Name}}", cfg.ContainerName); err != nil {
		return manualOutcome("container_missing", cfg), nil
	}

	if _, err := runDocker(ctx, action, cfg.ContainerName); err != nil {
		return nil, fmt.Errorf("docker %s %s: %w", action, cfg.ContainerName, err)
	}

	return &Outcome{Performed: true, Reason: reason}, nil
}

// manualOutcome explains what the operator has to do instead.
func manualOutcome(reason string, cfg config) *Outcome {
	command := "docker restart"
	if reason == "lifecycle_disabled" || reason == "mode_unsupported" || reason == "container_name_missing" {
		command = "docker restart <name>"
	}
	name := cfg.ContainerName
	if name == "" {
		name = "<headscale-container>"
	}

	return &Outcome{
		Performed:      false,
		RequiresManual: true,
		ManualHint:     manualHint(reason, command, name),
		Reason:         reason,
	}
}

func manualHint(reason, command, name string) string {
	switch reason {
	case "lifecycle_disabled":
		return fmt.Sprintf("HS_LIFECYCLE_ENABLED is false. Restart by hand: %s %s", command, name)
	case "docker_unavailable":
		return fmt.Sprintf("the panel cannot reach the docker socket. Restart by hand: %s %s", command, name)
	case "container_missing":
		return fmt.Sprintf("container %s was not found. Check HS_CONTAINER_NAME, then restart by hand", name)
	case "container_name_missing":
		return "HS_CONTAINER_NAME is not set, so the panel cannot target a container. Restart headscale by hand"
	case "container_name_invalid":
		return fmt.Sprintf("container name %q is not a valid docker name. Fix HS_CONTAINER_NAME", name)
	case "mode_unsupported":
		return fmt.Sprintf("only docker mode is supported. Restart by hand: %s %s", command, name)
	case "timeout":
		return fmt.Sprintf("headscale restarted but did not become ready in time. Inspect the logs: docker logs --tail 50 %s", name)
	}
	return fmt.Sprintf("restart headscale by hand: %s %s", command, name)
}

// runDocker runs one docker subcommand and returns its stdout.
func runDocker(ctx context.Context, args ...string) (string, error) {
	execCtx, cancel := context.WithTimeout(ctx, execTimeout)
	defer cancel()

	cmd := exec.CommandContext(execCtx, "docker", args...)
	out, err := cmd.Output()
	if err != nil {
		if errors.Is(err, exec.ErrNotFound) {
			return "", err
		}
		var exitErr *exec.ExitError
		if errors.As(err, &exitErr) {
			return strings.TrimSpace(string(exitErr.Stderr)), err
		}
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
}
