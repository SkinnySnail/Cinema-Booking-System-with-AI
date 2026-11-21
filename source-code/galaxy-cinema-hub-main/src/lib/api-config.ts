/**
 * API Configuration
 */

// Base API URL
// Accept both:
// - VITE_API_URL=http://localhost:8000
// - VITE_API_URL=http://localhost:8000/api
const rawApiUrl = (
  import.meta.env.VITE_API_URL || "http://localhost:8000"
).replace(/\/+$/, "");
export const API_BASE_URL = rawApiUrl.endsWith("/api")
  ? rawApiUrl
  : `${rawApiUrl}/api`;

// API Endpoints
export const API_ENDPOINTS = {
  // Auth
  AUTH: {
    REGISTER: "/auth/register",
    LOGIN: "/auth/login",
    LOGOUT: "/auth/logout",
    ME: "/auth/me",
  },

  // Settings
  SETTINGS: "/settings",

  // Tickets
  TICKETS: {
    GET_BY_CODE: (code: string) => `/tickets/code/${code}`,
    GET_BY_BOOKING: (bookingId: string) => `/tickets/booking/${bookingId}`,
    SCAN_HISTORY: "/tickets/scan-history",
    CHECK: "/tickets/check",
    APPROVE_ENTRY: "/tickets/approve-entry",
    MARK_AS_USED: (id: string) => `/tickets/${id}/use`,
    REFUND: (id: string) => `/tickets/${id}/refund`,
    SEND_EMAIL: (id: string) => `/tickets/${id}/send-email`,
  },

  // Concessions
  CONCESSIONS: {
    LIST: "/concessions",
    AVAILABLE: "/concessions/available",
    DETAIL: (id: string) => `/concessions/${id}`,
    CREATE: "/concessions",
    UPDATE: (id: string) => `/concessions/${id}`,
    DELETE: (id: string) => `/concessions/${id}`,
  },

  // Movies
  MOVIES: {
    LIST: "/movies",
    DETAIL: (id: string) => `/movies/${id}`,
    SHOWTIMES: (id: string) => `/movies/${id}/showtimes`,
    REVIEWS: (id: string) => `/movies/${id}/reviews`,
  },

  // Cinemas
  CINEMAS: {
    LIST: "/cinemas",
    DETAIL: (id: string) => `/cinemas/${id}`,
    HALLS: (id: string) => `/cinemas/${id}/halls`,
  },

  // Bookings
  BOOKINGS: {
    LIST: "/bookings",
    DETAIL: (id: string) => `/bookings/${id}`,
    CREATE: "/bookings",
    UPDATE: (id: string) => `/bookings/${id}`,
    CONFIRM: (id: string) => `/bookings/${id}/confirm`,
    CANCEL: (id: string) => `/bookings/${id}/cancel`,
    USER_BOOKINGS: (userId: string) => `/bookings/user/${userId}`,
    SHOWTIME_BOOKINGS: (showtimeId: string) =>
      `/bookings/showtime/${showtimeId}`,
    USER_AND_SHOWTIME_BOOKING: (userId: string, showtimeId: string) =>
      `/bookings/user/showtime/${userId}/${showtimeId}`,
  },

  // Customers (POS - Khách Vãng Lai)
  CUSTOMERS: {
    LOOKUP_OR_CREATE: "/customers/lookup-or-create",
    BY_PHONE: (phone: string) => `/customers/by-phone?phone=${phone}`,
    DETAIL: (id: string) => `/customers/${id}`,
    BOOKING_HISTORY: (id: string) => `/customers/${id}/bookings`,
    STATS: "/customers/stats",
  },

  // Transactions
  TRANSACTIONS: {
    CREATE: "/transactions",
    MOMO: "/transactions/momo",
    VNPAY: "/transactions/vnpay",
    VISA: "/transactions/visa",
    CASH: "/transactions/cash",
    MOMO_VERIFY: "/transactions/momo/verify",
    VNPAY_VERIFY: "/transactions/vnpay/verify",
    BY_BOOKING: (bookingId: string) => `/transactions/booking/${bookingId}`,
    USER_HISTORY: (userId: string) => `/transactions/user/${userId}`,
  },

  // Showtimes
  SHOWTIMES: {
    LIST: "/showtimes",
    DETAIL: (id: string) => `/showtimes/${id}`,
    SEATS: (id: string) => `/showtimes/${id}/seats`,
  },
};

// Storage keys
export const STORAGE_KEYS = {
  AUTH_TOKEN: "galaxy_cinema_token",
  USER: "galaxy_cinema_user",
  BOOKING_STATE: "galaxy_cinema_booking",
};
