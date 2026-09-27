import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from "react";
import {
  User,
  Booking,
  Seat,
  ConcessionItem,
  Showtime,
  UserRole,
} from "@/types/cinema";
import { API_ENDPOINTS } from "@/lib/api";
import { systemConfig } from "@/data/mockData";

interface AuthContextType {
  user: User | null;
  login: (
    email: string,
    password: string,
  ) => Promise<{ success: boolean; user?: User }>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  isAuthenticated: boolean;
}

interface BookingContextType {
  selectedMovie: string | null;
  selectedCinema: string | null;
  selectedShowtime: Showtime | null;
  selectedSeats: Seat[];
  concessions: ConcessionItem[];
  bookingsActive: Booking[];
  checkBookingActive: (showtime_id: string) => boolean;
  setSelectedMovie: (id: string | null) => void;
  setSelectedCinema: (id: string | null) => void;
  setSelectedShowtime: (showtime: Showtime | null) => void;
  addSeat: (seat: Seat) => void;
  removeSeat: (seatId: string) => void;
  updateConcession: (
    id: string,
    quantity: number,
    itemData?: Partial<ConcessionItem>,
  ) => void;
  getTotalAmount: () => number;
  clearBooking: () => void;
  holdStartedAt: number | null;
  holdPausedAt: number | null;
  startHoldTimer: () => void;
  stopHoldTimer: () => void;
  pauseHoldTimer: () => void;
  resumeHoldTimer: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const BookingContext = createContext<BookingContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  // Initialize user synchronously from localStorage to prevent race conditions
  // (e.g., AdminLayout checking isAuthenticated before useEffect runs)
  // Helper function to map role_id / base_role / role to UserRole
  const mapRoleIdToRole = (
    roleId?: number,
    baseRole?: string,
    roleStr?: string
  ): UserRole => {
    const check = (baseRole || roleStr || "").toLowerCase();
    if (check === "admin") return "admin";
    if (check === "manager") return "manager";
    if (check === "staff") return "staff";
    if (check === "client" || check === "member" || check === "guest")
      return "client";

    switch (roleId) {
      case 5:
        return "admin";
      case 4:
        return "manager";
      case 3:
        return "staff";
      case 2:
      case 1:
      default:
        return "client";
    }
  };

  const [user, setUser] = useState<User | null>(() => {
    const token = localStorage.getItem("token");
    const savedUser = localStorage.getItem("user");
    if (token && savedUser) {
      try {
        const parsed = JSON.parse(savedUser);
        const remapped = mapRoleIdToRole(
          parsed.role_id,
          parsed.base_role,
          parsed.role
        );
        if (remapped && remapped !== parsed.role) {
          parsed.role = remapped;
        }
        return parsed;
      } catch (error) {
        console.error("Failed to parse saved user:", error);
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        return null;
      }
    }
    return null;
  });

  const login = async (
    email: string,
    password: string,
  ): Promise<{ success: boolean; user?: User }> => {
    try {
      const response = await fetch(API_ENDPOINTS.LOGIN, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        console.error("Login failed:", data.message);
        return { success: false };
      }

      const backendUser = data.data.user;
      const resolvedRole = mapRoleIdToRole(
        backendUser.role_id,
        backendUser.base_role,
        backendUser.role
      );

      // Map backend response to User type
      const userData: User = {
        id: backendUser.id.toString(),
        name: backendUser.full_name,
        email: backendUser.email,
        role: resolvedRole,
        base_role: backendUser.base_role || (backendUser.role || "").toLowerCase(),
        role_id: backendUser.role_id,
        roles: backendUser.roles || [],
        permissions: backendUser.permissions || [],
        avatar: backendUser.avatar || undefined,
        loyaltyPoints: backendUser.current_points || 0,
        phone: backendUser.phone,
        dob: backendUser.dob,
        cinema_id: backendUser.cinema_id
          ? String(backendUser.cinema_id)
          : undefined,
        cinema_name: backendUser.cinema_name || undefined,
      };

      // Save token and user to localStorage
      localStorage.setItem("token", data.data.token);
      localStorage.setItem("user", JSON.stringify(userData));

      setUser(userData);
      return { success: true, user: userData };
    } catch (error) {
      console.error("Login error:", error);
      return { success: false };
    }
  };

  const logout = () => {
    console.log("👋 Logging out...");
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("galaxy_cinema_token");
    localStorage.removeItem("galaxy_cinema_user");
    setUser(null);

    // Redirect to home page
    console.log("🏠 Redirecting to home page...");
    window.location.href = "/";
  };

