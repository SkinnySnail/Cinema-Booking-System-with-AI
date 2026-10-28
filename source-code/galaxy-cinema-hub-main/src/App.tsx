import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, BookingProvider } from "@/contexts/AppContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import CinemaAssistant from "@/components/ai/CinemaAssistant";

// Pages
import HomePage from "./pages/HomePage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import ProfilePage from "./pages/ProfilePage";
import BookingHistoryPage from "./pages/BookingHistoryPage";
import SearchPage from "./pages/SearchPage";
import MovieDetailPage from "./pages/MovieDetailPage";
import SchedulePage from "./pages/SchedulePage";
import MoviesPage from "./pages/CinemasPage";
import CinemasListPage from "./pages/CinemasListPage";
import PromotionsPage from "./pages/PromotionsPage";
import ConcessionMenuPage from "./pages/ConcessionMenuPage";
import CinemaDetailPage from "./pages/CinemaDetailPage";
import SeatSelectionPage from "./pages/booking/SeatSelectionPage";
import ConcessionsPage from "./pages/booking/ConcessionsPage";
import PaymentPage from "./pages/booking/PaymentPage";
import BookingSuccessPage from "./pages/booking/BookingSuccessPage";
import BookingFailedPage from "./pages/booking/BookingFailedPage";
import BookingFlowGuard from "./components/booking/BookingFlowGuard";
import AdminLayout from "./components/admin/AdminLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminMovies from "./pages/admin/AdminMovies";
import AdminMovieDetailPage from "./pages/admin/MovieDetailPage";
import AdminUsers from "./pages/admin/AdminUsers";
import AdminCinemas from "./pages/admin/AdminCinemas";
import AdminPromotions from "./pages/admin/AdminPromotions";
import AdminConcessions from "./pages/admin/AdminConcessions";
import AdminScheduler from "./pages/admin/AdminScheduler";
import AdminTransactions from "./pages/admin/AdminTransactions";
import AdminReviews from "./pages/admin/AdminReviews";
import AdminNotifications from "./pages/admin/AdminNotifications";
import AdminSettings from "./pages/admin/AdminSettings";
import AdminSeatManagement from "./pages/admin/AdminSeatManagement";
import AdminPermissions from "./pages/admin/AdminPermissions";
import AdminRolePermissions from "./pages/admin/AdminRolePermissions";
import ManagerLayout from "./components/manager/ManagerLayout";
import ManagerDashboard from "./pages/manager/ManagerDashboard";
import ManagerShowtimes from "./pages/manager/ManagerShowtimes";
import ManagerStaff from "./pages/manager/ManagerStaff";
import ManagerReports from "./pages/manager/ManagerReports";
import ManagerConcessions from "./pages/manager/ManagerConcessions";
import ManagerMovies from "./pages/manager/ManagerMovies";
import ManagerCinema from "./pages/manager/ManagerCinema";
import ManagerReviews from "./pages/manager/ManagerReviews";
import ManagerTransactions from "./pages/manager/ManagerTransactions";
import StaffLayout from "./components/staff/StaffLayout";
import StaffScanner from "./pages/staff/StaffScanner";
import StaffPOS from "./pages/staff/StaffPOS";
import StaffScanHistory from "./pages/staff/StaffScanHistory";
import StaffPaymentHistory from "./pages/staff/StaffPaymentHistory";
import NotFound from "./pages/NotFound";

import { useEffect } from "react";
import { apiCall, API_ENDPOINTS } from "@/lib/api";
import { systemConfig } from "@/data/mockData";

