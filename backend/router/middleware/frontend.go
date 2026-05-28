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

package middleware

import (
	"headscale-panel/pkg/conf"
	"headscale-panel/pkg/log"
	"io/fs"
	"net/http"
	"os"
	"path"
	"strings"

	"github.com/gin-gonic/gin"
	"go.uber.org/zap"
)

const frontendContentSecurityPolicy = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: https:; connect-src 'self' ws: wss:; worker-src 'self' blob:; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"

func setFrontendSecurityHeaders(header http.Header) {
	header.Set("Content-Security-Policy", frontendContentSecurityPolicy)
	header.Set("Referrer-Policy", "strict-origin-when-cross-origin")
	header.Set("X-Content-Type-Options", "nosniff")
	header.Set("X-Frame-Options", "DENY")
	header.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
	header.Set("Cross-Origin-Opener-Policy", "same-origin")
	if strings.HasPrefix(strings.ToLower(strings.TrimSpace(conf.Conf.System.BaseURL)), "https://") {
		header.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
	}
}

// FrontendMiddleware serves compiled frontend static files under the /panel path prefix
// and handles SPA routing by falling back to index.html.
func FrontendMiddleware(staticDir string) gin.HandlerFunc {
	absDir, err := os.Stat(staticDir)
	if err != nil || !absDir.IsDir() {
		log.L.Warn("frontend directory not found, static file serving disabled", zap.String("dir", staticDir))
		return func(c *gin.Context) { c.Next() }
	}

	fileServer := http.StripPrefix("/panel", http.FileServer(http.Dir(staticDir)))

	return func(c *gin.Context) {
		reqPath := c.Request.URL.Path

		// Let API and well-known routes pass through
		if strings.HasPrefix(reqPath, "/panel/api/") || strings.HasPrefix(reqPath, "/api/") || strings.HasPrefix(reqPath, "/.well-known/") {
			c.Next()
			return
		}

		// Redirect bare / to /panel/
		if reqPath == "/" {
			c.Redirect(http.StatusFound, "/panel/")
			c.Abort()
			return
		}

		// Only handle /panel and /panel/* paths
		if !strings.HasPrefix(reqPath, "/panel") {
			c.Next()
			return
		}

		// Strip /panel prefix and resolve the file
		cleanPath := strings.TrimPrefix(reqPath, "/panel")
		if cleanPath == "" {
			cleanPath = "/"
		}
		filePath := path.Join(staticDir, cleanPath)

		// Prevent path traversal
		if !strings.HasPrefix(filePath, staticDir) {
			c.Next()
			return
		}

		// Serve static file if it exists
		if info, err := os.Stat(filePath); err == nil && !info.IsDir() {
			setFrontendSecurityHeaders(c.Writer.Header())
			fileServer.ServeHTTP(c.Writer, c.Request)
			c.Abort()
			return
		}

		// SPA fallback: serve index.html for all /panel/* routes
		indexFile := path.Join(staticDir, "index.html")
		if _, err := os.Stat(indexFile); err == nil {
			setFrontendSecurityHeaders(c.Writer.Header())
			c.File(indexFile)
			c.Abort()
			return
		}

		c.Next()
	}
}

// EmbedFrontendMiddleware serves frontend files from an embedded filesystem.
// Useful for embedding the frontend directly into the Go binary.
func EmbedFrontendMiddleware(fsys fs.FS) gin.HandlerFunc {
	fileServer := http.FileServer(http.FS(fsys))

	return func(c *gin.Context) {
		reqPath := c.Request.URL.Path

		if strings.HasPrefix(reqPath, "/api/") || strings.HasPrefix(reqPath, "/.well-known/") {
			c.Next()
			return
		}

		// Try serving the static file
		cleanPath := strings.TrimPrefix(reqPath, "/")
		if f, err := fsys.Open(cleanPath); err == nil {
			f.Close()
			setFrontendSecurityHeaders(c.Writer.Header())
			fileServer.ServeHTTP(c.Writer, c.Request)
			c.Abort()
			return
		}

		// SPA fallback
		if f, err := fsys.Open("index.html"); err == nil {
			f.Close()
			setFrontendSecurityHeaders(c.Writer.Header())
			c.Request.URL.Path = "/"
			fileServer.ServeHTTP(c.Writer, c.Request)
			c.Abort()
			return
		}

		c.Next()
	}
}
