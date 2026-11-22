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
	"errors"
	"net/http"
	"sort"
	"strings"

	"headscale-panel/internal/config"
	"headscale-panel/model"
	"headscale-panel/pkg/constants"
	"headscale-panel/pkg/hslifecycle"
	"headscale-panel/pkg/unifyerror"
)

// HeadscaleConfigService exposes the headscale config file.
//
// Every read and write goes through internal/config, which merges into the parsed
// YAML document instead of re-marshalling a struct. That is what keeps operator
// comments, unmodelled keys and read-only values intact.
type headscaleConfigService struct{}

var HeadscaleConfigService = new(headscaleConfigService)

// RedactedSecret is what the API returns in place of a stored secret. A client that
// sends it back is saying "leave the stored value alone".
const RedactedSecret = "******"

// ConfigField is one editable config value.
type ConfigField struct {
	Key     string `json:"key"`
	Value   any    `json:"value"`
	Owner   string `json:"owner"`
	Tier    string `json:"tier"`
	Kind    string `json:"kind"`
	Section string `json:"section"`
	Secret  bool   `json:"secret"`
	Note    string `json:"note"`
}

// ConfigView is the whole config as the UI sees it.
type ConfigView struct {
	Mode       string              `json:"mode"`
	Configured bool                `json:"configured"`
	Path       string              `json:"path"`
	Fields     []ConfigField       `json:"fields"`
	Drift      *config.DriftReport `json:"drift"`
	// Unmodelled lists keys the panel does not model. Surfacing them is the point:
	// it tells the operator the panel is not claiming to own the whole file.
	Unmodelled []string `json:"unmodelled"`
}

func (s *headscaleConfigService) configService() *config.Service {
	return config.NewService(constants.HeadscaleConfigFilePath, s.Mode())
}

// Mode returns the configured ownership mode, defaulting to managed.
func (s *headscaleConfigService) Mode() config.OwnershipMode {
	if model.DB == nil {
		return config.ManagedMode
	}
	var state config.State
	if err := model.DB.First(&state, 1).Error; err != nil {
		return config.ManagedMode
	}
	if !state.Mode.Valid() {
		return config.ManagedMode
	}
	return state.Mode
}

// SetMode persists the ownership mode.
func (s *headscaleConfigService) SetMode(mode config.OwnershipMode) error {
	if !mode.Valid() {
		return unifyerror.BadRequest("unknown ownership mode")
	}
	if model.DB == nil {
		return unifyerror.ServerError(errors.New("database not initialised"))
	}

	var state config.State
	if err := model.DB.First(&state, 1).Error; err != nil {
		state = config.State{Mode: mode}
		if createErr := model.DB.Create(&state).Error; createErr != nil {
			return unifyerror.DbError(createErr)
		}
		return nil
	}
	state.Mode = mode
	if err := model.DB.Save(&state).Error; err != nil {
		return unifyerror.DbError(err)
	}
	return nil
}

// Get returns the config with secrets masked.
func (s *headscaleConfigService) Get() (*ConfigView, error) {
	service := s.configService()

	values, err := service.Load()
	if err != nil {
		return nil, unifyerror.ServerError(err)
	}

	fields := make([]ConfigField, 0, len(values))
	for _, rule := range config.Registry {
		value := values[rule.Key].Value
		if rule.Secret && value == true {
			value = RedactedSecret
		}
		fields = append(fields, ConfigField{
			Key:     rule.Key,
			Value:   value,
			Owner:   string(rule.Owner),
			Tier:    string(rule.Tier),
			Kind:    string(rule.Kind),
			Section: rule.Section,
			Secret:  rule.Secret,
			Note:    rule.Note,
		})
	}
	sort.Slice(fields, func(i, j int) bool { return fields[i].Key < fields[j].Key })

	doc, err := service.Document()
	if err != nil {
		return nil, unifyerror.ServerError(err)
	}

	return &ConfigView{
		Mode:       string(service.Mode()),
		Configured: len(doc.Keys()) > 0,
		Path:       service.Path(),
		Fields:     fields,
		Unmodelled: config.DetectDrift(doc, nil).Unmodelled,
	}, nil
}

// Save merges the provided values into the config file and records how to undo it.
//
// A value the panel cannot prove headscale can start from is not saved silently:
// publication keeps the previous file so an operator whose restart fails can get
// back to a working config.
func (s *headscaleConfigService) Save(actorID uint, actorName string, values map[string]any) (*config.PublishResult, error) {
	desired := s.dropRedactedSecrets(values)

	result, err := s.deployments().Publish(context.Background(), config.ActionSave, actorID, actorName, desired, config.MergeOptions{})
	if err != nil {
		return nil, mapConfigError(err)
	}
	return result, nil
}

// PublishBootstrap runs one of the bootstrap actions.
//
// Bootstrap is the only flow allowed to create read-only keys, and only where they
// are absent; its output still goes through publication so a broken result can be
// rolled back like any other change.
func (s *headscaleConfigService) PublishBootstrap(actorID uint, actorName, action string, values map[string]any) (*config.PublishResult, error) {
	desired := s.dropRedactedSecrets(values)

	result, err := s.deployments().Publish(context.Background(), action, actorID, actorName, desired, config.MergeOptions{Bootstrap: true})
	if err != nil {
		return nil, mapConfigError(err)
	}
	return result, nil
}

// Deployments returns recent publications, newest first.
func (s *headscaleConfigService) Deployments(limit int) ([]config.Deployment, error) {
	list, err := s.deployments().List(limit)
	if err != nil {
		return nil, unifyerror.ServerError(err)
	}
	return list, nil
}

