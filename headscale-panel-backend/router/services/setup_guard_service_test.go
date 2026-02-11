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
