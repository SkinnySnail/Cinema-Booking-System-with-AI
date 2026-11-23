const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * Resolve the backend base URL.
 *
 * VITE_API_URL usually points at http://localhost:8000. That only works in a
 * browser on the machine running the backend. When the page itself is opened
 * through another host (an ngrok/Cloudflare tunnel, or a LAN IP from a phone),
 * call the API on the page's own origin instead; the Vite dev server proxies
 * /api, /index.php and /uploads to the backend (see vite.config.ts).
 */
export function resolveApiBase(configured: string | undefined): string {
  const raw = (configured || "http://localhost:8000").replace(/\/+$/, "");
  if (typeof window === "undefined") return raw;

  try {
    const api = new URL(raw);
    const pageHost = window.location.hostname;
    if (LOCAL_HOSTS.has(api.hostname) && !LOCAL_HOSTS.has(pageHost)) {
      return window.location.origin + api.pathname.replace(/\/+$/, "");
    }
  } catch {
    // Relative or malformed value: use it as given.
  }
  return raw;
}