// VerifyDeployment checks headscale after a restart and rolls back on failure.
func (s *headscaleConfigService) VerifyDeployment(ctx context.Context, id uint) (*config.Deployment, error) {
	dep, err := s.deployments().Verify(ctx, id)
	if err != nil {
		switch {
		case errors.Is(err, config.ErrNothingToVerify):
			return nil, unifyerror.New(http.StatusConflict, unifyerror.CodeConflict,
				"this deployment is not awaiting verification; a newer publication may have replaced it")
		case errors.Is(err, config.ErrConfigChangedExternally):
			return nil, unifyerror.New(http.StatusConflict, unifyerror.CodeConflict,
				"the config was modified after it was published; publish again before verifying")
		case errors.Is(err, config.ErrSnapshotUnusable):
			return nil, unifyerror.New(http.StatusConflict, unifyerror.CodeConflict,
				"the stored snapshot failed its integrity check; restore the config by hand")
		}
		return nil, unifyerror.ServerError(err)
	}
	return dep, nil
}

// deployments builds the publisher with the live files and a real health probe.
func (s *headscaleConfigService) deployments() *config.DeploymentService {
	return config.NewDeploymentService(model.DB, config.NewFile(constants.HeadscaleConfigFilePath), probeHeadscaleHealth)
}

// probeHeadscaleHealth reports whether headscale answers its own health endpoint.
//
// Capability probing is the right signal here: it proves the process started and can
// reach its database, which is exactly what a config change can break.
func probeHeadscaleHealth(ctx context.Context) error {
	client, err := headscaleRESTClient()
	if err != nil {
		return err
	}

	probeCtx, cancel := withServiceTimeout(ctx)
	defer cancel()
	return client.Health(probeCtx)
}

// mapConfigError turns config-package errors into HTTP errors with a message an
// operator can act on.
func mapConfigError(err error) error {
	switch {
	case errors.Is(err, config.ErrObservedMode):
		return unifyerror.BadRequest("the panel is in observed mode and does not write the headscale config; switch to managed first")
	case errors.Is(err, config.ErrNotGenerated):
		return unifyerror.BadRequest("headscale config does not exist yet; generate it from the bootstrap page first")
	case errors.Is(err, config.ErrDeploymentBusy):
		return unifyerror.New(http.StatusConflict, unifyerror.CodeConflict, "another config deployment is in progress")
	}

	var validationErr *config.ValidationError
	if errors.As(err, &validationErr) {
		return unifyerror.BadRequest(validationErr.Error())
	}
	return unifyerror.ServerError(err)
}

// Preview renders what the file would contain without writing it.
func (s *headscaleConfigService) Preview(values map[string]any) (string, *config.MergeResult, error) {
	desired := s.dropRedactedSecrets(values)

	result, rendered, err := s.configService().Preview(desired)
	if err != nil {
		var validationErr *config.ValidationError
		if errors.As(err, &validationErr) {
			return "", nil, unifyerror.BadRequest(validationErr.Error())
		}
		return "", nil, unifyerror.ServerError(err)
	}
	return rendered, result, nil
}

// dropRedactedSecrets removes values the client sent back as the redaction
// placeholder, so a form that renders every field cannot overwrite a stored secret
// with "******".
func (s *headscaleConfigService) dropRedactedSecrets(values map[string]any) map[string]any {
	desired := make(map[string]any, len(values))
	for key, value := range values {
		if text, ok := value.(string); ok && text == RedactedSecret {
			continue
		}
		desired[key] = value
	}
	return desired
}

// Restart applies a written config.
//
// The caller has already written the file, so this is best effort; the outcome is
// returned so the UI can tell the operator to restart by hand when lifecycle control
// is unavailable.
func (s *headscaleConfigService) Restart(ctx context.Context) (*hslifecycle.Outcome, error) {
	return hslifecycle.RequestRestart(ctx, "config_saved")
}

// GetRunningConfig fetches the live redacted YAML configuration reported by
// Headscale's GET /api/v1/config endpoint.
func (s *headscaleConfigService) GetRunningConfig(ctx context.Context, includeDocs bool) (string, error) {
	client, err := headscaleRESTClient()
	if err != nil {
		return "", err
	}
	queryCtx, cancel := withServiceTimeout(ctx)
	defer cancel()

	yamlDoc, apiErr := client.GetRunningConfig(queryCtx, includeDocs)
	if apiErr != nil {
		return "", unifyerror.HeadscaleAPIError(apiErr)
	}
	return yamlDoc, nil
}

// ServerURL returns the configured public URL, or an empty string when unset.
//
// Other domains derive the panel IdP redirect from this. A missing value is a
// configuration problem the config page reports, not a reason to break an unrelated
// endpoint, so this never returns an error.
func (s *headscaleConfigService) ServerURL() string {
	return s.stringValue("server_url")
}

// PolicyMode returns the configured policy source, "database" or "file".
func (s *headscaleConfigService) PolicyMode() string {
	return s.stringValue("policy.mode")
}

// OIDCIssuer returns the headscale OIDC issuer, or an empty string when headscale
// is not configured for OIDC.
func (s *headscaleConfigService) OIDCIssuer() string {
	return s.stringValue("oidc.issuer")
}

func (s *headscaleConfigService) stringValue(key string) string {
	doc, err := s.configService().Document()
	if err != nil {
		return ""
	}
	value, ok := doc.Get(key)
	if !ok {
		return ""
	}
	text, _ := value.(string)
	return strings.TrimSpace(text)
}
