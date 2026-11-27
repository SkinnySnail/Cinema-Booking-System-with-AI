import React, { useState, useEffect, useMemo } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Calendar,
  MapPin,
  Clock,
  Search,
  Loader2,
  Film,
  Info,
  ChevronRight,
  Ticket,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { API_ENDPOINTS, apiCall, getImageUrl } from "@/lib/api";
import { isMovieVisibleToUser } from "@/lib/validation";
import { useAuth, useBooking } from "@/contexts/AppContext";
import { useToast } from "@/hooks/use-toast";
import { Showtime } from "@/types/cinema";

interface Cinema {
  id: number;
  name: string;
  address: string;
}

interface ShowtimeAPI {
  id: number;
  movie_id: number;
  cinema_hall_id: number;
  start_time: string;
  end_time: string;
  base_price?: number;
  movie_title: string;
  poster_url?: string;
  duration_minutes?: number;
  age_rating?: string;
  hall_name: string;
  cinema_id: number;
  cinema_name: string;
}

const getAgeRatingBadge = (rating?: string) => {
  if (!rating) return null;
  const classes: Record<string, string> = {
    P: "bg-emerald-600/90 text-white border-emerald-500/40",
    K: "bg-blue-600/90 text-white border-blue-500/40",
    T13: "bg-amber-500/90 text-black border-amber-400/40",
    T16: "bg-orange-600/90 text-white border-orange-500/40",
    T18: "bg-rose-600/90 text-white border-rose-500/40",
    C: "bg-zinc-700/90 text-white border-zinc-600/40",
  };
  const cls = classes[rating] || "bg-zinc-700/90 text-white border-zinc-600/40";
  return (
    <span
      className={`px-2 py-0.5 rounded text-[11px] font-black uppercase tracking-wider border shadow-sm ${cls}`}
    >
      {rating}
    </span>
  );
};

const SchedulePoster3D: React.FC<{
  posterSrc: string;
  title: string;
  movieId: number;
  ageRating?: string;
}> = ({ posterSrc, title, movieId, ageRating }) => {
  const cardRef = React.useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = React.useState({ x: 0, y: 0, glareX: 50, glareY: 50 });
  const [isHovered, setIsHovered] = React.useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const rotateX = ((y - centerY) / centerY) * -7;
    const rotateY = ((x - centerX) / centerX) * 7;

    setTilt({
      x: rotateX,
      y: rotateY,
      glareX: (x / rect.width) * 100,
      glareY: (y / rect.height) * 100,
    });
  };

  const handleMouseEnter = () => setIsHovered(true);
  const handleMouseLeave = () => {
    setIsHovered(false);
    setTilt({ x: 0, y: 0, glareX: 50, glareY: 50 });
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        transform: isHovered
          ? `perspective(800px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale3d(1.025, 1.025, 1.025)`
          : "perspective(800px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)",
        transition: isHovered
          ? "transform 0.1s cubic-bezier(0.2, 0, 0, 1), box-shadow 0.2s"
          : "transform 0.4s ease-out, box-shadow 0.4s ease-out",
        transformStyle: "preserve-3d",
      }}
      className="relative rounded-2xl overflow-hidden aspect-[2/3] bg-zinc-950 border border-border/70 hover:border-primary/50 shadow-md hover:shadow-[0_16px_32px_rgba(0,0,0,0.45)] select-none group/poster cursor-pointer"
    >
      {/* Specular Glare Highlight */}
      {isHovered && (
        <div
          className="absolute inset-0 pointer-events-none z-30 opacity-20 transition-opacity duration-200"
          style={{
            background: `radial-gradient(circle at ${tilt.glareX}% ${tilt.glareY}%, rgba(255,255,255,0.4) 0%, transparent 65%)`,
          }}
        />
      )}

      <img
        src={posterSrc}
        alt={title}
        className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover/poster:scale-105"
      />

      {/* Floating Badge (Age Rating) with 3D Depth */}
      {ageRating && (
        <div
          className="absolute top-2.5 left-2.5 z-20 pointer-events-none transition-transform duration-300"
          style={{ transform: isHovered ? "translateZ(16px)" : "translateZ(0)" }}
        >
          {getAgeRatingBadge(ageRating)}
        </div>
      )}

      {/* Hover Action Overlay with 3D Depth */}
      <Link
        to={`/movie/${movieId}`}
        className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent opacity-0 group-hover/poster:opacity-100 transition-all duration-300 flex items-center justify-center p-3 z-20"
      >
        <span
          className="px-3.5 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-bold shadow-lg shadow-primary/30 inline-flex items-center gap-1.5 transition-transform duration-300"
          style={{ transform: isHovered ? "translateZ(24px)" : "translateZ(0)" }}
        >
          <span>Chi tiết</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </span>
      </Link>
    </div>
  );
};