  useEffect(() => {
    const handleUnauthorized = () => {
      setUser(null);
    };

    const handleFocusOrRefresh = () => {
      const token = localStorage.getItem("token");
      if (token) {
        refreshUser();
      }
    };

    window.addEventListener("auth:unauthorized", handleUnauthorized);
    window.addEventListener("focus", handleFocusOrRefresh);
    window.addEventListener("auth:refresh", handleFocusOrRefresh);

    // Auto-refresh user profile on load if logged in
    const token = localStorage.getItem("token");
    if (token) {
      refreshUser();
    }

    return () => {
      window.removeEventListener("auth:unauthorized", handleUnauthorized);
      window.removeEventListener("focus", handleFocusOrRefresh);
      window.removeEventListener("auth:refresh", handleFocusOrRefresh);
    };
  }, []);

  const refreshUser = async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) {
        console.warn("No token found, cannot refresh user");
        return;
      }

      console.log("🔄 Refreshing user data...");
      const response = await fetch(API_ENDPOINTS.GET_CURRENT_USER, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      const data = await response.json();
      console.log("📦 Refreshed user data:", data);

      if (data.success && data.data.user) {
        if (data.data.token) {
          localStorage.setItem("token", data.data.token);
        }
        const backendUser = data.data.user;
        const resolvedRole = mapRoleIdToRole(
          backendUser.role_id,
          backendUser.base_role,
          backendUser.role
        );

        const userData: User = {
          id: backendUser.id.toString(),
          name: backendUser.full_name,
          email: backendUser.email,
          role: resolvedRole,
          base_role: backendUser.base_role || (backendUser.role || "").toLowerCase(),
          role_id: backendUser.role_id,
          roles: backendUser.roles || [],
          permissions: backendUser.permissions || [],
          avatar: backendUser.avatar || undefined,
          loyaltyPoints: backendUser.current_points || 0,
          phone: backendUser.phone,
          dob: backendUser.dob,
          cinema_id: backendUser.cinema_id
            ? String(backendUser.cinema_id)
            : undefined,
          cinema_name: backendUser.cinema_name || undefined,
        };

        localStorage.setItem("user", JSON.stringify(userData));
        setUser(userData);
        console.log("✅ User data refreshed successfully, role:", resolvedRole);
      }
    } catch (error) {
      console.error("❌ Error refreshing user:", error);
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, login, logout, refreshUser, isAuthenticated: !!user }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const BookingProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [selectedMovie, setSelectedMovie] = useState<string | null>(null);
  const [selectedCinema, setSelectedCinema] = useState<string | null>(null);
  const [selectedShowtime, setSelectedShowtime] = useState<Showtime | null>(
    null,
  );
  const [selectedSeats, setSelectedSeats] = useState<Seat[]>([]);
  const [concessions, setConcessions] = useState<ConcessionItem[]>([]);
  const [bookingsActive, setBookingsActive] = useState<Booking[]>([]);
  const [holdStartedAt, setHoldStartedAt] = useState<number | null>(null);
  const [holdPausedAt, setHoldPausedAt] = useState<number | null>(null);

  const startHoldTimer = useCallback(() => {
    setHoldStartedAt((prev) => prev ?? Date.now());
  }, []);

  const stopHoldTimer = useCallback(() => {
    setHoldStartedAt(null);
    setHoldPausedAt(null);
  }, []);

  const pauseHoldTimer = useCallback(() => {
    setHoldPausedAt((prev) => prev ?? Date.now());
  }, []);

  const resumeHoldTimer = useCallback(() => {
    setHoldPausedAt((prev) => {
      if (!prev) return null;
      // Shift holdStartedAt forward by the paused duration so remaining time is preserved
      const pausedDuration = Date.now() - prev;
      setHoldStartedAt((started) =>
        started ? started + pausedDuration : started,
      );
      return null;
    });
  }, []);

  const addSeat = useCallback((seat: Seat) => {
    setSelectedSeats((prev) => {
      if (prev.find((s) => s.id === seat.id)) return prev;
      return [...prev, seat];
    });
  }, []);

  const checkBookingActive = (showtime_id: string) => {
    return bookingsActive.some((booking) => booking.showtimeId === showtime_id);
  };

  const removeSeat = useCallback((seatId: string) => {
    setSelectedSeats((prev) => prev.filter((s) => s.id !== seatId));
  }, []);

  const updateConcession = (
    id: string,
    quantity: number,
    itemData?: Partial<ConcessionItem>,
  ) => {
    setConcessions((prev) => {
      if (quantity <= 0) {
        return prev.filter((c) => c.id !== id);
      }

      const existing = prev.find((c) => c.id === id);
      if (existing) {
        return prev.map((c) =>
          c.id === id
            ? {
                ...c,
                ...itemData,
                quantity,
              }
            : c,
        );
      }

      const item: ConcessionItem = {
        id,
        name: itemData?.name ?? "",
        nameVi: itemData?.nameVi ?? itemData?.name ?? "",
        price: itemData?.price ?? 0,
        quantity,
        image: itemData?.image ?? "",
      };
      return [...prev, item];
    });
  };

  const getTotalAmount = () => {
    const seatTotal = selectedSeats.reduce((sum, seat) => sum + seat.price, 0);
    const concessionTotal = concessions.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );
    return seatTotal + concessionTotal;
  };

  const clearBooking = () => {
    setSelectedMovie(null);
    setSelectedCinema(null);
    setSelectedShowtime(null);
    setSelectedSeats([]);
    setConcessions([]);
    setHoldStartedAt(null);
    setHoldPausedAt(null);
  };

  // Release held seats on tab close / F5 (beforeunload)
  const selectedShowtimeRef = useRef(selectedShowtime);
  selectedShowtimeRef.current = selectedShowtime;
  const holdStartedAtRef = useRef(holdStartedAt);
  holdStartedAtRef.current = holdStartedAt;

  useEffect(() => {
    const releaseOnUnload = () => {
      const st = selectedShowtimeRef.current;
      const started = holdStartedAtRef.current;
      if (!st || !started) return;
      const token =
        localStorage.getItem("token") || sessionStorage.getItem("token");
      if (!token) return;
      fetch(API_ENDPOINTS.SHOWTIME_RELEASE_SEATS(parseInt(st.id)), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({}),
        keepalive: true,
      }).catch(() => {});
    };

    window.addEventListener("beforeunload", releaseOnUnload);
    return () => window.removeEventListener("beforeunload", releaseOnUnload);
  }, []);

  // Auto-expire: release seats + clear booking when hold timer expires
  useEffect(() => {
    if (!holdStartedAt || holdPausedAt) return;
    const durationMs = systemConfig.seatHoldDuration * 60 * 1000;
    const remaining = durationMs - (Date.now() - holdStartedAt);
    if (remaining <= 0) {
      // Already expired
      const st = selectedShowtimeRef.current;
      const token =
        localStorage.getItem("token") || sessionStorage.getItem("token");
      if (st && token) {
        fetch(API_ENDPOINTS.SHOWTIME_RELEASE_SEATS(parseInt(st.id)), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({}),
          keepalive: true,
        }).catch(() => {});
      }
      setSelectedMovie(null);
      setSelectedCinema(null);
      setSelectedShowtime(null);
      setSelectedSeats([]);
      setConcessions([]);
      setHoldStartedAt(null);
      window.location.href = "/";
      return;
    }
    const timer = setTimeout(() => {
      const st = selectedShowtimeRef.current;
      const token =
        localStorage.getItem("token") || sessionStorage.getItem("token");
      if (st && token) {
        fetch(API_ENDPOINTS.SHOWTIME_RELEASE_SEATS(parseInt(st.id)), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({}),
          keepalive: true,
        }).catch(() => {});
      }
      setSelectedMovie(null);
      setSelectedCinema(null);
      setSelectedShowtime(null);
      setSelectedSeats([]);
      setConcessions([]);
      setHoldStartedAt(null);
      window.location.href = "/";
    }, remaining);
    return () => clearTimeout(timer);
  }, [holdStartedAt, holdPausedAt]);

  return (
    <BookingContext.Provider
      value={{
        selectedMovie,
        selectedCinema,
        selectedShowtime,
        selectedSeats,
        concessions,
        setSelectedMovie,
        setSelectedCinema,
        setSelectedShowtime,
        addSeat,
        removeSeat,
        updateConcession,
        getTotalAmount,
        clearBooking,
        bookingsActive,
        checkBookingActive,
        holdStartedAt,
        holdPausedAt,
        startHoldTimer,
        stopHoldTimer,
        pauseHoldTimer,
        resumeHoldTimer,
      }}
    >
      {children}
    </BookingContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};

export const useBooking = () => {
  const context = useContext(BookingContext);
  if (!context)
    throw new Error("useBooking must be used within BookingProvider");
  return context;
};
