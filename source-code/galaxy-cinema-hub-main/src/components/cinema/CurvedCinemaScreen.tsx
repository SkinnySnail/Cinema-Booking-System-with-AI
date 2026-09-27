import React, { useId } from "react";
import { cn } from "@/lib/utils";
import { useTheme } from "@/hooks/use-theme";

interface CurvedCinemaScreenProps {
  title?: string;
  subtitle?: string;
  className?: string;
  compact?: boolean;
}

export const CurvedCinemaScreen: React.FC<CurvedCinemaScreenProps> = ({
  title = "MÀN HÌNH CHÍNH / IMAX SCREEN",
  subtitle = "Hệ thống âm thanh vòm Dolby Atmos • Máy chiếu Laser 4K",
  className,
  compact = false,
}) => {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const rawId = useId();
  const id = rawId.replace(/:/g, "");

  return (
    <div
      className={cn(
        "w-full mx-auto flex flex-col items-center relative select-none",
        compact ? "max-w-xl my-2" : "max-w-2xl my-3",
        className,
      )}
    >

      {/* Top Projector Light Source */}
      <div
        className={cn(
          "bg-gradient-to-b from-sky-400/80 to-transparent rounded-full blur-[2px]",
          compact ? "w-16 h-1.5 mb-1" : "w-24 h-2 mb-1.5",
        )}
      />

      <svg viewBox="0 0 900 80" className="w-full overflow-visible">
        <defs>
          {/* Screen ambient projection beam */}
          <linearGradient
            id={`screenBeamEnhanced-${id}`}
            x1="0%"
            y1="0%"
            x2="0%"
            y2="100%"
          >
            <stop
              offset="0%"
              stopColor={
                isLight
                  ? "rgba(14, 165, 233, 0.22)"
                  : "rgba(56, 189, 248, 0.35)"
              }
            />
            <stop
              offset="40%"
              stopColor={
                isLight
                  ? "rgba(14, 165, 233, 0.08)"
                  : "rgba(56, 189, 248, 0.12)"
              }
            />
            <stop offset="100%" stopColor="rgba(56, 189, 248, 0)" />
          </linearGradient>

          {/* Silver Screen Metallic Gradient */}
          <linearGradient
            id={`silverScreenCurve-${id}`}
            x1="0%"
            y1="0%"
            x2="100%"
            y2="0%"
          >
            <stop
              offset="0%"
              stopColor={
                isLight
                  ? "rgba(148, 163, 184, 0.2)"
                  : "rgba(255, 255, 255, 0.1)"
              }
            />
            <stop
              offset="12%"
              stopColor={isLight ? "#38bdf8" : "rgba(255, 255, 255, 0.85)"}
            />
            <stop offset="50%" stopColor={isLight ? "#0284c7" : "#ffffff"} />
            <stop
              offset="88%"
              stopColor={isLight ? "#38bdf8" : "rgba(255, 255, 255, 0.85)"}
            />
            <stop
              offset="100%"
              stopColor={
                isLight
                  ? "rgba(148, 163, 184, 0.2)"
                  : "rgba(255, 255, 255, 0.1)"
              }
            />
          </linearGradient>

          {/* Glow bloom filter */}
          <filter
            id={`screenBloomFilter-${id}`}
            x="-20%"
            y="-40%"
            width="140%"
            height="220%"
          >
            <feGaussianBlur
              stdDeviation={isLight ? "3" : "6"}
              result="glow"
            />
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
          fill={`url(#screenBeamEnhanced-${id})`}
        />

        {/* 3D Curved Silver Screen Line */}
        <path
          d="M 40 52 Q 450 10 860 52"
          stroke={`url(#silverScreenCurve-${id})`}
          strokeWidth={isLight ? "4" : "5"}
          strokeLinecap="round"
          fill="none"
          filter={`url(#screenBloomFilter-${id})`}
        />

        {/* Lower reflection accent line */}
        <path
          d="M 80 58 Q 450 24 820 58"
          stroke={
            isLight ? "rgba(14, 165, 233, 0.3)" : "rgba(56, 189, 248, 0.4)"
          }
          strokeWidth="1.5"
          strokeLinecap="round"
          fill="none"
        />
      </svg>

      {/* Screen Label & Room Specs */}
      <div className="flex flex-col items-center gap-0.5 mt-1 text-center select-none">
        <span
          className={cn(
            "font-extrabold tracking-[0.35em] text-slate-700 dark:text-zinc-300 drop-shadow-sm flex items-center justify-center gap-2",
            compact ? "text-[10px]" : "text-[12px]",
          )}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-ping inline-block" />
          {title}
        </span>
        {subtitle && (
          <span
            className={cn(
              "text-slate-500 dark:text-zinc-500 font-medium tracking-wider",
              compact ? "text-[9px]" : "text-[10px]",
            )}
          >
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );
};
