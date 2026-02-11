package influxdb

import "testing"

func TestFluxStringLiteralEscapes(t *testing.T) {
	input := "a\"b\\c\nx\ry\tz"
	got := fluxStringLiteral(input)
	want := "\"a\\\"b\\\\c x y z\""
	if got != want {
		t.Fatalf("unexpected escaped value: got %q, want %q", got, want)
	}
}
