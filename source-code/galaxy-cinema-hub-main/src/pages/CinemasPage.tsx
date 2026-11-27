import React, { useEffect, useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Film,
  Search,
  Loader2,
  Sparkles,
  Calendar as CalendarIcon,
  Clock,
  Info,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import MovieCard from "@/components/movie/MovieCard";
import { useAuth } from "@/contexts/AppContext";
import { API_ENDPOINTS, apiCall, getImageUrl } from "@/lib/api";
import { isMovieVisibleToUser } from "@/lib/validation";
import { Movie, AgeRating, calculateMovieStatus } from "@/types/cinema";

interface BackendMovie {
  id: number;
  title: string;
  poster_url: string;
  duration: number;
  age_rating: string;
  origin: string;
  release_date: string;
  status: string;
  description: string;
  trailer_url: string | null;
  genres: string | null;
  active_showtimes_count?: number;
}

type FilterType = "all" | "now-showing" | "coming-soon" | "no-showtimes";

const MoviesPage: React.FC = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const initialFilter: FilterType =
    searchParams.get("type") === "coming" ? "coming-soon" : "all";

  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>(initialFilter);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const fetchMovies = async () => {
      try {
        setLoading(true);
        const response = await apiCall<{
          success: boolean;
          data: {
            movies: BackendMovie[];
            pagination: unknown;
          };
        }>(API_ENDPOINTS.MOVIES);

        if (response.success && response.data?.movies) {
          const mappedMovies: Movie[] = response.data.movies
            .filter((movie) => isMovieVisibleToUser(movie.age_rating, user))
            .map((movie) => {
            const statusType = calculateMovieStatus(
              movie.active_showtimes_count,
              movie.release_date,
            );

            return {
              id: movie.id.toString(),
              title: movie.title,
              titleVi: movie.title,
              poster: getImageUrl(movie.poster_url),
              duration: movie.duration || 120,
              ageRating: (movie.age_rating as AgeRating) || "P",
              origin: movie.origin === "Vietnam" ? "VN" : "INT",
              genre: movie.genres
                ? movie.genres.split(",").map((g) => g.trim())
                : [],
              director: "",
              cast: [],
              releaseDate: movie.release_date,
              description: movie.description || "",
              trailerUrl: movie.trailer_url || undefined,
              rating: 8.2,
              isNowShowing: statusType === "now-showing",
              statusType,
              activeShowtimesCount: Number(movie.active_showtimes_count || 0),
            };
          });

          setMovies(mappedMovies);
        }
      } catch (error) {
        console.error("Error fetching movies:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchMovies();
  }, [user]);

  const nowShowingMovies = useMemo(
    () => movies.filter((m) => m.statusType === "now-showing"),
    [movies],
  );

  const comingSoonMovies = useMemo(
    () => movies.filter((m) => m.statusType === "coming-soon"),
    [movies],
  );

  const noShowtimesMovies = useMemo(
    () => movies.filter((m) => m.statusType === "no-showtimes"),
    [movies],
  );

  const filteredMovies = useMemo(() => {
    let list = movies;
    if (filter === "now-showing") {
      list = nowShowingMovies;
    } else if (filter === "coming-soon") {
      list = comingSoonMovies;
    } else if (filter === "no-showtimes") {
      list = noShowtimesMovies;
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (m) =>
          m.title.toLowerCase().includes(q) ||
          (m.titleVi && m.titleVi.toLowerCase().includes(q)) ||
          m.genre.some((g) => g.toLowerCase().includes(q)),
      );
    }

    return list;
  }, [
    movies,
    filter,
    searchQuery,
    nowShowingMovies,
    comingSoonMovies,
    noShowtimesMovies,
  ]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />

      <main className="flex-1 pb-16 relative">
        {/* Ambient Top Glow for high-end cinematic atmosphere */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 max-w-5xl h-64 bg-primary/[0.04] blur-3xl pointer-events-none -z-10 rounded-full" />

        {/* Hero Header Area */}
        <div className="border-b border-border/40 bg-card/40 backdrop-blur-sm">
          <div className="container mx-auto px-4 py-8 sm:py-10">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-wider mb-3 shadow-xs">
                  <Film className="w-3.5 h-3.5" />
                  <span>Galaxy Cinema Movies</span>
                </div>
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-foreground tracking-tight">
                  Danh Sách Phim
                </h1>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1.5 max-w-xl">
                  Khám phá các siêu phẩm điện ảnh đỉnh cao đang chiếu và sắp khởi chiếu tại toàn bộ hệ thống Galaxy Cinema.
                </p>
              </div>

              {/* Quick Search */}
              <div className="relative w-full md:w-80">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Tìm kiếm theo tên phim, thể loại..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-9 h-11 rounded-xl bg-background/80 border-border/70 focus:border-primary text-xs sm:text-sm transition-all shadow-xs"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 pt-8">
          {/* Section: Modern Filter Tabs */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm sm:text-base font-bold text-foreground flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <span>Phân Loại Phim</span>
              </h2>
              <span className="text-xs text-muted-foreground hidden sm:inline">
                Hiển thị {filteredMovies.length} bộ phim
              </span>
            </div>

            <div className="flex gap-2.5 overflow-x-auto pb-2 scrollbar-none items-center">
              <button
                type="button"
                onClick={() => setFilter("all")}
                className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all duration-200 border flex items-center gap-2 whitespace-nowrap active:scale-95 ${
                  filter === "all"
                    ? "bg-primary text-primary-foreground border-primary shadow-[0_4px_14px_rgba(255,107,0,0.25)] scale-[1.02]"
                    : "bg-card text-foreground border-border/70 hover:border-primary/40 hover:bg-card/80 hover:-translate-y-0.5"
                }`}
              >
                <Film className="w-3.5 h-3.5" />
                <span>Tất cả phim</span>
                <span
                  className={`ml-1 px-2 py-0.5 rounded-full text-[11px] font-mono ${
                    filter === "all"
                      ? "bg-black/20 text-white"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {movies.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setFilter("now-showing")}
                className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all duration-200 border flex items-center gap-2 whitespace-nowrap active:scale-95 ${
                  filter === "now-showing"
                    ? "bg-primary text-primary-foreground border-primary shadow-[0_4px_14px_rgba(255,107,0,0.25)] scale-[1.02]"
                    : "bg-card text-foreground border-border/70 hover:border-primary/40 hover:bg-card/80 hover:-translate-y-0.5"
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Đang chiếu</span>
                <span
                  className={`ml-1 px-2 py-0.5 rounded-full text-[11px] font-mono ${
                    filter === "now-showing"
                      ? "bg-black/20 text-white"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {nowShowingMovies.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setFilter("coming-soon")}
                className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all duration-200 border flex items-center gap-2 whitespace-nowrap active:scale-95 ${
                  filter === "coming-soon"
                    ? "bg-primary text-primary-foreground border-primary shadow-[0_4px_14px_rgba(255,107,0,0.25)] scale-[1.02]"
                    : "bg-card text-foreground border-border/70 hover:border-primary/40 hover:bg-card/80 hover:-translate-y-0.5"
                }`}
              >
                <CalendarIcon className="w-3.5 h-3.5" />
                <span>Sắp chiếu</span>
                <span
                  className={`ml-1 px-2 py-0.5 rounded-full text-[11px] font-mono ${
                    filter === "coming-soon"
                      ? "bg-black/20 text-white"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {comingSoonMovies.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setFilter("no-showtimes")}
                className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all duration-200 border flex items-center gap-2 whitespace-nowrap active:scale-95 ${
                  filter === "no-showtimes"
                    ? "bg-primary text-primary-foreground border-primary shadow-[0_4px_14px_rgba(255,107,0,0.25)] scale-[1.02]"
                    : "bg-card text-foreground border-border/70 hover:border-primary/40 hover:bg-card/80 hover:-translate-y-0.5"
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>Chưa có suất</span>
                <span
                  className={`ml-1 px-2 py-0.5 rounded-full text-[11px] font-mono ${
                    filter === "no-showtimes"
                      ? "bg-black/20 text-white"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {noShowtimesMovies.length}
                </span>
              </button>
            </div>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-24 bg-card/40 rounded-3xl border border-border/40 my-6 animate-fade-in">
              <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
              <p className="text-sm font-medium text-muted-foreground">
                Đang tải danh sách phim...
              </p>
            </div>
          )}

          {/* Empty State */}
          {!loading && filteredMovies.length === 0 && (
            <div className="text-center py-20 px-4 bg-card/40 rounded-3xl border border-border/40 my-6 animate-fade-in">
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-muted flex items-center justify-center text-muted-foreground">
                <Info className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-1">
                Không tìm thấy bộ phim phù hợp
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground max-w-md mx-auto mb-5">
                Không có bộ phim nào khớp với từ khóa tìm kiếm hoặc danh mục bạn đã chọn.
              </p>
              <div className="flex justify-center gap-3">
                {filter !== "all" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setFilter("all")}
                    className="rounded-xl text-xs hover:border-primary/50"
                  >
                    Xem tất cả phim
                  </Button>
                )}
                {searchQuery && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSearchQuery("")}
                    className="rounded-xl text-xs hover:border-primary/50"
                  >
                    Xóa từ khóa tìm kiếm
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Movie Grid with 3D MovieCards */}
          {!loading && filteredMovies.length > 0 && (
            <div
              key={`${filter}-${searchQuery}`}
              className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-6 animate-fade-in"
            >
              {filteredMovies.map((movie) => (
                <MovieCard key={movie.id} movie={movie} showBookButton={true} />
              ))}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default MoviesPage;

