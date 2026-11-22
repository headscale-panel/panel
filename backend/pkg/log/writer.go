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

package log

import (
	"bytes"
	"strings"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

// Writer adapts a zap logger to io.Writer so third-party libraries that insist
// on writing plain text to stdout still land in the structured log stream.
type Writer struct {
	Logger *zap.Logger
	Level  zapcore.Level
}

// Write emits each line separately, dropping the trailing newline.
func (w Writer) Write(p []byte) (int, error) {
	logger := w.Logger
	if logger == nil {
		logger = L
	}

	for _, line := range bytes.Split(p, []byte("\n")) {
		if trimmed := strings.TrimRight(string(line), "\r"); trimmed != "" {
			switch w.Level {
			case zapcore.ErrorLevel:
				logger.Error(trimmed)
			case zapcore.WarnLevel:
				logger.Warn(trimmed)
			case zapcore.DebugLevel:
				logger.Debug(trimmed)
			default:
				logger.Info(trimmed)
			}
		}
	}
	return len(p), nil
}
