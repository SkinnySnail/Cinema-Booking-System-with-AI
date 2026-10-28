// API Configuration
// Default to the local PHP built-in server (used in this workspace).
// You can override with VITE_API_URL in your environment (.env.local)
export const API_BASE_URL =
  import.meta.env.VITE_API_URL || "http://localhost:8000";

export const API_ENDPOINTS = {
  AI_RECOMMENDATIONS: `${API_BASE_URL}/api/ai/recommendations`,
  AI_CHAT: `${API_BASE_URL}/api/ai/chat`,
  AI_SENTIMENT: `${API_BASE_URL}/api/ai/reviews/sentiment`,
  // Auth
  SEND_VERIFICATION: `${API_BASE_URL}/api/auth/send-verification`,
  VERIFY_EMAIL: `${API_BASE_URL}/api/auth/verify-email`,
  LOGIN: `${API_BASE_URL}/api/auth/login`,
  LOGOUT: `${API_BASE_URL}/api/auth/logout`,
  GET_CURRENT_USER: `${API_BASE_URL}/api/auth/me`,
  FORGOT_PASSWORD: `${API_BASE_URL}/api/auth/forgot-password`,
  RESET_PASSWORD: `${API_BASE_URL}/api/auth/reset-password`,

  // Settings
  SETTINGS: `${API_BASE_URL}/api/settings`,

  // Users
  USERS: `${API_BASE_URL}/api/users`,
  USER_PROFILE: (id: number) => `${API_BASE_URL}/api/users/${id}/profile`,
  CHANGE_PASSWORD: (id: number) =>
    `${API_BASE_URL}/api/users/${id}/change-password`,

  // Movies
  MOVIES: `${API_BASE_URL}/api/movies`,
  MOVIE_DETAIL: (id: number) => `${API_BASE_URL}/api/movies/${id}`,
  MOVIE_SHOWTIMES: (id: number) => `${API_BASE_URL}/api/movies/${id}/showtimes`,
  MOVIE_REVIEWS: (id: number) => `${API_BASE_URL}/api/movies/${id}/reviews`,
  MOVIE_UPLOAD_POSTER: (id: number) =>
    `${API_BASE_URL}/api/movies/${id}/upload-poster`,
  MOVIE_UPLOAD_POSTER_FROM_URL: (id: number) =>
    `${API_BASE_URL}/api/movies/${id}/upload-poster-from-url`,

  // Genres
  GENRES: `${API_BASE_URL}/api/genres`,

  // Posters (Hero Banner)
  POSTERS: `${API_BASE_URL}/api/posters`,

  // Cinemas
  CINEMAS: `${API_BASE_URL}/api/cinemas`,
  CINEMA_DETAIL: (id: number) => `${API_BASE_URL}/api/cinemas/${id}`,
  CINEMA_HALLS: (id: number) => `${API_BASE_URL}/api/cinemas/${id}/halls`,
  CINEMA_SHOWTIMES: (id: number) =>
    `${API_BASE_URL}/api/cinemas/${id}/showtimes`,

  // Halls
  HALLS: `${API_BASE_URL}/api/halls`,
  HALL_DETAIL: (id: number) => `${API_BASE_URL}/api/halls/${id}`,
  HALL_LAYOUT: (id: number) => `${API_BASE_URL}/api/halls/${id}/layout`,

  // Showtimes
  SHOWTIMES: `${API_BASE_URL}/api/showtimes`,
  SHOWTIMES_AUTO_GENERATE: `${API_BASE_URL}/api/showtimes/auto-generate`,
  SHOWTIME_SEATS: (id: number) => `${API_BASE_URL}/api/showtimes/${id}/seats`,
  SHOWTIME_SEAT_MAP: (id: number) =>
    `${API_BASE_URL}/api/showtimes/${id}/seat-map`,
  SHOWTIME_HOLD_SEATS: (id: number) =>
    `${API_BASE_URL}/api/showtimes/${id}/hold-seats`,
  SHOWTIME_RELEASE_SEATS: (id: number) =>
    `${API_BASE_URL}/api/showtimes/${id}/release-seats`,

  // Bookings
  BOOKINGS: `${API_BASE_URL}/api/bookings`,
  POS_BOOKING_HISTORY: `${API_BASE_URL}/api/bookings/pos-history`,
  BOOKING_DETAIL: (id: number) => `${API_BASE_URL}/api/bookings/${id}`,
  USER_BOOKINGS: (userId: number) =>
    `${API_BASE_URL}/api/bookings/user/${userId}`,
  CONFIRM_BOOKING: (id: number) => `${API_BASE_URL}/api/bookings/${id}/confirm`,
  CANCEL_BOOKING: (id: number) => `${API_BASE_URL}/api/bookings/${id}/cancel`,
  REFUND_BOOKING: (id: number) => `${API_BASE_URL}/api/bookings/${id}/refund`,

  // Transactions
  TRANSACTIONS: `${API_BASE_URL}/api/transactions`,
  USER_TRANSACTIONS: (userId: number) =>
    `${API_BASE_URL}/api/transactions/user/${userId}`,
  MOMO_PAYMENT: `${API_BASE_URL}/api/transactions/momo`,
  VNPAY_PAYMENT: `${API_BASE_URL}/api/transactions/vnpay`,
  MOMO_VERIFY: `${API_BASE_URL}/api/transactions/momo/verify`,
  VNPAY_VERIFY: `${API_BASE_URL}/api/transactions/vnpay/verify`,

  // Promotions & Vouchers
  PROMOTIONS_ACTIVE: `${API_BASE_URL}/api/promotions/active`,
  PROMOTIONS: `${API_BASE_URL}/api/promotions`,
  USER_VOUCHERS: (userId: number) =>
    `${API_BASE_URL}/api/vouchers/user/${userId}`,
  APPLY_VOUCHER: `${API_BASE_URL}/api/vouchers/apply`,
  REWARD_TIERS: `${API_BASE_URL}/api/vouchers/reward-tiers`,
  REDEEM_POINTS_VOUCHER: `${API_BASE_URL}/api/vouchers/redeem-points`,

  // Concessions
  CONCESSIONS: `${API_BASE_URL}/api/concessions`,
  CONCESSION_UPLOAD_IMAGE: (id: number) =>
    `${API_BASE_URL}/api/concessions/${id}/upload-image`,
  CONCESSION_UPLOAD_IMAGE_FROM_URL: (id: number) =>
    `${API_BASE_URL}/api/concessions/${id}/upload-image-from-url`,
  ADMIN_CONCESSION_INVENTORY: (id: number) =>
    `${API_BASE_URL}/api/concessions/${id}/inventory`,

  // Reviews
  MOVIE_REVIEWS_LIST: (movieId: number) =>
    `${API_BASE_URL}/api/reviews/movie/${movieId}`,
  CREATE_REVIEW: `${API_BASE_URL}/api/reviews`,

  // Reviews (Admin)
  REVIEWS: `${API_BASE_URL}/api/reviews`,
  REVIEW_DETAIL: (id: number) => `${API_BASE_URL}/api/reviews/${id}`,
  REVIEW_APPROVE: (id: number) => `${API_BASE_URL}/api/reviews/${id}/approve`,
  REVIEW_REJECT: (id: number) => `${API_BASE_URL}/api/reviews/${id}/reject`,
  REVIEW_REPORT: (id: number) => `${API_BASE_URL}/api/reviews/${id}/report`,

  // Notifications
  PUBLIC_NOTIFICATIONS: `${API_BASE_URL}/api/notifications/public`,
  USER_NOTIFICATIONS: (userId: number) =>
    `${API_BASE_URL}/api/notifications/user/${userId}`,
  MARK_READ: (id: number) => `${API_BASE_URL}/api/notifications/${id}/read`,
  ADMIN_NOTIFICATIONS: `${API_BASE_URL}/api/admin/notifications`,
  ADMIN_NOTIFICATION_DETAIL: (id: number) =>
    `${API_BASE_URL}/api/admin/notifications/${id}`,

  // Admin dashboard
  ADMIN_STATS: `${API_BASE_URL}/api/admin/stats`,
  ADMIN_REVENUE: `${API_BASE_URL}/api/admin/revenue`,
  ADMIN_SEAT_HEATMAP: `${API_BASE_URL}/api/admin/seat-heatmap`,
  ADMIN_RECENT_TRANSACTIONS: `${API_BASE_URL}/api/admin/recent-transactions`,
  ADMIN_TRANSACTIONS: `${API_BASE_URL}/api/admin/transactions`,
  ADMIN_FORCE_BOOKING_STATUS: (id: number) =>
    `${API_BASE_URL}/api/admin/bookings/${id}/force-status`,

  // Loyalty
  LOYALTY_POINTS: (userId: number) =>
    `${API_BASE_URL}/api/loyalty/points/${userId}`,
  LOYALTY_HISTORY: (userId: number) =>
    `${API_BASE_URL}/api/loyalty/history/${userId}`,
  EARN_POINTS: `${API_BASE_URL}/api/loyalty/earn`,
  REDEEM_POINTS: `${API_BASE_URL}/api/loyalty/redeem`,

  // Memberships
  MEMBERSHIPS: `${API_BASE_URL}/api/memberships`,
  MEMBERSHIP_USER_TIER: (userId: number) =>
    `${API_BASE_URL}/api/memberships/user/${userId}`,
  MEMBERSHIP_CHECK_UPGRADE: (userId: number) =>
    `${API_BASE_URL}/api/memberships/check-upgrade/${userId}`,

  // ── Manager (Cinema-scoped) ────────────────────────────
  MANAGER_DASHBOARD_STATS: `${API_BASE_URL}/api/manager/dashboard/stats`,
  MANAGER_DASHBOARD_REVENUE: `${API_BASE_URL}/api/manager/dashboard/revenue`,
  MANAGER_DASHBOARD_UPCOMING: `${API_BASE_URL}/api/manager/dashboard/upcoming-shows`,
  MANAGER_CINEMA_INFO: `${API_BASE_URL}/api/manager/cinema/info`,
  MANAGER_CINEMA_UPDATE: `${API_BASE_URL}/api/manager/cinema/info`,
  MANAGER_CINEMA_HALLS: `${API_BASE_URL}/api/manager/cinema/halls`,
  MANAGER_MOVIES_AVAILABLE: `${API_BASE_URL}/api/manager/movies/available`,
  MANAGER_SHOWTIMES: `${API_BASE_URL}/api/manager/showtimes`,
  MANAGER_SHOWTIME: (id: number) =>
    `${API_BASE_URL}/api/manager/showtimes/${id}`,
  MANAGER_STAFF: `${API_BASE_URL}/api/manager/staff`,
  MANAGER_STAFF_IMPORT: `${API_BASE_URL}/api/manager/staff/import`,
  MANAGER_STAFF_DETAIL: (id: number) =>
    `${API_BASE_URL}/api/manager/staff/${id}`,
  MANAGER_STAFF_TOGGLE: (id: number) =>
    `${API_BASE_URL}/api/manager/staff/${id}/toggle-status`,
  MANAGER_REPORT_REVENUE: `${API_BASE_URL}/api/manager/reports/revenue`,
  MANAGER_REPORT_OCCUPANCY: `${API_BASE_URL}/api/manager/reports/occupancy`,
  MANAGER_REPORT_EXPORT: `${API_BASE_URL}/api/manager/reports/export`,
  MANAGER_TRANSACTIONS: `${API_BASE_URL}/api/manager/transactions`,
  MANAGER_TRANSACTIONS_EXPORT_DETAILS: `${API_BASE_URL}/api/manager/transactions/export-details`,
  MANAGER_CONCESSIONS: `${API_BASE_URL}/api/manager/concessions`,
  MANAGER_CONCESSIONS_IMPORT: `${API_BASE_URL}/api/manager/concessions/import`,
  MANAGER_CONCESSION_INVENTORY: (id: number) =>
    `${API_BASE_URL}/api/manager/concessions/${id}/inventory`,
  CONCESSIONS_AVAILABLE_BY_CINEMA: (cinemaId: number) =>
    `${API_BASE_URL}/api/concessions/available?cinema_id=${cinemaId}`,
};

