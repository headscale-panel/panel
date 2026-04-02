package services

import (
	"testing"

	"headscale-panel/model"
)

func TestBuildValidatedBindingsRejectsUnavailableHeadscale(t *testing.T) {
	entries := []BindingEntry{
		{HeadscaleName: "ghost-user", IsPrimary: true},
	}

	bindings, err := buildValidatedBindings(1, entries)
	if err == nil {
		t.Fatal("expected binding validation to fail when headscale is unavailable")
	}
	if len(bindings) != 0 {
		t.Fatalf("expected no bindings on validation failure, got %d", len(bindings))
	}
}

func TestDeriveLoginMethodsRequiresPasswordForLocal(t *testing.T) {
	methods := deriveLoginMethods(&model.User{Provider: "local"})
	if len(methods) != 1 || methods[0] != "none" {
		t.Fatalf("expected local user without password to expose no login method, got %#v", methods)
	}
}
