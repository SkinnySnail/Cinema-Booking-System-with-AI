import React, { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import {
  Film,
  Calendar,
  Clock,
  Star,
  X,
  Play,
  Ticket,
  Sparkles,
  LayoutGrid,
  ListFilter,
  Clock3,
  ArrowRight,
  Loader2,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AppContext";
import { API_ENDPOINTS, apiCall, getImageUrl } from "@/lib/api";
import { isMovieVisibleToUser } from "@/lib/validation";
import { Movie, AgeRating, calculateMovieStatus } from "@/types/cinema";
import MovieCard from "@/components/movie/MovieCard";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

function extractYouTubeId(url?: string | null): string | null {
  if (!url) return null;
  const match = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([a-zA-Z0-9_-]{11})/
  );
  return match ? match[1] : null;
}

export const SearchPage: React.FC = () => {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const searchQuery = searchParams.get("q") || "";
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(false);

  // View Mode
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  // Trailer Modal
  const [selectedTrailerUrl, setSelectedTrailerUrl] = useState<string | null>(null);

  // Fetch Movies based on searchQuery
  useEffect(() => {
    const fetchMovies = async () => {
      setLoading(true);
      try {
        let url = `${API_ENDPOINTS.MOVIES}?limit=100`;
        if (searchQuery) {
          url += `&search=${encodeURIComponent(searchQuery)}`;
        }

        const data = await apiCall<{
          success: boolean;
          data?: { movies?: any[] };
        }>(url);

        if (data.success && data.data?.movies) {
          const mapped: Movie[] = data.data.movies
            .filter((m: any) => isMovieVisibleToUser(m.age_rating, user))
            .map((m: any) => {
            const statusType = calculateMovieStatus(
              m.active_showtimes_count,
              m.release_date
            );
            return {
              id: m.id.toString(),
              title: m.title,
              titleVi: m.title,
              poster: getImageUrl(m.poster_url),
              duration: Number(m.duration_minutes || m.duration || 0),
              ageRating: (m.age_rating as AgeRating) || "P",
              origin: m.origin === "Vietnam" || m.origin === "VN" ? "VN" : "INT",
              genre: m.genres ? m.genres.split(",").map((g: string) => g.trim()) : [],
              director: m.director || "",
              cast: m.cast ? m.cast.split(",").map((c: string) => c.trim()) : [],
              releaseDate: m.release_date || "",
              description: m.description || "",
              trailerUrl: m.trailer_url || undefined,
              rating: Number(m.avg_rating) > 0 ? Number(m.avg_rating) : 8.1,
              isNowShowing: statusType === "now-showing",
              statusType,
              activeShowtimesCount: Number(m.active_showtimes_count || 0),
            };
          });
          setMovies(mapped);
        } else {
          setMovies([]);
        }
      } catch (error) {
        console.error("Error fetching movies:", error);
        setMovies([]);
      } finally {
        setLoading(false);
      }
    };

    fetchMovies();
  }, [searchQuery, user]);

  // Open trailer modal
  const handleOpenTrailer = (e: React.MouseEvent, trailerUrl?: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!trailerUrl) return;
    const ytId = extractYouTubeId(trailerUrl);
    if (ytId) {
      setSelectedTrailerUrl(`https://www.youtube.com/embed/${ytId}?autoplay=1`);
    } else {
      window.open(trailerUrl, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col text-foreground">
      <Header />

      <main className="flex-1 pb-16 relative">
        {/* Ambient Top Glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 max-w-5xl h-64 bg-primary/[0.04] blur-3xl pointer-events-none -z-10 rounded-full" />

        {/* Clean Header Bar: Left-Aligned with Title & View Mode Switcher */}
        <div className="border-b border-border/40 bg-card/40 backdrop-blur-sm">
          <div className="container mx-auto px-4 py-6 sm:py-8">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-wider mb-2.5 shadow-xs">
                  <Film className="w-3.5 h-3.5" />
                  <span>Galaxy Cinema Search</span>
                </div>
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-foreground tracking-tight">
                  Kết Quả Tìm Kiếm
                </h1>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                  {searchQuery ? (
                    <>
                      Tìm thấy{" "}
                      <strong className="text-foreground font-bold">
                        {movies.length}
                      </strong>{" "}
                      bộ phim cho từ khóa "
                      <span className="text-primary font-semibold">
                        {searchQuery}
                      </span>
                      "
                    </>
                  ) : (
                    <>
                      Hiển thị{" "}
                      <strong className="text-foreground font-bold">
                        {movies.length}
                      </strong>{" "}
                      bộ phim trong hệ thống
                    </>
                  )}
                </p>
              </div>

              {/* View Mode Switcher */}
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <span className="text-xs text-muted-foreground mr-1 hidden sm:inline">
                  Chế độ xem:
                </span>
                <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/60 border border-border/60">
                  <Button
                    variant={viewMode === "grid" ? "default" : "ghost"}
                    size="icon"
                    className="w-8 h-8 rounded-lg"
                    onClick={() => setViewMode("grid")}
                    aria-label="Xem dạng lưới"
                    title="Xem dạng lưới"
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </Button>
                  <Button
                    variant={viewMode === "list" ? "default" : "ghost"}
                    size="icon"
                    className="w-8 h-8 rounded-lg"
                    onClick={() => setViewMode("list")}
                    aria-label="Xem dạng danh sách"
                    title="Xem dạng danh sách"
                  >
                    <ListFilter className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Content Container */}
        <div className="container mx-auto px-4 pt-8">
          {/* Loading State */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-24 bg-card/40 rounded-3xl border border-border/40 my-6 animate-fade-in">
              <Loader2 className="w-8 h-8 animate-spin text-primary mb-3" />
              <p className="text-sm font-medium text-muted-foreground">
                Đang tìm kiếm phim...
              </p>
            </div>
          )}

          {/* Empty State */}
          {!loading && movies.length === 0 && (
            <div className="text-center py-20 px-4 bg-card/40 rounded-3xl border border-border/40 my-6 animate-fade-in">
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-muted flex items-center justify-center text-muted-foreground">
                <Info className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-bold text-foreground mb-1">
                Không tìm thấy bộ phim phù hợp
              </h3>
              <p className="text-xs sm:text-sm text-muted-foreground max-w-md mx-auto mb-5">
                Không có bộ phim nào khớp với từ khóa "{searchQuery}". Vui lòng thử tìm với từ khóa khác trên thanh tìm kiếm của Header.
              </p>
              <Button asChild variant="outline" size="sm" className="rounded-xl text-xs hover:border-primary/50">
                <Link to="/movies">Khám phá tất cả phim</Link>
              </Button>
            </div>
          )}

          {/* Results: GRID VIEW (5 Columns matching /movies) */}
          {!loading && movies.length > 0 && viewMode === "grid" && (
            <div
              key={searchQuery}
              className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-6 animate-fade-in"
            >
              {movies.map((movie, index) => (
                <div
                  key={movie.id}
                  className="animate-slide-up"
                  style={{
                    animationDelay: `${Math.min(index * 40, 400)}ms`,
                    animationFillMode: "both",
                  }}
                >
                  <MovieCard movie={movie} showBookButton={true} />
                </div>
              ))}
            </div>
          )}

          {/* Results: LIST VIEW */}
          {!loading && movies.length > 0 && viewMode === "list" && (
            <div className="space-y-4">
              {movies.map((movie, index) => (
                <div
                  key={movie.id}
                  className="group relative rounded-2xl bg-card border border-border/70 hover:border-primary/50 shadow-xs hover:shadow-lg transition-all duration-300 overflow-hidden animate-slide-up"
                  style={{
                    animationDelay: `${Math.min(index * 40, 400)}ms`,
                    animationFillMode: "both",
                  }}
                >
                  <div className="flex flex-col sm:flex-row gap-4 p-4 sm:p-5">
                    {/* Poster */}
                    <Link
                      to={`/movie/${movie.id}`}
                      className="relative flex-shrink-0 w-full sm:w-28 md:w-32 aspect-[2/3] rounded-xl overflow-hidden bg-zinc-950 shadow-sm group-hover:shadow-md"
                    >
                      <img
                        src={movie.poster}
                        alt={movie.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.src =
                            "https://via.placeholder.com/400x600?text=No+Poster";
                        }}
                      />
                      <div className="absolute top-2 left-2 z-10">
                        <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-black/80 text-white border border-white/20 backdrop-blur-md">
                          {movie.ageRating}
                        </span>
                      </div>
                    </Link>

                    {/* Info Body */}
                    <div className="flex-1 flex flex-col justify-between min-w-0">
                      <div>
                        {/* Header: Title & Dynamic Status Badge */}
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                          <Link
                            to={`/movie/${movie.id}`}
                            className="text-lg sm:text-xl font-black text-foreground hover:text-primary transition-colors line-clamp-1"
                          >
                            {movie.title}
                          </Link>

                          {/* Dynamic Status Badge */}
                          {movie.statusType === "now-showing" ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-500 border border-emerald-500/30 shadow-xs">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                              Đang chiếu
                            </span>
                          ) : movie.statusType === "coming-soon" ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-500 border border-amber-500/30 shadow-xs">
                              <Sparkles className="w-3 h-3 text-amber-500" />
                              Sắp chiếu
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-slate-500/15 text-slate-400 border border-slate-500/30 shadow-xs">
                              <Clock3 className="w-3 h-3 text-slate-400" />
                              Chưa có suất
                            </span>
                          )}
                        </div>

                        {/* Meta row: Duration, Release Date, Rating */}
                        <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm text-muted-foreground mb-3">
                          {movie.duration > 0 && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-primary" />
                              {movie.duration} phút
                            </span>
                          )}
                          {movie.releaseDate && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5 text-primary" />
                              {new Date(movie.releaseDate).toLocaleDateString(
                                "vi-VN"
                              )}
                            </span>
                          )}
                          <span className="flex items-center gap-1 text-amber-400 font-bold">
                            <Star className="w-3.5 h-3.5 fill-amber-400" />
                            {((movie as any).rating || 8.1).toFixed(1)}
                          </span>
                        </div>

                        {/* Genres */}
                        {movie.genre.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-3">
                            {movie.genre.map((g) => (
                              <span
                                key={g}
                                className="px-2.5 py-0.5 rounded-lg text-xs bg-muted/80 text-muted-foreground border border-border/50"
                              >
                                {g}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Description */}
                        {movie.description && (
                          <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2 leading-relaxed mb-4">
                            {movie.description}
                          </p>
                        )}
                      </div>

                      {/* Action Buttons Footer */}
                      <div className="flex flex-wrap items-center gap-2.5 pt-3 border-t border-border/40">
                        {movie.statusType === "now-showing" ? (
                          <Button
                            asChild
                            className="bg-primary hover:bg-primary/90 text-white rounded-xl text-xs sm:text-sm font-bold shadow-xs hover:scale-105 active:scale-95 transition-all"
                          >
                            <Link to={`/schedule`}>
                              <Ticket className="w-4 h-4 mr-1.5" />
                              Đặt Vé Ngay
                            </Link>
                          </Button>
                        ) : (
                          <Button
                            asChild
                            variant="outline"
                            className="rounded-xl text-xs sm:text-sm font-bold border-border/80 hover:border-primary/50"
                          >
                            <Link to={`/movie/${movie.id}`}>
                              Xem Chi Tiết
                              <ArrowRight className="w-4 h-4 ml-1.5" />
                            </Link>
                          </Button>
                        )}

                        {movie.trailerUrl && (
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={(e) => handleOpenTrailer(e, movie.trailerUrl)}
                            className="rounded-xl text-xs sm:text-sm font-medium hover:bg-muted/80 gap-1.5"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            Trailer
                          </Button>
                        )}

                        {movie.statusType === "now-showing" && (
                          <Button
                            asChild
                            variant="ghost"
                            className="rounded-xl text-xs sm:text-sm text-muted-foreground hover:text-foreground"
                          >
                            <Link to={`/movie/${movie.id}`}>Chi tiết</Link>
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Video Trailer Modal */}
      {selectedTrailerUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md animate-fade-in p-4"
          onClick={() => setSelectedTrailerUrl(null)}
        >
          <div
            className="relative w-full max-w-4xl aspect-video rounded-2xl overflow-hidden shadow-2xl border border-white/10 bg-black"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSelectedTrailerUrl(null)}
              className="absolute top-3 right-3 z-10 text-white bg-black/60 hover:bg-white/20 rounded-full w-9 h-9 backdrop-blur-md border border-white/20"
            >
              <X className="w-4 h-4" />
            </Button>
            <iframe
              src={selectedTrailerUrl}
              className="w-full h-full"
              allow="autoplay; encrypted-media"
              allowFullScreen
              title="Trailer Phim"
            />
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
};

export default SearchPage;
