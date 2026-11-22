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
	"errors"
	"fmt"
	"sort"
)

// ErrObservedMode means a write was attempted while the panel is not the owner of
// the file.
var ErrObservedMode = errors.New("the panel is in observed mode and will not write the headscale config")

// ErrNotGenerated means there is no config file yet, so there is nothing for an
// edit to apply to.
var ErrNotGenerated = errors.New("headscale config does not exist yet; generate it with HSBootstrap first")

// Service owns reading, previewing and writing the headscale config file.
type Service struct {
	file *File
	mode OwnershipMode
}

// NewService returns a service for a config path.
func NewService(path string, mode OwnershipMode) *Service {
	if !mode.Valid() {
		mode = ManagedMode
	}
	return &Service{file: NewFile(path), mode: mode}
}

// Path returns the config path.
func (s *Service) Path() string { return s.file.Path() }

// Mode returns the current ownership mode.
func (s *Service) Mode() OwnershipMode { return s.mode }

// SetMode changes the ownership mode for this service instance.
func (s *Service) SetMode(mode OwnershipMode) {
	if mode.Valid() {
		s.mode = mode
	}
}

// Value is a single rendered config field for the UI.
type Value struct {
	Key    string `json:"key"`
	Value  any    `json:"value"`
	Owner  string `json:"owner"`
	Tier   string `json:"tier"`
	Secret bool   `json:"secret"`
}

// Load returns the resolved config values keyed by registry key.
//
// Values that are absent from the file report the registry default so the UI has
// something to show, and Report values so the caller can tell the two apart.
func (s *Service) Load() (map[string]Value, error) {
	doc, err := s.file.LoadOrEmpty()
	if err != nil {
		return nil, err
	}

	out := make(map[string]Value, len(Registry))
	for _, rule := range Registry {
		value := rule.Default
		if existing, ok := doc.Get(rule.Key); ok {
			value = existing
		}
		if rule.Secret {
			// Never return a secret. The UI shows whether one is set and writes a new
			// one; it never round-trips the current value, which would put it in a
			// response body and in the browser's memory.
			value = value != nil && asString(value) != ""
		}
		out[rule.Key] = Value{
			Key:    rule.Key,
			Value:  value,
			Owner:  string(rule.Owner),
			Tier:   string(rule.Tier),
			Secret: rule.Secret,
		}
	}
	return out, nil
}

// Document returns the raw parsed file for callers that need the whole tree.
func (s *Service) Document() (*Document, error) {
	return s.file.LoadOrEmpty()
}

// Preview renders what the file would become without writing it.
// Secret fields are redacted so credentials never leave the server in preview output.
func (s *Service) Preview(desired map[string]any) (*MergeResult, string, error) {
	base, err := s.file.LoadOrEmpty()
	if err != nil {
		return nil, "", err
	}

	result, err := Merge(base, desired, MergeOptions{})
	if err != nil {
		return nil, "", err
	}

	redacted := result.Document.Clone()
	for _, rule := range Registry {
		if !rule.Secret {
			continue
		}
		if existing, ok := redacted.Get(rule.Key); ok && existing != nil && asString(existing) != "" {
			_ = redacted.Set(rule.Key, "******")
		}
	}

	rendered, err := redacted.Bytes()
	if err != nil {
		return nil, "", fmt.Errorf("rendering preview: %w", err)
	}
	return result, string(rendered), nil
}

// Save merges desired values into the file.
//
// Blocks are reported back to the caller rather than returned as an error: a UI
// form submits every field it knows about, and a read-only key among them is a
// normal outcome, not a failure.
func (s *Service) Save(desired map[string]any) (*MergeResult, error) {
	if s.mode == ObservedMode {
		return nil, ErrObservedMode
	}

	// Creating the file from nothing is Bootstrap's job. A save can only write
	// managed keys, and those alone do not make a startable config — the database
	// block is read-only. Writing a half-file here would produce something headscale
	// refuses to start from, which is worse than refusing the request.
	if !s.file.Exists() {
		return nil, ErrNotGenerated
	}

	base, err := s.file.LoadOrEmpty()
	if err != nil {
		return nil, err
	}

	result, err := Merge(base, desired, MergeOptions{})
	if err != nil {
		return nil, err
	}
	if len(result.Changes) == 0 {
		return result, nil
	}

	if err := s.file.Write(result.Document); err != nil {
		return nil, err
	}

	// Re-read so the returned changes describe what is on disk, not what was
	// intended.
	written, err := s.file.Load()
	if err != nil {
		return nil, err
	}
	result.Document = written
	return result, nil
}

// Bootstrap fills in missing managed keys only. Used by HSBootstrap generate and
// repair, which are the one path allowed to write read-only keys the operator has
// not set.
func (s *Service) Bootstrap(desired map[string]any) (*MergeResult, error) {
	base, err := s.file.LoadOrEmpty()
	if err != nil {
		return nil, err
	}

	result, err := Merge(base, desired, MergeOptions{Bootstrap: true})
	if err != nil {
		return nil, err
	}
	if len(result.Changes) == 0 {
		return result, nil
	}

	if err := s.file.Write(result.Document); err != nil {
		return nil, err
	}

	written, err := s.file.Load()
	if err != nil {
		return nil, err
	}
	result.Document = written
	return result, nil
}

// Drift compares the file against desired values.
func (s *Service) Drift(desired map[string]any) (*DriftReport, error) {
	doc, err := s.file.LoadOrEmpty()
	if err != nil {
		return nil, err
	}
	return DetectDrift(doc, desired), nil
}

// Sections groups registry rules for UI rendering.
func Sections() map[string][]FieldRule { return BySection() }

// Keys returns every registry key in sorted order.
func Keys() []string {
	keys := make([]string, 0, len(Registry))
	for _, rule := range Registry {
		keys = append(keys, rule.Key)
	}
	sort.Strings(keys)
	return keys
}

// FilterManaged strips keys the panel may not write, so a caller can pass a whole
// form through without inspecting the registry itself.
func FilterManaged(desired map[string]any) map[string]any {
	out := make(map[string]any, len(desired))
	for key, value := range desired {
		if rule, ok := Lookup(key); ok && rule.Owner == Managed {
			out[key] = value
		}
	}
	return out
}
