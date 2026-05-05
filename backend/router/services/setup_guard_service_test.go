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

import "testing"

func TestSetupGuardTokenLifecycle(t *testing.T) {
	guard := newSetupGuardService()

	token, _, err := guard.IssueDeployToken(true, "127.0.0.1", "test-agent")
	if err != nil {
		t.Fatalf("expected issue token success, got err: %v", err)
	}
	if token == "" {
		t.Fatalf("expected non-empty token")
	}

	if err := guard.ValidateAndConsumeDeployToken(true, token, "127.0.0.1", "test-agent"); err != nil {
		t.Fatalf("expected token validate success, got err: %v", err)
	}

	if err := guard.ValidateAndConsumeDeployToken(true, token, "127.0.0.1", "test-agent"); err == nil {
		t.Fatalf("expected one-time token to be rejected on second use")
	}
}

func TestSetupGuardRejectsMismatchedClient(t *testing.T) {
	guard := newSetupGuardService()

	token, _, err := guard.IssueDeployToken(true, "127.0.0.1", "test-agent")
	if err != nil {
		t.Fatalf("expected issue token success, got err: %v", err)
	}

	if err := guard.ValidateAndConsumeDeployToken(true, token, "127.0.0.2", "test-agent"); err == nil {
		t.Fatalf("expected client ip mismatch rejection")
	}
}

func TestSetupGuardWindowClosed(t *testing.T) {
	guard := newSetupGuardService()

	if _, _, err := guard.IssueDeployToken(false, "127.0.0.1", "test-agent"); err == nil {
		t.Fatalf("expected token issue failure when window closed")
	}
}

func TestSetupGuardPurposeMismatch(t *testing.T) {
	guard := newSetupGuardService()

	token, _, err := guard.IssueInitToken(true, "127.0.0.1", "test-agent")
	if err != nil {
		t.Fatalf("expected issue token success, got err: %v", err)
	}

	if err := guard.ValidateAndConsumeDeployToken(true, token, "127.0.0.1", "test-agent"); err == nil {
		t.Fatalf("expected purpose mismatch rejection")
	}
}
