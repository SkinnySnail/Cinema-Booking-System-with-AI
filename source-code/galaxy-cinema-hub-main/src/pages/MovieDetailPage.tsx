import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  Clock,
  Calendar,
  Star,
  Play,
  AlertTriangle,
  MapPin,
  ChevronRight,
  Send,
  Loader2,
  Pencil,
  Trash2,
  Film,
  Users,
  Ticket,
  Sparkles,
  X,
  MessageSquare,
  Share2,
  Info,
} from "lucide-react";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import RecommendationsSection from "@/components/ai/RecommendationsSection";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import { API_ENDPOINTS, apiCall, getImageUrl } from "@/lib/api";
import { Movie, AgeRating, Showtime } from "@/types/cinema";
import { useBooking, useAuth } from "@/contexts/AppContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface BackendMovie {
  id: number;
  title: string;
  description: string;
  duration: number;
  release_date: string;
  poster_url: string;
  trailer_url: string | null;
  age_rating: string;
  origin: string;
  status: string;
  genres: string | null;
  avg_rating: string | null;
  review_count: number;
  director: string | null;
  cast: string | null;
}

interface BackendReview {
  id: number;
  user_id: number;
  movie_id: number;
  rating: number;
  comment: string;
  status: string;
  created_at: string;
  updated_at: string;
  email: string;
  full_name: string | null;
  avatar: string | null;
}

interface ReviewStats {
  total_reviews: number;
  average_rating: number;
  rating_distribution: {
    "5": number;
    "4": number;
    "3": number;
    "2": number;
    "1": number;
  };
}

interface Review {
  id: string;
  userId: number;
  userName: string;
  userAvatar: string;
  rating: number;
  comment: string;
  createdAt: string;
  helpful: number;
}

interface APICinema {
  id: number;
  name: string;
  address: string;
  hotline?: string;
}

interface APIShowtime {
  id: number;
  movie_title: string;
  movie_id: number;
  cinema_id: number;
  cinema_name: string;
  hall_name: string;
  start_time: string;
  total_seats: number;
  base_price?: number;
}

const AGE_RATING_CONFIG: Record<
  string,
  { label: string; badgeClass: string; description: string }
> = {
  P: {
    label: "P - Phổ biến",
    badgeClass: "bg-emerald-500 hover:bg-emerald-600 text-white",
    description: "Phim thích hợp cho khán giả ở mọi độ tuổi",
  },
  T13: {
    label: "T13 - Khán giả từ 13+",
    badgeClass: "bg-amber-500 hover:bg-amber-600 text-white",
    description: "Phim dành cho khán giả từ đủ 13 tuổi trở lên",
  },
  T16: {
    label: "T16 - Khán giả từ 16+",
    badgeClass: "bg-orange-500 hover:bg-orange-600 text-white",
    description: "Phim dành cho khán giả từ đủ 16 tuổi trở lên",
  },
  T18: {
    label: "T18 - Khán giả từ 18+",
    badgeClass: "bg-rose-500 hover:bg-rose-600 text-white",
    description: "Phim dành cho khán giả từ đủ 18 tuổi trở lên (Cần CMND/CCCD)",
  },
  C: {
    label: "C - Cấm phổ biến",
    badgeClass: "bg-gray-500 text-white",
    description: "Phim không được phép phổ biến",
  },
};

const extractYouTubeId = (url: string) => {
  const regExp =
    /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[2].length === 11 ? match[2] : null;
};

const MovieDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAuthenticated, user } = useAuth();
  const { setSelectedMovie, setSelectedCinema, setSelectedShowtime } =
    useBooking();

  const [movie, setMovie] = useState<Movie | null>(null);
  const [loading, setLoading] = useState(true);
  const getLocalDateString = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };

  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return getLocalDateString(new Date());
  });
  const [showAgeModal, setShowAgeModal] = useState(false);
  const [pendingShowtime, setPendingShowtime] = useState<{
    cinemaId: string;
    showtime: Showtime;
  } | null>(null);

  // Trailer Modal State
  const [isTrailerOpen, setIsTrailerOpen] = useState(false);

  // Cinema & showtime states (from API)
  const [apiCinemas, setApiCinemas] = useState<APICinema[]>([]);
  const [showtimesByCinema, setShowtimesByCinema] = useState<
    Record<string, Showtime[]>
  >({});
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [loadingShowtimes, setLoadingShowtimes] = useState(false);

  // Review states
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewStats, setReviewStats] = useState<ReviewStats | null>(null);
  const [loadingReviews, setLoadingReviews] = useState(false);

  const normalizeTrailerUrl = (url: string) => {
    const trimmed = url.trim();
    if (!trimmed) return "";
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
  };

  useEffect(() => {
    const fetchMovie = async () => {
      if (!id) return;

      try {
        setLoading(true);
        const response = await apiCall<{
          success: boolean;
          data: { movie: BackendMovie };
        }>(API_ENDPOINTS.MOVIE_DETAIL(parseInt(id)));

        if (response.success && response.data?.movie) {
          const m = response.data.movie;
          const castList = (m.cast || "")
            .split(",")
            .map((name) => name.trim())
            .filter(Boolean);

          const mappedMovie: Movie = {
            id: m.id.toString(),
            title: m.title,
            titleVi: m.title,
            poster: getImageUrl(m.poster_url),
            duration: m.duration,
            ageRating: m.age_rating as AgeRating,
            origin: m.origin === "Vietnam" ? "VN" : "INT",
            genre: m.genres ? m.genres.split(",").map((g) => g.trim()) : [],
            director: (m.director || "").trim(),
            cast: castList,
            releaseDate: m.release_date,
            description: m.description || "",
            trailerUrl: m.trailer_url || undefined,
            rating: m.avg_rating ? parseFloat(m.avg_rating) : 0,
            isNowShowing: m.status === "Now Showing",
          };
          setMovie(mappedMovie);
        }
      } catch (error) {
        console.error("Error fetching movie:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchMovie();
  }, [id]);

  // Fetch cinemas and showtimes from API
  useEffect(() => {
    const fetchCinemasAndShowtimes = async () => {
      if (!id) return;

      const toLocalYmd = (dateInput: string) => {
        const d = new Date(dateInput.replace(" ", "T"));
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      };

      try {
        setLoadingShowtimes(true);

        // Fetch cinemas
        const cinemasRes = await apiCall<{
          success: boolean;
          data: { cinemas: APICinema[] };
        }>(API_ENDPOINTS.CINEMAS);
        const cinemaList = cinemasRes.data?.cinemas || [];
        setApiCinemas(cinemaList);

        // Fetch all showtimes for this movie, then filter by selectedDate on frontend.
        const params = new URLSearchParams();
        params.append("movie_id", id);
        params.append("limit", "300");
        const showtimesRes = await apiCall<{
          success: boolean;
          data: { showtimes: APIShowtime[] };
        }>(`${API_ENDPOINTS.SHOWTIMES}?${params.toString()}`);

        const rawShowtimes = showtimesRes.data?.showtimes || [];
        const todayYmd = getLocalDateString(new Date());

        // Filter out past showtimes older than today (e.g. historical data from previous months)
        const validUpcomingShowtimes = rawShowtimes.filter((s) => {
          const showYmd = toLocalYmd(s.start_time);
          return showYmd >= todayYmd;
        });

        const futureDates = Array.from(
          new Set(validUpcomingShowtimes.map((s) => toLocalYmd(s.start_time))),
        ).sort();
        setAvailableDates(futureDates);

        // If selectedDate is in the past (before today), reset it to todayYmd
        if (selectedDate < todayYmd) {
          setSelectedDate(todayYmd);
          return;
        }

        const filteredShowtimes = validUpcomingShowtimes.filter(
          (s) => toLocalYmd(s.start_time) === selectedDate,
        );

        // Group showtimes by cinema_id
        const grouped: Record<string, Showtime[]> = {};
        filteredShowtimes.forEach((s) => {
          const cinemaKey = String(s.cinema_id);
          const startDate = new Date(s.start_time.replace(" ", "T"));
          const dur = movie?.duration || 120;
          const endDate = new Date(startDate.getTime() + dur * 60000);
          const endTimeStr = !Number.isNaN(endDate.getTime())
            ? `${String(endDate.getHours()).padStart(2, "0")}:${String(endDate.getMinutes()).padStart(2, "0")}`
            : undefined;

          const mapped: Showtime = {
            id: String(s.id),
            movieId: String(s.movie_id),
            cinemaId: cinemaKey,
            roomId: s.hall_name,
            date: getLocalDateString(startDate),
            time: startDate.toTimeString().slice(0, 5),
            endTime: endTimeStr,
            start_time: s.start_time,
            hall: s.hall_name,
            cinema: s.cinema_name,
            hall_name: s.hall_name,
            cinema_name: s.cinema_name,
            price: {
              standard: s.base_price || 90000,
              vip: (s.base_price || 90000) * 1.5,
              couple: (s.base_price || 90000) * 2,
            },
            availableSeats: s.total_seats || 0,
            totalSeats: s.total_seats || 0,
          };
          if (!grouped[cinemaKey]) {
            grouped[cinemaKey] = [];
          }
          grouped[cinemaKey].push(mapped);
        });
        setShowtimesByCinema(grouped);
      } catch (error) {
        console.error("Error fetching cinemas/showtimes:", error);
      } finally {
        setLoadingShowtimes(false);
      }
    };

    fetchCinemasAndShowtimes();
  }, [id, selectedDate, movie?.duration]);

  // Fetch reviews
  const fetchReviews = async () => {
    if (!id) return;

    try {
      setLoadingReviews(true);
      const response = await apiCall<{
        success: boolean;
        data: {
          movie_id: number;
          reviews: BackendReview[];
          rating_stats: ReviewStats;
        };
      }>(API_ENDPOINTS.MOVIE_REVIEWS(parseInt(id)));

      if (response.success && response.data) {
        const mappedReviews = response.data.reviews.map((r) => ({
          id: r.id.toString(),
          userId: r.user_id,
          userName: r.full_name || r.email.split("@")[0],
          userAvatar:
            r.avatar ||
            `https://api.dicebear.com/7.x/avataaars/svg?seed=${r.email}`,
          rating: r.rating,
          comment: r.comment,
          createdAt: r.created_at,
          helpful: 0,
        }));
        setReviews(mappedReviews);
        setReviewStats(response.data.rating_stats);
      }
    } catch (error) {
      console.error("Error fetching reviews:", error);
    } finally {
      setLoadingReviews(false);
    }
  };

  useEffect(() => {
    fetchReviews();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <main className="flex-1 flex flex-col items-center justify-center py-32">
          <div className="relative flex items-center justify-center">
            <div className="w-14 h-14 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
            <Film className="w-5 h-5 text-primary absolute" />
          </div>
          <p className="mt-5 text-sm font-medium text-muted-foreground animate-pulse">
            Đang tải thông tin chi tiết phim...
          </p>
        </main>
        <Footer />
      </div>
    );
  }

  if (!movie) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <main className="flex-1 flex items-center justify-center py-32">
          <div className="text-center p-8 max-w-md bg-card border border-border rounded-3xl shadow-sm">
            <Film className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2">Không tìm thấy phim</h1>
            <p className="text-muted-foreground text-sm mb-6">
              Bộ phim bạn đang tìm kiếm không tồn tại hoặc đã ngừng chiếu.
            </p>
            <Link to="/movies">
              <Button className="rounded-xl px-6 bg-primary hover:bg-primary/90 text-primary-foreground">
                Xem danh sách phim
              </Button>
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // Dates starting from Today onwards (at least 8 days, or up to the latest available showtime date)
  const today = new Date();
  const todayStr = getLocalDateString(today);

  const maxAvailableDate =
    availableDates.length > 0
      ? availableDates[availableDates.length - 1]
      : todayStr;

  const daysAhead = Math.max(
    8,
    Math.min(
      14,
      Math.ceil(
        (new Date(`${maxAvailableDate}T00:00:00`).getTime() -
          new Date(`${todayStr}T00:00:00`).getTime()) /
          (1000 * 60 * 60 * 24),
      ) + 1,
    ),
  );

  const dates = Array.from({ length: daysAhead }, (_, i) => {
    const d = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() + i,
    );
    const value = getLocalDateString(d);
    const isToday = value === todayStr;
    const isTomorrow = i === 1;
    const dayName = isToday
      ? "Hôm nay"
      : isTomorrow
        ? "Ngày mai"
        : d.toLocaleDateString("vi-VN", { weekday: "short" });
    const hasShowtimes = availableDates.includes(value);

    return {
      value,
      dayName,
      day: d.getDate(),
      month: d.getMonth() + 1,
      hasShowtimes,
      isToday,
    };
  });

  const totalShowtimesForSelectedDate = Object.values(showtimesByCinema).reduce(
    (acc, times) => acc + times.length,
    0,
  );
  const nextAvailableDate = availableDates.find((d) => d > selectedDate);

  const handleSelectShowtime = (cinemaId: string, showtime: Showtime) => {
    if (getShowtimeTimestamp(showtime) <= Date.now()) {
      toast({
        title: "Suất chiếu đã qua giờ",
        description: "Vui lòng chọn suất chiếu khác còn hiệu lực.",
        variant: "destructive",
      });
      return;
    }

    if (!isAuthenticated || !user) {
      toast({
        title: "Vui lòng đăng nhập",
        description:
          "Bạn cần đăng nhập để đặt vé. Khách chỉ có thể xem lịch chiếu.",
        variant: "destructive",
      });
      navigate("/login");
      return;
    }

    // CHECK UNDER 13 AND UNDER 16 LAWS
    if (showtime.start_time) {
      const startObj = new Date(showtime.start_time.replace(" ", "T"));
      const endObj = new Date(startObj.getTime() + movie.duration * 60000);
      const endHour = endObj.getHours();
      const endMinute = endObj.getMinutes();

      let totalMinsOfDay = endHour * 60 + endMinute;
      if (endHour >= 0 && endHour < 6) {
        totalMinsOfDay += 24 * 60;
      }

      if (user.dob) {
        const age =
          (Date.now() - new Date(user.dob).getTime()) /
          (1000 * 60 * 60 * 24 * 365.25);
        const limit22 = 22 * 60; // 22:00
        const limit23 = 23 * 60; // 23:00

        if (age < 13 && totalMinsOfDay > limit22) {
          toast({
            title: "Không thể chọn suất chiếu này",
            description:
              "Theo quy định, trẻ dưới 13 tuổi không được xem phim kết thúc sau 22h.",
            variant: "destructive",
          });
          return;
        }

        if (age < 16 && totalMinsOfDay > limit23) {
          toast({
            title: "Không thể chọn suất chiếu này",
            description:
              "Theo quy định, trẻ dưới 16 tuổi không được xem phim kết thúc sau 23h.",
            variant: "destructive",
          });
          return;
        }
      }
    }

    // Check age restriction
    if (movie.ageRating === "T18") {
      setPendingShowtime({ cinemaId, showtime });
      setShowAgeModal(true);
      return;
    }

    proceedToBooking(cinemaId, showtime);
  };

  const proceedToBooking = (cinemaId: string, showtime: Showtime) => {
    setSelectedMovie(movie.id);
    setSelectedCinema(cinemaId);
    setSelectedShowtime(showtime);
    navigate("/booking/seats");
  };

  const handleAgeConfirm = () => {
    if (pendingShowtime) {
      proceedToBooking(pendingShowtime.cinemaId, pendingShowtime.showtime);
    }
    setShowAgeModal(false);
  };

  const handleSubmitReview = async () => {
    if (!isAuthenticated) {
      toast({
        title: "Vui lòng đăng nhập",
        description: "Bạn cần đăng nhập để đánh giá phim",
        variant: "destructive",
      });
      navigate("/login");
      return;
    }

    if (rating === 0) {
      toast({
        title: "Chưa chọn đánh giá",
        description: "Vui lòng chọn số sao đánh giá",
        variant: "destructive",
      });
      return;
    }

    if (!reviewText.trim()) {
      toast({
        title: "Chưa có nội dung",
        description: "Vui lòng nhập nội dung đánh giá",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await apiCall<{
        success: boolean;
        message: string;
        data?: { review_id: number };
      }>(
        editingReviewId
          ? API_ENDPOINTS.REVIEW_DETAIL(parseInt(editingReviewId))
          : API_ENDPOINTS.CREATE_REVIEW,
        {
          method: editingReviewId ? "PUT" : "POST",
          body: JSON.stringify({
            movie_id: parseInt(id!),
            rating: rating,
            comment: reviewText.trim(),
          }),
        },
      );

      if (response.success) {
        toast({
          title: editingReviewId
            ? "Cập nhật đánh giá thành công"
            : "Gửi đánh giá thành công",
          description: editingReviewId
            ? "Đánh giá của bạn đã được cập nhật."
            : "Đánh giá của bạn đang được xem xét. Cảm ơn bạn!",
        });

        // Reset form
        setRating(0);
        setReviewText("");
        setEditingReviewId(null);

        // Refresh reviews list
        fetchReviews();
      } else {
        toast({
          title: "Không thể gửi đánh giá",
          description: response.message || "Đã có lỗi xảy ra",
          variant: "destructive",
        });
      }
    } catch (error: unknown) {
      console.error("Error submitting review:", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Không thể gửi đánh giá. Vui lòng thử lại sau.";
      toast({
        title: "Lỗi",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleDeleteReview = async (reviewId: string) => {
    if (!confirm("Bạn có chắc muốn xóa đánh giá này?")) return;

    try {
      const response = await apiCall<{ success: boolean; message: string }>(
        API_ENDPOINTS.REVIEW_DETAIL(parseInt(reviewId)),
        { method: "DELETE" },
      );

      if (response.success) {
        toast({
          title: "Xóa đánh giá thành công",
          description: "Đánh giá của bạn đã được xóa.",
        });
        if (editingReviewId === reviewId) {
          setEditingReviewId(null);
          setRating(0);
          setReviewText("");
        }
        fetchReviews();
      } else {
        toast({
          title: "Không thể xóa đánh giá",
          description: response.message || "Đã có lỗi xảy ra",
          variant: "destructive",
        });
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Không thể xóa đánh giá.";
      toast({
        title: "Lỗi",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("vi-VN", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const renderStars = (count: number, interactive: boolean = false) => {
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={cn(
              "w-5 h-5 transition-all",
              interactive && "cursor-pointer hover:scale-110",
              star <= (interactive ? hoverRating || rating : count)
                ? "fill-yellow-400 text-yellow-400"
                : "text-gray-300 dark:text-zinc-600",
            )}
            onClick={() => interactive && setRating(star)}
            onMouseEnter={() => interactive && setHoverRating(star)}
            onMouseLeave={() => interactive && setHoverRating(0)}
          />
        ))}
      </div>
    );
  };

  const hasAnyShowtimes =
    availableDates.length > 0 ||
    Object.values(showtimesByCinema).some((times) => times.length > 0);

  const getShowtimeTimestamp = (showtime: Showtime): number => {
    if (showtime.start_time) {
      const ts = new Date(showtime.start_time.replace(" ", "T")).getTime();
      if (!Number.isNaN(ts)) return ts;
    }

    const fallbackTs = new Date(
      `${showtime.date}T${showtime.time}:00`,
    ).getTime();
    return Number.isNaN(fallbackTs) ? 0 : fallbackTs;
  };

  const getShowtimeEndTime = (
    showtime: Showtime,
    duration?: number,
  ): string => {
    if (showtime.endTime) return showtime.endTime;

    const movieDuration = duration && duration > 0 ? duration : 120;

    if (showtime.start_time) {
      const start = new Date(showtime.start_time.replace(" ", "T"));
      if (!Number.isNaN(start.getTime())) {
        const end = new Date(start.getTime() + movieDuration * 60000);
        return `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`;
      }
    }

    if (showtime.time) {
      const parts = showtime.time.split(":").map(Number);
      if (
        parts.length >= 2 &&
        !Number.isNaN(parts[0]) &&
        !Number.isNaN(parts[1])
      ) {
        const totalMinutes = parts[0] * 60 + parts[1] + movieDuration;
        const endHours = Math.floor(totalMinutes / 60) % 24;
        const endMinutes = totalMinutes % 60;
        return `${String(endHours).padStart(2, "0")}:${String(endMinutes).padStart(2, "0")}`;
      }
    }

    return "";
  };

  const handleWatchTrailer = () => {
    if (!movie?.trailerUrl) return;

    const trailerUrl = normalizeTrailerUrl(movie.trailerUrl);
    const ytId = extractYouTubeId(trailerUrl);
    if (ytId) {
      setIsTrailerOpen(true);
      return;
    }

    try {
      const parsed = new URL(trailerUrl);
      if (!["http:", "https:"].includes(parsed.protocol)) {
        throw new Error("Invalid protocol");
      }
      window.open(parsed.toString(), "_blank", "noopener,noreferrer");
    } catch {
      toast({
        title: "URL trailer không hợp lệ",
        description: "Vui lòng kiểm tra lại link trailer của phim này.",
        variant: "destructive",
      });
    }
  };

  const youtubeId = movie.trailerUrl ? extractYouTubeId(movie.trailerUrl) : null;
  const ageConfig =
    AGE_RATING_CONFIG[movie.ageRating] || AGE_RATING_CONFIG.P;

  const displayRating =
    reviewStats && reviewStats.average_rating > 0
      ? reviewStats.average_rating
      : movie.rating && movie.rating > 0
        ? movie.rating
        : null;

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground transition-colors duration-300">
      <Header />

      <main className="flex-1 pb-16">
        {/* Cinematic Backdrop Hero Section */}
        <div className="relative w-full overflow-hidden bg-background">
          {/* Backdrop Image Container */}
          <div className="relative h-[320px] sm:h-[400px] lg:h-[460px] w-full overflow-hidden bg-muted">
            <img
              src={movie.backdrop || movie.poster}
              alt={movie.title}
              className="w-full h-full object-cover object-center brightness-90 dark:brightness-75 scale-105"
            />

            {/* Seamless Gradients into page background */}
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-background/70 via-transparent to-transparent hidden lg:block" />
            <div className="absolute top-0 inset-x-0 h-20 bg-gradient-to-b from-black/25 to-transparent" />
          </div>

          {/* Foreground Hero Content Card Overlay */}
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 -mt-56 sm:-mt-64 lg:-mt-72 relative z-20 pb-10">
            <div className="grid lg:grid-cols-[300px,1fr] xl:grid-cols-[320px,1fr] gap-6 lg:gap-10 items-start">
              {/* Poster Column */}
              <div className="relative group mx-auto lg:mx-0 w-full max-w-[280px] sm:max-w-[300px] lg:max-w-none">
                <div className="relative aspect-[2/3] w-full rounded-2xl overflow-hidden shadow-2xl border-2 border-border bg-muted">
                  <img
                    src={movie.poster}
                    alt={movie.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />

                  {/* Ribbon Badges on Poster */}
                  <div className="absolute top-3 left-3 flex flex-col gap-1.5">
                    <Badge
                      className={cn(
                        "text-xs font-bold px-2.5 py-0.5 rounded-lg shadow-md",
                        ageConfig.badgeClass,
                      )}
                    >
                      {movie.ageRating}
                    </Badge>
                    {movie.origin === "VN" && (
                      <Badge className="bg-red-600 text-white font-semibold text-[11px] px-2 py-0.5 rounded-lg shadow-md border-0">
                        🇻🇳 Phim Việt
                      </Badge>
                    )}
                  </div>

                  {/* Play Trailer Overlay on Poster */}
                  {movie.trailerUrl && (
                    <button
                      type="button"
                      onClick={handleWatchTrailer}
                      className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col items-center justify-center gap-2.5 text-white cursor-pointer backdrop-blur-[2px]"
                      title="Xem Trailer"
                    >
                      <div className="w-14 h-14 rounded-full bg-primary text-white flex items-center justify-center shadow-xl shadow-primary/50 hover:scale-110 active:scale-95 transition-transform">
                        <Play className="w-6 h-6 fill-white text-white" />
                      </div>
                      <span className="text-xs font-bold uppercase tracking-wider">
                        Xem Trailer
                      </span>
                    </button>
                  )}
                </div>
              </div>

              {/* Movie Info Column */}
              <div className="space-y-5 lg:pt-8 text-foreground">
                {/* Age & Status Tags */}
                <div className="flex flex-wrap items-center gap-2.5">
                  <span
                    className={cn(
                      "px-3 py-1 rounded-xl text-xs font-bold shadow-sm",
                      ageConfig.badgeClass,
                    )}
                  >
                    {ageConfig.label}
                  </span>

                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-card/80 border border-border text-xs font-medium text-foreground backdrop-blur-md">
                    <span
                      className={cn(
                        "w-2 h-2 rounded-full",
                        movie.isNowShowing
                          ? "bg-emerald-500 animate-pulse shadow-[0_0_8px_#10b981]"
                          : "bg-amber-500",
                      )}
                    />
                    <span>
                      {movie.isNowShowing ? "Đang Chiếu Tại Rạp" : "Sắp Chiếu"}
                    </span>
                  </span>

                  {movie.origin === "VN" && (
                    <span className="px-3 py-1 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 font-semibold text-xs">
                      Phim Việt Nam
                    </span>
                  )}
                </div>

                {/* Movie Titles */}
                <div>
                  <h1 className="text-2xl sm:text-3xl lg:text-4xl xl:text-5xl font-extrabold tracking-tight text-foreground leading-tight">
                    {movie.title}
                  </h1>
                  {movie.titleVi && movie.titleVi !== movie.title && (
                    <p className="text-base sm:text-lg text-muted-foreground mt-1 font-medium italic">
                      {movie.titleVi}
                    </p>
                  )}
                </div>

                {/* Age Restriction Alert if T18 */}
                {movie.ageRating === "T18" && (
                  <div className="flex items-start gap-3 p-3.5 sm:p-4 bg-destructive/10 border border-destructive/30 rounded-2xl">
                    <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs sm:text-sm font-bold text-destructive">
                        Cảnh báo T18: Phim chỉ dành cho khán giả từ đủ 18 tuổi trở lên
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Rạp có quyền từ chối phục vụ và không hoàn tiền nếu khán
                        giả không xuất trình được giấy tờ tùy thân hợp lệ khi vào
                        phòng chiếu.
                      </p>
                    </div>
                  </div>
                )}

                {/* Meta Highlights Bar (Duration, Release Date, Rating) */}
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-card/80 border border-border text-xs sm:text-sm text-foreground font-medium shadow-sm backdrop-blur-md">
                    <Clock className="w-4 h-4 text-primary" />
                    <span>{movie.duration} phút</span>
                  </div>

                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-card/80 border border-border text-xs sm:text-sm text-foreground font-medium shadow-sm backdrop-blur-md">
                    <Calendar className="w-4 h-4 text-primary" />
                    <span>
                      {new Date(movie.releaseDate).toLocaleDateString("vi-VN")}
                    </span>
                  </div>

                  {/* Clean Rating Badge - No Stray '0' bug */}
                  {displayRating !== null && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs sm:text-sm font-bold shadow-sm backdrop-blur-md">
                      <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                      <span>{displayRating.toFixed(1)} / 5</span>
                      {reviewStats && reviewStats.total_reviews > 0 && (
                        <span className="text-[11px] text-muted-foreground font-normal">
                          ({reviewStats.total_reviews} đánh giá)
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Genre Tags */}
                {movie.genre && movie.genre.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    {movie.genre.map((g) => (
                      <span
                        key={g}
                        className="px-3 py-1 rounded-xl text-xs font-semibold bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors shadow-sm"
                      >
                        {g}
                      </span>
                    ))}
                  </div>
                )}

                {/* Synopsis / Description */}
                <div className="p-4 sm:p-5 rounded-2xl bg-card border border-border text-foreground/90 text-sm sm:text-base shadow-sm">
                  <p className="whitespace-pre-line leading-relaxed font-normal">
                    {movie.description || "Nội dung phim đang được cập nhật..."}
                  </p>
                </div>

                {/* Cast & Crew Info Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="p-3.5 rounded-xl bg-card border border-border flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                      <Film className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-[11px] text-muted-foreground uppercase font-semibold">
                        Đạo diễn
                      </div>
                      <div className="text-sm font-bold text-foreground">
                        {movie.director || "Đang cập nhật"}
                      </div>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-card border border-border flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                      <Users className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] text-muted-foreground uppercase font-semibold">
                        Diễn viên
                      </div>
                      <div className="text-sm font-bold text-foreground truncate">
                        {movie.cast && movie.cast.length > 0
                          ? movie.cast.join(", ")
                          : "Đang cập nhật"}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Primary Action Row */}
                <div className="flex flex-wrap items-center gap-3 pt-3">
                  {movie.isNowShowing || hasAnyShowtimes ? (
                    <Button
                      size="lg"
                      onClick={() => {
                        const el = document.getElementById("showtimes-section");
                        if (el) {
                          el.scrollIntoView({ behavior: "smooth" });
                        }
                      }}
                      className="h-12 px-7 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-sm sm:text-base flex items-center gap-2.5 shadow-lg shadow-primary/25 hover:scale-[1.02] active:scale-95 transition-all"
                    >
                      <Ticket className="w-4 h-4" />
                      <span>Đặt Vé Ngay</span>
                    </Button>
                  ) : (
                    <Button
                      size="lg"
                      disabled
                      className="h-12 px-7 rounded-xl bg-muted text-muted-foreground font-semibold text-sm cursor-not-allowed"
                    >
                      Phim Sắp Chiếu
                    </Button>
                  )}

                  {movie.trailerUrl && (
                    <Button
                      size="lg"
                      variant="outline"
                      onClick={handleWatchTrailer}
                      className="h-12 px-6 rounded-xl border-border bg-card hover:bg-muted text-foreground font-semibold text-sm flex items-center gap-2.5 shadow-sm hover:scale-[1.02] active:scale-95 transition-all"
                    >
                      <div className="w-5 h-5 rounded-full border border-primary flex items-center justify-center shrink-0">
                        <Play className="w-2.5 h-2.5 fill-primary text-primary" />
                      </div>
                      <span>Xem Trailer</span>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Body Content (Showtimes & Reviews) */}
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 mt-4 space-y-12">
          {/* Showtimes Section */}
          {(movie.isNowShowing || loadingShowtimes || hasAnyShowtimes) && (
            <section id="showtimes-section" className="scroll-mt-24 pt-6">
              <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                    <Calendar className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-foreground">
                      Lịch Chiếu Phim
                    </h2>
                    <p className="text-xs sm:text-sm text-muted-foreground font-light">
                      Chọn ngày xem và cụm rạp Galaxy gần bạn nhất
                    </p>
                  </div>
                </div>
              </div>

              {/* Date Picker Cards */}
              <div className="flex gap-2.5 overflow-x-auto pb-4 mb-6 scrollbar-thin">
                {dates.map((date) => {
                  const isSelected = selectedDate === date.value;

                  return (
                    <button
                      key={date.value}
                      type="button"
                      onClick={() => setSelectedDate(date.value)}
                      className={cn(
                        "relative flex flex-col items-center justify-center min-w-[82px] px-3.5 py-3 rounded-2xl transition-all duration-200 cursor-pointer border shrink-0",
                        isSelected
                          ? "bg-primary text-primary-foreground border-primary shadow-lg shadow-primary/25 scale-[1.02]"
                          : "bg-card hover:bg-muted text-foreground border-border hover:border-primary/40",
                      )}
                    >
                      <span className="text-[11px] uppercase font-bold tracking-wider opacity-85">
                        {date.dayName}
                      </span>
                      <span className="text-xl font-extrabold my-0.5">
                        {date.day}
                      </span>
                      <span className="text-[11px] opacity-75">
                        Tháng {date.month}
                      </span>
                      {date.hasShowtimes && (
                        <span
                          className={cn(
                            "w-1.5 h-1.5 rounded-full mt-1",
                            isSelected ? "bg-white" : "bg-emerald-500",
                          )}
                          title="Có suất chiếu"
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Helpful notification if selected date has no showtimes */}
              {!loadingShowtimes &&
                totalShowtimesForSelectedDate === 0 &&
                apiCinemas.length > 0 && (
                  <div className="mb-6 p-4 sm:p-5 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                        <Info className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="font-bold text-sm sm:text-base text-foreground">
                          {selectedDate === todayStr
                            ? "Hôm nay chưa có suất chiếu cho phim này"
                            : `Ngày ${selectedDate.split("-").reverse().join("/")} chưa có suất chiếu`}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {nextAvailableDate
                            ? `Suất chiếu gần nhất sẽ có từ ${
                                nextAvailableDate ===
                                dates.find((d) => d.dayName === "Ngày mai")
                                  ?.value
                                  ? "Ngày mai"
                                  : `ngày ${nextAvailableDate.split("-").reverse().join("/")}`
                              }. Bạn có thể chọn ngày trên thanh lịch chiếu.`
                            : "Vui lòng chọn ngày khác hoặc theo dõi thêm thông báo từ rạp."}
                        </p>
                      </div>
                    </div>
                    {nextAvailableDate && (
                      <Button
                        type="button"
                        onClick={() => setSelectedDate(nextAvailableDate)}
                        className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold rounded-xl text-xs sm:text-sm h-10 px-5 shrink-0 shadow-md shadow-primary/20"
                      >
                        Xem suất chiếu ngày{" "}
                        {nextAvailableDate
                          .split("-")
                          .reverse()
                          .slice(0, 2)
                          .join("/")}
                      </Button>
                    )}
                  </div>
                )}

              {/* Cinema List Accordion */}
              {loadingShowtimes ? (
                <div className="flex flex-col items-center justify-center py-16 bg-card rounded-2xl border border-border">
                  <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
                  <span className="text-sm text-muted-foreground">
                    Đang tải lịch chiếu theo ngày đã chọn...
                  </span>
                </div>
              ) : apiCinemas.length === 0 ? (
                <div className="text-center py-14 bg-card rounded-2xl border border-border p-6">
                  <MapPin className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-foreground font-semibold">
                    Chưa có rạp nào mở bán vé cho ngày này
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Vui lòng chọn ngày khác để xem thêm suất chiếu.
                  </p>
                </div>
              ) : (
                <Accordion
                  type="multiple"
                  defaultValue={apiCinemas.map((c) => String(c.id))}
                  className="space-y-4"
                >
                  {apiCinemas.map((cinema) => {
                    const cinemaKey = String(cinema.id);
                    const cinemaShowtimes = showtimesByCinema[cinemaKey] || [];
                    const hasShowtimes = cinemaShowtimes.length > 0;

                    return (
                      <AccordionItem
                        key={cinemaKey}
                        value={cinemaKey}
                        className="bg-card rounded-2xl border border-border overflow-hidden shadow-sm transition-colors"
                      >
                        <AccordionTrigger className="px-5 py-4 hover:no-underline hover:bg-muted/40 transition-colors">
                          <div className="flex items-center justify-between w-full pr-4 text-left gap-4">
                            <div className="flex items-center gap-3.5">
                              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                                <MapPin className="w-5 h-5" />
                              </div>
                              <div>
                                <p className="font-bold text-base text-foreground">
                                  {cinema.name}
                                </p>
                                <p className="text-xs text-muted-foreground line-clamp-1 font-normal">
                                  {cinema.address}
                                </p>
                              </div>
                            </div>

                            <Badge
                              variant={hasShowtimes ? "default" : "outline"}
                              className={cn(
                                "text-xs rounded-lg shrink-0",
                                hasShowtimes
                                  ? "bg-primary text-primary-foreground"
                                  : "text-muted-foreground border-border",
                              )}
                            >
                              {hasShowtimes
                                ? `${cinemaShowtimes.length} suất chiếu`
                                : "0 suất chiếu"}
                            </Badge>
                          </div>
                        </AccordionTrigger>

                        <AccordionContent className="px-5 pb-5 pt-1">
                          {hasShowtimes ? (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                              {cinemaShowtimes.map((showtime) => {
                                const isPastShowtime =
                                  getShowtimeTimestamp(showtime) <= Date.now();
                                const endTime = getShowtimeEndTime(
                                  showtime,
                                  movie.duration,
                                );

                                return (
                                  <button
                                    key={showtime.id}
                                    type="button"
                                    disabled={isPastShowtime}
                                    onClick={() =>
                                      handleSelectShowtime(cinemaKey, showtime)
                                    }
                                    className={cn(
                                      "group relative flex flex-col items-center justify-center py-2.5 px-3 rounded-xl border text-center transition-all duration-200",
                                      isPastShowtime
                                        ? "opacity-40 cursor-not-allowed bg-muted/40 border-border text-muted-foreground"
                                        : "bg-card hover:bg-primary hover:text-primary-foreground border-border hover:border-primary hover:shadow-md hover:scale-[1.03] active:scale-95 text-foreground cursor-pointer",
                                    )}
                                  >
                                    <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
                                      <span className="text-base font-extrabold tracking-tight">
                                        {showtime.time}
                                      </span>
                                      {endTime && (
                                        <span className="text-xs font-semibold opacity-75">
                                          ~ {endTime}
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-[11px] opacity-75 font-medium truncate max-w-full">
                                      {showtime.hall_name || "2D Phụ Đề"}
                                    </span>
                                    {isPastShowtime && (
                                      <span className="text-[9px] text-destructive font-semibold uppercase mt-0.5">
                                        Đã qua giờ
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="py-4 text-center text-xs text-muted-foreground italic">
                              Rạp này hiện chưa có suất chiếu phù hợp cho ngày đã chọn.
                            </div>
                          )}
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              )}
            </section>
          )}

          {/* Reviews Section */}
          <section className="pt-8 border-t border-border">
            <div className="mb-8 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-foreground">
                    Đánh Giá Từ Khán Giả
                  </h2>
                  <p className="text-xs sm:text-sm text-muted-foreground font-light">
                    Chia sẻ và xem cảm nhận của cộng đồng người xem phim
                  </p>
                </div>
              </div>
            </div>

            {/* Review Statistics Card */}
            {loadingReviews ? (
              <div className="bg-card rounded-2xl border border-border p-8 mb-8 flex justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : reviewStats &&
              reviewStats.average_rating &&
              reviews.length > 0 ? (
              <div className="bg-card rounded-2xl border border-border p-6 sm:p-8 mb-8 shadow-sm">
                <div className="flex flex-col md:flex-row items-center gap-8">
                  {/* Left Big Score */}
                  <div className="text-center md:border-r md:border-border md:pr-8 shrink-0">
                    <div className="text-5xl sm:text-6xl font-black text-primary mb-2">
                      {reviewStats.average_rating.toFixed(1)}
                    </div>
                    <div className="flex justify-center mb-2">
                      {renderStars(Math.round(reviewStats.average_rating))}
                    </div>
                    <p className="text-xs sm:text-sm text-muted-foreground font-medium">
                      Dựa trên {reviewStats.total_reviews} lượt đánh giá
                    </p>
                  </div>

                  {/* Right Rating Distribution Bars */}
                  <div className="flex-1 space-y-2.5 w-full">
                    {[5, 4, 3, 2, 1].map((star) => {
                      const count =
                        reviewStats.rating_distribution[
                          star.toString() as keyof typeof reviewStats.rating_distribution
                        ] || 0;
                      const percentage =
                        reviewStats.total_reviews > 0
                          ? (count / reviewStats.total_reviews) * 100
                          : 0;
                      return (
                        <div key={star} className="flex items-center gap-3 text-xs sm:text-sm">
                          <span className="w-9 font-semibold text-foreground flex items-center gap-1">
                            <span>{star}</span>
                            <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                          </span>
                          <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-amber-400 rounded-full transition-all duration-500"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground w-12 text-right">
                            {count} lượt
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : null}

            {/* Write Review Form */}
            {isAuthenticated ? (
              <div
                id="review-form"
                className="bg-card rounded-2xl border border-border p-5 sm:p-6 mb-8 shadow-sm"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-lg text-foreground flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-primary" />
                    <span>
                      {editingReviewId
                        ? "Sửa đánh giá của bạn"
                        : "Viết cảm nhận của bạn"}
                    </span>
                  </h3>
                  {editingReviewId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setEditingReviewId(null);
                        setRating(0);
                        setReviewText("");
                      }}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Hủy sửa
                    </Button>
                  )}
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-xs sm:text-sm font-semibold text-foreground mb-2 block">
                      Đánh giá số sao:
                    </label>
                    {renderStars(rating, true)}
                  </div>

                  <div>
                    <label className="text-xs sm:text-sm font-semibold text-foreground mb-2 block">
                      Nội dung bình luận:
                    </label>
                    <Textarea
                      placeholder="Bộ phim mang lại cho bạn cảm xúc gì? Diễn xuất, âm thanh, kỹ xảo ra sao..."
                      value={reviewText}
                      onChange={(e) => setReviewText(e.target.value)}
                      rows={4}
                      className="resize-none rounded-xl bg-background border-input text-sm"
                    />
                  </div>

                  <Button
                    onClick={handleSubmitReview}
                    className="w-full sm:w-auto px-6 h-11 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm flex items-center gap-2"
                    disabled={rating === 0 || !reviewText.trim()}
                  >
                    <Send className="w-4 h-4" />
                    <span>
                      {editingReviewId ? "Cập nhật đánh giá" : "Gửi đánh giá"}
                    </span>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="bg-card rounded-2xl border border-border p-6 sm:p-8 mb-8 text-center shadow-sm">
                <MessageSquare className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-foreground font-semibold mb-1">
                  Bạn đã thưởng thức bộ phim này?
                </p>
                <p className="text-xs text-muted-foreground mb-5 max-w-sm mx-auto">
                  Đăng nhập tài khoản Galaxy Cinema để gửi đánh giá và nhận điểm
                  thưởng thành viên.
                </p>
                <Button
                  onClick={() => navigate("/login")}
                  className="rounded-xl px-6 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold"
                >
                  Đăng nhập để đánh giá
                </Button>
              </div>
            )}

            {/* Reviews List */}
            <div className="space-y-4">
              {loadingReviews ? (
                <div className="text-center py-10">
                  <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
                </div>
              ) : reviews.length === 0 ? (
                <div className="text-center py-12 bg-card rounded-2xl border border-border p-6 text-muted-foreground text-sm">
                  Chưa có đánh giá nào cho phim này. Hãy là người đầu tiên chia sẻ cảm nhận!
                </div>
              ) : (
                reviews.map((review) => (
                  <div
                    key={review.id}
                    className="bg-card rounded-2xl border border-border p-5 sm:p-6 shadow-sm space-y-3"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <Avatar className="w-10 h-10 border border-border">
                          <AvatarImage src={review.userAvatar} />
                          <AvatarFallback className="bg-primary/10 text-primary font-bold">
                            {review.userName.charAt(0).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-bold text-sm sm:text-base text-foreground">
                            {review.userName}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatDateTime(review.createdAt)}
                          </div>
                        </div>
                      </div>

                      {/* Stars */}
                      <div className="shrink-0">
                        {renderStars(review.rating)}
                      </div>
                    </div>

                    <p className="text-sm text-foreground/90 leading-relaxed pt-1">
                      {review.comment}
                    </p>

                    {/* Review Actions */}
                    <div className="flex items-center justify-between pt-2 border-t border-border/60 text-xs">
                      <span className="text-muted-foreground text-[11px]">
                        Khán giả Galaxy Cinema
                      </span>

                      {user && String(review.userId) === user.id && (
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-muted-foreground hover:text-primary rounded-lg"
                            onClick={() => {
                              setEditingReviewId(review.id);
                              setRating(review.rating);
                              setReviewText(review.comment);
                              const el = document.getElementById("review-form");
                              if (el) {
                                el.scrollIntoView({ behavior: "smooth" });
                              }
                            }}
                          >
                            <Pencil className="w-3 h-3 mr-1" />
                            Sửa
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-muted-foreground hover:text-destructive rounded-lg"
                            onClick={() => handleDeleteReview(review.id)}
                          >
                            <Trash2 className="w-3 h-3 mr-1" />
                            Xóa
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </main>

      {/* Embedded YouTube Trailer Modal */}
      <RecommendationsSection movieId={Number(movie.id)} />

      {youtubeId && (
        <Dialog open={isTrailerOpen} onOpenChange={setIsTrailerOpen}>
          <DialogContent className="max-w-4xl p-0 overflow-hidden bg-black/95 border border-white/20 aspect-video rounded-2xl shadow-2xl">
            <iframe
              src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1`}
              title={movie.title}
              className="w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </DialogContent>
        </Dialog>
      )}

      {/* Age Restriction T18 Confirmation Modal */}
      <Dialog open={showAgeModal} onOpenChange={setShowAgeModal}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <div className="flex justify-center mb-3">
              <div className="w-14 h-14 bg-destructive/10 rounded-2xl flex items-center justify-center">
                <AlertTriangle className="w-7 h-7 text-destructive" />
              </div>
            </div>
            <DialogTitle className="text-center text-lg sm:text-xl font-bold">
              Xác Nhận Độ Tuổi (T18)
            </DialogTitle>
            <DialogDescription className="text-center text-xs sm:text-sm text-muted-foreground pt-1">
              Phim này được phân loại <strong className="text-destructive font-bold">T18</strong> - chỉ dành cho khán giả từ đủ 18 tuổi trở lên.
              Vui lòng mang theo CMND/CCCD để nhân viên rạp xác minh trước khi vào phòng chiếu.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setShowAgeModal(false)}
              className="flex-1 rounded-xl text-xs sm:text-sm h-10"
            >
              Quay Lại
            </Button>
            <Button
              onClick={handleAgeConfirm}
              className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl text-xs sm:text-sm h-10"
            >
              Tôi Đã Đủ 18 Tuổi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
};

export default MovieDetailPage;
