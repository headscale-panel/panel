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
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

var L *zap.Logger
var S *zap.SugaredLogger

// Standard field names. Log lines must use these keys so queries stay stable
// across features instead of relying on whatever name a call site invents.
const (
	FieldRequestID  = "request_id"
	FieldActorID    = "actor_id"
	FieldAction     = "action"
	FieldTarget     = "target"
	FieldDurationMS = "duration_ms"
	FieldResult     = "result"
)

// Result values for FieldResult.
const (
	ResultOK    = "ok"
	ResultError = "error"
)

func init() {
	cfg := zap.Config{
		Level:            zap.NewAtomicLevelAt(zap.InfoLevel),
		Encoding:         "json",
		OutputPaths:      []string{"stdout"},
		ErrorOutputPaths: []string{"stderr"},
		EncoderConfig: zapcore.EncoderConfig{
			TimeKey:        zapcore.OmitKey,
			LevelKey:       "level",
			NameKey:        zapcore.OmitKey,
			CallerKey:      "caller",
			MessageKey:     "msg",
			StacktraceKey:  "stacktrace",
			LineEnding:     zapcore.DefaultLineEnding,
			EncodeLevel:    zapcore.LowercaseLevelEncoder,
			EncodeTime:     zapcore.EpochMillisTimeEncoder,
			EncodeDuration: zapcore.MillisDurationEncoder,
			EncodeCaller:   zapcore.ShortCallerEncoder,
		},
	}
	var err error
	L, err = cfg.Build()
	if err != nil {
		panic(err)
	}
	S = L.Sugar()
}

// WithRequestID returns a logger carrying the request correlation id, or the
// base logger when there is no id.
func WithRequestID(requestID string) *zap.Logger {
	if requestID == "" {
		return L
	}
	return L.With(zap.String(FieldRequestID, requestID))
}

func Sync() {
	if L != nil {
		_ = L.Sync()
	}
}
