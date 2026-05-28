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

package unifyerror

import (
	"fmt"
	"time"

	"headscale-panel/pkg/constants"
	"headscale-panel/pkg/log"

	"go.uber.org/zap"
)

// newUniErr builds a UniErr and logs according to errorType.
func newUniErr(errorType int, httpCode int, code int, msg string) *UniErr {
	switch errorType {
	case ErrTypeServer:
		log.L.Error("[Server] "+msg, zap.Int("code", code))
	case ErrTypeDb:
		log.L.Error("[Database] "+msg, zap.Int("code", code))
	case ErrTypeGRPC:
		log.L.Warn("[gRPC] "+msg, zap.Int("code", code))
	}
	return &UniErr{
		HttpCode: httpCode,
		Code:     code,
		Msg:      msg,
	}
}

// newUniErrWithServer builds a UniErr where an internal (server-side) error
// string is available for logging but should NOT be surfaced to the user.
func newUniErrWithServer(errorType int, httpCode int, code int, userMsg string, serverMsg string) *UniErr {
	errorTime := time.Now().Format("2006-01-02 15:04:05")
	fields := []zap.Field{
		zap.String("time", errorTime),
		zap.Int("code", code),
	}

	switch errorType {
	case ErrTypeServer:
		log.L.Error(fmt.Sprintf("[Server] %s | internal: %s", userMsg, serverMsg), fields...)
	case ErrTypeDb:
		log.L.Error(fmt.Sprintf("[Database] %s | internal: %s", userMsg, serverMsg), fields...)
	case ErrTypeGRPC:
		log.L.Warn(fmt.Sprintf("[gRPC] %s | internal: %s", userMsg, serverMsg), fields...)
	case ErrTypeUser:
		log.L.Debug(fmt.Sprintf("[User] %s | context: %s", userMsg, serverMsg), fields...)
	}

	return &UniErr{
		HttpCode: httpCode,
		Code:     code,
		Msg:      userMsg,
	}
}

// FromError converts a plain Go error to a UniErr. If the error is already a
// *UniErr it is returned as-is. Otherwise it is wrapped as a ServerError.
func FromError(err error) *UniErr {
	if err == nil {
		return nil
	}
	if u, ok := err.(*UniErr); ok {
		return u
	}
	return newUniErrWithServer(ErrTypeServer, 500, CodeServerErr, constants.MsgServerErr, fmt.Sprintf("%v", err))
}
