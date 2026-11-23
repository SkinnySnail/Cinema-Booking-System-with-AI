import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// Backend reached by the dev-server proxy. In Docker the backend is the "app"
// service, so docker.yml sets VITE_PROXY_TARGET=http://app:8000.
const proxyTarget = process.env.VITE_PROXY_TARGET || "http://localhost:8000";
const backendProxy = { target: proxyTarget, changeOrigin: true };

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // Load root .env directly when running Vite outside Docker; in Docker, VITE_* come from docker.yml environment.
  envDir: path.resolve(__dirname, "../.."),
  server: {
    host: "::",
    port: 8080,
    allowedHosts: true,
    // Lets one public domain (ngrok / LAN IP) serve both the app and the API:
    // payment return/IPN URLs use /index.php/api/..., images live under /uploads.
    proxy: {
      "/api": backendProxy,
      "/index.php": backendProxy,
      "/uploads": backendProxy,
    },
    hmr: {
      overlay: false,
    },
    // In Docker on Windows the watcher polls (CHOKIDAR_USEPOLLING). A local pnpm
    // store (~25k files) or build output in this folder makes every poll walk all
    // of them and stalls the dev server, so every request (API proxy included) waits.
    watch: {
      ignored: ["**/.pnpm-store/**", "**/dist/**", "**/*.timestamp-*.mjs"],
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(
    Boolean,
  ),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