const SchedulePage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const { isAuthenticated, user } = useAuth();
  const { setSelectedMovie, setSelectedShowtime } = useBooking();

  const getLocalDateString = (d: Date) => {
    const tzOffsetMs = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tzOffsetMs).toISOString().split("T")[0];
  };

  const [selectedDate, setSelectedDate] = useState<string>(
    getLocalDateString(new Date()),
  );
  const cinemaParam =
    searchParams.get("cinema") || searchParams.get("cinema_id") || "all";
  const [selectedCinema, setSelectedCinema] = useState<string>(cinemaParam);

  // Sync if URL search params change
  useEffect(() => {
    const currentParam =
      searchParams.get("cinema") || searchParams.get("cinema_id");
    if (currentParam && currentParam !== selectedCinema) {
      setSelectedCinema(currentParam);
    }
  }, [searchParams, selectedCinema]);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [cinemas, setCinemas] = useState<Cinema[]>([]);
  const [showtimes, setShowtimes] = useState<ShowtimeAPI[]>([]);
  const [loading, setLoading] = useState(false);

  // Generate dates for the next 7 days
  const dates = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() + i);
      return date;
    });
  }, []);

  // Fetch cinemas on mount
  useEffect(() => {
    const fetchCinemas = async () => {
      try {
        const response = await apiCall<{
          success: boolean;
          data: { cinemas: Cinema[] };
        }>(API_ENDPOINTS.CINEMAS);
        setCinemas(response.data?.cinemas || []);
      } catch (error) {
        console.error("Failed to fetch cinemas:", error);
        toast({
          title: "Lỗi",
          description: "Không thể tải danh sách rạp.",
          variant: "destructive",
        });
      }
    };

    fetchCinemas();
  }, [toast]);

  // Fetch showtimes when date or cinema changes
  useEffect(() => {
    const fetchShowtimes = async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        params.append("date", selectedDate);
        if (selectedCinema !== "all") {
          params.append("cinema_id", selectedCinema);
        }

        const response = await apiCall<{
          success: boolean;
          data: { showtimes: ShowtimeAPI[] };
        }>(`${API_ENDPOINTS.SHOWTIMES}?${params.toString()}`);
        const visibleShowtimes = (response.data?.showtimes || []).filter((st) =>
          isMovieVisibleToUser(st.age_rating, user),
        );
        setShowtimes(visibleShowtimes);
      } catch (error) {
        console.error("Failed to fetch showtimes:", error);
        toast({
          title: "Lỗi",
          description: "Không thể tải lịch chiếu.",
          variant: "destructive",
        });
        setShowtimes([]);
      } finally {
        setLoading(false);
      }
    };

    fetchShowtimes();
  }, [selectedDate, selectedCinema, toast, user]);

  const getDayName = (date: Date) => {
    const days = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
    return days[date.getDay()];
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  // Group showtimes by movie, then under each movie by cinema
  const filteredAndGroupedMovies = useMemo(() => {
    const filteredShowtimes = searchQuery.trim()
      ? showtimes.filter((st) =>
          st.movie_title.toLowerCase().includes(searchQuery.toLowerCase()),
        )
      : showtimes;

    const movieMap: Record<
      number,
      {
        movie: ShowtimeAPI;
        cinemas: Record<
          number,
          {
            cinemaId: number;
            cinemaName: string;
            showtimes: ShowtimeAPI[];
          }
        >;
      }
    > = {};

    filteredShowtimes.forEach((st) => {
      if (!movieMap[st.movie_id]) {
        movieMap[st.movie_id] = {
          movie: st,
          cinemas: {},
        };
      }

      if (!movieMap[st.movie_id].cinemas[st.cinema_id]) {
        movieMap[st.movie_id].cinemas[st.cinema_id] = {
          cinemaId: st.cinema_id,
          cinemaName: st.cinema_name,
          showtimes: [],
        };
      }

      movieMap[st.movie_id].cinemas[st.cinema_id].showtimes.push(st);
    });

    return Object.values(movieMap);
  }, [showtimes, searchQuery]);

  const handleShowtimeClick = (
    e: React.MouseEvent,
    showtime: ShowtimeAPI,
    movie: ShowtimeAPI,
    isPastShowtime: boolean,
  ) => {
    if (isPastShowtime) {
      e.preventDefault();
      toast({
        title: "Suất chiếu đã qua",
        description: "Vui lòng chọn suất chiếu khác còn hiệu lực.",
        variant: "destructive",
      });
      return;
    }

    if (!isAuthenticated) {
      e.preventDefault();
      toast({
        title: "Vui lòng đăng nhập",
        description:
          "Bạn cần đăng nhập để đặt vé. Khách chỉ có thể xem lịch chiếu.",
        variant: "destructive",
      });
      navigate("/login");
      return;
    }

    const showtimeTime = new Date(showtime.start_time).toLocaleTimeString(
      "vi-VN",
      {
        hour: "2-digit",
        minute: "2-digit",
      },
    );

    setSelectedMovie(String(movie.movie_id));
    const showtimePayload: Showtime = {
      id: String(showtime.id),
      movieId: String(showtime.movie_id),
      cinemaId: String(showtime.cinema_id),
      roomId: String(showtime.cinema_hall_id),
      time: showtimeTime,
      date: showtime.start_time.split(" ")[0],
      start_time: showtime.start_time,
      hall: showtime.hall_name,
      cinema: showtime.cinema_name,
      hall_name: showtime.hall_name,
      cinema_name: showtime.cinema_name,
      endTime: new Date(
        new Date(showtime.start_time).getTime() +
          (movie.duration_minutes || 0) * 60000,
      ).toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      price: {
        standard: Number(showtime.base_price) || 0,
        vip: Number(showtime.base_price) || 0,
        couple: Number(showtime.base_price) || 0,
      },
      availableSeats: 0,
      totalSeats: 0,
    };
    setSelectedShowtime(showtimePayload);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />

      <main className="flex-1 pb-16 relative">
        {/* Ambient Top Glow for high-end cinematic feel */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 max-w-5xl h-64 bg-primary/[0.04] blur-3xl pointer-events-none -z-10 rounded-full" />

        {/* Hero Header Area */}
        <div className="border-b border-border/40 bg-card/40 backdrop-blur-sm">
          <div className="container mx-auto px-4 py-8 sm:py-10">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-wider mb-3 shadow-xs">
                  <Film className="w-3.5 h-3.5" />
                  <span>Galaxy Cinema Schedule</span>
                </div>
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-foreground tracking-tight">
                  Lịch Chiếu Phim
                </h1>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1.5 max-w-xl">
                  Chọn rạp và suất chiếu phù hợp nhất để thưởng thức các siêu phẩm điện ảnh đỉnh cao hôm nay.
                </p>
              </div>

              {/* Quick Search */}
              <div className="relative w-full md:w-72">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Tìm phim theo tên..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-11 rounded-xl bg-background/80 border-border/70 focus:border-primary text-xs sm:text-sm transition-all shadow-xs"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 pt-8">
          {/* Section 1: Modern Date Selector */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm sm:text-base font-bold text-foreground flex items-center gap-2">
                <Calendar className="w-4 h-4 text-primary" />
                <span>Chọn Ngày Chiếu</span>
              </h2>
              <span className="text-xs text-muted-foreground hidden sm:inline">
                Lịch chiếu được cập nhật liên tục 7 ngày
              </span>
            </div>

            <div className="flex gap-2.5 sm:gap-3 overflow-x-auto pb-3 pt-1 scrollbar-none">
              {dates.map((date) => {
                const dateStr = getLocalDateString(date);
                const isSelected = selectedDate === dateStr;
                const isCurrentDay = isToday(date);

                return (
                  <button
                    key={dateStr}
                    type="button"
                    onClick={() => setSelectedDate(dateStr)}
                    className={`relative flex-shrink-0 flex flex-col items-center justify-center w-20 sm:w-24 py-3 sm:py-3.5 px-2 rounded-2xl border transition-all duration-200 select-none ${
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground shadow-[0_6px_20px_rgba(255,107,0,0.32)] scale-[1.04] ring-2 ring-primary/20"
                        : "border-border/70 bg-card hover:border-primary/40 hover:bg-card/90 hover:-translate-y-0.5 hover:shadow-sm text-foreground active:scale-95"
                    }`}
                  >
                    <span
                      className={`text-[11px] font-bold uppercase tracking-wider mb-1 ${
                        isSelected
                          ? "text-primary-foreground/90"
                          : isCurrentDay
                            ? "text-primary font-black"
                            : "text-muted-foreground"
                      }`}
                    >
                      {isCurrentDay ? "Hôm nay" : getDayName(date)}
                    </span>
                    <span className="text-2xl sm:text-3xl font-black tracking-tight leading-none mb-1">
                      {date.getDate()}
                    </span>
                    <span
                      className={`text-[11px] ${
                        isSelected
                          ? "text-primary-foreground/80 font-medium"
                          : "text-muted-foreground"
                      }`}
                    >
                      {date.toLocaleString("vi-VN", { month: "short" })}
                    </span>

                    {/* Today indicator dot when not selected */}
                    {isCurrentDay && !isSelected && (
                      <span className="absolute bottom-1 w-1 h-1 rounded-full bg-primary" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 2: Cinema Filter Tabs */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm sm:text-base font-bold text-foreground flex items-center gap-2">
                <MapPin className="w-4 h-4 text-primary" />
                <span>Chọn Cụm Rạp</span>
              </h2>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none items-center">
              <button
                type="button"
                onClick={() => {
                  setSelectedCinema("all");
                  setSearchParams((prev) => {
                    const p = new URLSearchParams(prev);
                    p.delete("cinema");
                    p.delete("cinema_id");
                    return p;
                  });
                }}
                className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all duration-200 border flex items-center gap-2 whitespace-nowrap active:scale-95 ${
                  selectedCinema === "all"
                    ? "bg-primary text-primary-foreground border-primary shadow-[0_4px_14px_rgba(255,107,0,0.25)] scale-[1.02]"
                    : "bg-card text-foreground border-border/70 hover:border-primary/40 hover:bg-card/80 hover:-translate-y-0.5"
                }`}
              >
                <MapPin className="w-3.5 h-3.5" />
                <span>Tất cả rạp ({cinemas.length})</span>
              </button>

              {cinemas.map((cinema) => {
                const isSelected = selectedCinema === cinema.id.toString();
                return (
                  <button
                    key={cinema.id}
                    type="button"
                    onClick={() => {
                      setSelectedCinema(cinema.id.toString());
                      setSearchParams((prev) => {
                        const p = new URLSearchParams(prev);
                        p.set("cinema", cinema.id.toString());
                        return p;
                      });
                    }}
                    className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all duration-200 border flex items-center gap-2 whitespace-nowrap active:scale-95 ${
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary shadow-[0_4px_14px_rgba(255,107,0,0.25)] scale-[1.02]"
                        : "bg-card text-foreground border-border/70 hover:border-primary/40 hover:bg-card/80 hover:-translate-y-0.5"
                    }`}
                  >
                    <MapPin className="w-3.5 h-3.5 opacity-70" />
                    <span>{cinema.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-20 bg-card/40 rounded-3xl border border-border/40 my-6 animate-fade-in">
              <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
              <p className="text-sm font-medium text-muted-foreground">
                Đang cập nhật danh sách suất chiếu...
              </p>
            </div>
          )}

          {/* No Showtimes State */}
          {!loading && filteredAndGroupedMovies.length === 0 && (
            <div className="text-center py-20 px-4 bg-card/40 rounded-3xl border border-border/40 my-6 animate-fade-in">
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-muted flex items-center justify-center text-muted-foreground">
                <Info className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-1">
                Không tìm thấy suất chiếu phù hợp
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground max-w-md mx-auto mb-5">
                Hiện tại rạp chưa có lịch chiếu cho các tiêu chí bạn đã chọn. Vui lòng chọn một ngày khác hoặc chọn tất cả cụm rạp.
              </p>
              <div className="flex justify-center gap-3">
                {selectedCinema !== "all" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedCinema("all")}
                    className="rounded-xl text-xs hover:border-primary/50"
                  >
                    Xem tất cả rạp
                  </Button>
                )}
                {searchQuery && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSearchQuery("")}
                    className="rounded-xl text-xs hover:border-primary/50"
                  >
                    Xóa bộ lọc tìm kiếm
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Section 3: Movies & Grouped Showtimes List with Staggered Entrance */}
          {!loading && filteredAndGroupedMovies.length > 0 && (
            <div
              key={`${selectedDate}-${selectedCinema}`}
              className="space-y-6 animate-fade-in"
            >
              {filteredAndGroupedMovies.map(({ movie, cinemas: groupedCinemas }) => {
                const posterSrc = movie.poster_url
                  ? getImageUrl(movie.poster_url)
                  : "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=300&h=450&fit=crop";

                const cinemaList = Object.values(groupedCinemas);

                return (
                  <div
                    key={movie.movie_id}
                    className="relative rounded-3xl border border-border/70 bg-card/90 backdrop-blur-md overflow-hidden shadow-sm hover:shadow-xl hover:border-primary/30 transition-all duration-300 group"
                  >
                    {/* Faint subtle top accent gradient */}
                    <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-primary/30 to-transparent opacity-60 group-hover:opacity-100 transition-opacity" />

                    <div className="p-5 sm:p-6 flex flex-col md:flex-row gap-6">
                      {/* Movie Poster with 3D Mouse Tilt & Glare */}
                      <div className="w-32 sm:w-44 flex-shrink-0 mx-auto md:mx-0">
                        <SchedulePoster3D
                          posterSrc={posterSrc}
                          title={movie.movie_title}
                          movieId={movie.movie_id}
                          ageRating={movie.age_rating}
                        />
                      </div>

                      {/* Movie Info & Grouped Showtimes */}
                      <div className="flex-1 flex flex-col justify-between">
                        <div>
                          {/* Title & Badges */}
                          <div className="flex flex-wrap items-center gap-2.5 mb-2">
                            {getAgeRatingBadge(movie.age_rating)}
                            <Link to={`/movie/${movie.movie_id}`} className="group/title">
                              <h3 className="text-xl sm:text-2xl font-black text-foreground group-hover/title:text-primary transition-colors tracking-tight">
                                {movie.movie_title}
                              </h3>
                            </Link>
                          </div>

                          {/* Movie Meta Information */}
                          <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm text-muted-foreground mb-6">
                            {movie.duration_minutes && (
                              <span className="inline-flex items-center gap-1.5 font-medium">
                                <Clock className="w-4 h-4 text-primary" />
                                <span>{movie.duration_minutes} phút</span>
                              </span>
                            )}
                            <span className="text-border">•</span>
                            <span className="px-2 py-0.5 rounded bg-muted text-[11px] font-bold text-foreground/80 border border-border/50">
                              2D Digital
                            </span>
                          </div>

                          {/* Grouped by Cinema Locations */}
                          <div className="space-y-4">
                            {cinemaList.map((cinemaGroup) => (
                              <div
                                key={cinemaGroup.cinemaId}
                                className="rounded-2xl border border-border/60 bg-muted/20 dark:bg-muted/10 p-4 sm:p-5"
                              >
                                {/* Cinema Header */}
                                <div className="flex items-center justify-between gap-2 mb-3.5 pb-2.5 border-b border-border/40">
                                  <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center border border-primary/20 shadow-xs">
                                      <MapPin className="w-4 h-4" />
                                    </div>
                                    <h4 className="font-bold text-sm sm:text-base text-foreground">
                                      {cinemaGroup.cinemaName}
                                    </h4>
                                  </div>

                                  <span className="text-xs text-muted-foreground font-semibold px-2.5 py-0.5 rounded-full bg-background border border-border/60 shadow-xs">
                                    {cinemaGroup.showtimes.length} suất chiếu
                                  </span>
                                </div>

                                {/* Showtimes Slot Grid (Tactile 3D Ticket Slots) */}
                                <div className="flex flex-wrap gap-2.5 sm:gap-3">
                                  {cinemaGroup.showtimes.map((showtime) => {
                                    const startTime = new Date(
                                      showtime.start_time,
                                    ).toLocaleTimeString("vi-VN", {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    });

                                    const endTime = new Date(
                                      new Date(showtime.start_time).getTime() +
                                        (movie.duration_minutes || 0) * 60000,
                                    ).toLocaleTimeString("vi-VN", {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    });

                                    const isPastShowtime =
                                      new Date(showtime.start_time).getTime() <=
                                      Date.now();

                                    return (
                                      <Link
                                        key={showtime.id}
                                        to={`/booking/seats?movie=${movie.movie_id}&showtime=${showtime.id}`}
                                        onClick={(e) =>
                                          handleShowtimeClick(
                                            e,
                                            showtime,
                                            movie,
                                            isPastShowtime,
                                          )
                                        }
                                        className={`group/slot relative w-[150px] sm:w-[160px] flex flex-col justify-between p-3 rounded-xl border transition-all duration-200 text-left select-none overflow-hidden ${
                                          isPastShowtime
                                            ? "border-border/50 bg-muted/40 opacity-55 cursor-not-allowed pointer-events-none"
                                            : "border-border/70 bg-background/90 hover:border-primary/80 hover:bg-card hover:shadow-[0_8px_20px_-4px_rgba(255,107,0,0.22)] hover:-translate-y-1 active:scale-[0.98]"
                                        }`}
                                      >
                                        {/* Micro ticket edge accent */}
                                        {!isPastShowtime && (
                                          <div className="absolute left-0 top-2.5 bottom-2.5 w-1 rounded-r bg-primary/30 group-hover/slot:bg-primary transition-colors duration-200" />
                                        )}

                                        {/* Top Row: Start Time - End Time */}
                                        <div className="flex items-center justify-between gap-1 mb-2 pl-1.5">
                                          <div
                                            className={`flex items-baseline gap-1 text-sm sm:text-base font-black tracking-tight ${
                                              isPastShowtime
                                                ? "text-muted-foreground line-through decoration-muted-foreground/60"
                                                : "text-foreground group-hover/slot:text-primary transition-colors"
                                            }`}
                                          >
                                            <span>{startTime}</span>
                                            <span className="text-muted-foreground/40 font-normal text-xs mx-0.5">-</span>
                                            <span className="text-muted-foreground group-hover/slot:text-foreground/80 font-semibold text-xs sm:text-sm">{endTime}</span>
                                          </div>
                                        </div>

                                        {/* Bottom Row: Hall Name & (Price or "Đã chiếu") */}
                                        <div className="flex items-center justify-between gap-1 text-[11px] font-medium pt-1.5 border-t border-border/40 pl-1.5">
                                          <span className="px-1.5 py-0.5 rounded bg-muted/70 font-mono text-[10px] text-foreground/80 border border-border/40 truncate max-w-[65px]">
                                            {showtime.hall_name || "Phòng Chiếu"}
                                          </span>

                                          {isPastShowtime ? (
                                            <span className="text-[10px] font-bold text-muted-foreground/80 bg-muted px-1.5 py-0.5 rounded border border-border/40">
                                              Đã chiếu
                                            </span>
                                          ) : showtime.base_price ? (
                                            <span className="text-primary font-black text-xs">
                                              {Number(showtime.base_price).toLocaleString("vi-VN")}đ
                                            </span>
                                          ) : null}
                                        </div>
                                      </Link>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default SchedulePage;
