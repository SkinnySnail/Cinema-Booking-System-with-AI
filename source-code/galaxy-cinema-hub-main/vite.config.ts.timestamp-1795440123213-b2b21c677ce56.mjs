// vite.config.ts
import { defineConfig } from "file:///app/node_modules/vite/dist/node/index.js";
import react from "file:///app/node_modules/@vitejs/plugin-react-swc/index.js";
import path from "path";
import { componentTagger } from "file:///app/node_modules/lovable-tagger/dist/index.js";
var __vite_injected_original_dirname = "/app";
var proxyTarget = process.env.VITE_PROXY_TARGET || "http://localhost:8000";
var backendProxy = { target: proxyTarget, changeOrigin: true };
var vite_config_default = defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    allowedHosts: true,
    // Lets one public domain (ngrok / LAN IP) serve both the app and the API:
    // payment return/IPN URLs use /index.php/api/..., images live under /uploads.
    proxy: {
      "/api": backendProxy,
      "/index.php": backendProxy,
      "/uploads": backendProxy
    },
    hmr: {
      overlay: false
    }
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(
    Boolean
  ),
  resolve: {
    alias: {
      "@": path.resolve(__vite_injected_original_dirname, "./src")
    }
  }
}));
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvYXBwXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvYXBwL3ZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9hcHAvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tIFwidml0ZVwiO1xyXG5pbXBvcnQgcmVhY3QgZnJvbSBcIkB2aXRlanMvcGx1Z2luLXJlYWN0LXN3Y1wiO1xyXG5pbXBvcnQgcGF0aCBmcm9tIFwicGF0aFwiO1xyXG5pbXBvcnQgeyBjb21wb25lbnRUYWdnZXIgfSBmcm9tIFwibG92YWJsZS10YWdnZXJcIjtcclxuXHJcbi8vIEJhY2tlbmQgcmVhY2hlZCBieSB0aGUgZGV2LXNlcnZlciBwcm94eS4gSW4gRG9ja2VyIHRoZSBiYWNrZW5kIGlzIHRoZSBcImFwcFwiXHJcbi8vIHNlcnZpY2UsIHNvIGRvY2tlci55bWwgc2V0cyBWSVRFX1BST1hZX1RBUkdFVD1odHRwOi8vYXBwOjgwMDAuXHJcbmNvbnN0IHByb3h5VGFyZ2V0ID0gcHJvY2Vzcy5lbnYuVklURV9QUk9YWV9UQVJHRVQgfHwgXCJodHRwOi8vbG9jYWxob3N0OjgwMDBcIjtcclxuY29uc3QgYmFja2VuZFByb3h5ID0geyB0YXJnZXQ6IHByb3h5VGFyZ2V0LCBjaGFuZ2VPcmlnaW46IHRydWUgfTtcclxuXHJcbi8vIGh0dHBzOi8vdml0ZWpzLmRldi9jb25maWcvXHJcbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZygoeyBtb2RlIH0pID0+ICh7XHJcbiAgc2VydmVyOiB7XHJcbiAgICBob3N0OiBcIjo6XCIsXHJcbiAgICBwb3J0OiA4MDgwLFxyXG4gICAgYWxsb3dlZEhvc3RzOiB0cnVlLFxyXG4gICAgLy8gTGV0cyBvbmUgcHVibGljIGRvbWFpbiAobmdyb2sgLyBMQU4gSVApIHNlcnZlIGJvdGggdGhlIGFwcCBhbmQgdGhlIEFQSTpcclxuICAgIC8vIHBheW1lbnQgcmV0dXJuL0lQTiBVUkxzIHVzZSAvaW5kZXgucGhwL2FwaS8uLi4sIGltYWdlcyBsaXZlIHVuZGVyIC91cGxvYWRzLlxyXG4gICAgcHJveHk6IHtcclxuICAgICAgXCIvYXBpXCI6IGJhY2tlbmRQcm94eSxcclxuICAgICAgXCIvaW5kZXgucGhwXCI6IGJhY2tlbmRQcm94eSxcclxuICAgICAgXCIvdXBsb2Fkc1wiOiBiYWNrZW5kUHJveHksXHJcbiAgICB9LFxyXG4gICAgaG1yOiB7XHJcbiAgICAgIG92ZXJsYXk6IGZhbHNlLFxyXG4gICAgfSxcclxuICB9LFxyXG4gIHBsdWdpbnM6IFtyZWFjdCgpLCBtb2RlID09PSBcImRldmVsb3BtZW50XCIgJiYgY29tcG9uZW50VGFnZ2VyKCldLmZpbHRlcihcclxuICAgIEJvb2xlYW4sXHJcbiAgKSxcclxuICByZXNvbHZlOiB7XHJcbiAgICBhbGlhczoge1xyXG4gICAgICBcIkBcIjogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgXCIuL3NyY1wiKSxcclxuICAgIH0sXHJcbiAgfSxcclxufSkpO1xyXG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQThMLFNBQVMsb0JBQW9CO0FBQzNOLE9BQU8sV0FBVztBQUNsQixPQUFPLFVBQVU7QUFDakIsU0FBUyx1QkFBdUI7QUFIaEMsSUFBTSxtQ0FBbUM7QUFPekMsSUFBTSxjQUFjLFFBQVEsSUFBSSxxQkFBcUI7QUFDckQsSUFBTSxlQUFlLEVBQUUsUUFBUSxhQUFhLGNBQWMsS0FBSztBQUcvRCxJQUFPLHNCQUFRLGFBQWEsQ0FBQyxFQUFFLEtBQUssT0FBTztBQUFBLEVBQ3pDLFFBQVE7QUFBQSxJQUNOLE1BQU07QUFBQSxJQUNOLE1BQU07QUFBQSxJQUNOLGNBQWM7QUFBQTtBQUFBO0FBQUEsSUFHZCxPQUFPO0FBQUEsTUFDTCxRQUFRO0FBQUEsTUFDUixjQUFjO0FBQUEsTUFDZCxZQUFZO0FBQUEsSUFDZDtBQUFBLElBQ0EsS0FBSztBQUFBLE1BQ0gsU0FBUztBQUFBLElBQ1g7QUFBQSxFQUNGO0FBQUEsRUFDQSxTQUFTLENBQUMsTUFBTSxHQUFHLFNBQVMsaUJBQWlCLGdCQUFnQixDQUFDLEVBQUU7QUFBQSxJQUM5RDtBQUFBLEVBQ0Y7QUFBQSxFQUNBLFNBQVM7QUFBQSxJQUNQLE9BQU87QUFBQSxNQUNMLEtBQUssS0FBSyxRQUFRLGtDQUFXLE9BQU87QUFBQSxJQUN0QztBQUFBLEVBQ0Y7QUFDRixFQUFFOyIsCiAgIm5hbWVzIjogW10KfQo=
