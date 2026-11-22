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
	"os"
	"path/filepath"
)

// ErrFileMissing means the headscale config file does not exist.
var ErrFileMissing = errors.New("headscale config file does not exist")

// File is the on-disk headscale configuration.
type File struct {
	path string
}

// NewFile returns a handle for a config file path.
func NewFile(path string) *File {
	return &File{path: path}
}

// Path returns the file path.
func (f *File) Path() string { return f.path }

// Exists reports whether the file is present.
func (f *File) Exists() bool {
	info, err := os.Stat(f.path)
	return err == nil && !info.IsDir()
}

// Load reads and parses the file. A missing file yields ErrFileMissing so callers
// can distinguish "not created yet" from "unreadable", which need different UI.
func (f *File) Load() (*Document, error) {
	raw, err := os.ReadFile(f.path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, ErrFileMissing
		}
		return nil, fmt.Errorf("reading %s: %w", f.path, err)
	}

	doc, err := ParseDocument(raw)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", f.path, err)
	}
	return doc, nil
}

// LoadOrEmpty reads the file, returning an empty document when it is absent.
func (f *File) LoadOrEmpty() (*Document, error) {
	doc, err := f.Load()
	if errors.Is(err, ErrFileMissing) {
		return NewDocument(), nil
	}
	if err != nil {
		return nil, err
	}
	return doc, nil
}

// Write persists a document with double validation.
//
// The sequence is deliberate:
//
//  1. validate the document that is about to be written;
//  2. write to a temporary file in the same directory and fsync it;
//  3. rename over the target, which is atomic on a POSIX filesystem;
//  4. re-read and re-parse, and restore the original bytes if that fails.
//
// Step 4 exists because a rename can succeed while leaving a file headscale
// cannot parse — a disk that reports success but truncates, or a merge bug that
// produces valid YAML here and invalid YAML there. Rolling back is the only
// outcome that keeps headscale startable.
func (f *File) Write(doc *Document) error {
	if err := Validate(doc); err != nil {
		return err
	}

	rendered, err := doc.Bytes()
	if err != nil {
		return fmt.Errorf("rendering config: %w", err)
	}

	previous, hadPrevious := readIfPresent(f.path)

	dir := filepath.Dir(f.path)
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return fmt.Errorf("creating %s: %w", dir, err)
	}

	tmp, err := os.CreateTemp(dir, ".headscale-config-*")
	if err != nil {
		return fmt.Errorf("creating temporary file: %w", err)
	}
	tmpName := tmp.Name()

	cleanup := func() {
		_ = tmp.Close()
		_ = os.Remove(tmpName)
	}

	if _, err := tmp.Write(rendered); err != nil {
		cleanup()
		return fmt.Errorf("writing temporary file: %w", err)
	}
	// fsync before the rename: without it a crash can leave the renamed file empty.
	if err := tmp.Sync(); err != nil {
		cleanup()
		return fmt.Errorf("syncing temporary file: %w", err)
	}
	if err := tmp.Close(); err != nil {
		_ = os.Remove(tmpName)
		return fmt.Errorf("closing temporary file: %w", err)
	}
	if err := os.Chmod(tmpName, 0o600); err != nil {
		_ = os.Remove(tmpName)
		return fmt.Errorf("setting permissions: %w", err)
	}

	if err := os.Rename(tmpName, f.path); err != nil {
		_ = os.Remove(tmpName)
		return fmt.Errorf("replacing %s: %w", f.path, err)
	}

	// Post-write verification.
	written, err := os.ReadFile(f.path)
	if err != nil {
		f.rollback(previous, hadPrevious)
		return fmt.Errorf("re-reading %s: %w", f.path, err)
	}
	if _, parseErr := ParseDocument(written); parseErr != nil {
		f.rollback(previous, hadPrevious)
		return fmt.Errorf("written config could not be parsed back, previous contents restored: %w", parseErr)
	}

	return nil
}

// rollback restores the previous bytes, or removes the file if there was none.
func (f *File) rollback(previous []byte, had bool) {
	if !had {
		_ = os.Remove(f.path)
		return
	}
	_ = os.WriteFile(f.path, previous, 0o600)
}

func readIfPresent(path string) ([]byte, bool) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, false
	}
	return raw, true
}

// removeFile deletes a file, ignoring a missing one.
func removeFile(path string) error {
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

// writeRaw replaces a file with exactly the given bytes.
//
// Used only for rollback: the content was validated when it was first written, so
// re-validating it here would be re-litigating a decision already made.
func writeRaw(path string, data []byte) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return err
	}

	tmp, err := os.CreateTemp(dir, ".headscale-restore-*")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()

	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		_ = os.Remove(tmpName)
		return err
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		_ = os.Remove(tmpName)
		return err
	}
	if err := tmp.Close(); err != nil {
		_ = os.Remove(tmpName)
		return err
	}
	if err := os.Chmod(tmpName, 0o600); err != nil {
		_ = os.Remove(tmpName)
		return err
	}
	return os.Rename(tmpName, path)
}
