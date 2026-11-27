import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AppContext";
import { apiCall, API_ENDPOINTS, getImageUrl } from "@/lib/api";

interface SlideData {
  id?: number;
  image_url: string;
  title?: string | null;
  target_url?: string | null;
  is_active?: boolean;
}

interface HeroBannerProps {
  slides?: SlideData[];
}

function extractYouTubeId(url: string): string | null {
  const match = url.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([a-zA-Z0-9_-]{11})/,
  );
  return match ? match[1] : null;
}

// Fallback banners when Admin has not uploaded any banner yet
const defaultSlides: SlideData[] = [
  {
    image_url:
      "https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=1920&h=820&fit=crop&q=85",
    title: "Dune: Hành Tinh Cát - Phần Hai",
    target_url: "/schedule",
  },
  {
    image_url:
      "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=1920&h=820&fit=crop&q=85",
    title: "Trải Nghiệm Điện Ảnh Đỉnh Cao Tại Galaxy Cinema",
    target_url: "/schedule",
  },
  {
    image_url:
      "https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?w=1920&h=820&fit=crop&q=85",
    title: "Ưu Đãi Bắp Nước & Sự Kiện Thành Viên",
    target_url: "/promotions",
  },
];

export const HeroBanner: React.FC<HeroBannerProps> = ({ slides: initialSlides }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [activeSlides, setActiveSlides] = useState<SlideData[]>(
    initialSlides || defaultSlides,
  );
  const [isPaused, setIsPaused] = useState(false);
  const [trailerUrl, setTrailerUrl] = useState<string | null>(null);

  // Fetch banners from Admin API (API_ENDPOINTS.POSTERS)
  useEffect(() => {
    if (initialSlides && initialSlides.length > 0) {
      setActiveSlides(initialSlides);
      return;
    }

    const fetchBanners = async () => {
      try {
        const res = await apiCall<{
          success: boolean;
          data: {
            posters: SlideData[];
          };
        }>(API_ENDPOINTS.POSTERS);

        if (res.success && res.data?.posters) {
          const published = res.data.posters.filter(
            (p) => p.is_active !== false,
          );
          if (published.length > 0) {
            setActiveSlides(published);
          } else {
            setActiveSlides(defaultSlides);
          }
        }
      } catch {
        setActiveSlides(defaultSlides);
      }
    };

    fetchBanners();
  }, [initialSlides, user?.id, user?.dob, user?.role]);

  // Next / Prev navigation
  const nextSlide = useCallback(() => {
    setActiveSlides((prevSlides) => {
      if (prevSlides.length === 0) return prevSlides;
      setCurrentSlide((curr) => (curr + 1) % prevSlides.length);
      return prevSlides;
    });
  }, []);

  const prevSlide = useCallback(() => {
    setActiveSlides((prevSlides) => {
      if (prevSlides.length === 0) return prevSlides;
      setCurrentSlide((curr) => (curr - 1 + prevSlides.length) % prevSlides.length);
      return prevSlides;
    });
  }, []);

  const goToSlide = (index: number) => {
    setCurrentSlide(index);
  };

  // Auto-play timer (slides every 6 seconds, pauses on hover)
  useEffect(() => {
    if (isPaused || activeSlides.length <= 1) return;

    const interval = setInterval(() => {
      nextSlide();
    }, 6000);

    return () => clearInterval(interval);
  }, [isPaused, activeSlides.length, nextSlide]);

  // Handle click on banner
  const handleBannerClick = (slide: SlideData) => {
    if (!slide.target_url) return;

    const ytId = extractYouTubeId(slide.target_url);
    if (ytId) {
      setTrailerUrl(`https://www.youtube.com/embed/${ytId}?autoplay=1`);
      return;
    }

    if (slide.target_url.startsWith("http://") || slide.target_url.startsWith("https://")) {
      window.open(slide.target_url, "_blank", "noopener,noreferrer");
    } else {
      navigate(slide.target_url);
    }
  };

  if (activeSlides.length === 0) return null;

  return (
    <div className="w-full">
      <div className="container mx-auto px-4 pt-4 sm:pt-6">
        <div
          className="relative w-full max-w-5xl lg:max-w-6xl xl:max-w-[1240px] mx-auto aspect-video rounded-2xl sm:rounded-3xl overflow-hidden shadow-2xl border border-border/50 bg-zinc-950 select-none group/carousel"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          {/* Slides Container */}
          <div
            className="flex transition-transform duration-700 ease-out h-full"
            style={{ transform: `translateX(-${currentSlide * 100}%)` }}
          >
            {activeSlides.map((slide, index) => {
              const hasLink = Boolean(slide.target_url);

              return (
                <div
                  key={index}
                  onClick={() => handleBannerClick(slide)}
                  className={`min-w-full h-full relative flex items-center justify-center overflow-hidden ${
                    hasLink ? "cursor-pointer" : "cursor-default"
                  }`}
                >
                  {/* Main Banner Image: Fills 100% of the frame edge-to-edge */}
                  <img
                    src={getImageUrl(slide.image_url)}
                    alt={slide.title || `Banner ${index + 1}`}
                    className="w-full h-full object-cover object-center scale-[1.06] transition-transform duration-700 group-hover/carousel:scale-[1.10]"
                    loading={index === 0 ? "eager" : "lazy"}
                  />

                  {/* Contrast gradient overlay at bottom for readability */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent pointer-events-none" />

                  {/* Title & Trailer Badge */}
                  {(slide.title || hasLink) && (
                    <div className="absolute bottom-3 left-3 sm:bottom-5 sm:left-5 z-20 max-w-[85%] sm:max-w-lg animate-fade-in pointer-events-auto">
                      <div className="inline-flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-1.5 sm:py-2 rounded-2xl bg-black/75 backdrop-blur-md border border-white/20 shadow-2xl">
                        {slide.title && (
                          <span className="text-white font-bold text-xs sm:text-sm tracking-wide drop-shadow-md truncate max-w-[180px] sm:max-w-[280px]">
                            {slide.title}
                          </span>
                        )}
                        {hasLink && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleBannerClick(slide);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1 sm:px-3.5 sm:py-1.2 rounded-full bg-primary hover:bg-primary/90 text-white text-[11px] sm:text-xs font-bold shadow-lg shadow-primary/30 transition-all hover:scale-105 active:scale-95 cursor-pointer"
                          >
                            <Play className="w-3 h-3 fill-white" />
                            <span>Trailer</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Navigation Arrows (Positioned comfortably right on the banner edges) */}
          {activeSlides.length > 1 && (
            <>
              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  prevSlide();
                }}
                aria-label="Banner trước"
                className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-black/50 hover:bg-black/80 text-white backdrop-blur-md border border-white/20 z-20 shadow-xl opacity-70 sm:opacity-0 sm:group-hover/carousel:opacity-100 transition-all duration-300 hover:scale-110 active:scale-95 cursor-pointer"
              >
                <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                onClick={(e) => {
                  e.stopPropagation();
                  nextSlide();
                }}
                aria-label="Banner kế tiếp"
                className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-black/50 hover:bg-black/80 text-white backdrop-blur-md border border-white/20 z-20 shadow-xl opacity-70 sm:opacity-0 sm:group-hover/carousel:opacity-100 transition-all duration-300 hover:scale-110 active:scale-95 cursor-pointer"
              >
                <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
              </Button>
            </>
          )}

          {/* Pagination Indicators (Bottom center of banner) */}
          {activeSlides.length > 1 && (
            <div className="absolute bottom-3 sm:bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 sm:gap-2 z-20">
              {activeSlides.map((_, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    goToSlide(index);
                  }}
                  aria-label={`Chuyển tới slide ${index + 1}`}
                  className={`h-1.5 sm:h-2 rounded-full transition-all duration-300 ${
                    index === currentSlide
                      ? "w-6 sm:w-8 bg-primary shadow-[0_0_10px_rgba(255,107,0,0.8)]"
                      : "w-1.5 sm:w-2 bg-white/40 hover:bg-white/80"
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Fullscreen Video Trailer Modal (if target_url is YouTube) */}
      {trailerUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md animate-fade-in"
          onClick={() => setTrailerUrl(null)}
        >
          <div
            className="relative w-[92vw] max-w-5xl aspect-video rounded-2xl overflow-hidden shadow-2xl border border-white/10 bg-black"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTrailerUrl(null)}
              className="absolute top-4 right-4 z-10 text-white bg-black/60 hover:bg-white/20 rounded-full w-10 h-10 backdrop-blur-md border border-white/20"
            >
              <X className="w-5 h-5" />
            </Button>
            <iframe
              src={trailerUrl}
              className="w-full h-full"
              allow="autoplay; encrypted-media"
              allowFullScreen
              title="Trailer"
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default HeroBanner;

