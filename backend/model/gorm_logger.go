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

package model

import (
	"context"
	"errors"
	"headscale-panel/pkg/log"
	"time"

	"go.uber.org/zap"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"
)

// gormLoggerAdapter sends GORM output through zap.
//
// GORM's default logger writes plain text to the process stdout, which breaks
// the JSON log stream and cannot carry the request id. Errors and slow queries
// stay visible; routine statements only appear at debug level.
type gormLoggerAdapter struct {
	debug bool
	slow  time.Duration
}

func newGORMLogger(debug bool) gormlogger.Interface {
	return gormLoggerAdapter{debug: debug, slow: 200 * time.Millisecond}
}

func (g gormLoggerAdapter) LogMode(gormlogger.LogLevel) gormlogger.Interface { return g }

func (g gormLoggerAdapter) Info(_ context.Context, msg string, args ...any) {
	if !g.debug {
		return
	}
	log.S.Debugf(msg, args...)
}

func (g gormLoggerAdapter) Warn(_ context.Context, msg string, args ...any) {
	log.S.Warnf(msg, args...)
}

func (g gormLoggerAdapter) Error(_ context.Context, msg string, args ...any) {
	log.S.Errorf(msg, args...)
}

func (g gormLoggerAdapter) Trace(_ context.Context, begin time.Time, fc func() (string, int64), err error) {
	elapsed := time.Since(begin)

	switch {
	case err != nil && !errors.Is(err, gorm.ErrRecordNotFound):
		stmt, rows := fc()
		log.L.Error("sql failed",
			zap.Duration("duration_ms", elapsed),
			zap.Int64("rows", rows),
			zap.String("statement", stmt),
			zap.Error(err))
	case elapsed > g.slow:
		stmt, rows := fc()
		log.L.Warn("slow sql",
			zap.Duration("duration_ms", elapsed),
			zap.Int64("rows", rows),
			zap.String("statement", stmt))
	case g.debug:
		stmt, rows := fc()
		log.L.Debug("sql",
			zap.Duration("duration_ms", elapsed),
			zap.Int64("rows", rows),
			zap.String("statement", stmt))
	}
}
