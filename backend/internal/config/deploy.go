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
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"sync"
	"time"

	"headscale-panel/pkg/secretbox"

	"gorm.io/gorm"
)

// DeploymentAction values recorded on each publication.
const (
	ActionSave     = "save"
	ActionGenerate = "bootstrap_generate"
	ActionRepair   = "bootstrap_repair"
	ActionResync   = "bootstrap_resync"
)

var (
	// ErrDeploymentBusy means another publication is in progress.
	ErrDeploymentBusy = errors.New("another config deployment is in progress")
	// ErrNothingToVerify means the deployment is not waiting for a restart, or a
	// newer publication has superseded it.
	ErrNothingToVerify = errors.New("this deployment is not awaiting verification")
	// ErrConfigChangedExternally means the file was edited after publication, so
	// verifying it would verify something the panel did not write.
	ErrConfigChangedExternally = errors.New("the config was modified after it was published; publish again")
	// ErrSnapshotUnusable means the stored snapshot no longer matches its hash, so
	// restoring it would install unknown content.
	ErrSnapshotUnusable = errors.New("the stored config snapshot failed its integrity check")
)

// DeploymentService publishes config changes and verifies them after a restart.
//
// This is the part of the config flow that the write path alone cannot cover:
// writing a valid file does not prove headscale can start from it. Publication
// therefore keeps the previous file, and verification either confirms health or
// puts the previous file back.
type DeploymentService struct {
	db    *gorm.DB
	files *File

	// health is injected so tests can force success or failure without a live
	// headscale, and so the caller decides what "healthy" means.
	health func(context.Context) error

	// mu serialises publication. Two administrators saving at once would otherwise
	// overwrite each other's snapshots, leaving nothing to roll back to.
	mu sync.Mutex
}

// NewDeploymentService wires the publisher to a database, a config file and a
// health probe.
func NewDeploymentService(db *gorm.DB, files *File, health func(context.Context) error) *DeploymentService {
	return &DeploymentService{db: db, files: files, health: health}
}

// PublishResult is what a publication returns.
type PublishResult struct {
	Deployment *Deployment
	Changes    []Change
	Blocked    []BlockedWrite
	// RequiresManual is true whenever the file changed: headscale has to be
	// restarted before the new config means anything.
	RequiresManual bool
}

// Publish writes the merged config and records how to undo it.
//
// The order matters: the snapshot is captured and stored before the file is
// touched, because a snapshot taken afterwards would record the new content and
// make rollback a no-op.
func (s *DeploymentService) Publish(
	ctx context.Context,
	action string,
	actorID uint,
	actorName string,
	desired map[string]any,
	opts MergeOptions,
) (*PublishResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.db == nil {
		return nil, errors.New("config deployments require a database")
	}

	// Creating the file is Bootstrap's job. A plain save can only write managed keys,
	// and those alone do not make a startable config because the database block is
	// read-only — writing one here would produce a file headscale refuses to start
	// from, which is worse than refusing the request.
	if !opts.Bootstrap && !s.files.Exists() {
		return nil, ErrNotGenerated
	}

	base, err := s.files.LoadOrEmpty()
	if err != nil {
		return nil, err
	}

	previous, previousExisted := readIfPresent(s.files.Path())
	previousHash := hashBytes(previous)

	result, err := Merge(base, desired, opts)
	if err != nil {
		return nil, err
	}

	deployment := &Deployment{
		Status:          DeploymentPending,
		Action:          action,
		CreatedBy:       actorID,
		CreatedByName:   actorName,
		PreviousHash:    previousHash,
		PreviousExisted: previousExisted,
	}

	if len(result.Changes) == 0 {
		// Nothing to write. Recording a deployment here would queue a restart that
		// changes nothing, so the caller gets an empty result instead.
		return &PublishResult{
			Deployment: nil,
			Changes:    result.Changes,
			Blocked:    result.Blocked,
		}, nil
	}

	if err := s.files.Write(result.Document); err != nil {
		// The file was not replaced, so there is nothing to roll back; record the
		// failure only so the operator can see the attempt.
		deployment.Status = DeploymentFailed
		deployment.Message = truncate(err.Error(), 500)
		now := time.Now()
		deployment.FinishedAt = &now
		if createErr := s.db.Create(deployment).Error; createErr != nil {
			return nil, fmt.Errorf("recording failed deployment: %w", createErr)
		}
		return nil, err
	}

	applied, _ := readIfPresent(s.files.Path())
	deployment.AppliedHash = hashBytes(applied)
	deployment.ManualRestartRequired = true

	sealed, encErr := sealSnapshot(previous)
	if encErr != nil {
		// Without a usable snapshot a later failure has no way back, so treat it as
		// a failed publication rather than proceeding blind.
		s.restore(previous, previousExisted)
		deployment.Status = DeploymentFailed
		deployment.Message = "could not snapshot the previous config: " + truncate(encErr.Error(), 400)
		now := time.Now()
		deployment.FinishedAt = &now
		if createErr := s.db.Create(deployment).Error; createErr != nil {
			return nil, fmt.Errorf("recording failed deployment: %w", createErr)
		}
		return nil, encErr
	}
	deployment.PreviousConfig = sealed

	if err := s.db.Create(deployment).Error; err != nil {
		// The file is already replaced but the undo record failed to save. Restoring
		// now keeps the pair consistent.
		s.restore(previous, previousExisted)
		return nil, fmt.Errorf("recording deployment: %w", err)
	}

	return &PublishResult{
		Deployment:     deployment,
		Changes:        result.Changes,
		Blocked:        result.Blocked,
		RequiresManual: true,
	}, nil
}

