package middleware

import (
	"io/fs"
	"net/http"
	"os"
	"path"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/sirupsen/logrus"
)

// FrontendMiddleware serves compiled frontend static files under the /panel path prefix
// and handles SPA routing by falling back to index.html.
func FrontendMiddleware(staticDir string) gin.HandlerFunc {
	absDir, err := os.Stat(staticDir)
	if err != nil || !absDir.IsDir() {
		logrus.Warnf("frontend directory %q not found, static file serving disabled", staticDir)
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

		// Serve static file if it exists
		if info, err := os.Stat(filePath); err == nil && !info.IsDir() {
			fileServer.ServeHTTP(c.Writer, c.Request)
			c.Abort()
			return
		}

		// SPA fallback: serve index.html for all /panel/* routes
		indexFile := path.Join(staticDir, "index.html")
		if _, err := os.Stat(indexFile); err == nil {
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
			fileServer.ServeHTTP(c.Writer, c.Request)
			c.Abort()
			return
		}

		// SPA fallback
		if f, err := fsys.Open("index.html"); err == nil {
			f.Close()
			c.Request.URL.Path = "/"
			fileServer.ServeHTTP(c.Writer, c.Request)
			c.Abort()
			return
		}

		c.Next()
	}
}
