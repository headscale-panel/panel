import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "rolldown-vite";
import UnoCSS from "unocss/vite";

export default defineConfig({
  plugins: [
    react(),
    UnoCSS(),
  ],
  base: '/panel/',
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist"),
    emptyOutDir: true,
    sourcemap: false,
    // rolldownOptions: {
    //   output: {
    //     advancedChunks: {
    //       groups: [
    //         { name: "vendor-monaco", test: /node_modules\/(@monaco-editor|monaco-editor)/ },
    //         { name: "vendor-charts", test: /node_modules\/(recharts|d3-)/ },
    //         { name: "vendor", test: /node_modules/ },
    //       ],
    //     },
    //   },
    // },
  },
  server: {
    port: 3000,
    strictPort: false, // Will find next available port if 3000 is busy
    host: true,
    allowedHosts: [
      "localhost",
      "127.0.0.1",
    ],
    proxy: {
      "/panel/api": {
        target: process.env.VITE_API_PROXY_TARGET ?? "http://localhost:8080",
      },
    },
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
