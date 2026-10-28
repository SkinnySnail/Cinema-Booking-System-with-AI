import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import HeroBanner from "@/components/home/HeroBanner";
import RecommendationsSection from "@/components/ai/RecommendationsSection";
import QuickBookingBar from "@/components/booking/QuickBookingBar";
import MovieCard from "@/components/movie/MovieCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AppContext";
import { API_ENDPOINTS, apiCall, getImageUrl } from "@/lib/api";
import { Movie, AgeRating, calculateMovieStatus } from "@/types/cinema";
import {
  Loader2,
  Sparkles,
  ArrowRight,
  Ticket,
  Popcorn,
} from "lucide-react";

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
}

const HomePage: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const [movies, setMovies] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMovies();
  }, []);

  const fetchMovies = async () => {
    try {
      setLoading(true);
      const response = await apiCall<{
        success: boolean;
        data: { movies: BackendMovie[] };
      }>(API_ENDPOINTS.MOVIES, {
        method: "GET",
      });

      if (response.success && response.data?.movies) {
        const mappedMovies: Movie[] = response.data.movies.map((m: any) => {
          const statusType = calculateMovieStatus(
            m.active_showtimes_count,
            m.release_date,
          );
          return {
            id: m.id.toString(),
            title: m.title,
            titleVi: m.title,
            poster: getImageUrl(m.poster_url),
            duration: m.duration,
            ageRating: m.age_rating as AgeRating,
            origin: m.origin === "Vietnam" ? "VN" : "INT",
            genre: m.genres ? m.genres.split(",").map((g: string) => g.trim()) : [],
            director: "",
            cast: [],
            releaseDate: m.release_date,
            description: m.description || "",
            trailerUrl: m.trailer_url || undefined,
            isNowShowing: statusType === "now-showing",
            statusType,
            activeShowtimesCount: Number(m.active_showtimes_count || 0),
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

  const nowShowingMovies = movies.filter((m) => m.statusType === "now-showing");
  const comingSoonMovies = movies.filter((m) => m.statusType === "coming-soon");
  const noShowtimesMovies = movies.filter((m) => m.statusType === "no-showtimes");

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1">
        {/* Hero Banner */}
        <HeroBanner />

        {/* Quick Booking Bar */}
        <div className="container mx-auto px-4">
          <QuickBookingBar />
        <RecommendationsSection />
        </div>

        {/* Movie Section */}
        <section className="container mx-auto px-4 py-12">
          <Tabs defaultValue="now-showing" className="w-full">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
              <div>
                <h2 className="text-2xl lg:text-3xl font-extrabold text-foreground tracking-tight">
                  Phim Đang & Sắp Chiếu
                </h2>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                  Khám phá các bom tấn điện ảnh hấp dẫn nhất tuần này
                </p>
              </div>

              <TabsList className="bg-muted/70 p-1 rounded-2xl border border-border/50 backdrop-blur-sm self-start sm:self-auto">
                <TabsTrigger
                  value="now-showing"
                  className="rounded-xl px-4 py-2 font-bold text-xs sm:text-sm transition-all data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
                >
                  <span>Đang Chiếu</span>
                  <span className="ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] bg-black/15 dark:bg-white/20 font-mono">
                    {nowShowingMovies.length}
                  </span>
                </TabsTrigger>
                <TabsTrigger
                  value="coming-soon"
                  className="rounded-xl px-4 py-2 font-bold text-xs sm:text-sm transition-all data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
                >
                  <span>Sắp Chiếu</span>
                  <span className="ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] bg-black/15 dark:bg-white/20 font-mono">
                    {comingSoonMovies.length}
                  </span>
                </TabsTrigger>
                <TabsTrigger
                  value="no-showtimes"
                  className="rounded-xl px-4 py-2 font-bold text-xs sm:text-sm transition-all data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
                >
                  <span>Chưa Có Suất</span>
                  <span className="ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] bg-black/15 dark:bg-white/20 font-mono">
                    {noShowtimesMovies.length}
                  </span>
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="now-showing" className="mt-0">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : nowShowingMovies.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  Hiện chưa có phim đang chiếu
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 lg:gap-6">
                  {nowShowingMovies.map((movie) => (
                    <MovieCard key={movie.id} movie={movie} />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="coming-soon" className="mt-0">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : comingSoonMovies.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  Chưa có phim sắp chiếu
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 lg:gap-6">
                  {comingSoonMovies.map((movie) => (
                    <MovieCard
                      key={movie.id}
                      movie={movie}
                      showBookButton={true}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="no-showtimes" className="mt-0">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : noShowtimesMovies.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  Không có phim nào
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 lg:gap-6">
                  {noShowtimesMovies.map((movie) => (
                    <MovieCard
                      key={movie.id}
                      movie={movie}
                      showBookButton={true}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </section>



        {/* Modern Promotions & Privileges Section */}
        <section className="container mx-auto px-4 py-12 border-t border-border/40">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-primary bg-primary/10 px-3 py-1 rounded-full border border-primary/20 inline-block mb-2">
                Đặc Quyền
              </span>
              <h2 className="text-2xl lg:text-3xl font-black text-foreground tracking-tight">
                Ưu Đãi & Sự Kiện Nổi Bật
              </h2>
            </div>
            <Link
              to="/promotions"
              className="inline-flex items-center gap-2 text-sm font-bold text-primary hover:text-primary/80 transition-colors group"
            >
              <span>Xem tất cả ưu đãi</span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Promo Card 1: Thành viên Galaxy */}
            <div className="rounded-2xl p-6 bg-gradient-to-br from-card to-card/50 border border-border/60 hover:border-primary/40 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-primary/15 text-primary border border-primary/20 uppercase">
                    Thành Viên
                  </span>
                  <Ticket className="w-5 h-5 text-primary/70" />
                </div>
                <h3 className="font-bold text-lg text-foreground mb-2">
                  Galaxy Member Rewards
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Tích điểm thưởng lên tới 10% trên mỗi hóa đơn. Đổi vé xem phim miễn phí và nhận quà sinh nhật đặc biệt hàng năm.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-border/40">
                <Link to={isAuthenticated ? "/promotions" : "/register"}>
                  <Button variant="outline" className="w-full rounded-xl text-xs font-bold hover:bg-primary hover:text-white transition-all">
                    {isAuthenticated ? "Xem Ưu Đãi" : "Đăng Ký Thành Viên"}
                  </Button>
                </Link>
              </div>
            </div>

            {/* Promo Card 2: Happy Day */}
            <div className="rounded-2xl p-6 bg-gradient-to-br from-card to-card/50 border border-border/60 hover:border-amber-500/40 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-500 border border-amber-500/20 uppercase">
                    Đồng Giá Vé
                  </span>
                  <Sparkles className="w-5 h-5 text-amber-500/70" />
                </div>
                <h3 className="font-bold text-lg text-foreground mb-2">
                  Happy Day - Thứ 3 Vui Vẻ
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Đồng giá vé chỉ từ 50.000đ vào mỗi thứ 3 hàng tuần tại tất cả các cụm rạp Galaxy Cinema trên toàn quốc.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-border/40">
                <Link to="/schedule">
                  <Button variant="outline" className="w-full rounded-xl text-xs font-bold hover:bg-amber-500 hover:text-white transition-all">
                    Xem Lịch Chiếu
                  </Button>
                </Link>
              </div>
            </div>

            {/* Promo Card 3: Combo bắp nước */}
            <div className="rounded-2xl p-6 bg-gradient-to-br from-card to-card/50 border border-border/60 hover:border-rose-500/40 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-rose-500/15 text-rose-500 border border-rose-500/20 uppercase">
                    Bắp Nước Online
                  </span>
                  <Popcorn className="w-5 h-5 text-rose-500/70" />
                </div>
                <h3 className="font-bold text-lg text-foreground mb-2">
                  Combo Bắp Nước Tiết Kiệm
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Giảm đến 20% khi đặt trước combo bắp vị Caramel / Phô mai cùng nước ngọt trực tiếp khi mua vé online.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-border/40">
                <Link to="/concessions">
                  <Button variant="outline" className="w-full rounded-xl text-xs font-bold hover:bg-rose-500 hover:text-white transition-all">
                    Xem Menu Bắp Nước
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default HomePage;
