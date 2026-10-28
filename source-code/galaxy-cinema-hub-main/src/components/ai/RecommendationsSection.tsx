import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AppContext";
import { getImageUrl } from "@/lib/api";
import { aiService, type Recommendations } from "@/services/ai.service";

export default function RecommendationsSection({ movieId, cinemaId }: { movieId?: number; cinemaId?: number }) {
  const { user } = useAuth();
  const [data, setData] = useState<Recommendations | null>(null);
  useEffect(() => {
    let active = true;
    setData(null);
    aiService.recommendations(movieId, cinemaId).then(result => { if (active) setData(result); }).catch(() => {});
    return () => { active = false; };
  }, [user?.id, movieId, cinemaId]);
  if (!data || (!data.movies.length && !data.concessions.length)) return null;
  return (
    <section className="container mx-auto px-4 py-8" aria-label="Gợi ý dành cho bạn">
      <h2 className="mb-2 flex items-center gap-2 text-2xl font-bold"><Sparkles className="h-6 w-6 text-primary" />{data.mode === "hybrid" ? "Dành riêng cho bạn" : "Khám phá phim phù hợp"}</h2>
      <p className="mb-5 text-sm text-muted-foreground">{data.mode === "hybrid" ? "Gợi ý từ những phim và thể loại bạn từng quan tâm." : "Khám phá những phim đang có lịch chiếu."}</p>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {data.movies.map(movie => (
          <Link key={movie.id} to={`/movie/${movie.id}`} className="group rounded-xl border bg-card p-3 transition-shadow hover:shadow-lg">
            <img src={getImageUrl(movie.poster_url)} alt={movie.title} loading="lazy" className="aspect-[2/3] w-full rounded-lg object-cover" />
            <h3 className="mt-3 font-semibold group-hover:text-primary">{movie.title}</h3>
            <p className="text-xs text-muted-foreground">{movie.age_rating} · {movie.duration_minutes} phút</p>
            <p className="mt-2 text-xs text-primary">{movie.reason}</p>
          </Link>
        ))}
      </div>
      {data.concessions.length > 0 && <div className="mt-5 flex flex-wrap gap-3">{data.concessions.map(item => (
        <Link key={item.id} to="/concessions" className="rounded-lg border bg-card px-4 py-3 text-sm">
          <span className="font-medium">{item.name}</span> · {Number(item.price).toLocaleString("vi-VN")}đ
          <span className="block text-xs text-muted-foreground">{item.reason}</span>
        </Link>
      ))}</div>}
    </section>
  );
}
