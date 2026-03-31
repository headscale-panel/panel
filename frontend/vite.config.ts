import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

const chunkGroups: Record<string, string[]> = {
  "vendor-monaco": ["@monaco-editor", "monaco-editor"],
  "vendor-charts": ["recharts", "d3-"],
  "vendor-antd-heavy": [
    "/node_modules/antd/es/table/",
    "/node_modules/antd/es/form/",
    "/node_modules/antd/es/select/",
    "/node_modules/antd/es/date-picker/",
    "/node_modules/antd/es/tree/",
    "/node_modules/antd/es/menu/",
  ],
  "vendor-antd-icons": ["@ant-design/icons", "@ant-design/icons-svg"],
  "vendor-antd-rc": ["/node_modules/rc-", "/node_modules/@rc-component/", "/node_modules/rc-util/"],
  "vendor-antd-core": ["/node_modules/antd/"],
  "vendor-react": ["/node_modules/react/", "/node_modules/react-dom/", "/node_modules/scheduler/", "/node_modules/wouter/"],
};

export default defineConfig({
  plugins: [
    react(),
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
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          for (const [name, patterns] of Object.entries(chunkGroups)) {
            if (patterns.some((pattern) => id.includes(pattern))) return name;
          }
          return "vendor-misc";
        },
      },
    },
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