// Helper function for API calls
let hasWarnedMissingToken = false;
let hasHandledUnauthorized = false;

const handleUnauthorized = () => {
  if (hasHandledUnauthorized) return;
  hasHandledUnauthorized = true;

  localStorage.removeItem("token");
  localStorage.removeItem("user");
  localStorage.removeItem("galaxy_cinema_token");
  localStorage.removeItem("galaxy_cinema_user");

  window.dispatchEvent(new CustomEvent("auth:unauthorized"));
};

export const apiCall = async <T = unknown>(
  endpoint: string,
  options?: RequestInit,
): Promise<T> => {
  const token = localStorage.getItem("token");

  // Debug: Log token status
  console.log("📡 apiCall to:", endpoint, "- Token present:", !!token);
  if (!token && !hasWarnedMissingToken) {
    hasWarnedMissingToken = true;
    console.warn(
      "⚠️ No auth token found in localStorage. User may need to login again.",
    );
  }

  const defaultHeaders: Record<string, string> = {};

  if (!(options?.body instanceof FormData)) {
    defaultHeaders["Content-Type"] = "application/json";
  }

  if (token) {
    defaultHeaders["Authorization"] = `Bearer ${token}`;
  }

  const config: RequestInit = {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options?.headers,
    },
  };

  try {
    const response = await fetch(endpoint, config);
    const contentType = response.headers.get("content-type") || "";
    const isJson = contentType.includes("application/json");
    const raw = await response.text();

    let data: Record<string, unknown> | null = null;
    if (isJson) {
      try {
        data = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      } catch {
        throw new Error(
          `Phản hồi API không phải JSON hợp lệ (${response.status}) tại ${endpoint}`,
        );
      }
    } else {
      // If API returns HTML/text, surface a precise diagnostic.
      throw new Error(
        `API trả về ${contentType || "text/plain"} thay vì JSON (${response.status}) tại ${endpoint}`,
      );
    }

    if (!response.ok) {
      if (response.status === 401) {
        handleUnauthorized();
        throw new Error("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
      }

      // Better error handling for 403
      if (response.status === 403) {
        throw new Error("Không có quyền truy cập. Vui lòng đăng nhập lại.");
      }
      throw new Error(
        (typeof data?.message === "string" ? data.message : null) ||
          "API request failed",
      );
    }

    if (hasHandledUnauthorized) {
      hasHandledUnauthorized = false;
    }

    return data as T;
  } catch (error) {
    console.error("API Error:", error);
    throw error;
  }
};

// Helper function to get full image URL
export const getImageUrl = (path: string | null | undefined): string => {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path; // Already full URL
  }

  // Remove leading slash to prevent double slashes (e.g. http://localhost:8000//uploads...)
  const cleanPath = path.startsWith("/") ? path.substring(1) : path;

  // Relative path - prepend API base URL (remove /index.php if present)
  const baseUrl = API_BASE_URL.replace(/\/index\.php$/, "");
  return `${baseUrl}/${cleanPath}`;
};