// List returns recent deployments, newest first.
func (s *DeploymentService) List(limit int) ([]Deployment, error) {
	if s.db == nil {
		return nil, nil
	}
	if limit <= 0 || limit > 100 {
		limit = 20
	}

	var out []Deployment
	if err := s.db.Order("id desc").Limit(limit).Find(&out).Error; err != nil {
		return nil, err
	}
	return out, nil
}

// Latest returns the most recent deployment, or nil when there is none.
func (s *DeploymentService) Latest() (*Deployment, error) {
	if s.db == nil {
		return nil, nil
	}
	var out Deployment
	err := s.db.Order("id desc").First(&out).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &out, nil
}

// Verify checks whether headscale came up healthy on the published config, and
// restores the previous file if it did not.
//
// Every refusal below exists to avoid a specific wrong outcome:
//   - a superseded deployment has already been replaced on disk, so "verifying"
//     it would judge the current file by an older publication's expectations;
//   - a file edited after publication means the health check answers a question
//     nobody asked;
//   - restoring a snapshot that fails its hash check would install content of
//     unknown provenance.
func (s *DeploymentService) Verify(ctx context.Context, id uint) (*Deployment, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.db == nil {
		return nil, errors.New("config deployments require a database")
	}
	if s.health == nil {
		return nil, errors.New("no health probe configured")
	}

	var deployment Deployment
	if err := s.db.First(&deployment, id).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNothingToVerify
		}
		return nil, err
	}

	latest, err := s.Latest()
	if err != nil {
		return nil, err
	}
	if latest == nil || latest.ID != deployment.ID || !deployment.Status.Active() {
		return nil, ErrNothingToVerify
	}

	// The file must still be the one this deployment produced.
	if err := s.ensureAppliedUnchanged(&deployment); err != nil {
		return nil, err
	}

	healthErr := s.health(ctx)

	// Re-check after the probe: the file can be edited while it runs, in which case
	// the result describes a file that is no longer there.
	if err := s.ensureAppliedUnchanged(&deployment); err != nil {
		return nil, err
	}

	now := time.Now()
	deployment.FinishedAt = &now
	deployment.ManualRestartRequired = false

	if healthErr == nil {
		deployment.Status = DeploymentSucceeded
		deployment.HealthVerified = true
		deployment.Message = "headscale is healthy on the published config"
		// The snapshot is no longer needed once the change is proven good.
		deployment.PreviousConfig = ""
		if err := s.db.Save(&deployment).Error; err != nil {
			return nil, err
		}
		return &deployment, nil
	}

	previous, decErr := s.snapshotContent(&deployment)
	if decErr != nil {
		// Health is bad and the way back is broken. Report both, and leave the
		// deployment active so the operator can still intervene by hand.
		deployment.Message = truncate(fmt.Sprintf("headscale is unhealthy and the snapshot could not be read: %v; %v", healthErr, decErr), 500)
		if saveErr := s.db.Save(&deployment).Error; saveErr != nil {
			return nil, saveErr
		}
		return &deployment, decErr
	}

	s.restore(previous, deployment.PreviousExisted)

	deployment.Status = DeploymentRolledBack
	deployment.RolledBack = true
	// Restoring the file needs a restart too, hence the flag stays set.
	deployment.ManualRestartRequired = true
	deployment.Message = truncate("headscale failed to start; the previous config was restored: "+healthErr.Error(), 500)
	deployment.PreviousConfig = ""
	if err := s.db.Save(&deployment).Error; err != nil {
		return nil, err
	}
	return &deployment, nil
}

// ensureAppliedUnchanged rejects verification when the file no longer matches what
// was published.
func (s *DeploymentService) ensureAppliedUnchanged(deployment *Deployment) error {
	current, _ := readIfPresent(s.files.Path())
	if hashBytes(current) != deployment.AppliedHash {
		return ErrConfigChangedExternally
	}
	return nil
}

// snapshotContent decrypts and integrity-checks the stored previous file.
func (s *DeploymentService) snapshotContent(deployment *Deployment) ([]byte, error) {
	previous, err := openSnapshot(deployment.PreviousConfig)
	if err != nil {
		return nil, fmt.Errorf("%w: %v", ErrSnapshotUnusable, err)
	}
	if hashBytes(previous) != deployment.PreviousHash {
		return nil, ErrSnapshotUnusable
	}
	return previous, nil
}

// sealSnapshot encrypts the previous file byte for byte.
//
// The base64 layer is not decoration: secretbox trims surrounding whitespace, so
// encrypting YAML directly would silently drop a trailing newline and every later
// integrity check would fail against the original hash. Base64 has no whitespace
// to trim, so the round trip is exact.
func sealSnapshot(content []byte) (string, error) {
	encoded := base64.RawStdEncoding.EncodeToString(content)
	if encoded == "" {
		return "", nil
	}
	return secretbox.Secrets.Encrypt(encoded)
}

func openSnapshot(sealed string) ([]byte, error) {
	if sealed == "" {
		return nil, nil
	}
	encoded, err := secretbox.Secrets.Decrypt(sealed)
	if err != nil {
		return nil, err
	}
	return base64.RawStdEncoding.DecodeString(encoded)
}

// restore puts the previous file back, or removes it when there was none.
func (s *DeploymentService) restore(previous []byte, existed bool) {
	if !existed {
		_ = removeFile(s.files.Path())
		return
	}
	_ = writeRaw(s.files.Path(), previous)
}

func hashBytes(data []byte) string {
	sum := sha256.Sum256(data)
	return hex.EncodeToString(sum[:])
}

func truncate(text string, limit int) string {
	if len(text) <= limit {
		return text
	}
	return text[:limit]
}
