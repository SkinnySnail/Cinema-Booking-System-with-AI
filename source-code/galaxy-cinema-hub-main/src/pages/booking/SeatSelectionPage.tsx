import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Clock, X, AlertCircle, Shield, Loader } from "lucide-react";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { useAuth, useBooking } from "@/contexts/AppContext";
import { systemConfig } from "@/data/mockData";
import { Seat } from "@/types/cinema";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useHoldTimer, formatHoldTime } from "@/hooks/useHoldTimer";
import {
  validateAge,
  validateCurfew,
  calculateShowtimeEnd,
  formatAgeRating,
  getAgeRatingColor,
} from "@/lib/validation";
import AgeWarningDialog from "@/components/booking/AgeWarningDialog";
import CurfewWarningDialog from "@/components/booking/CurfewWarningDialog";
import CinemaSeatIcon from "@/components/booking/CinemaSeatIcon";
import { Badge } from "@/components/ui/badge";
import { API_ENDPOINTS, apiCall, getImageUrl } from "@/lib/api";
import { BookingService } from "@/services/booking.service";
import { useTheme } from "@/hooks/use-theme";

interface SeatFromAPI {
  id: number;
  row_code: string;
  number: number;
  seat_type: string;
  price_multiplier: number;
  status: string;
  held_by_me?: boolean;
  calculated_price: number;
}

interface SeatMapResponse {
  showtime: {
    id: number;
    movie_title: string;
    hall_name: string;
    cinema_name: string;
    start_time: string;
  };
  seat_map: {
    [key: string]: SeatFromAPI[];
  };
  summary: {
    total_seats: number;
    available: number;
    holding: number;
    sold: number;
    maintenance: number;
  };
}

interface MovieData {
  id: string | number;
  title: string;
  poster_url?: string;
  poster?: string;
  duration?: number;
  duration_minutes?: number;
  age_rating?: string;
  ageRating?: string;
}

interface ValidationError {
  isValid: boolean;
  userAge?: number;
  requiredAge?: number;
  message?: string;
  showtimeEnd?: string;
  curfewTime?: string;
}

const SeatSelectionPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const { user } = useAuth();
  const {
    selectedMovie,
    selectedShowtime,
    selectedSeats,
    addSeat,
    removeSeat,
    clearBooking,
    setSelectedMovie,
    setSelectedShowtime,
    startHoldTimer,
  } = useBooking();

  const { timeLeft, isActive: holdTimerActive } = useHoldTimer();
  const { theme } = useTheme();
  const isLight = theme === "light";

  // Helper to safely convert string to AgeRating type
  const normalizeAgeRating = (
    value: string | undefined,
  ): "P" | "K" | "T13" | "T16" | "T18" | "C" => {
    const ageRatings: ("P" | "K" | "T13" | "T16" | "T18" | "C")[] = [
      "P",
      "K",
      "T13",
      "T16",
      "T18",
      "C",
    ];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (ageRatings.includes(value as any) ? value : "P") as
      | "P"
      | "K"
      | "T13"
      | "T16"
      | "T18"
      | "C";
  };

  const [seatMap, setSeatMap] = useState<Seat[][]>([]);
  const [ageWarningOpen, setAgeWarningOpen] = useState(false);
  const [curfewWarningOpen, setCurfewWarningOpen] = useState(false);
  const [ageValidation, setAgeValidation] = useState<ValidationError | null>(
    null,
  );
  const [curfewValidation, setCurfewValidation] =
    useState<ValidationError | null>(null);
  const [loading, setLoading] = useState(true);

  const [movie, setMovie] = useState<MovieData | null>(null);
  const hasShownAuthWarning = useRef(false);

  useEffect(() => {
    if (!user) {
      if (!hasShownAuthWarning.current) {
        hasShownAuthWarning.current = true;
        toast({
          title: "Vui lòng đăng nhập",
          description:
            "Bạn cần đăng nhập để đặt vé. Khách chỉ có thể xem lịch chiếu.",
          variant: "destructive",
        });
      }
      navigate("/login");
    }
  }, [user, navigate, toast]);

  // Initialize from query params if context is empty
  useEffect(() => {
    const movieParam = searchParams.get("movie");
    const showtimeParam = searchParams.get("showtime");

    if (movieParam && !selectedMovie) {
      setSelectedMovie(movieParam);
    }

    if (showtimeParam && !selectedShowtime) {
      // We don't have the full showtime object yet, but we'll fetch its data
      // For now, minimal object to satisfy the context check
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setSelectedShowtime({ id: showtimeParam } as any);
    }
  }, [
    searchParams,
    selectedMovie,
    selectedShowtime,
    setSelectedMovie,
    setSelectedShowtime,
  ]);

  // Fetch movie data from API
  useEffect(() => {
    const movieId = selectedMovie || searchParams.get("movie");
    if (!movieId) return;

    const fetchMovie = async () => {
      try {
        const response = await apiCall<{
          success: boolean;
          data: { movie: MovieData };
        }>(API_ENDPOINTS.MOVIE_DETAIL(parseInt(movieId)));
        if (response.success && response.data?.movie) {
          const m = response.data.movie;
          setMovie({
            id: String(m.id),
            title: m.title,
            poster_url: m.poster_url || m.poster || "",
            poster: m.poster_url
              ? getImageUrl(m.poster_url)
              : m.poster
                ? getImageUrl(m.poster)
                : "",
            duration: m.duration || m.duration_minutes || 0,
            duration_minutes: m.duration_minutes || m.duration || 0,
            age_rating: normalizeAgeRating(m.age_rating || m.ageRating),
            ageRating: normalizeAgeRating(m.age_rating || m.ageRating),
          });
        }
      } catch (error) {
        console.error("Failed to fetch movie:", error);
      }
    };
    fetchMovie();
  }, [selectedMovie, searchParams]);

  // Tạo mã chữ cái cho hàng: A, B, C, ... Z, AA, AB, ...
  const getRowLetter = (index: number): string => {
    let letter = "";
    let temp = index;
    while (temp >= 0) {
      letter = String.fromCharCode((temp % 26) + 65) + letter;
      temp = Math.floor(temp / 26) - 1;
    }
    return letter;
  };

  // Convert API response to component format with smart sequential row/col shifting
  const convertSeatMap = (apiResponse: SeatMapResponse): Seat[][] => {
    // Thứ tự hàng vật lý trả về từ backend
    const rowCodes = Object.keys(apiResponse.seat_map);
    const rawRows = rowCodes.map((code) => apiResponse.seat_map[code]);

    // 1. Tính toán nhãn hàng (Row Labels):
    // Hàng có ít nhất 1 ghế thực tế (status !== "Inactive") -> được gán chữ cái tuần tự A, B, C...
    // Hàng 100% lối đi (tất cả là Inactive) -> nhãn rỗng "", chữ cái dời sang hàng có ghế kế tiếp
    let seatRowCounter = 0;
    const rowLabels = rawRows.map((row) => {
      const hasAnySeat = row.some((s) => s.status !== "Inactive");
      if (!hasAnySeat) return "";
      const label = getRowLetter(seatRowCounter);
      seatRowCounter++;
      return label;
    });

    // 2. Tính toán nhãn cột (Column Labels):
    // Cột mà tất cả các hàng đều là Inactive (100% là lối đi dọc xuyên suốt phòng) -> null (bị ẩn số, dời sang cột kế tiếp)
    // Cột có ít nhất 1 ghế thực tế ở bất kỳ hàng nào -> được đánh số tuần tự 1, 2, 3...
    const maxCols = Math.max(...rawRows.map((r) => r.length), 0);
    let seatColCounter = 1;
    const colLabels: (number | null)[] = [];
    for (let c = 0; c < maxCols; c++) {
      const hasAnySeatInCol = rawRows.some(
        (row) => row[c] && row[c].status !== "Inactive",
      );
      if (!hasAnySeatInCol) {
        colLabels.push(null);
      } else {
        colLabels.push(seatColCounter);
        seatColCounter++;
      }
    }

    return rawRows.map((rowSeats, rIdx) => {
      const displayRow = rowLabels[rIdx];

      return rowSeats.map((seat, cIdx) => {
        const seatTypeLower = (seat.seat_type || "").toLowerCase();
        const multiplier = Number(seat.price_multiplier) || 1.0;
        let type: "standard" | "vip" | "couple" = "standard";

        // Detect VIP seats: text contains "vip" or price multiplier is between 1.2 and 1.8
        if (seatTypeLower.includes("vip") || (multiplier > 1.2 && multiplier < 1.9)) {
          type = "vip";
        } else if (
          seatTypeLower.includes("sweetbox") ||
          seatTypeLower.includes("couple") ||
          seatTypeLower.includes("đôi") ||
          multiplier >= 1.9
        ) {
          type = "couple";
        }

        // Ghế do chính mình giữ → hiển thị available để có thể chọn lại
        let seatStatus:
          | "available"
          | "held"
          | "sold"
          | "maintenance"
          | "inactive"
          | "selected" = "available";
        if (seat.status === "Inactive") seatStatus = "inactive";
        else if (seat.status === "SOLD") seatStatus = "sold";
        else if (seat.status === "Maintenance") seatStatus = "maintenance";
        else if (seat.status === "HOLDING" && !seat.held_by_me)
          seatStatus = "held";

        // Tính số ghế hiển thị (display number):
        // Nếu cột là lối đi (colLabels[cIdx] === null) -> giữ nguyên seat.number
        // Nếu cột có ghế -> lấy số cột đã dời colLabels[cIdx]
        const displayNumber =
          colLabels[cIdx] !== null && colLabels[cIdx] !== undefined
            ? colLabels[cIdx]!
            : seat.number;

        return {
          // Use DB seat id for booking API; render row/number for display.
          id: String(seat.id),
          row: displayRow || seat.row_code,
          number: displayNumber,
          type,
          status: seatStatus,
          price: Number(seat.calculated_price) || 0,
        };
      });
    });
  };

  useEffect(() => {
    const movieId = selectedMovie || searchParams.get("movie");
    const showtimeId = selectedShowtime?.id || searchParams.get("showtime");

    if (!movieId || !showtimeId) {
      // Only redirect if both are missing after initialization
      const timer = setTimeout(() => {
        if (!selectedMovie && !searchParams.get("movie")) {
          navigate("/");
        }
      }, 500);
      return () => clearTimeout(timer);
    }

    const fetchSeatMap = async () => {
      try {
        setLoading(true);
        const response = await apiCall<{
          success: boolean;
          data: SeatMapResponse;
        }>(API_ENDPOINTS.SHOWTIME_SEAT_MAP(parseInt(showtimeId)));

        const seatMapData =
          response.data || (response as unknown as SeatMapResponse);

        // If we initialized from query params, update the showtime object in context with real data
        if (
          seatMapData.showtime &&
          (!selectedShowtime || !selectedShowtime.start_time)
        ) {
          setSelectedShowtime({
            id: String(seatMapData.showtime.id),
            time: new Date(seatMapData.showtime.start_time).toLocaleTimeString(
              "vi-VN",
              {
                hour: "2-digit",
                minute: "2-digit",
              },
            ),
            date: seatMapData.showtime.start_time.split(" ")[0],
            start_time: seatMapData.showtime.start_time,
            hall: seatMapData.showtime.hall_name,
            cinema: seatMapData.showtime.cinema_name,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any);
        }

        const convertedSeatMap = convertSeatMap(seatMapData);
        setSeatMap(convertedSeatMap);
      } catch (error) {
        console.error("Failed to fetch seat map:", error);
        toast({
          title: "Lỗi",
          description: "Không thể tải sơ đồ ghế. Vui lòng thử lại.",
          variant: "destructive",
        });
        navigate("/schedule");
      } finally {
        setLoading(false);
      }
    };

    fetchSeatMap();
  }, [
    selectedMovie,
    selectedShowtime,
    searchParams,
    navigate,
    toast,
    setSelectedShowtime,
  ]);

  // refreshSeatMap: gọi lại seat-map API để cập nhật trạng thái ghế (polling)
  const refreshSeatMap = async () => {
    const showtimeId = selectedShowtime?.id || searchParams.get("showtime");
    if (!showtimeId) return;
    try {
      const response = await apiCall<{
        success: boolean;
        data: SeatMapResponse;
      }>(API_ENDPOINTS.SHOWTIME_SEAT_MAP(parseInt(showtimeId)));
      const seatMapData =
        response.data || (response as unknown as SeatMapResponse);
      const convertedSeatMap = convertSeatMap(seatMapData);
      setSeatMap(convertedSeatMap);
    } catch {
      // Polling thất bại thì bỏ qua
    }
  };

  // Polling cập nhật ghế mỗi 5 giây để hiển thị realtime
  useEffect(() => {
    const showtimeId = selectedShowtime?.id || searchParams.get("showtime");
    if (!showtimeId) return;

    const pollInterval = setInterval(() => {
      refreshSeatMap();
    }, 5000);

    return () => clearInterval(pollInterval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedShowtime, searchParams]);

  // Track whether pending booking has been synced to avoid re-syncing on every render
  const hasSyncedPendingBooking = useRef(false);
  // Track seat IDs that belong to the user's own pending booking
  const pendingBookingSeatIds = useRef<Set<string>>(new Set());

  // if user has an active booking for this showtime, sync seats once
  useEffect(() => {
    const showtimeId = selectedShowtime?.id || searchParams.get("showtime");
    const userId = user?.id;
    if (!showtimeId || !userId) return;
    if (hasSyncedPendingBooking.current) return;

    let isCancelled = false;

    const syncPendingBookingSeats = async () => {
      try {
        const hasPendingBooking = await BookingService.checkBookingPending(
          userId,
          showtimeId,
        );
        if (!hasPendingBooking || isCancelled) return;

        const booking = await BookingService.getBookingByUserAndShowtime(
          userId,
          showtimeId,
        );
        const seatOfBooking = booking.data?.seats || [];

        const seatIds = new Set<string>();

        seatOfBooking.forEach((seat) => {
          const seatTypeLower = (seat.seat_type || "").toLowerCase();
          let type: "standard" | "vip" | "couple" = "standard";
          if (seatTypeLower.includes("vip")) type = "vip";
          else if (
            seatTypeLower.includes("sweetbox") ||
            seatTypeLower.includes("couple") ||
            seatTypeLower.includes("đôi")
          ) {
            type = "couple";
          }

          const seatId = String(seat.id);
          seatIds.add(seatId);
          removeSeat(seatId);

          addSeat({
            id: seatId,
            row: seat.row_number,
            number: Number(seat.seat_number) || 0,
            type,
            status: "selected" as const,
            price: Number(seat.price) || 0,
          });
        });

        if (!isCancelled) {
          pendingBookingSeatIds.current = seatIds;
          hasSyncedPendingBooking.current = true;

          // Update seatMap: change user's own held seats to "available" so toggle works visually
          setSeatMap((prev) =>
            prev.map((row) =>
              row.map((s) =>
                seatIds.has(s.id) ? { ...s, status: "available" as const } : s,
              ),
            ),
          );
        }
      } catch (error) {
        console.error("Failed to sync pending booking seats:", error);
      }
    };

    void syncPendingBookingSeats();

    return () => {
      isCancelled = true;
    };
  }, [selectedShowtime, searchParams, user, addSeat, removeSeat]);

  const handleSeatClick = async (seat: Seat | Seat[]) => {
    const seats = Array.isArray(seat) ? seat : [seat];
    const showtimeId = selectedShowtime?.id || searchParams.get("showtime");

    // Check if any of the seats are already selected (e.g., synced from pending booking)
    const anySelected = seats.some((s) =>
      selectedSeats.find((ss) => ss.id === s.id),
    );

    // If selected → allow deselect and release hold
    if (anySelected) {
      seats.forEach((s) => removeSeat(s.id));
      // Release seats on server
      if (showtimeId) {
        try {
          await apiCall(
            API_ENDPOINTS.SHOWTIME_RELEASE_SEATS(parseInt(showtimeId)),
            {
              method: "POST",
              body: JSON.stringify({
                seat_ids: seats.map((s) => parseInt(s.id)),
              }),
            },
          );
        } catch {
          // Ignore release errors
        }
      }
      return;
    }

    // Block sold/maintenance seats
    if (seats.some((s) => s.status === "sold" || s.status === "maintenance"))
      return;

    // Block held seats (from other users)
    if (seats.some((s) => s.status === "held")) return;

    // Hold seats on server first
    if (showtimeId) {
      try {
        await apiCall(API_ENDPOINTS.SHOWTIME_HOLD_SEATS(parseInt(showtimeId)), {
          method: "POST",
          body: JSON.stringify({
            seat_ids: seats.map((s) => parseInt(s.id)),
          }),
        });
      } catch {
        toast({
          title: "Ghế đã bị người khác chọn",
          description: "Vui lòng chọn ghế khác",
          variant: "destructive",
        });
        // Refresh seat map
        refreshSeatMap();
        return;
      }
    }

    // Add available seat
    seats.forEach((s) => addSeat({ ...s, status: "selected" }));
    // Start the hold timer when first seat is selected
    startHoldTimer();
  };

  const getSeatClass = (seat: Seat | Seat[]) => {
    const seats = Array.isArray(seat) ? seat : [seat];
    const isMerged = Array.isArray(seat);
    const isSelected = seats.some((s) =>
      selectedSeats.find((ss) => ss.id === s.id),
    );

    if (isSelected)
      return cn("seat seat-selected", isMerged && "seat-couple-merged");
    if (seats.some((s) => s.status === "sold"))
      return cn("seat seat-sold", isMerged && "seat-couple-merged");
    if (seats.some((s) => s.status === "held"))
      return cn("seat seat-held", isMerged && "seat-couple-merged");
    if (seats.some((s) => s.status === "maintenance"))
      return cn("seat seat-maintenance", isMerged && "seat-couple-merged");
    if (seats.some((s) => s.type === "vip"))
      return cn(
        "seat seat-vip seat-available",
        isMerged && "seat-couple-merged",
      );
    if (seats.some((s) => s.type === "couple"))
      return cn(
        "seat seat-couple seat-available",
        isMerged && "seat-couple-merged",
      );
    return cn("seat seat-available", isMerged && "seat-couple-merged");
  };

  const groupSeats = (row: Seat[]) => {
    const grouped: (Seat | Seat[])[] = [];
    for (let i = 0; i < row.length; i++) {
      const current = row[i];
      const next = row[i + 1];

      if (
        current.status !== "inactive" &&
        current.type === "couple" &&
        next &&
        next.status !== "inactive" &&
        next.type === "couple"
      ) {
        grouped.push([current, next]);
        i++; // skip next
      } else {
        grouped.push(current);
      }
    }
    return grouped;
  };

  const totalPrice = selectedSeats.reduce((sum, seat) => sum + seat.price, 0);
  const formatSeatCode = (seat: Seat) => `${seat.row}${seat.number}`;

  // Dynamic price extraction for legend
  const standardPrice =
    seatMap.flat().find((s) => s.type === "standard")?.price || 100000;
  const vipPrice =
    seatMap.flat().find((s) => s.type === "vip")?.price ||
    Math.round(standardPrice * 1.5);
  const couplePrice =
    seatMap.flat().find((s) => s.type === "couple")?.price ||
    Math.round(standardPrice * 2.0);

  const handleContinue = () => {
    if (selectedSeats.length === 0) {
      toast({
        title: "Vui lòng chọn ghế",
        description: "Bạn cần chọn ít nhất 1 ghế để tiếp tục",
        variant: "destructive",
      });
      return;
    }

    // Check age validation
    if (movie && user?.dob) {
      const ageRating = normalizeAgeRating(movie.age_rating || movie.ageRating);
      const ageCheck = validateAge(user.dob, ageRating);
      if (!ageCheck.isValid) {
        setAgeValidation(ageCheck);
        setAgeWarningOpen(true);
        return;
      }
    }

    // Check curfew validation
    if (movie && selectedShowtime && user?.dob) {
      const movieDuration = movie.duration || movie.duration_minutes || 0;
      const showtimeEnd = calculateShowtimeEnd(
        selectedShowtime.date || "",
        selectedShowtime.time || "",
        movieDuration,
        systemConfig.defaultCleanupDuration,
      );
      const curfewCheck = validateCurfew(user.dob, showtimeEnd, systemConfig);
      if (!curfewCheck.isValid) {
        setCurfewValidation(curfewCheck);
        setCurfewWarningOpen(true);
        return;
      }
    }

    navigate("/booking/concessions");
  };

  if (!movie || !selectedShowtime) {
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Loader className="w-8 h-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Đang tải sơ đồ ghế...</p>
          </div>
        </main>
      </div>
    );
  }

  if (seatMap.length === 0) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-destructive" />
            <p className="text-muted-foreground mb-4">
              Không thể tải sơ đồ ghế
            </p>
            <Button onClick={() => navigate("/schedule")}>Quay lại</Button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#070a10] text-slate-900 dark:text-white selection:bg-sky-500 selection:text-white dark:selection:text-black relative overflow-x-hidden transition-colors duration-300">
      {/* Background Ambient Lighting Effects */}
      <div className="fixed inset-0 pointer-events-none z-0">
        {/* Top projector ambient glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[400px] bg-gradient-to-b from-sky-500/10 via-purple-500/5 to-transparent blur-3xl opacity-60 dark:opacity-70" />
        {/* Subtle auditorium floor vignette */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,transparent_20%,#f1f5f9_85%)] dark:bg-[radial-gradient(ellipse_at_top,transparent_20%,#05070c_80%)]" />
      </div>

      <Header />

      <main className="flex-1 flex flex-col items-center justify-between px-2 sm:px-4 py-2 sm:py-3 max-w-7xl mx-auto w-full relative z-10">
        {/* Top Header Card: Booking Stepper, Movie Info & Hold Timer */}
        <div className="w-full mb-3 rounded-2xl bg-white/90 dark:bg-zinc-900/50 border border-slate-200/90 dark:border-white/10 backdrop-blur-xl p-3 shadow-sm dark:shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
          {/* Booking Stepper */}
          <div className="flex items-center justify-center gap-2 sm:gap-4 mb-2 pb-2 border-b border-slate-200/80 dark:border-white/5 text-xs sm:text-sm">
            <div className="flex items-center gap-2 text-sky-600 dark:text-sky-400 font-bold">
              <span className="w-5 h-5 rounded-full bg-sky-500 text-white dark:text-black flex items-center justify-center text-[11px] font-black shadow-[0_0_10px_rgba(56,189,248,0.7)]">
                1
              </span>
              <span>Chọn Ghế</span>
            </div>
            <span className="w-6 sm:w-12 h-[2px] bg-gradient-to-r from-sky-500/80 to-slate-300 dark:to-zinc-700" />
            <div className="flex items-center gap-2 text-slate-400 dark:text-zinc-500">
              <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 flex items-center justify-center text-[11px] font-bold border border-slate-300/80 dark:border-zinc-700">
                2
              </span>
              <span>Bắp Nước</span>
            </div>
            <span className="w-6 sm:w-12 h-[2px] bg-slate-200 dark:bg-zinc-800" />
            <div className="flex items-center gap-2 text-slate-400 dark:text-zinc-500">
              <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 flex items-center justify-center text-[11px] font-bold border border-slate-300/80 dark:border-zinc-700">
                3
              </span>
              <span>Thanh Toán</span>
            </div>
          </div>

          {/* Movie Details & Hold Timer */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="relative group shrink-0">
                <img
                  src={
                    movie.poster ||
                    (movie.poster_url ? getImageUrl(movie.poster_url) : "")
                  }
                  alt={movie.title}
                  className="w-10 h-14 sm:w-11 sm:h-16 object-cover rounded-xl shadow-md border border-slate-200 dark:border-white/15 transition-transform duration-300 group-hover:scale-105"
                />
                <div className="absolute -inset-1 rounded-xl bg-gradient-to-tr from-sky-500/20 to-purple-500/20 blur -z-10 opacity-70" />
              </div>

              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="font-extrabold text-sm sm:text-lg tracking-tight text-slate-900 dark:text-white drop-shadow-sm">
                    {movie.title}
                  </h1>
                  <Badge
                    className={`${getAgeRatingColor(normalizeAgeRating(movie.age_rating || movie.ageRating))} text-white text-[10px] font-black px-1.5 py-0.5 rounded shadow-sm`}
                  >
                    {normalizeAgeRating(movie.age_rating || movie.ageRating)}
                  </Badge>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-purple-500/10 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 border border-purple-300 dark:border-purple-500/30">
                    IMAX 2D
                  </span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-sky-500/10 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-300 dark:border-sky-500/30 hidden sm:inline-block">
                    Dolby Atmos
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-zinc-400 mt-1 flex-wrap">
                  <span className="text-sky-600 dark:text-sky-400 font-bold text-xs bg-sky-50 dark:bg-sky-950/40 px-1.5 py-0.5 rounded border border-sky-200 dark:border-sky-800/40 font-mono">
                    {selectedShowtime.time}
                  </span>
                  <span>•</span>
                  <span className="text-slate-700 dark:text-zinc-300">
                    {new Date(selectedShowtime.date).toLocaleDateString("vi-VN", {
                      weekday: "long",
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}
                  </span>
                  {selectedShowtime.hall && (
                    <>
                      <span>•</span>
                      <span className="text-slate-800 dark:text-zinc-200 font-semibold">
                        {selectedShowtime.hall}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Countdown Hold Timer */}
            {holdTimerActive && (
              <div
                className={cn(
                  "flex items-center gap-2.5 px-4 py-2 rounded-xl font-mono text-sm font-bold border shrink-0 transition-all shadow-md",
                  timeLeft <= 60
                    ? "bg-red-500/15 text-red-700 dark:text-red-300 border-red-400 dark:border-red-500/40 animate-pulse shadow-[0_0_20px_rgba(239,68,68,0.3)]"
                    : "bg-sky-500/10 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-300 dark:border-sky-500/30 shadow-[0_0_20px_rgba(14,165,233,0.15)]",
                )}
              >
                <Clock className="w-4 h-4 animate-spin text-sky-600 dark:text-sky-400" style={{ animationDuration: "8s" }} />
                <div>
                  <span className="text-[10px] text-slate-500 dark:text-zinc-400 uppercase tracking-wider block leading-none mb-0.5 font-sans font-medium">
                    Thời gian giữ ghế
                  </span>
                  <span className="text-base tracking-wider">{formatHoldTime(timeLeft)}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Theater Auditorium Card (Màn chiếu & Phòng chiếu) */}
        <div className="w-full flex-1 flex flex-col items-center justify-center relative p-3 sm:p-5 rounded-2xl bg-white dark:bg-gradient-to-b dark:from-[#0e1422]/90 dark:via-[#0a0f19]/95 dark:to-[#070a10] border border-slate-200/90 dark:border-white/10 shadow-lg dark:shadow-[0_25px_70px_rgba(0,0,0,0.85)] overflow-hidden my-auto backdrop-blur-md">
          {/* Cinema Screen with Light Beam & Realistic Curved 3D Silver Arc */}
          <div className="w-full max-w-3xl mx-auto flex flex-col items-center mb-3 sm:mb-4 relative">
            {/* Top Projector Light Source */}
            <div className="w-16 h-1 bg-gradient-to-b from-sky-400/80 to-transparent rounded-full blur-[1px] mb-1" />

            <svg viewBox="0 0 900 65" className="w-full max-w-2xl max-h-12 overflow-visible">
              <defs>
                {/* Screen ambient projection beam */}
                <linearGradient id="screenBeamEnhanced" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor={isLight ? "rgba(14, 165, 233, 0.22)" : "rgba(56, 189, 248, 0.35)"} />
                  <stop offset="40%" stopColor={isLight ? "rgba(14, 165, 233, 0.08)" : "rgba(56, 189, 248, 0.12)"} />
                  <stop offset="100%" stopColor="rgba(56, 189, 248, 0)" />
                </linearGradient>

                {/* Silver Screen Metallic Gradient */}
                <linearGradient id="silverScreenCurve" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor={isLight ? "rgba(148, 163, 184, 0.2)" : "rgba(255, 255, 255, 0.1)"} />
                  <stop offset="12%" stopColor={isLight ? "#38bdf8" : "rgba(255, 255, 255, 0.85)"} />
                  <stop offset="50%" stopColor={isLight ? "#0284c7" : "#ffffff"} />
                  <stop offset="88%" stopColor={isLight ? "#38bdf8" : "rgba(255, 255, 255, 0.85)"} />
                  <stop offset="100%" stopColor={isLight ? "rgba(148, 163, 184, 0.2)" : "rgba(255, 255, 255, 0.1)"} />
                </linearGradient>

                {/* Glow bloom filter */}
                <filter id="screenBloomFilter" x="-20%" y="-40%" width="140%" height="220%">
                  <feGaussianBlur stdDeviation={isLight ? "3" : "6"} result="glow" />
                  <feMerge>
                    <feMergeNode in="glow" />
                    <feMergeNode in="glow" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Realistic Projector Light Beam Cone */}
              <path
                d="M 60 52 Q 450 14 840 52 L 780 78 Q 450 38 120 78 Z"
                fill="url(#screenBeamEnhanced)"
              />

              {/* 3D Curved Silver Screen Line */}
              <path
                d="M 40 52 Q 450 10 860 52"
                stroke="url(#silverScreenCurve)"
                strokeWidth={isLight ? "4" : "5"}
                strokeLinecap="round"
                fill="none"
                filter="url(#screenBloomFilter)"
              />

              {/* Lower reflection accent line */}
              <path
                d="M 80 58 Q 450 24 820 58"
                stroke={isLight ? "rgba(14, 165, 233, 0.3)" : "rgba(56, 189, 248, 0.4)"}
                strokeWidth="1.5"
                strokeLinecap="round"
                fill="none"
              />
            </svg>

            {/* Screen Label & Room Specs */}
            <div className="flex flex-col items-center gap-0.5 mt-0.5 select-none">
              <span className="text-[10px] sm:text-[11px] font-extrabold tracking-[0.3em] text-slate-700 dark:text-zinc-300 drop-shadow-sm flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-ping inline-block" />
                MÀN HÌNH CHÍNH / IMAX SCREEN
              </span>
              <span className="text-[9px] sm:text-[10px] text-slate-500 dark:text-zinc-500 font-medium tracking-wider">
                Hệ thống âm thanh vòm Dolby Atmos • Máy chiếu Laser 4K
              </span>
            </div>
          </div>

          {/* Seat Grid Matrix with Left & Right Row Badges */}
          <div className="flex flex-col items-center gap-1.5 sm:gap-2 overflow-x-auto max-w-full pb-2 px-1 scrollbar-thin scrollbar-thumb-slate-300 dark:scrollbar-thumb-zinc-700">
            {seatMap.map((row, rowIndex) => (
              <div
                key={rowIndex}
                className="flex items-center gap-1.5 sm:gap-2"
              >
                {/* Left Row Label */}
                {row.every((s) => s.status === "inactive") ? (
                  <span className="w-5 h-5 opacity-0 select-none pointer-events-none" />
                ) : (
                  <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center justify-center text-[10px] sm:text-xs font-bold text-slate-600 dark:text-zinc-400 select-none shadow-sm">
                    {row.find((s) => s.status !== "inactive")?.row || row[0]?.row}
                  </span>
                )}

                {/* Seats in Row */}
                <div className="flex items-center gap-1 sm:gap-1.5">
                  {groupSeats(row).map((seat) => {
                    const isMerged = Array.isArray(seat);
                    const seats = isMerged ? seat : [seat];
                    const firstSeat = seats[0];

                    // Khoảng trống / Lối đi (Inactive) -> Hiển thị ô trong suốt giữ khoảng cách
                    if (firstSeat.status === "inactive") {
                      return (
                        <div
                          key={isMerged ? `inactive-${seats[0].id}` : `inactive-${firstSeat.id || Math.random()}`}
                          className="w-[36px] h-[31px] opacity-0 pointer-events-none select-none shrink-0"
                          aria-hidden="true"
                        />
                      );
                    }

                    const isSold = seats.some((s) => s.status === "sold");
                    const isMaintenance = seats.some(
                      (s) => s.status === "maintenance",
                    );
                    const isHeld = seats.some((s) => s.status === "held");
                    const isInSelectedSeats = seats.some((s) =>
                      selectedSeats.find((ss) => ss.id === s.id),
                    );
                    const seatNumbers = isMerged
                      ? `${seats[0].number}-${seats[1].number}`
                      : firstSeat.number;
                    const seatIds = isMerged
                      ? `${seats[0].id},${seats[1].id}`
                      : firstSeat.id;
                    const price = isMerged
                      ? seats[0].price + seats[1].price
                      : firstSeat.price;

                    let seatStatus: "available" | "held" | "sold" | "maintenance" | "selected" =
                       firstSeat.status;
                    if (isInSelectedSeats) seatStatus = "selected";
                    else if (isSold) seatStatus = "sold";
                    else if (isMaintenance) seatStatus = "maintenance";
                    else if (isHeld) seatStatus = "held";

                    return (
                      <CinemaSeatIcon
                        key={isMerged ? `merged-${seats[0].id}` : firstSeat.id}
                        status={seatStatus}
                        type={firstSeat.type}
                        isMerged={isMerged}
                        isSelected={isInSelectedSeats}
                        seatNumber={seatNumbers}
                        onClick={() => handleSeatClick(seat)}
                        title={
                          isMaintenance
                            ? `Ghế ${firstSeat.row}${seatNumbers} - Đang bảo trì`
                            : `Ghế ${firstSeat.row}${seatNumbers} (${firstSeat.type.toUpperCase()}) - ${price.toLocaleString("vi-VN")}đ`
                        }
                      />
                    );
                  })}
                </div>

                {/* Right Row Label */}
                {row.every((s) => s.status === "inactive") ? (
                  <span className="w-5 h-5 opacity-0 select-none pointer-events-none" />
                ) : (
                  <span className="w-5 h-5 rounded-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center justify-center text-[10px] sm:text-xs font-bold text-slate-600 dark:text-zinc-400 select-none shadow-sm">
                    {row.find((s) => s.status !== "inactive")?.row || row[0]?.row}
                  </span>
                )}

              </div>
            ))}
          </div>

          {/* Seat Legend Bar (Bảng chú thích loại ghế & giá vé) - Luôn nằm thẳng 1 hàng */}
          <div className="w-full max-w-5xl flex items-center justify-center gap-2 sm:gap-2.5 md:gap-3.5 pt-3 mt-3 border-t border-slate-200/90 dark:border-white/10 text-xs text-slate-700 dark:text-zinc-300 overflow-x-auto pb-0.5 flex-nowrap scrollbar-none">
            {/* Ghế Thường */}
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-slate-100/90 dark:bg-white/[0.03] border border-slate-200 dark:border-white/5 shrink-0">
              <CinemaSeatIcon status="available" type="standard" disabled />
              <div>
                <span className="font-semibold block text-slate-800 dark:text-zinc-200 text-xs leading-tight">Ghế thường</span>
                <span className="text-slate-500 dark:text-zinc-400 font-mono text-[11px] font-semibold">
                  {standardPrice.toLocaleString("vi-VN")}đ
                </span>
              </div>
            </div>

            {/* Ghế VIP */}
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/20 shrink-0">
              <CinemaSeatIcon status="available" type="vip" disabled />
              <div>
                <span className="font-semibold block text-purple-900 dark:text-purple-200 text-xs leading-tight">Ghế VIP</span>
                <span className="text-purple-600 dark:text-purple-300 font-mono text-[11px] font-bold">
                  {vipPrice.toLocaleString("vi-VN")}đ
                </span>
              </div>
            </div>

            {/* Ghế Đôi / Sweetbox */}
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 shrink-0">
              <CinemaSeatIcon status="available" type="couple" isMerged={false} disabled />
              <div>
                <span className="font-semibold block text-rose-900 dark:text-rose-200 text-xs leading-tight">Ghế Đôi</span>
                <span className="text-rose-600 dark:text-rose-300 font-mono text-[11px] font-bold">
                  {couplePrice.toLocaleString("vi-VN")}đ
                </span>
              </div>
            </div>

            <span className="text-slate-300 dark:text-zinc-700 hidden sm:inline select-none shrink-0">|</span>

            {/* Đang Chọn */}
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/25 shrink-0">
              <CinemaSeatIcon status="available" isSelected disabled />
              <div>
                <span className="font-bold block text-sky-800 dark:text-sky-300 text-xs leading-tight">Đang chọn</span>
                <span className="text-sky-600 dark:text-sky-400 font-mono text-[11px]">Đã chọn</span>
              </div>
            </div>

            {/* Đã Bán */}
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-slate-100/90 dark:bg-zinc-800/60 border border-slate-300/80 dark:border-zinc-700 shrink-0">
              <CinemaSeatIcon status="sold" disabled />
              <div>
                <span className="font-medium block text-slate-700 dark:text-zinc-300 text-xs leading-tight">Đã bán</span>
                <span className="text-slate-500 dark:text-zinc-400 text-[11px]">Không thể chọn</span>
              </div>
            </div>

            {/* Bảo Trì */}
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-amber-50 dark:bg-amber-500/10 border border-amber-300/80 dark:border-amber-500/30 shrink-0">
              <CinemaSeatIcon status="maintenance" disabled />
              <div>
                <span className="font-medium block text-amber-800 dark:text-amber-300 text-xs leading-tight">Bảo trì</span>
                <span className="text-amber-600/90 dark:text-amber-400/90 text-[11px]">Tạm khóa</span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Floating Order Dock */}
        <div className="w-full sticky bottom-2 z-40 mt-3 p-3 sm:p-3.5 rounded-2xl bg-white/95 dark:bg-zinc-950/85 border border-slate-200/90 dark:border-white/15 backdrop-blur-2xl shadow-xl dark:shadow-[0_15px_40px_rgba(0,0,0,0.9)] flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs uppercase tracking-wider text-slate-500 dark:text-zinc-400 font-semibold">
                  Ghế đã chọn:
                </span>
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-full bg-sky-500/15 dark:bg-sky-500/20 text-sky-700 dark:text-sky-300 border border-sky-300 dark:border-sky-500/30">
                  {selectedSeats.length} ghế
                </span>
              </div>

              {/* Selected Seat Badges with Quick Remove */}
              {selectedSeats.length > 0 ? (
                <div className="flex items-center gap-1.5 flex-wrap max-h-16 overflow-y-auto">
                  {selectedSeats.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => removeSeat(s.id)}
                      title="Nhấn để hủy ghế này"
                      className="group flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-sky-50 dark:bg-sky-500/15 border border-sky-200 dark:border-sky-500/30 text-sky-700 dark:text-sky-200 text-xs font-mono font-bold hover:bg-red-50 dark:hover:bg-red-500/20 hover:border-red-300 dark:hover:border-red-500/40 hover:text-red-600 dark:hover:text-red-300 transition-all cursor-pointer shadow-sm"
                    >
                      <span>{formatSeatCode(s)}</span>
                      <X className="w-3 h-3 group-hover:scale-125 transition-transform" />
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400 dark:text-zinc-500 italic">
                  Vui lòng chọn ít nhất một ghế ngồi để tiếp tục
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between md:justify-end gap-5 pt-3 md:pt-0 border-t md:border-t-0 border-slate-200/80 dark:border-white/10">
            <div className="text-right">
              <span className="text-[11px] uppercase tracking-wider text-slate-500 dark:text-zinc-400 block font-medium">
                Tạm tính ({selectedSeats.length} vé)
              </span>
              <span className="text-2xl sm:text-3xl font-extrabold font-mono text-sky-600 dark:text-sky-400 drop-shadow-[0_0_15px_rgba(56,189,248,0.3)] dark:drop-shadow-[0_0_15px_rgba(56,189,248,0.5)]">
                {totalPrice.toLocaleString("vi-VN")}đ
              </span>
            </div>

            <Button
              onClick={handleContinue}
              disabled={selectedSeats.length === 0}
              className="h-12 px-8 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-extrabold text-sm sm:text-base shadow-[0_4px_20px_rgba(14,165,233,0.4)] dark:shadow-[0_0_25px_rgba(14,165,233,0.5)] hover:shadow-[0_6px_25px_rgba(14,165,233,0.6)] dark:hover:shadow-[0_0_35px_rgba(14,165,233,0.8)] transition-all active:scale-95 disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed flex items-center gap-2"
            >
              <span>Tiếp Tục Chọn Bắp Nước</span>
              <span className="text-lg">→</span>
            </Button>
          </div>
        </div>
      </main>

      {/* Age Warning Dialog */}
      {ageValidation && (
        <AgeWarningDialog
          open={ageWarningOpen}
          onOpenChange={setAgeWarningOpen}
          userAge={ageValidation.userAge}
          requiredAge={ageValidation.requiredAge}
          message={ageValidation.message || ""}
        />
      )}

      {/* Curfew Warning Dialog */}
      {curfewValidation && (
        <CurfewWarningDialog
          open={curfewWarningOpen}
          onOpenChange={setCurfewWarningOpen}
          userAge={curfewValidation.userAge}
          showtimeEnd={curfewValidation.showtimeEnd}
          curfewTime={curfewValidation.curfewTime}
          message={curfewValidation.message || ""}
        />
      )}
    </div>
  );
};

export default SeatSelectionPage;
