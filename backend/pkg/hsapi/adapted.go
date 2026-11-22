// Package hsapi is the only egress to a headscale control server: HTTP client,
// request/response shapes, error mapping and the version gate.
package hsapi

// Adapter baseline. Every value here is compared against a running headscale at
// runtime and surfaced through /system/health; updating them is the first step
// of any headscale upgrade.
const (
	// AdaptedHeadscaleCommit is the upstream commit this panel's client and
	// config registry were written against.
	AdaptedHeadscaleCommit = "0c304b0632db524356e940fc74dc6230e790d11d"

	// AdaptedHeadscaleVersion is informational only. Dev builds report an empty
	// or "dev" version, so it is never used as a gate.
	AdaptedHeadscaleVersion = "0.30.0-dev"

	// AdaptedAPIProfile records how much of the upstream API surface is used.
	AdaptedAPIProfile = "v1-full"
)

// BaselineStatus classifies a running server against AdaptedHeadscaleCommit.
type BaselineStatus string

const (
	// BaselineMatch means the running commit is the adapted one.
	BaselineMatch BaselineStatus = "in_baseline"
	// BaselineNewer means the server is ahead of the adapted commit.
	BaselineNewer BaselineStatus = "newer"
	// BaselineUnknown means the commit could not be compared.
	BaselineUnknown BaselineStatus = "unknown"
)

// CompareCommit classifies commit against the adapted baseline.
func CompareCommit(commit string) BaselineStatus {
	switch commit {
	case "":
		return BaselineUnknown
	case AdaptedHeadscaleCommit:
		return BaselineMatch
	default:
		return BaselineNewer
	}
}
