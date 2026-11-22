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

import (
	"context"
	"headscale-panel/internal/account"
	"headscale-panel/internal/audit"
	"headscale-panel/internal/network"
	"headscale-panel/model"
	"headscale-panel/pkg/hsapi"
	"headscale-panel/pkg/unifyerror"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/pquerna/otp"
	"github.com/pquerna/otp/totp"
)

const totpEncryptedPrefix = "enc:v1:"

var (
	totpReplayMu      sync.Mutex
	totpLastUsedSteps = map[uint]int64{}
)

func encryptTOTPSecret(plain string) (string, error) {
	sealed, err := Secrets.Encrypt(plain)
	if err != nil {
		return "", err
	}
	return totpEncryptedPrefix + sealed, nil
}

func decryptTOTPSecret(stored string) (string, error) {
	if strings.HasPrefix(stored, totpEncryptedPrefix) {
		return Secrets.Decrypt(strings.TrimPrefix(stored, totpEncryptedPrefix))
	}
	// Legacy plaintext secret fallback for existing rows before re-enrolment.
	return stored, nil
}

// validateTOTPWithReplayGuard verifies a 6-digit TOTP code across the standard
// ±1 step skew window and rejects any time-step that was already consumed for
// the same account.
func validateTOTPWithReplayGuard(accountID uint, code, secret string) bool {
	code = strings.TrimSpace(code)
	if code == "" || secret == "" {
		return false
	}

	now := time.Now().UTC()
	const period = int64(30)
	currentStep := now.Unix() / period

	totpReplayMu.Lock()
	defer totpReplayMu.Unlock()

	lastStep := totpLastUsedSteps[accountID]
	for delta := int64(-1); delta <= 1; delta++ {
		step := currentStep + delta
		if step <= lastStep {
			continue
		}
		stepTime := time.Unix(step*period, 0).UTC()
		ok, err := totp.ValidateCustom(code, secret, stepTime, totp.ValidateOpts{
			Period:    uint(period),
			Skew:      0,
			Digits:    otp.DigitsSix,
			Algorithm: otp.AlgorithmSHA1,
		})
		if err == nil && ok {
			totpLastUsedSteps[accountID] = step
			return true
		}
	}
	return false
}

// MarkGuideTourSeen records that the account finished the onboarding tour.
func MarkGuideTourSeen(accountID uint) error {
	return Accounts.SetGuideTourSeen(accountID, time.Now().UTC())
}

// ResetGuideTour makes the tour run again.
func ResetGuideTour(accountID uint) error {
	return Accounts.SetGuideTourSeen(accountID, time.Time{})
}

// GenerateTOTPSecret starts enrolment and returns the pending secret.
//
// The secret is encrypted before persistence and TOTP stays disabled until a
// live code confirms it. Calling this while TOTP is already enabled is refused
// so a stolen session cannot silently downgrade active 2FA.
func GenerateTOTPSecret(acc *account.Account) (string, string, error) {
	if acc == nil {
		return "", "", unifyerror.InvalidToken()
	}
	if acc.TOTPEnabled {
		return "", "", unifyerror.New(http.StatusConflict, unifyerror.CodeConflict,
			"two-factor authentication is already enabled; disable it first")
	}

	key, err := totp.Generate(totp.GenerateOpts{
		Issuer:      "Headscale Panel",
		AccountName: acc.Username,
	})
	if err != nil {
		return "", "", unifyerror.ServerError(err)
	}

	sealed, sealErr := encryptTOTPSecret(key.Secret())
	if sealErr != nil {
		return "", "", unifyerror.ServerError(sealErr)
	}

	if storeErr := Accounts.SetTOTPSecret(acc.ID, sealed, false); storeErr != nil {
		return "", "", unifyerror.DbError(storeErr)
	}
	return key.Secret(), key.URL(), nil
}

// EnableTOTP confirms enrolment with a live code.
func EnableTOTP(accountID uint, code string) error {
	acc, err := Accounts.Get(accountID)
	if err != nil {
		return mapAccountError(err)
	}
	if acc.TOTPSecret == "" {
		return unifyerror.WrongParam("code")
	}
	secret, decErr := decryptTOTPSecret(acc.TOTPSecret)
	if decErr != nil || !validateTOTPWithReplayGuard(accountID, code, secret) {
		return unifyerror.New(http.StatusBadRequest, unifyerror.CodeParamErr, "invalid authenticator code")
	}

	stored := acc.TOTPSecret
	if !strings.HasPrefix(stored, totpEncryptedPrefix) {
		sealed, sealErr := encryptTOTPSecret(secret)
		if sealErr != nil {
			return unifyerror.ServerError(sealErr)
		}
		stored = sealed
	}

	if storeErr := Accounts.SetTOTPSecret(accountID, stored, true); storeErr != nil {
		return unifyerror.DbError(storeErr)
	}
	return nil
}

// DisableTOTP removes the second factor after verifying either the account's
// current password or a live TOTP code (for SSO-only accounts).
func DisableTOTP(accountID uint, currentPassword, totpCode string) error {
	acc, err := Accounts.Get(accountID)
	if err != nil {
		return mapAccountError(err)
	}
	if !acc.TOTPEnabled {
		return nil
	}

	verified := false
	if strings.TrimSpace(currentPassword) != "" && Accounts.VerifyPassword(acc, currentPassword) {
		verified = true
	}
	if !verified && strings.TrimSpace(totpCode) != "" && acc.TOTPSecret != "" {
		if secret, decErr := decryptTOTPSecret(acc.TOTPSecret); decErr == nil {
			verified = validateTOTPWithReplayGuard(accountID, totpCode, secret)
		}
	}
	if !verified {
		return unifyerror.New(http.StatusForbidden, unifyerror.CodeForbidden,
			"current password or a valid authenticator code is required to disable two-factor authentication")
	}

	if err := Accounts.SetTOTPSecret(accountID, "", false); err != nil {
		return unifyerror.DbError(err)
	}
	return nil
}

// IdentitySnapshot exposes the network snapshot to controllers.
func IdentitySnapshot(ctx context.Context) (*network.Snapshot, error) {
	snap, err := identitySnapshot(ctx)
	if err != nil {
		return nil, unifyerror.HeadscaleAPIError(err)
	}
	return snap, nil
}

// ToIdentityView exposes the projection helper.
func ToIdentityView(ident *network.Identity) IdentityView {
	return toIdentityView(ident)
}

// AuditFilter narrows an audit query.
type AuditFilter struct {
	ActorID  uint
	Action   string
	Resource string
	Success  *bool
	Offset   int
	Limit    int
}

// ListAuditEvents returns audit rows newest first.
func ListAuditEvents(f AuditFilter) ([]audit.Event, int64, error) {
	q := model.DB.Model(&audit.Event{})
	if f.ActorID != 0 {
		q = q.Where("actor_id = ?", f.ActorID)
	}
	if f.Action != "" {
		q = q.Where("action = ?", f.Action)
	}
	if f.Resource != "" {
		q = q.Where("resource = ?", f.Resource)
	}
	if f.Success != nil {
		q = q.Where("success = ?", *f.Success)
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, unifyerror.DbError(err)
	}

	var events []audit.Event
	if err := q.Order("id DESC").Offset(f.Offset).Limit(f.Limit).Find(&events).Error; err != nil {
		return nil, 0, unifyerror.DbError(err)
	}
	return events, total, nil
}

// CurrentHeadscaleClient exposes the live REST client for probing.
func CurrentHeadscaleClient() (*hsapi.Client, error) {
	return headscaleRESTClient()
}