const SettingsLoader = () => {
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const res = await apiCall<{ success: boolean; data: any }>(
          API_ENDPOINTS.SETTINGS,
        );
        if (res.success && res.data) {
          const dbConfig = res.data;
          if (dbConfig.curfew_u13)
            systemConfig.curfewTimeU13 = dbConfig.curfew_u13.substring(0, 5);
          if (dbConfig.curfew_u16)
            systemConfig.curfewTimeU16 = dbConfig.curfew_u16.substring(0, 5);
          if (dbConfig.min_vietnamese_quota)
            systemConfig.minVietnameseQuota = Number(
              dbConfig.min_vietnamese_quota,
            );
          if (dbConfig.seat_hold_duration)
            systemConfig.seatHoldDuration = Math.max(
              1,
              Math.floor(Number(dbConfig.seat_hold_duration) / 60),
            );
          if (dbConfig.cleanup_duration)
            systemConfig.defaultCleanupDuration = Number(
              dbConfig.cleanup_duration,
            );
          if (dbConfig.loyalty_points_rate)
            systemConfig.loyaltyPointsRate = Number(
              dbConfig.loyalty_points_rate,
            );

          console.log("System config loaded from DB:", systemConfig);
        }
      } catch (error) {
        console.error("Failed to load system settings", error);
      }
    };
    void fetchSettings();
  }, []);
  return null;
};

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <AuthProvider>
        <BookingProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <SettingsLoader />
              <CinemaAssistant />
              <BookingFlowGuard />
              <Routes>
                {/* Client Routes */}
                <Route path="/" element={<HomePage />} />
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route
                  path="/forgot-password"
                  element={<ForgotPasswordPage />}
                />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/bookings" element={<BookingHistoryPage />} />
                <Route path="/search" element={<SearchPage />} />
                <Route path="/schedule" element={<SchedulePage />} />
                <Route path="/movies" element={<MoviesPage />} />
                <Route path="/cinemas" element={<CinemasListPage />} />
                <Route path="/promotions" element={<PromotionsPage />} />
                <Route path="/concessions" element={<ConcessionMenuPage />} />
                <Route path="/cinema/:id" element={<Navigate to="/cinemas" replace />} />
                <Route path="/movie/:id" element={<MovieDetailPage />} />
                <Route path="/booking/seats" element={<SeatSelectionPage />} />
                <Route
                  path="/booking/concessions"
                  element={<ConcessionsPage />}
                />
                <Route path="/booking/payment" element={<PaymentPage />} />
                <Route
                  path="/booking/success"
                  element={<BookingSuccessPage />}
                />
                <Route path="/booking/failed" element={<BookingFailedPage />} />

                {/* Admin Routes */}
                <Route path="/admin" element={<AdminLayout />}>
                  <Route index element={<AdminDashboard />} />
                  <Route path="movies" element={<AdminMovies />} />
                  <Route path="movies/:id" element={<AdminMovieDetailPage />} />
                  <Route path="users" element={<AdminUsers />} />
                  <Route path="cinemas" element={<AdminCinemas />} />
                  <Route path="promotions" element={<AdminPromotions />} />
                  <Route path="concessions" element={<AdminConcessions />} />
                  <Route path="scheduler" element={<AdminScheduler />} />
                  <Route path="transactions" element={<AdminTransactions />} />
                  <Route path="reviews" element={<AdminReviews />} />
                  <Route
                    path="notifications"
                    element={<AdminNotifications />}
                  />
                  <Route path="settings" element={<AdminSettings />} />
                  <Route path="seats" element={<AdminSeatManagement />} />
                  <Route path="permissions" element={<AdminPermissions />} />
                  <Route
                    path="role-permissions"
                    element={<AdminRolePermissions />}
                  />
                </Route>

                {/* Manager Routes */}
                <Route path="/manager" element={<ManagerLayout />}>
                  <Route index element={<ManagerDashboard />} />
                  <Route path="cinema" element={<ManagerCinema />} />
                  <Route path="movies" element={<ManagerMovies />} />
                  <Route path="showtimes" element={<ManagerShowtimes />} />
                  <Route path="seats" element={<AdminSeatManagement />} />
                  <Route path="staff" element={<ManagerStaff />} />
                  <Route path="reports" element={<ManagerReports />} />
                  <Route path="concessions" element={<ManagerConcessions />} />
                  <Route path="reviews" element={<ManagerReviews />} />
                  <Route
                    path="transactions"
                    element={<ManagerTransactions />}
                  />
                </Route>

                {/* Staff Routes */}
                <Route path="/staff" element={<StaffLayout />}>
                  <Route index element={<StaffScanner />} />
                  <Route path="scanner" element={<StaffScanner />} />
                  <Route path="pos" element={<StaffPOS />} />
                  <Route path="scan-history" element={<StaffScanHistory />} />
                  <Route
                    path="payment-history"
                    element={<StaffPaymentHistory />}
                  />
                </Route>

                {/* 404 */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </TooltipProvider>
        </BookingProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
