package jwt

import (
	"errors"
	"headscale-panel/pkg/conf"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type Claims struct {
	UserID   uint   `json:"user_id"`
	Username string `json:"username"`
	GroupID  uint   `json:"group_id"`
	jwt.RegisteredClaims
}

func GenerateToken(userID uint, username string, groupID uint) (string, error) {
	now := time.Now()
	expireTime := now.Add(time.Duration(conf.Conf.JWT.Expire) * time.Hour)

	claims := Claims{
		UserID:   userID,
		Username: username,
		GroupID:  groupID,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(expireTime),
			Issuer:    "headscale-panel",
		},
	}

	tokenClaims := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	token, err := tokenClaims.SignedString([]byte(conf.Conf.JWT.Secret))
	return token, err
}

func ParseToken(token string) (*Claims, error) {
	tokenClaims, err := jwt.ParseWithClaims(token, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		return []byte(conf.Conf.JWT.Secret), nil
	})

	if err != nil {
		return nil, err
	}

	if tokenClaims != nil {
		if claims, ok := tokenClaims.Claims.(*Claims); ok && tokenClaims.Valid {
			return claims, nil
		}
	}

	return nil, errors.New("invalid token")
}
