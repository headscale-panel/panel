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

import "context"

// RequestRestart is the single entry point every "this needs a restart" path
// must use.
//
// Funnelling restarts through one function is what makes the manual-hint path
// reliable: every caller gets the same explanation and the same audit reason
// instead of each one inventing its own exec call and its own error message.
func RequestRestart(ctx context.Context, reason string) (*Outcome, error) {
	return Restart(ctx, reason)
}
