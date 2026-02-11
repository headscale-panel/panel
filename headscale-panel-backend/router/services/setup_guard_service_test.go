package services

import "testing"

func TestSetupGuardTokenLifecycle(t *testing.T) {
	guard := newSetupGuardService()

	token, _, err := guard.IssueDeployToken(false, "127.0.0.1", "test-agent")
	if err != nil {
		t.Fatalf("expected issue token success, got err: %v", err)
	}
	if token == "" {
		t.Fatalf("expected non-empty token")
	}

	if err := guard.ValidateAndConsumeDeployToken(false, token, "127.0.0.1", "test-agent"); err != nil {
		t.Fatalf("expected token validate success, got err: %v", err)
	}

	if err := guard.ValidateAndConsumeDeployToken(false, token, "127.0.0.1", "test-agent"); err == nil {
		t.Fatalf("expected one-time token to be rejected on second use")
	}
}

func TestSetupGuardRejectsMismatchedClient(t *testing.T) {
	guard := newSetupGuardService()

	token, _, err := guard.IssueDeployToken(false, "127.0.0.1", "test-agent")
	if err != nil {
		t.Fatalf("expected issue token success, got err: %v", err)
	}

	if err := guard.ValidateAndConsumeDeployToken(false, token, "127.0.0.2", "test-agent"); err == nil {
		t.Fatalf("expected client ip mismatch rejection")
	}
}

func TestSetupGuardWindowClosed(t *testing.T) {
	guard := newSetupGuardService()
	guard.bootTime = guard.bootTime.Add(-guard.setupWindow).Add(-1)

	if guard.IsWindowOpen(false) {
		t.Fatalf("expected setup window to be closed")
	}

	if _, _, err := guard.IssueDeployToken(false, "127.0.0.1", "test-agent"); err == nil {
		t.Fatalf("expected token issue failure when window closed")
	}
}
